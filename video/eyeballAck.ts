/**
 * #867 Leg 1 — the FAIL-CLOSED, both-ends EYEBALL-ACK gate.
 *
 * THE GATE (the load-bearing piece): a PAID step (the `*_PAID=1` voiceover synth) and a PUBLISH step
 * (live Typefully) must NOT run until a human has LOOKED at the rendered pixels and recorded an ack
 * for the EXACT bytes of the artifact. The ack marker (`.ai-workspace/eyeball-ack-<sha256>.json`) is
 * keyed to `sha256(artifact bytes)`:
 *
 *   - no ack for the current bytes               → requireEyeballAck THROWS  (BLOCK).
 *   - ack present for the EXACT current bytes     → requireEyeballAck returns (ALLOW).
 *   - a re-render changes the bytes → new sha → the old ack file no longer matches → THROWS (BLOCK):
 *     a re-render FORCES a fresh eyeball. This is the desired invalidation.
 *
 * DETERMINISM (measured #867): three byte-identical renders of the same demo on this hardware produced
 * the SAME sha256 (Remotion renderMedia is deterministic here — no nondeterministic mux timestamp), so
 * hashing the RAW file bytes does NOT cause annoying false re-acks. Even if a future render were
 * nondeterministic, raw-file hashing is still fail-closed-SAFE: a byte difference only ever forces a
 * re-ack, NEVER a false ALLOW. So we hash raw bytes (simplest + safe) and do not normalize.
 *
 * recordEyeballAck REQUIRES a contact sheet to already exist for the exact sha (you cannot ack bytes
 * you never extracted frames for) — so the human path is: generate the sheet → LOOK → ack. The gate
 * is React-free + pure-filesystem, so it is inside the tsc/jest gate and unit-testable.
 *
 * CI / no-ffmpeg: if the system ffmpeg is absent, no contact sheet can be generated ⇒ no ack can be
 * recorded ⇒ the paid/publish step stays BLOCKED. Fail-closed by construction; no extra skip logic.
 * A real CI fixture that must bypass uses EYEBALL_ACK_BYPASS=1 (logged, narrow — see requireEyeballAck).
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

import { findManifestForSha } from "./contactSheet";

/** The committed marker dir (lives under the repo's .ai-workspace, gitignored scratch is fine). */
export function ackDir(opts?: { ackRoot?: string }): string {
  return opts?.ackRoot ?? path.join(process.cwd(), ".ai-workspace");
}

/** The ack marker path for an artifact sha. */
export function ackPath(artifactSha: string, opts?: { ackRoot?: string }): string {
  return path.join(ackDir(opts), `eyeball-ack-${artifactSha}.json`);
}

/** sha256 of an artifact's exact bytes as lower-case hex. Throws if the file is missing. */
export function sha256File(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    throw new Error(`eyeballAck: artifact does not exist: ${filePath}`);
  }
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

/** The on-disk ack record. */
export interface EyeballAck {
  artifactPath: string;
  /** sha256 of the EXACT artifact bytes this ack is valid for. */
  sha: string;
  ackedAt: string;
  /** The contact-sheet manifest the human looked at (provenance breadcrumb). */
  sheetManifestPath: string;
  /** Optional free-text note from the human (who looked / what they checked). */
  note?: string;
}

export interface AckOpts {
  /** Override the ack marker root (default <cwd>/.ai-workspace). Tests point this at a tmp dir. */
  ackRoot?: string;
  /** Override the contact-sheet review root (default <cwd>/out/review). */
  reviewRoot?: string;
}

/**
 * Record an eyeball-ack for an artifact's CURRENT bytes. REQUIRES that a contact sheet was already
 * generated for THESE exact bytes (no sheet → throw "generate the contact sheet first") — you cannot
 * ack pixels you never extracted. Writes `.ai-workspace/eyeball-ack-<sha>.json`. Returns the ack path.
 */
export function recordEyeballAck(artifactPath: string, opts?: AckOpts & { note?: string }): string {
  const sha = sha256File(artifactPath);
  const manifestPath = findManifestForSha(sha, { reviewRoot: opts?.reviewRoot });
  if (!manifestPath) {
    throw new Error(
      `eyeballAck: cannot record an ack for ${path.basename(artifactPath)} — no contact sheet exists for ` +
        `its current bytes (sha256=${sha.slice(0, 12)}…). Generate the sheet FIRST so there are pixels to ` +
        `look at: \`npm run eyeball:sheet -- ${artifactPath}\`, LOOK at out/review/<slug>/eyeball/${sha.slice(0, 12)}…/sheet.png, ` +
        `then ack.`,
    );
  }
  const dir = ackDir(opts);
  fs.mkdirSync(dir, { recursive: true });
  const ack: EyeballAck = {
    artifactPath: path.resolve(artifactPath),
    sha,
    ackedAt: new Date().toISOString(),
    sheetManifestPath: manifestPath,
    note: opts?.note,
  };
  const p = ackPath(sha, opts);
  fs.writeFileSync(p, JSON.stringify(ack, null, 2) + "\n");
  console.log(`EYEBALL-ACK:${p} (sha=${sha.slice(0, 12)}…)`);
  return p;
}

/**
 * THE FAIL-CLOSED GATE. Call this BEFORE a paid render/VO or a live publish, passing the artifact the
 * operator is about to spend on / send out. THROWS (blocks) unless an ack marker exists for the
 * artifact's EXACT current bytes AND the contact sheet that ack references still exists. No-op
 * (returns) when a matching, valid ack is present.
 *
 * Both-ends boolean:
 *   - missing artifact / missing ack / stale ack (sha mismatch) / dangling sheet → THROW (BLOCK).
 *   - ack for the exact current bytes + sheet present                            → return (ALLOW).
 *
 * Kill-switch: EYEBALL_ACK_BYPASS=1 lets an explicitly-marked CI fixture through (logged, LOUD). Use
 * ONLY for CI that cannot generate a sheet (no system ffmpeg); the default is ENFORCE.
 */
export function requireEyeballAck(
  artifactPath: string,
  opts?: AckOpts & { label?: string },
): void {
  const label = opts?.label ?? path.basename(artifactPath ?? "artifact");

  if (process.env.EYEBALL_ACK_BYPASS === "1") {
    console.warn(
      `EYEBALL-ACK-BYPASS: enforcement disabled via EYEBALL_ACK_BYPASS=1 for ${label} — ` +
        `this MUST only be set for an explicitly-marked CI fixture. The eyeball gate is NOT enforced.`,
    );
    return;
  }

  if (!artifactPath || !fs.existsSync(artifactPath)) {
    throw new Error(
      `#867 EYEBALL-GATE: cannot verify the eyeball-ack for ${label} — the artifact does not exist at ` +
        `${artifactPath}. Refusing the paid/publish step (fail-closed).`,
    );
  }

  const sha = sha256File(artifactPath);
  const p = ackPath(sha, opts);
  if (!fs.existsSync(p)) {
    throw new Error(
      `#867 EYEBALL-GATE BLOCKED: no eyeball-ack for ${label}'s current bytes (sha256=${sha.slice(0, 12)}…). ` +
        `You must LOOK at the rendered pixels before this paid/publish step. Run:\n` +
        `  npm run eyeball:sheet -- ${artifactPath}\n` +
        `then open out/review/<slug>/eyeball/${sha}/sheet.png, and if it looks right:\n` +
        `  npm run eyeball:ack -- ${artifactPath}\n` +
        `A re-render changes the bytes and forces a fresh look (the stale ack no longer matches).`,
    );
  }

  // Validate the marker actually pins THESE bytes + a real sheet (defence against a forged/partial ack).
  let ack: EyeballAck;
  try {
    ack = JSON.parse(fs.readFileSync(p, "utf8")) as EyeballAck;
  } catch (err) {
    throw new Error(
      `#867 EYEBALL-GATE BLOCKED: eyeball-ack at ${p} is unparseable (${err instanceof Error ? err.message : String(err)}). ` +
        `Re-record it: npm run eyeball:ack -- ${artifactPath}`,
    );
  }
  if (ack.sha !== sha) {
    // Should never happen (the filename encodes the sha) but a hand-tampered marker is caught here.
    throw new Error(
      `#867 EYEBALL-GATE BLOCKED: eyeball-ack at ${p} pins sha ${ack.sha?.slice(0, 12)}… but ${label} is now ` +
        `${sha.slice(0, 12)}… — STALE ack (the artifact changed). Re-eyeball + re-ack.`,
    );
  }
  if (!ack.sheetManifestPath || !fs.existsSync(ack.sheetManifestPath)) {
    throw new Error(
      `#867 EYEBALL-GATE BLOCKED: the contact sheet the ack for ${label} references is missing ` +
        `(${ack.sheetManifestPath}). Re-generate the sheet + re-ack so there are real pixels behind the ack.`,
    );
  }
  console.log(`#867 EYEBALL-GATE: PASS for ${label} (sha=${sha.slice(0, 12)}…, acked ${ack.ackedAt}).`);
}
