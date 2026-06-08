/**
 * P5 publish plan — take a finished post and get it ready to send out through
 * Typefully (a service that posts to social platforms).
 *
 * The real Typefully connection is injected as a client function (stub in tests),
 * so no real network/API calls are made from this module.
 *
 * Do not modify the test file. This module's 13 exports are the contract.
 */

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export type Platform = "x" | "linkedin" | "threads";

export interface PublishRequest {
  thread: string[];
  targets: Platform[];
}

export interface PlatformPayload {
  target: Platform;
  content: string;
  threadify: boolean;
}

export type PublishClient = (payload: PlatformPayload) => Promise<{ id: string }>;

export interface PublishOutcome {
  target: Platform;
  ok: boolean;
  id?: string;
  error?: string;
}

export interface PublishResult {
  mode: "dry-run" | "live";
  outcomes: PublishOutcome[];
  payloads: PlatformPayload[];
  pathLine: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const PRIMARY_TARGET: Platform = "x";

export const TARGET_ORDER: Platform[] = ["x", "linkedin", "threads"];

export const THREAD_SPLIT = "\n\n\n\n";

// ---------------------------------------------------------------------------
// buildPublishRequest — carry thread posts and targets VERBATIM
// ---------------------------------------------------------------------------

export function buildPublishRequest(thread: string[], targets: Platform[]): PublishRequest {
  return { thread, targets };
}

// ---------------------------------------------------------------------------
// buildPayloads — one payload per requested target, X-first order
// ---------------------------------------------------------------------------

export function buildPayloads(request: PublishRequest): PlatformPayload[] {
  // Filter TARGET_ORDER by membership in request.targets (X-first is guaranteed)
  const activeTargets = TARGET_ORDER.filter((t) => request.targets.includes(t));

  return activeTargets.map((target) => ({
    target,
    content: request.thread.join(THREAD_SPLIT),
    threadify: request.thread.length > 1,
  }));
}

// ---------------------------------------------------------------------------
// publish — dry-run (default) or live (best-effort)
// ---------------------------------------------------------------------------

export async function publish(
  request: PublishRequest,
  client: PublishClient,
  opts?: { live?: boolean },
): Promise<PublishResult> {
  const payloads = buildPayloads(request);

  const isLive = opts?.live === true;
  const mode = isLive ? "live" : "dry-run";

  // Build path-line string for the dry-run case
  const pathLineForDryRun = (): string => {
    const targetStr = payloads.map((p) => p.target).join(",");
    return `PUBLISH-PATH: mode=${mode} targets="${targetStr}" sent=0 dryRun=true`;
  };

  // ------------------------------------------------------------------
  // DRY-RUN: zero client calls, outcomes ok:true with no id
  // ------------------------------------------------------------------
  if (!isLive) {
    const outcomes: PublishOutcome[] = payloads.map((p) => ({
      target: p.target,
      ok: true,
    }));

    return {
      mode,
      outcomes,
      payloads,
      pathLine: pathLineForDryRun(),
    };
  }

  // ------------------------------------------------------------------
  // LIVE: call client best-effort per payload, continue on failure
  // ------------------------------------------------------------------
  const outcomes: PublishOutcome[] = [];

  for (const payload of payloads) {
    try {
      const result = await client(payload);
      outcomes.push({ target: payload.target, ok: true, id: result.id });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outcomes.push({ target: payload.target, ok: false, error: message });
    }
  }

  const sent = outcomes.filter((o) => o.ok && o.id !== undefined).length;
  const targetStr = payloads.map((p) => p.target).join(",");

  return {
    mode,
    outcomes,
    payloads,
    pathLine: `PUBLISH-PATH: mode=${mode} targets="${targetStr}" sent=${sent} dryRun=false`,
  };
}

// ---------------------------------------------------------------------------
// assertDryRunSafe — a pretend run must not carry a real posted id
// ---------------------------------------------------------------------------

export function assertDryRunSafe(result: PublishResult): void {
  if (result.mode === "dry-run") {
    const hasId = result.outcomes.some((o) => o.id !== undefined && o.id !== "");
    if (hasId) {
      throw new Error("Dry-run result must not carry a real posted id");
    }
  }
  // live results with ids are fine — no-op
}
