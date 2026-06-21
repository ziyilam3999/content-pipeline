/**
 * #1120 Leg 0 — the FAIL-CLOSED, both-ends APPROVED-STORYBOARD gate.
 *
 * THE GATE (the load-bearing piece): no capture / paid-voice / stage step may run for a post until a
 * human has DESIGNED a storyboard for it AND the operator has SIGNED OFF on those exact bytes. This is
 * the first leg of making a post ("Leg 0"): design the shot list, get the operator's YES, then film.
 * Without it, a context-less / post-compact agent could start filming with no plan and waste a paid
 * voiceover on a bad cut (Rule 17 — the doctrine alone is instruction-class; this is the mechanical backstop).
 *
 * It MIRRORS `video/eyeballAck.ts` exactly (the proven both-ends, content-hash, fail-closed shape):
 *   - the storyboard doc lives at        storyboards/<slug>.md          (committed; the shot list).
 *   - the approval marker lives at        storyboards/<slug>.approved.json (committed; the operator YES),
 *     pinning `docSha = sha256(doc bytes)`.
 *
 *   - no doc                                  → requireApprovedStoryboard THROWS  (BLOCK).
 *   - doc present, no marker                  → THROWS (get operator sign-off).
 *   - marker `docSha` ≠ current doc sha       → THROWS: editing the storyboard after the YES auto-EXPIRES
 *                                               it (re-approve) — exactly like a re-render expiring an
 *                                               eyeball-ack. This is the desired invalidation.
 *   - unparseable marker                      → THROWS (defence against a forged/partial marker).
 *   - doc + marker present + sha matches      → returns (ALLOW).
 *
 * Unlike eyeball-ack's gitignored, per-render-byte ephemeral marker, the approval marker is COMMITTED next
 * to the doc — storyboard approval is DURABLE (it ships in the PR so CI / other machines see the YES), not
 * per-render ephemeral.
 *
 * HONEST RULE-17 SPLIT (state it loud): this gate checks EXISTENCE + the sha-pinned APPROVED marker =
 * MECHANICAL. Whether the operator ACTUALLY reviewed the storyboard and the YES is honest = irreducible
 * JUDGMENT the gate does NOT and must NOT pretend to verify (identical to the eyeball-ack trust model). The
 * marker is written ONLY by `recordStoryboardApproval`, invoked ONLY via the `storyboard:approve` CLI — no
 * code path rubber-stamps without the operator running it.
 *
 * Pure filesystem + React-free, so it is inside the tsc/jest gate and unit-testable. CI fixture / emergency
 * escape hatch: STORYBOARD_GATE_BYPASS=1 (logged LOUD); the default is ENFORCE.
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

/** Override the storyboards root (default <cwd>/storyboards). Tests point this at a tmp dir. */
export interface StoryboardOpts {
  storyboardRoot?: string;
}

/** The storyboards dir (default <cwd>/storyboards). */
export function storyboardRoot(opts?: StoryboardOpts): string {
  return opts?.storyboardRoot ?? path.join(process.cwd(), "storyboards");
}

/** The storyboard doc path for a slug: storyboards/<slug>.md */
export function storyboardDocPath(slug: string, opts?: StoryboardOpts): string {
  return path.join(storyboardRoot(opts), `${slug}.md`);
}

/** The approval-marker path for a slug: storyboards/<slug>.approved.json */
export function approvalMarkerPath(slug: string, opts?: StoryboardOpts): string {
  return path.join(storyboardRoot(opts), `${slug}.approved.json`);
}

/**
 * Normalize a text doc's line endings BEFORE hashing so the sha is line-ending-INSENSITIVE.
 * git may check the storyboard out with CRLF on Windows and LF on ubuntu/macOS; without this the
 * SAME doc would hash to two different shas across platforms → the committed (LF-computed) marker
 * would read STALE on a Windows CRLF checkout → the gate would falsely BLOCK on its own approved doc.
 * Collapse `\r\n` → `\n` and any lone `\r` → `` so CRLF and LF checkouts produce an IDENTICAL sha.
 */
export function normalizeDocBytes(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\r/g, "");
}

/**
 * sha256 of the storyboard doc, line-ending-NORMALIZED, as lower-case hex. Throws if the doc is missing.
 * Reads as utf8 + normalizes EOLs (see `normalizeDocBytes`) so CRLF/LF checkouts hash identically — the
 * single doc-sha call site, used both to write the approval marker and to validate it, so they can never
 * diverge on byte representation.
 */
export function sha256Doc(slug: string, opts?: StoryboardOpts): string {
  const p = storyboardDocPath(slug, opts);
  if (!fs.existsSync(p)) {
    throw new Error(`storyboardGate: storyboard doc does not exist: ${p}`);
  }
  const normalized = normalizeDocBytes(fs.readFileSync(p, "utf8"));
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/** The on-disk approval record (the operator sign-off). */
export interface StoryboardApproval {
  slug: string;
  /** sha256 of the EXACT storyboard-doc bytes this approval is valid for. */
  docSha: string;
  approvedAt: string;
  /** Optional free-text note from the operator (who signed off / what they checked). */
  note?: string;
}

/** Read + parse the approval marker for a slug. Returns null if absent; THROWS if present-but-unparseable. */
export function readApprovalMarker(slug: string, opts?: StoryboardOpts): StoryboardApproval | null {
  const p = approvalMarkerPath(slug, opts);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as StoryboardApproval;
  } catch (err) {
    throw new Error(
      `#1120 STORYBOARD-GATE BLOCKED: approval marker at ${p} is unparseable ` +
        `(${err instanceof Error ? err.message : String(err)}). Re-approve: npm run storyboard:approve -- ${slug}`,
    );
  }
}

/**
 * Record an operator approval for a storyboard's CURRENT bytes. This is the OPERATOR SIGN-OFF act (the human
 * judgment), invoked ONLY via the `storyboard:approve` CLI — exactly as `recordEyeballAck` is the human
 * "I looked" act. REQUIRES the doc to already exist. Writes `storyboards/<slug>.approved.json`. Returns the
 * marker path.
 */
export function recordStoryboardApproval(slug: string, opts?: StoryboardOpts & { note?: string }): string {
  const docSha = sha256Doc(slug, opts); // throws if the doc is missing
  const dir = storyboardRoot(opts);
  fs.mkdirSync(dir, { recursive: true });
  const approval: StoryboardApproval = {
    slug,
    docSha,
    approvedAt: new Date().toISOString(),
    note: opts?.note,
  };
  const p = approvalMarkerPath(slug, opts);
  fs.writeFileSync(p, JSON.stringify(approval, null, 2) + "\n");
  console.log(`STORYBOARD-APPROVED:${p} (docSha=${docSha.slice(0, 12)}…)`);
  return p;
}

/**
 * THE FAIL-CLOSED GATE. Call this at the EARLIEST point of any capture / paid-voice / stage entrypoint,
 * BEFORE any filming work or paid call, so Leg 0 is the first thing checked. THROWS (blocks) unless an
 * approval marker exists for the storyboard's EXACT current bytes. No-op (returns) when a matching, valid
 * approval is present.
 *
 * Both-ends boolean:
 *   - missing doc / missing marker / stale marker (docSha mismatch) / unparseable marker → THROW (BLOCK).
 *   - marker for the exact current doc bytes                                             → return (ALLOW).
 *
 * Kill-switch: STORYBOARD_GATE_BYPASS=1 lets an explicitly-marked CI fixture / emergency through (logged,
 * LOUD). Use ONLY when there is genuinely no doc/marker to check; the default is ENFORCE.
 */
export function requireApprovedStoryboard(
  slug: string,
  opts?: StoryboardOpts & { label?: string },
): void {
  const label = opts?.label ?? slug;

  if (process.env.STORYBOARD_GATE_BYPASS === "1") {
    console.warn(
      `STORYBOARD-GATE-BYPASS: enforcement disabled via STORYBOARD_GATE_BYPASS=1 for ${label} — ` +
        `this MUST only be set for an explicitly-marked CI fixture / emergency. The storyboard gate is NOT enforced.`,
    );
    return;
  }

  const docPath = storyboardDocPath(slug, opts);
  if (!fs.existsSync(docPath)) {
    throw new Error(
      `#1120 STORYBOARD-GATE BLOCKED: no storyboard doc for "${label}" at ${docPath}. ` +
        `Leg 0 first — design the shot list before any capture/voice/stage:\n` +
        `  cp storyboards/_TEMPLATE.md storyboards/${slug}.md   (then design it)\n` +
        `then get the operator's sign-off:\n` +
        `  npm run storyboard:approve -- ${slug}`,
    );
  }

  const sha = sha256Doc(slug, opts);
  const markerPath = approvalMarkerPath(slug, opts);
  if (!fs.existsSync(markerPath)) {
    throw new Error(
      `#1120 STORYBOARD-GATE BLOCKED: the storyboard for "${label}" has no operator sign-off ` +
        `(${markerPath} missing). Get it approved before filming:\n` +
        `  npm run storyboard:approve -- ${slug}\n` +
        `Editing the storyboard later auto-expires the approval (it is pinned to the doc's bytes).`,
    );
  }

  // Validate the marker actually pins THESE bytes (defence against a forged/partial/stale marker).
  const approval = readApprovalMarker(slug, opts); // THROWS on unparseable
  if (!approval || approval.docSha !== sha) {
    throw new Error(
      `#1120 STORYBOARD-GATE BLOCKED: the approval for "${label}" pins docSha ` +
        `${approval?.docSha?.slice(0, 12)}… but the storyboard is now ${sha.slice(0, 12)}… — ` +
        `the storyboard CHANGED after sign-off (STALE approval). Re-approve:\n` +
        `  npm run storyboard:approve -- ${slug}`,
    );
  }

  console.log(`#1120 STORYBOARD-GATE: PASS for ${label} (docSha=${sha.slice(0, 12)}…, approved ${approval.approvedAt}).`);
}
