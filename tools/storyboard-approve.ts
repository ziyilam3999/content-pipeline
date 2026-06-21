/**
 * #1120 Leg 0 — `npm run storyboard:approve -- <slug> [--note "<who/what>"]`.
 *
 * The OPERATOR SIGN-OFF act: record "yes, film this storyboard" for a post's storyboard at its EXACT
 * current bytes. Writes `storyboards/<slug>.approved.json` pinning `docSha = sha256(doc bytes)`, which
 * `requireApprovedStoryboard` checks before any capture / paid-voice / stage step. Editing the storyboard
 * after this changes its bytes → the approval auto-expires → re-run this command (same trick the
 * eyeball-ack gate uses). Validates the slug is a known post AND the storyboard doc exists first.
 */

import { isPostSlug, POST_ASSETS } from "../publish/publishAssets";
import { recordStoryboardApproval, storyboardDocPath } from "../video/storyboardGate";
import * as fs from "fs";

function parseArgs(argv: string[]): { slug?: string; note?: string } {
  const out: { slug?: string; note?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--note") out.note = argv[++i];
    else if (!a.startsWith("--") && !out.slug) out.slug = a;
  }
  return out;
}

function main(): void {
  const { slug, note } = parseArgs(process.argv.slice(2));
  if (!slug || !isPostSlug(slug)) {
    console.error(
      `usage: npm run storyboard:approve -- <slug> [--note "<note>"]\n` +
        `  <slug> must be a known post (${Object.keys(POST_ASSETS).join(" | ")}).`,
    );
    process.exit(2);
  }
  const docPath = storyboardDocPath(slug);
  if (!fs.existsSync(docPath)) {
    console.error(
      `#1120 storyboard:approve FAILED: no storyboard doc at ${docPath}. ` +
        `Design it first: cp storyboards/_TEMPLATE.md storyboards/${slug}.md`,
    );
    process.exit(1);
  }
  try {
    const p = recordStoryboardApproval(slug, { note });
    console.log(
      `\n#1120 storyboard approved → ${p}\n` +
        `The Leg-0 storyboard gate for "${slug}" is now satisfied (for these exact bytes). ` +
        `Editing the storyboard will auto-expire this approval.`,
    );
  } catch (err) {
    console.error(`#1120 storyboard:approve FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
