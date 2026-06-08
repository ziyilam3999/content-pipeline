/**
 * P5 — publish plan (the RED acceptance test lfah must turn green).
 *
 * Scope (operator MCQ 2026-06-08): take the finished launch post and get it READY to send out through
 * Typefully (a service that posts to social platforms for you). The real Typefully connection is
 * INJECTED as a stub, so this test never touches the network or a real account — the real-key publish is
 * a separate human-approved step that stays OFF.
 *
 * Operator picks (2026-06-08):
 *  1. Request shape — a full THREAD (several linked posts) plus a LIST of target platforms.
 *  2. Safety gate  — always PRETEND (dry-run) unless an explicit "really post" switch (opts.live) is on.
 *  3. If one fails — BEST-EFFORT: try every platform on its own; post where it works; report each one.
 *  + Honesty default — a dry-run returns the EXACT payload it WOULD send and makes ZERO network calls
 *    (mirrors the app's smoke-path assertPrimaryProven honesty: never claim a send you didn't make).
 *
 * X (Twitter) is the priority platform and always goes first in the order. A real benchmark/API key is
 * never used here.
 *
 * Do NOT modify this test.
 */
import {
  PRIMARY_TARGET,
  TARGET_ORDER,
  THREAD_SPLIT,
  Platform,
  PublishRequest,
  PlatformPayload,
  PublishClient,
  PublishOutcome,
  PublishResult,
  buildPublishRequest,
  buildPayloads,
  publish,
  assertDryRunSafe,
} from "../publish";

const THREAD = [
  "We built a local-first agent harness that fixes bugs test-first.",
  "It never loses a bug — the chain only ever rescues extra ones.",
  "Star the repo and try it on your own backlog.",
];
const TARGETS: Platform[] = ["x", "linkedin", "threads"];

// A stub Typefully client: records every call and returns a fake draft id — no real network.
const makeStub = (failOn: Platform[] = []) => {
  const calls: PlatformPayload[] = [];
  const client: PublishClient = async (p: PlatformPayload) => {
    calls.push(p);
    if (failOn.includes(p.target)) throw new Error(`platform ${p.target} unavailable (stub)`);
    return { id: `draft_${p.target}` };
  };
  return { client, calls };
};

describe("P5 publish — constants", () => {
  test("X is the primary target and the canonical order is X-first", () => {
    expect(PRIMARY_TARGET).toBe("x");
    expect(TARGET_ORDER).toEqual(["x", "linkedin", "threads"]);
    expect(THREAD_SPLIT.length).toBeGreaterThan(0); // a concrete Typefully thread separator
  });
});

describe("P5 publish — buildPublishRequest", () => {
  test("carries the thread posts VERBATIM and the chosen targets", () => {
    const req: PublishRequest = buildPublishRequest(THREAD, TARGETS);
    expect(req.thread).toEqual(THREAD); // words are never altered or invented
    expect(req.targets).toEqual(TARGETS);
  });
});

describe("P5 publish — buildPayloads (one per target, X-first, exact would-send content)", () => {
  test("emits one payload per target, ALWAYS X-first regardless of the request order", () => {
    const req = buildPublishRequest(THREAD, ["threads", "x", "linkedin"]); // jumbled on purpose
    const payloads = buildPayloads(req);
    expect(payloads.map((p) => p.target)).toEqual(["x", "linkedin", "threads"]); // reordered X-first
  });

  test("each payload's content is the thread joined by the Typefully thread separator, threadify when multi-post", () => {
    const req = buildPublishRequest(THREAD, ["x"]);
    const [payload] = buildPayloads(req);
    expect(payload.target).toBe("x");
    expect(payload.content).toBe(THREAD.join(THREAD_SPLIT)); // the EXACT body Typefully would receive
    THREAD.forEach((post) => expect(payload.content).toContain(post)); // every post present, verbatim
    expect(payload.threadify).toBe(true); // >1 post = a thread
  });

  test("a single-post thread is NOT threadified", () => {
    const req = buildPublishRequest(["just one post"], ["x"]);
    const [payload] = buildPayloads(req);
    expect(payload.content).toBe("just one post");
    expect(payload.threadify).toBe(false);
  });
});

describe("P5 publish — dry-run is the default and makes ZERO network calls", () => {
  test("with no opts, publish PRETENDS: mode is dry-run, the client is never called", async () => {
    const { client, calls } = makeStub();
    const result: PublishResult = await publish(buildPublishRequest(THREAD, TARGETS), client);
    expect(result.mode).toBe("dry-run");
    expect(calls.length).toBe(0); // network-zero proof: nothing was actually sent
    // dry-run still returns the exact payloads it WOULD have sent, so you can eyeball them
    expect(result.payloads.map((p) => p.target)).toEqual(["x", "linkedin", "threads"]);
    result.payloads.forEach((p) => expect(p.content).toBe(THREAD.join(THREAD_SPLIT)));
    // every target reported, none carries a real posted id (nothing went out)
    expect(result.outcomes.map((o) => o.target)).toEqual(["x", "linkedin", "threads"]);
    result.outcomes.forEach((o) => {
      expect(o.ok).toBe(true);
      expect(o.id).toBeUndefined();
    });
    // greppable proof line, like the app's SMOKE-PATH / VOICE-PATH
    expect(result.pathLine).toContain("mode=dry-run");
    expect(result.pathLine).toContain("dryRun=true");
  });

  test("dry-run stays dry even when explicitly passed live:false", async () => {
    const { client, calls } = makeStub();
    const result = await publish(buildPublishRequest(THREAD, TARGETS), client, { live: false });
    expect(result.mode).toBe("dry-run");
    expect(calls.length).toBe(0);
  });
});

describe("P5 publish — live mode sends, X-first, one call per target", () => {
  test("with live:true, the client is called once per target in X-first order and ids come back", async () => {
    const { client, calls } = makeStub();
    const result = await publish(buildPublishRequest(THREAD, ["linkedin", "threads", "x"]), client, { live: true });
    expect(result.mode).toBe("live");
    expect(calls.map((c) => c.target)).toEqual(["x", "linkedin", "threads"]); // sent X-first
    expect(result.outcomes.every((o) => o.ok)).toBe(true);
    expect(result.outcomes.map((o) => o.id)).toEqual(["draft_x", "draft_linkedin", "draft_threads"]);
    expect(result.pathLine).toContain("mode=live");
    expect(result.pathLine).toContain("dryRun=false");
    expect(result.pathLine).toContain("sent=3");
  });
});

describe("P5 publish — best-effort: one platform failing does not block the others", () => {
  test("if LinkedIn is down in live mode, X and Threads still post and LinkedIn is reported failed", async () => {
    const { client, calls } = makeStub(["linkedin"]);
    const result = await publish(buildPublishRequest(THREAD, TARGETS), client, { live: true });
    expect(calls.map((c) => c.target)).toEqual(["x", "linkedin", "threads"]); // all three attempted
    const byTarget = Object.fromEntries(result.outcomes.map((o) => [o.target, o]));
    expect(byTarget.x.ok).toBe(true);
    expect(byTarget.x.id).toBe("draft_x");
    expect(byTarget.threads.ok).toBe(true);
    expect(byTarget.threads.id).toBe("draft_threads");
    expect(byTarget.linkedin.ok).toBe(false); // failed, but did not abort the others
    expect(typeof byTarget.linkedin.error).toBe("string");
    expect(byTarget.linkedin.error!.length).toBeGreaterThan(0);
    expect(byTarget.linkedin.id).toBeUndefined();
    expect(result.pathLine).toContain("sent=2"); // 2 of 3 succeeded
  });
});

describe("P5 publish — assertDryRunSafe (a pretend run must not have really posted)", () => {
  test("passes silently for a clean dry-run", async () => {
    const { client } = makeStub();
    const result = await publish(buildPublishRequest(THREAD, TARGETS), client);
    expect(() => assertDryRunSafe(result)).not.toThrow();
  });

  test("HARD-FAILS (throws) if a dry-run result somehow carries a real posted id", () => {
    const leaky: PublishResult = {
      mode: "dry-run",
      payloads: [],
      outcomes: [{ target: "x", ok: true, id: "draft_x" }], // a real id leaked into a pretend run
      pathLine: "PUBLISH-PATH: mode=dry-run targets=\"x\" sent=0 dryRun=true",
    };
    expect(() => assertDryRunSafe(leaky)).toThrow();
  });

  test("does not throw for a live result that legitimately posted", async () => {
    const { client } = makeStub();
    const result = await publish(buildPublishRequest(THREAD, TARGETS), client, { live: true });
    expect(() => assertDryRunSafe(result)).not.toThrow(); // live ids are expected; only dry-run+id is illegal
  });
});
