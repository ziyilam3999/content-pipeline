/**
 * #871/#927 — REGENERATE the 3 forge-demo dashboard snapshots from forge-harness's
 * REAL dashboard renderer (v0.47.0+), so the demo video shows the genuine SHIPPED
 * responsive mobile layout (the `@media (max-width: 640px)` vertical grouped-by-status
 * reflow). Run ONCE to (re)produce the committed `assets/forge-demo/dashboard-*.html`;
 * it is NOT part of the build/test graph (the build reads the committed HTML).
 *
 * Honesty: `renderDashboardHtml` IS the product — the same function forge writes to
 * `.forge/dashboard.html` on every run. Staging 3 StoryState fixtures through it is the
 * same honesty class as the prior "pre-captured real dashboard" snapshots, now showing
 * the shipped mobile reflow.
 *
 * The forge-harness dist path is configurable (FORGE_HARNESS_DIST) with a homedir()
 * default — NEVER hardcode an absolute /Users path (CLAUDE.md). Regenerate after any
 * forge-harness dashboard-renderer change, then update the sha256/bytes provenance in
 * `video/__tests__/forgeSpec.test.ts`.
 *
 *   node tools/gen-forge-dashboards.mjs
 *   FORGE_HARNESS_DIST=/path/to/forge-harness/dist/lib/dashboard-renderer.js node tools/gen-forge-dashboards.mjs
 */
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const FORGE_DIST =
  process.env.FORGE_HARNESS_DIST ??
  path.join(os.homedir(), "coding_projects", "forge-harness", "dist", "lib", "dashboard-renderer.js");

if (!fs.existsSync(FORGE_DIST)) {
  console.error(
    `[gen-forge-dashboards] forge-harness renderer not found at:\n  ${FORGE_DIST}\n` +
      `Build forge-harness (npm run build) or set FORGE_HARNESS_DIST to its dist dashboard-renderer.js.`,
  );
  process.exit(1);
}
const { renderDashboardHtml } = await import(FORGE_DIST);

const RENDERED_AT = "2026-06-15T00:00:00.000Z";

function story(storyId, status, evidence = null, retryCount = 0) {
  return { storyId, status, retryCount, retriesRemaining: Math.max(0, 3 - retryCount), priorEvalReport: null, evidence };
}
function brief(stories, status = "in-progress") {
  return {
    status,
    stories,
    readyStories: [],
    depFailedStories: [],
    failedStories: [],
    completedCount: stories.filter((s) => s.status === "done").length,
    totalCount: stories.length,
    budget: { usedUsd: 0.8, budgetUsd: null, remainingUsd: null, incompleteData: false, warningLevel: "none" },
    timeBudget: { elapsedMs: 0, maxTimeMs: null, warningLevel: "none" },
    replanningNotes: [],
    recommendation: "",
    configSource: {},
  };
}
function render({ stories, activity = null, inProgress = [], briefStatus = "in-progress" }) {
  return renderDashboardHtml({
    brief: brief(stories, briefStatus),
    activity,
    auditEntries: [],
    renderedAt: RENDERED_AT,
    inProgressFromRuns: new Set(inProgress),
  });
}

// ── 3 staged states (the DEMO-2 journey: working → retry → done) ───────────────────
// WORKING-GREEN (beat 5, establishing): DEMO-2 actively worked (green Forge Pulse +
// IN PROGRESS column lit). Full board: backlog / ready / in-progress / done populated.
const working = render({
  stories: [
    story("DEMO-1", "done", "passed"),
    story("DEMO-2", "ready"), // routed to IN PROGRESS via inProgressFromRuns
    story("DEMO-3", "ready"),
    story("DEMO-4", "pending"),
    story("DEMO-5", "done", "passed"),
  ],
  // activity.lastUpdate == renderedAt  →  pulseElapsedMs 0  →  working-green pulse.
  // storyId OMITTED on purpose: with a storyId the renderer routes the DEMO-2 STORY
  // card to in-progress AND emits the activity card → a confusing double DEMO-2. We
  // route DEMO-2 via inProgressFromRuns instead, so in-progress shows ONE DEMO-2 story
  // card plus a generic "live" activity strip (the tool that's running).
  activity: {
    tool: "forge_evaluate",
    stage: "evaluate",
    startedAt: RENDERED_AT,
    lastUpdate: RENDERED_AT,
    label: "running acceptance checks",
  },
  inProgress: ["DEMO-2"],
});

// RETRY (beat 6): DEMO-2 bounced to RETRY — a check failed, one prior attempt, retrying.
const retry = render({
  stories: [
    story("DEMO-1", "done", "passed"),
    story("DEMO-2", "ready-for-retry", "AC failed: sum.test.js — 1 prior attempt, retrying", 1),
    story("DEMO-3", "ready"),
    story("DEMO-4", "pending"),
    story("DEMO-5", "done", "passed"),
  ],
});

// ALL-DONE (beat 7, payoff): DEMO-2 passes after 1 retry and joins DONE carrying its
// 1/3-retries evidence badge; the whole plan is shipped.
const allDone = render({
  stories: [
    story("DEMO-1", "done", "passed"),
    story("DEMO-2", "done", "passed after 1 retry", 1),
    story("DEMO-3", "done", "passed"),
    story("DEMO-4", "done", "passed"),
    story("DEMO-5", "done", "passed"),
  ],
  briefStatus: "complete",
});

const OUT_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "assets", "forge-demo");
const targets = [
  ["dashboard-working-green.html", working],
  ["dashboard-idle.html", retry],
  ["dashboard-all-done.html", allDone],
];
for (const [name, html] of targets) {
  const p = path.join(OUT_DIR, name);
  fs.writeFileSync(p, html, "utf8");
  const sha = crypto.createHash("sha256").update(html, "utf8").digest("hex");
  console.log(`${name}  bytes=${Buffer.byteLength(html, "utf8")}  sha256=${sha}`);
}
console.log(`\nWrote 3 snapshots to ${OUT_DIR}`);
console.log("Update the sha256/bytes in video/forgeStoryboard.ts hero provenance + video/__tests__/forgeSpec.test.ts.");
