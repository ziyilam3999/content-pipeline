/**
 * Unit test for the real copy adapter — uses an INJECTED fake caller (no real Claude).
 * The real-Claude path is exercised separately by `smoke/copy-smoke.ts`.
 */

import { writeCopy, type RawCaller } from "../copy";
import { type ContentSpec } from "../../inputs/contentspec";

function spec(): ContentSpec {
  return {
    product: { name: "lfah", summary: "test-driven app builder" },
    facts: [
      { label: "pass rate", value: "83.8%", source: "runs/PHASE-B-VERDICT.md" },
      { label: "bugs", value: "74", source: "runs/PHASE-B-VERDICT.md" },
    ],
    highlights: ["test-first"],
    ctas: ["star the repo"],
    sourceFiles: ["runs/PHASE-B-VERDICT.md"],
  };
}

const cleanJson = JSON.stringify({
  video_script: "lfah passed 83.8% across 74 bugs.",
  x_thread: ["lfah ships test-first.", "83.8% on 74 bugs."],
  infographic_labels: ["83.8% pass", "74 bugs"],
});

describe("writeCopy adapter (injected fake caller)", () => {
  it("maps the parsed JSON into a CopyResult and reports the injected path", async () => {
    const caller: RawCaller = async () => cleanJson;
    const out = await writeCopy(spec(), { caller });

    expect(out.thread).toEqual(["lfah ships test-first.", "83.8% on 74 bugs."]);
    expect(out.script).toBe("lfah passed 83.8% across 74 bugs.");
    expect(out.labels).toEqual(["83.8% pass", "74 bugs"]);
    expect(out.pathUsed).toBe("injected");
    expect(out.attempts).toBe(1);
    expect(out.verify.ok).toBe(true);
  });

  it("feeds the spec's facts into the prompt the caller receives", async () => {
    let seenPrompt = "";
    const caller: RawCaller = async (p) => {
      seenPrompt = p;
      return cleanJson;
    };
    await writeCopy(spec(), { caller });
    expect(seenPrompt).toContain("83.8%");
    expect(seenPrompt).toContain("74");
  });

  it("makes ONE repair retry when the first draft has an unsupported number", async () => {
    const badJson = JSON.stringify({
      video_script: "lfah scored 999% somehow.",
      x_thread: ["999% wow"],
      infographic_labels: ["999%"],
    });
    let call = 0;
    const caller: RawCaller = async () => (++call === 1 ? badJson : cleanJson);
    const out = await writeCopy(spec(), { caller });

    expect(call).toBe(2);
    expect(out.attempts).toBe(2);
    expect(out.verify.ok).toBe(true);
    expect(out.script).toBe("lfah passed 83.8% across 74 bugs.");
  });

  it("reports a still-unsupported number after the repair retry (does not loop forever)", async () => {
    const badJson = JSON.stringify({
      video_script: "still 999% here",
      x_thread: ["999%"],
      infographic_labels: ["999%"],
    });
    let call = 0;
    const caller: RawCaller = async () => {
      call++;
      return badJson;
    };
    const out = await writeCopy(spec(), { caller });

    expect(call).toBe(2);
    expect(out.attempts).toBe(2);
    expect(out.verify.ok).toBe(false);
    expect(out.verify.unsupportedNumbers).toContain("999%");
  });
});
