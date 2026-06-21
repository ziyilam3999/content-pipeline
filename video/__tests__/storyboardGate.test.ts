/**
 * #1120 Leg 0 — the fail-closed approved-storyboard gate (both-ends), mirroring eyeballAck.test.ts.
 *
 * Builds a fake storyboard doc + approval marker in a tmp `storyboardRoot` (so the gate logic is tested in
 * isolation), then asserts: missing-doc→throw, missing-marker→throw, stale-sha→throw, unparseable→throw,
 * valid→pass, BYPASS→pass. The stale-sha case proves the sha-pin is load-bearing: re-writing the doc after
 * approval flips a passing case RED (editing the storyboard auto-expires the YES). A final block proves it
 * on the REAL shipped `agent-kanban-demo` doc + marker (PASS) and a tampered-sha fixture (FAIL).
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  requireApprovedStoryboard,
  recordStoryboardApproval,
  approvalMarkerPath,
  storyboardDocPath,
  sha256Doc,
} from "../storyboardGate";

const DOC_A = "# Storyboard — demo\n\nspine: a one-line through-line.\n";

describe("#1120 requireApprovedStoryboard — fail-closed both-ends", () => {
  let root: string;
  let storyboardRoot: string;
  const slug = "demo-post";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "storyboard-gate-"));
    storyboardRoot = path.join(root, "storyboards");
    fs.mkdirSync(storyboardRoot, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.STORYBOARD_GATE_BYPASS;
  });

  function writeDoc(bytes: string): void {
    fs.writeFileSync(storyboardDocPath(slug, { storyboardRoot }), bytes);
  }

  // ── THROW × 4 ──────────────────────────────────────────────────────────────
  test("missing doc → THROWS (BLOCK)", () => {
    expect(() => requireApprovedStoryboard(slug, { storyboardRoot })).toThrow(/STORYBOARD-GATE BLOCKED/);
  });

  test("doc present, NO marker → THROWS (no operator sign-off)", () => {
    writeDoc(DOC_A);
    expect(() => requireApprovedStoryboard(slug, { storyboardRoot })).toThrow(/no operator sign-off/);
  });

  test("stale sha after the doc is edited post-approval → THROWS (forced re-approval)", () => {
    writeDoc(DOC_A);
    recordStoryboardApproval(slug, { storyboardRoot });
    expect(() => requireApprovedStoryboard(slug, { storyboardRoot })).not.toThrow();
    // edit the storyboard AFTER sign-off → different bytes → different sha → old approval no longer matches
    writeDoc(DOC_A + "\nADDED A BEAT after the YES.\n");
    expect(() => requireApprovedStoryboard(slug, { storyboardRoot })).toThrow(/STALE approval/);
  });

  test("unparseable marker → THROWS (forged/partial marker)", () => {
    writeDoc(DOC_A);
    fs.writeFileSync(approvalMarkerPath(slug, { storyboardRoot }), "{ not json");
    expect(() => requireApprovedStoryboard(slug, { storyboardRoot })).toThrow(/unparseable/);
  });

  // ── RETURN × 2 ─────────────────────────────────────────────────────────────
  test("doc + marker pinning the CURRENT sha → PASSES (ALLOW)", () => {
    writeDoc(DOC_A);
    recordStoryboardApproval(slug, { storyboardRoot });
    expect(() => requireApprovedStoryboard(slug, { storyboardRoot })).not.toThrow();
  });

  test("STORYBOARD_GATE_BYPASS=1 + no doc → PASSES (CI escape hatch, loud)", () => {
    process.env.STORYBOARD_GATE_BYPASS = "1";
    expect(() => requireApprovedStoryboard(slug, { storyboardRoot })).not.toThrow();
  });

  // ── A hand-tampered marker for a DIFFERENT sha still BLOCKS ─────────────────
  test("marker pins a wrong/forged docSha → still BLOCKS", () => {
    writeDoc(DOC_A);
    fs.writeFileSync(
      approvalMarkerPath(slug, { storyboardRoot }),
      JSON.stringify({ slug, docSha: "a".repeat(64), approvedAt: new Date().toISOString() }),
    );
    expect(() => requireApprovedStoryboard(slug, { storyboardRoot })).toThrow(/STALE approval/);
  });
});

describe("#1120 requireApprovedStoryboard — the REAL shipped agent-kanban-demo doc", () => {
  const realSlug = "agent-kanban-demo";
  // The gate's default root is <cwd>/storyboards; jest runs from the repo root, so the committed doc + marker
  // are discovered with no opts — this is the same shape CI runs.

  test("the committed demo doc + marker → PASSES (first post satisfies the gate)", () => {
    expect(() => requireApprovedStoryboard(realSlug)).not.toThrow();
  });

  test("the committed marker's docSha equals the committed doc's current sha256", () => {
    const docSha = sha256Doc(realSlug);
    const marker = JSON.parse(fs.readFileSync(approvalMarkerPath(realSlug), "utf8")) as { docSha: string };
    expect(marker.docSha).toBe(docSha);
  });

  test("a tampered/zeroed marker sha (copied to a tmp root) → FAILS (no false ALLOW)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "storyboard-real-tamper-"));
    const tmpRoot = path.join(tmp, "storyboards");
    fs.mkdirSync(tmpRoot, { recursive: true });
    // copy the REAL doc verbatim, but write a marker whose docSha is WRONG → must block.
    fs.copyFileSync(storyboardDocPath(realSlug), storyboardDocPath(realSlug, { storyboardRoot: tmpRoot }));
    fs.writeFileSync(
      approvalMarkerPath(realSlug, { storyboardRoot: tmpRoot }),
      JSON.stringify({ slug: realSlug, docSha: "0".repeat(64), approvedAt: new Date().toISOString() }),
    );
    expect(() => requireApprovedStoryboard(realSlug, { storyboardRoot: tmpRoot })).toThrow(/STALE approval/);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
