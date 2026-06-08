import { buildCopyPrompt, parseCopyResponse, generateCopy, draftText, LlmCaller } from "../generate";
import { ContentSpec } from "../../inputs/contentspec";

const SPEC: ContentSpec = {
  product: { name: "lfah", summary: "A local-first harness that makes a 30-second demo." },
  facts: [
    { label: "Resolved", value: "83.8%", scopeGuard: "n=74", source: "r.md" },
    { label: "Sample", value: "74", source: "r.md" },
  ],
  highlights: ["Test-first"],
  ctas: ["Star the repo"],
  sourceFiles: [],
};

const GOOD = JSON.stringify({
  video_script: "Resolved 83.8% of 74 bugs (n=74). Test-first.",
  x_thread: ["We resolved 83.8% (n=74).", "Star the repo."],
  infographic_labels: ["83.8% resolved", "n=74"],
});
const BAD = JSON.stringify({
  video_script: "We resolved 95% of bugs.",
  x_thread: ["95% resolved!"],
  infographic_labels: ["95%"],
});

describe("buildCopyPrompt", () => {
  const p = buildCopyPrompt(SPEC);
  it("feeds facts verbatim with their scope guards", () => {
    expect(p).toContain("83.8%");
    expect(p).toContain("scope guard: n=74");
  });
  it("states the only-CONTEXT-numbers rule and the JSON output shape", () => {
    expect(p).toMatch(/ONLY numbers/i);
    expect(p).toContain('"video_script"');
  });
});

describe("parseCopyResponse", () => {
  it("parses bare JSON", () => {
    expect(parseCopyResponse(GOOD).video_script).toContain("83.8%");
  });
  it("parses JSON inside ```json fences with surrounding prose", () => {
    const raw = "Sure!\n```json\n" + GOOD + "\n```\nHope that helps.";
    expect(parseCopyResponse(raw).x_thread.length).toBe(2);
  });
  it("throws when a required field is missing", () => {
    expect(() => parseCopyResponse('{"video_script":"x"}')).toThrow();
  });
});

describe("generateCopy", () => {
  it("passes a clean draft on the first attempt", async () => {
    const caller: LlmCaller = async () => GOOD;
    const r = await generateCopy(SPEC, caller);
    expect(r.attempts).toBe(1);
    expect(r.verify.ok).toBe(true);
  });

  it("repairs once: bad numbers first, clean on retry", async () => {
    const seq = [BAD, GOOD];
    let i = 0;
    const caller: LlmCaller = async () => seq[i++];
    const r = await generateCopy(SPEC, caller);
    expect(r.attempts).toBe(2);
    expect(r.verify.ok).toBe(true);
  });

  it("reports failure when the model stays unfactual after the repair pass", async () => {
    const caller: LlmCaller = async () => BAD;
    const r = await generateCopy(SPEC, caller);
    expect(r.attempts).toBe(2);
    expect(r.verify.ok).toBe(false);
    expect(r.verify.unsupportedNumbers).toContain("95%");
  });

  it("draftText concatenates every surface for verification", () => {
    expect(draftText(parseCopyResponse(GOOD))).toContain("Star the repo");
  });
});
