/**
 * #1096b — `stage:<slug>` ONE-SHOT: run a demo post's whole capture → render → stage pipeline in a
 * single, idempotent command (was 6 manual steps).
 *
 * Reads the publish-asset registry (`publish/publishAssets.ts`): the post's `staging` recipe gives the
 * npm scripts that produce the renders, the dir they land in, and the basename→rendered-file map; the
 * post's `assets` give the published basenames and `defaultBundleDir` the durable launch bundle to stage
 * into. The command (1) runs each render script in order, (2) copies + renames each render into the
 * bundle under its published basename, (3) freezes the publish manifest. Re-running is idempotent (copies
 * overwrite, the manifest re-freezes to the same hashes when the bytes are unchanged).
 *
 * It adds NO paid call of its own — any paid step lives INSIDE a pipeline script and is gated there
 * (e.g. voice:kanban's full paid render is refused until the #1096a preview gate is satisfied).
 *
 * Usage:
 *   npm run stage -- <slug> [--dry-run] [--skip-render] [--from <bundleDir>]
 *   npm run stage:agent-kanban-demo [-- --dry-run]
 *
 *   --dry-run     print the plan (scripts, copies, freeze) and EXIT — reads the registry only, runs
 *                 nothing, makes no paid call. The wiring-verification boundary.
 *   --skip-render stage the EXISTING renders (skip the capture/render scripts) — copy + freeze only.
 *   --from <dir>  override the bundle dir to stage into (defaults to the post's defaultBundleDir).
 */
import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

import { POST_ASSETS, isPostSlug } from "../publish/publishAssets";

interface Args {
  slug?: string;
  dryRun: boolean;
  skipRender: boolean;
  from?: string;
}

function parseArgs(argv: string[]): Args {
  const a: Args = { dryRun: false, skipRender: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--dry-run") a.dryRun = true;
    else if (t === "--skip-render") a.skipRender = true;
    else if (t === "--from") a.from = argv[++i];
    else if (!t.startsWith("--") && a.slug === undefined) a.slug = t;
  }
  return a;
}

function run(cmd: string, cmdArgs: string[], cwd: string): void {
  const label = `${cmd} ${cmdArgs.join(" ")}`;
  console.log(`  → ${label}`);
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit" });
  if (r.status !== 0) throw new Error(`stage: \`${label}\` failed (exit ${r.status}).`);
}

function main(): void {
  const repoRoot = fs.realpathSync(process.cwd());
  const args = parseArgs(process.argv.slice(2));

  if (!args.slug || !isPostSlug(args.slug)) {
    console.error(
      `stage: expected a known post slug (${Object.keys(POST_ASSETS).join(" | ")}). ` +
        `Usage: npm run stage -- <slug> [--dry-run] [--skip-render] [--from <dir>]`,
    );
    process.exit(2);
  }

  const spec = POST_ASSETS[args.slug];
  if (!spec.staging) {
    console.error(
      `stage: post "${args.slug}" has no staging recipe (publishAssets POST_ASSETS[...].staging). ` +
        `Add one (renderDir + pipeline + sources) to make it one-shot-stageable.`,
    );
    process.exit(2);
  }

  const { renderDir, pipeline, sources } = spec.staging;
  const bundleDir = args.from ?? spec.defaultBundleDir;

  // Coherence: every PUBLISHED asset must have a staging source, and every source must name a real asset.
  const assetBasenames = new Set(spec.assets.map((a) => a.basename));
  const sourceBasenames = new Set(Object.keys(sources));
  const missingSource = [...assetBasenames].filter((b) => !sourceBasenames.has(b));
  const orphanSource = [...sourceBasenames].filter((b) => !assetBasenames.has(b));
  if (missingSource.length || orphanSource.length) {
    console.error(
      `stage: staging.sources is out of sync with assets for "${args.slug}".` +
        (missingSource.length ? ` Missing a source for: ${missingSource.join(", ")}.` : "") +
        (orphanSource.length ? ` Source names an unknown asset: ${orphanSource.join(", ")}.` : ""),
    );
    process.exit(2);
  }

  const copies = spec.assets.map((a) => ({
    src: path.join(repoRoot, renderDir, sources[a.basename]),
    dest: path.join(bundleDir, a.basename),
    role: a.role,
  }));

  console.log(`\n#1096b stage: ${args.slug}${args.dryRun ? "  [DRY-RUN — no execution, no paid call]" : ""}`);
  console.log(`  renderDir : ${renderDir}`);
  console.log(`  bundleDir : ${bundleDir}`);
  console.log(`  pipeline  : ${args.skipRender ? "(skipped — --skip-render)" : pipeline.map((p) => `npm run ${p}`).join("  →  ")}`);
  console.log(`  stage     :`);
  for (const c of copies) console.log(`     ${path.relative(repoRoot, c.src)}  →  ${c.dest}  (${c.role})`);
  console.log(`  freeze    : npm run publish:freeze-manifest -- ${args.slug} --from ${bundleDir}`);

  if (args.dryRun) {
    console.log(`\nstage: DRY-RUN complete — plan above; nothing executed. Re-run without --dry-run to stage.`);
    return;
  }

  // 1 — produce the renders (each paid step is gated inside its own script).
  if (!args.skipRender) {
    console.log(`\nstage: running the render pipeline…`);
    for (const script of pipeline) run("npm", ["run", script], repoRoot);
  }

  // 2 — copy + rename each render into the durable bundle under its published basename.
  console.log(`\nstage: copying renders into the bundle…`);
  fs.mkdirSync(bundleDir, { recursive: true });
  for (const c of copies) {
    if (!fs.existsSync(c.src)) {
      throw new Error(`stage: render missing — ${path.relative(repoRoot, c.src)} (run the pipeline first, or drop --skip-render).`);
    }
    fs.copyFileSync(c.src, c.dest);
    console.log(`     staged ${path.basename(c.dest)} (${fs.statSync(c.dest).size} B)`);
  }

  // 3 — freeze the publish manifest from the freshly-staged bundle (idempotent).
  console.log(`\nstage: freezing the publish manifest…`);
  run("npm", ["run", "publish:freeze-manifest", "--", args.slug, "--from", bundleDir], repoRoot);

  console.log(`\nstage: ${args.slug} staged + frozen. DRY-RUN the publish runbook next (operator-gated; never publishes).`);
}

main();
