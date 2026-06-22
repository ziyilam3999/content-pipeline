/**
 * YouTube publish-safety guards — two nets that close the #1120 failure class.
 *
 * THE #1120 ROOT CAUSE (two distinct ways the demo publish almost went wrong):
 *
 *   #1162 — "oops, it's a Short": the demo was MEANT to be a *regular* YouTube video whose
 *           hand-made custom thumbnail is the primary click-driver. But it rendered 9:16 (vertical)
 *           and ≤3min, so YouTube AUTO-classifies it as a SHORT — and in the Shorts shelf YouTube
 *           IGNORES the custom thumbnail. So the thumbnail we made never shows where it matters.
 *           Net: when a post is `format: "regular"` but its hero shape (vertical-or-square) + length
 *           (≤180s) means YouTube will file it as a Short, WARN (default) — operator can escalate to a
 *           hard FAIL via `YOUTUBE_SHORT_GUARD=fail`.
 *
 *   #1163 — "stale video": the file we almost uploaded was an OLD render (9.28 MB) instead of the
 *           approved newer cut (16 MB). Nobody had EYEBALLED the exact bytes about to go out. The repo
 *           already has the #867 eyeball-ack system (a human looks at the rendered frames → an ack
 *           marker is written keyed to the artifact's sha256). Net: in the LIVE upload path, REFUSE to
 *           upload a hero unless an eyeball-ack exists for THAT EXACT file's sha256. In dry-run it's a
 *           WARNING, not a block.
 *
 * KILL-SWITCHES:
 *   - `YOUTUBE_SHORT_GUARD=fail`  → escalate the #1162 short-classification warning to a hard throw.
 *   - `YOUTUBE_HERO_ACK_OFF=1`    → disable the #1163 live hero-ack gate (logged, LOUD).
 *
 * This module is React-free + pure decision + tiny filesystem I/O (sha + ack-marker existence). It
 * reuses the #867 hashing/marker-path utils and NEVER references the YouTube upload op (the #1068
 * handroll-guard stays green) — the ffmpeg part lives only in the smoke caller.
 */

import * as fs from "fs";
import * as path from "path";

import { sha256File, ackPath } from "../video/eyeballAck";

// ── GUARD #1162 — Short-classification warning ─────────────────────────────────────────────────────

/** YouTube classifies a vertical-or-square video ≤3min as a Short (custom thumbnail suppressed). */
export const SHORT_GUARD_MAX_DURATION_SEC = 180;

export interface HeroGeometry {
  width: number;
  height: number;
  durationSec: number;
}

export type ShortGuardLevel = "warn" | "fail";

/** "fail" iff `YOUTUBE_SHORT_GUARD=fail` (case/space-insensitive); otherwise the default "warn". */
export function resolveShortGuardLevel(env: NodeJS.ProcessEnv = process.env): ShortGuardLevel {
  return (env.YOUTUBE_SHORT_GUARD ?? "").trim().toLowerCase() === "fail" ? "fail" : "warn";
}

/**
 * Returns the short-classification warning string iff a `format: "regular"` post's hero will be
 * AUTO-classified as a Short (vertical-or-square AND ≤180s); otherwise null. A `format: "short"` post
 * is SUPPOSED to be a Short, so it never warns.
 */
export function shortClassificationWarning(
  slug: string,
  format: "short" | "regular",
  geo: HeroGeometry,
): string | null {
  if (format === "short") return null;
  const verticalOrSquare = geo.height >= geo.width;
  const shortLength = geo.durationSec <= SHORT_GUARD_MAX_DURATION_SEC;
  if (!(verticalOrSquare && shortLength)) return null;
  return (
    `⚠️  ${slug}: hero is ${geo.width}x${geo.height} / ${Math.round(geo.durationSec)}s → YouTube will ` +
    `classify this as a SHORT, so the custom thumbnail won't display in the Shorts shelf. Render 16:9 ` +
    `(or >3min) for a true regular video, or accept it as a Short.`
  );
}

/**
 * Enforce the short-classification guard. WARN (default, non-blocking, returns the message) or THROW
 * (when level resolves to "fail"). Returns null when there's nothing to warn about.
 */
export function enforceShortClassification(
  slug: string,
  format: "short" | "regular",
  geo: HeroGeometry,
  opts?: { level?: ShortGuardLevel; env?: NodeJS.ProcessEnv; log?: (m: string) => void },
): string | null {
  const msg = shortClassificationWarning(slug, format, geo);
  if (msg === null) return null;
  const level = opts?.level ?? resolveShortGuardLevel(opts?.env);
  if (level === "fail") {
    throw new Error(`YOUTUBE_SHORT_GUARD=fail — ${msg}`);
  }
  (opts?.log ?? console.warn)(msg);
  return msg;
}

// ── GUARD #1163 — hero eyeball-ack (live=block, dry=warn) ───────────────────────────────────────────

/** The live hero-ack gate is disabled via `YOUTUBE_HERO_ACK_OFF=1` (mirrors #867's EYEBALL_ACK_BYPASS). */
export function heroAckOff(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.YOUTUBE_HERO_ACK_OFF === "1";
}

export interface HeroAckStatus {
  acked: boolean;
  sha: string;
  ackPath: string;
}

/**
 * Whether an eyeball-ack marker exists for the hero's EXACT current bytes. `sha256File` throws if the
 * file is missing — that is correct/fail-closed (you cannot ack bytes that don't exist).
 */
export function heroAckStatus(heroPath: string, opts?: { ackRoot?: string }): HeroAckStatus {
  const sha = sha256File(heroPath);
  const p = ackPath(sha, opts);
  return { acked: fs.existsSync(p), sha, ackPath: p };
}

/**
 * Require an eyeball-ack for the hero's EXACT bytes before a live upload. live=true → THROW (block) when
 * un-acked; live=false (dry-run) → WARN. Kill-switch `YOUTUBE_HERO_ACK_OFF=1` disables it (logged).
 */
export function requireHeroEyeballAck(
  heroPath: string,
  opts: { live: boolean; ackRoot?: string; env?: NodeJS.ProcessEnv; label?: string; log?: (m: string) => void },
): void {
  const label = opts.label ?? path.basename(heroPath);

  if (heroAckOff(opts.env)) {
    (opts.log ?? console.warn)(
      `YOUTUBE-HERO-ACK-OFF: gate disabled via YOUTUBE_HERO_ACK_OFF=1 for ${label} — the staged hero ` +
        `bytes were NOT verified as eyeballed.`,
    );
    return;
  }

  const { acked, sha, ackPath: p } = heroAckStatus(heroPath, opts);
  if (acked) {
    (opts.log ?? console.log)(`#1163 HERO-ACK: PASS for ${label} (sha=${sha.slice(0, 12)}…).`);
    return;
  }

  const message =
    `#1163 HERO-ACK ${opts.live ? "BLOCKED" : "WARNING"}: no eyeball-ack for ${label}'s staged bytes ` +
    `(sha256=${sha.slice(0, 12)}…) at ${p}. The hero may be a STALE pre-approval render — eyeball it ` +
    `first: \`npm run eyeball:sheet -- ${heroPath}\` then \`npm run eyeball:ack -- ${heroPath}\`. ` +
    `(kill-switch: YOUTUBE_HERO_ACK_OFF=1)`;

  if (opts.live) {
    throw new Error(message);
  }
  (opts.log ?? console.warn)(message);
}
