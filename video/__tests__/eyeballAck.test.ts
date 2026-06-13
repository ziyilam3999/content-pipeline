/**
 * #867 Leg 1 — the fail-closed eyeball-ack gate (both-ends, no ffmpeg needed).
 *
 * Builds a fake artifact + a fake contact-sheet manifest in tmp dirs (so the gate logic is tested in
 * isolation from a real render), then asserts: missing→throw, matching→pass, stale-hash→throw,
 * missing-sheet→throw, and the forged-ack bypass (an ack for a DIFFERENT sha must still block).
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { recordEyeballAck, requireEyeballAck, ackPath, sha256File } from "../eyeballAck";

function sha256(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Create a fake artifact + a contact-sheet manifest for its bytes under a tmp reviewRoot. */
function makeArtifactWithSheet(root: string, bytes: Buffer, slug = "demo"): { artifactPath: string; sha: string; manifestPath: string } {
  const artifactPath = path.join(root, "artifact.mp4");
  fs.writeFileSync(artifactPath, bytes);
  const sha = sha256(bytes);
  const dir = path.join(root, "review", slug, "eyeball", sha);
  fs.mkdirSync(dir, { recursive: true });
  const sheetPath = path.join(dir, "sheet.png");
  fs.writeFileSync(sheetPath, Buffer.from([0x89, 0x50, 0x4e, 0x47])); // PNG magic, non-empty
  const manifestPath = path.join(dir, "contact-sheet-manifest.json");
  fs.writeFileSync(
    manifestPath,
    JSON.stringify({ artifactPath, artifactSha: sha, frameCount: 1, frames: [], sheetPath, grid: { cols: 1, rows: 1 }, generatedAt: new Date().toISOString() }),
  );
  return { artifactPath, sha, manifestPath };
}

describe("#867 requireEyeballAck — fail-closed both-ends", () => {
  let root: string;
  let reviewRoot: string;
  let ackRoot: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "eyeball-ack-"));
    reviewRoot = path.join(root, "review");
    ackRoot = path.join(root, "ack");
    fs.mkdirSync(ackRoot, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.EYEBALL_ACK_BYPASS;
  });

  test("missing ack → THROWS (BLOCK)", () => {
    const { artifactPath } = makeArtifactWithSheet(root, Buffer.from("video-bytes-A"));
    expect(() => requireEyeballAck(artifactPath, { ackRoot, reviewRoot })).toThrow(/EYEBALL-GATE BLOCKED/);
  });

  test("ack for exact bytes → PASSES (ALLOW)", () => {
    const { artifactPath } = makeArtifactWithSheet(root, Buffer.from("video-bytes-A"));
    recordEyeballAck(artifactPath, { ackRoot, reviewRoot });
    expect(() => requireEyeballAck(artifactPath, { ackRoot, reviewRoot })).not.toThrow();
  });

  test("recordEyeballAck without a contact sheet → THROWS (cannot ack pixels you never extracted)", () => {
    const artifactPath = path.join(root, "no-sheet.mp4");
    fs.writeFileSync(artifactPath, Buffer.from("orphan"));
    expect(() => recordEyeballAck(artifactPath, { ackRoot, reviewRoot })).toThrow(/no contact sheet exists/);
  });

  test("stale ack after a re-render (bytes change) → THROWS (forced re-eyeball)", () => {
    const { artifactPath } = makeArtifactWithSheet(root, Buffer.from("video-bytes-A"));
    recordEyeballAck(artifactPath, { ackRoot, reviewRoot });
    expect(() => requireEyeballAck(artifactPath, { ackRoot, reviewRoot })).not.toThrow();
    // re-render → different bytes → different sha → old ack no longer matches
    fs.writeFileSync(artifactPath, Buffer.from("video-bytes-A-RERENDERED"));
    expect(() => requireEyeballAck(artifactPath, { ackRoot, reviewRoot })).toThrow(/EYEBALL-GATE BLOCKED/);
  });

  test("forged ack for a DIFFERENT sha → still BLOCKS", () => {
    const { artifactPath } = makeArtifactWithSheet(root, Buffer.from("video-bytes-A"));
    const otherSha = "a".repeat(64);
    fs.mkdirSync(ackRoot, { recursive: true });
    fs.writeFileSync(
      ackPath(otherSha, { ackRoot }),
      JSON.stringify({ artifactPath, sha: otherSha, ackedAt: new Date().toISOString(), sheetManifestPath: "/nope" }),
    );
    expect(() => requireEyeballAck(artifactPath, { ackRoot, reviewRoot })).toThrow(/EYEBALL-GATE BLOCKED/);
  });

  test("ack present but its referenced contact sheet is gone → THROWS (dangling sheet)", () => {
    const { artifactPath, sha } = makeArtifactWithSheet(root, Buffer.from("video-bytes-A"));
    recordEyeballAck(artifactPath, { ackRoot, reviewRoot });
    // delete the whole review tree → the ack's sheetManifestPath now dangles
    fs.rmSync(reviewRoot, { recursive: true, force: true });
    expect(sha256File(artifactPath)).toBe(sha);
    expect(() => requireEyeballAck(artifactPath, { ackRoot, reviewRoot })).toThrow(/contact sheet .* is missing/);
  });

  test("missing artifact → THROWS (fail-closed)", () => {
    expect(() => requireEyeballAck(path.join(root, "ghost.mp4"), { ackRoot, reviewRoot })).toThrow(
      /artifact does not exist/,
    );
  });

  test("EYEBALL_ACK_BYPASS=1 allows (CI fixture escape hatch, loud)", () => {
    const { artifactPath } = makeArtifactWithSheet(root, Buffer.from("video-bytes-A"));
    process.env.EYEBALL_ACK_BYPASS = "1";
    expect(() => requireEyeballAck(artifactPath, { ackRoot, reviewRoot })).not.toThrow();
  });
});
