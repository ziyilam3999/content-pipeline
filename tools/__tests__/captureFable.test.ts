/**
 * #824 Fable — capture-harness gate tests (REVISED ~90s, 8-beat storyboard).
 *
 * Proves the PURE pieces with NO Playwright / NO ffmpeg / NO capture: the 8-beat plan, the agent-interface
 * REFRAME (the chat beat + the tool/output labels), the VISUALLY DISTINCT tool-vs-output backgrounds, the
 * paid-free + brand-clean + owner-leak pre-flight gates, and the on-screen stdout scrub. The live capture
 * run is the prove-primary (run locally, out/ artefacts eyeballed); these are the mechanical regression.
 */

import {
  FABLE_BEATS,
  type FableBeat,
  assertFableBeatsClean,
  ownerLeak,
  scrubStreamChunk,
  publicSafeLine,
  filterPublicLines,
  buildTerminalHtml,
  buildChatHtml,
  buildTitleHtml,
  buildTransitionHtml,
  buildViewerCardHtml,
  buildViewerVideoHtml,
  BG_TOOL,
  BG_OUTPUT_A,
  CAP_W,
  CAP_H,
} from "../captureFable";

const clone = (): FableBeat[] => FABLE_BEATS.map((b) => ({ ...b, commands: [...b.commands] }));

describe("#824 Fable — the REVISED ~90s 8-beat storyboard", () => {
  it("has 8 beats, numbered 1..8, in the approved order", () => {
    expect(FABLE_BEATS).toHaveLength(8);
    expect(FABLE_BEATS.map((b) => b.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(FABLE_BEATS.map((b) => b.kind)).toEqual([
      "title", "chat", "terminal", "transition", "viewer-card", "viewer-video", "title", "title",
    ]);
  });

  it("totals ~90s (acceptance bar: 85–92s), up from the rejected 31s cut", () => {
    const total = FABLE_BEATS.reduce((s, b) => s + b.clipSec, 0);
    expect(total).toBeGreaterThanOrEqual(85);
    expect(total).toBeLessThanOrEqual(92);
  });

  it("opens with a HOOK title beat (hard requirement 2)", () => {
    expect(FABLE_BEATS[0].kind).toBe("title");
    expect(FABLE_BEATS[0].headline && FABLE_BEATS[0].headline.length).toBeGreaterThan(0);
  });

  it("makes the agent-interface reframe explicit — a CHAT beat (human natural language) + tool labeled 'the agent's interface, not yours' (hard requirement 3)", () => {
    const chat = FABLE_BEATS.find((b) => b.kind === "chat")!;
    expect(chat).toBeDefined();
    expect(chat.chatRequest && chat.chatRequest.length).toBeGreaterThan(10); // a real NL request
    expect(chat.stepLabel.toLowerCase()).toContain("claude code"); // "you → Claude Code · plain English"
    const tool = FABLE_BEATS.find((b) => b.kind === "terminal")!;
    expect(tool.stepLabel.toLowerCase()).toContain("the agent's interface");
    expect(tool.stepLabel.toLowerCase()).toContain("not yours");
  });

  it("has an explicit TRANSITION beat between the tool and the output (hard requirement 4)", () => {
    const toolIdx = FABLE_BEATS.findIndex((b) => b.kind === "terminal");
    const transIdx = FABLE_BEATS.findIndex((b) => b.kind === "transition");
    const cardIdx = FABLE_BEATS.findIndex((b) => b.kind === "viewer-card");
    expect(transIdx).toBeGreaterThan(toolIdx);
    expect(transIdx).toBeLessThan(cardIdx);
  });

  it("labels BOTH output beats 'the output' (hard requirement 5)", () => {
    for (const b of FABLE_BEATS.filter((x) => x.kind === "viewer-card" || x.kind === "viewer-video")) {
      expect(b.stepLabel).toBe("the output");
    }
  });

  it("the shipped beats pass the paid-free + brand-clean + owner-clean pre-flight", () => {
    expect(() => assertFableBeatsClean(FABLE_BEATS)).not.toThrow();
  });
});

describe("#824 Fable — the TOOL and the OUTPUT have VISUALLY DISTINCT backgrounds (hard requirement 5)", () => {
  it("the tool world (terminal) is the dark navy bg; the output world (card/video) is a DIFFERENT light bg", () => {
    const term = buildTerminalHtml("content-pipeline — the agent's interface, not yours", "content-pipeline");
    const card = buildViewerCardHtml("data:image/png;base64,AAAA");
    const video = buildViewerVideoHtml("http://127.0.0.1:9/x.mp4");
    expect(term).toContain(BG_TOOL); // tool = dark navy
    expect(card).toContain(BG_OUTPUT_A); // output = light cream
    expect(video).toContain(BG_OUTPUT_A);
    // the two worlds must NOT share a background colour
    expect(BG_TOOL).not.toBe(BG_OUTPUT_A);
    expect(card).not.toContain(`background:${BG_TOOL}`);
  });

  it("the output beats carry the 'the output' label and the tool beat carries the agent-interface label", () => {
    expect(buildViewerCardHtml("data:image/png;base64,AAAA", "the output")).toContain("the output");
    expect(buildViewerVideoHtml("http://127.0.0.1:9/x.mp4", "the output")).toContain("the output");
    expect(buildTerminalHtml("content-pipeline — the agent's interface, not yours", "content-pipeline")).toContain("the agent's interface");
  });

  it("the chat surface carries the 'you → Claude Code' label", () => {
    expect(buildChatHtml("you → Claude Code · plain English")).toContain("Claude Code");
  });

  it("the transition embeds the real card image (an explicit handoff, not a hard cut)", () => {
    const t = buildTransitionHtml("data:image/png;base64,ZZZZ");
    expect(t).toContain("data:image/png;base64,ZZZZ");
    expect(t).toContain(BG_TOOL); // starts in the tool world
    expect(t).toContain(BG_OUTPUT_A); // wipes to the output world
  });
});

describe("#824 Fable — assertFableBeatsClean is a REAL gate (AC 1)", () => {
  it("THROWS when any beat types a PAID script (ElevenLabs/nano-banana/Claude denylist)", () => {
    const beats = clone();
    beats[2].commands.push("npm run smoke:voice"); // ElevenLabs — paid (beat 3 is the terminal beat)
    expect(() => assertFableBeatsClean(beats)).toThrow(/PAID/i);
  });

  it("THROWS on any :paid / :live script variant", () => {
    const beats = clone();
    beats[2].commands = ["npm run smoke:launch-card:paid"];
    expect(() => assertFableBeatsClean(beats)).toThrow(/PAID/i);
  });

  it("THROWS when a beat label carries an employer-brand token (brand gate is wired)", () => {
    const forbidden = ["sho", "pee"].join("");
    const beats = clone();
    beats[0].stepLabel = `a label mentioning ${forbidden}`;
    expect(() => assertFableBeatsClean(beats)).toThrow();
  });

  it("THROWS when a TITLE headline / chat request carries an employer-brand token (every text field is gated)", () => {
    const forbidden = ["sho", "pee"].join("");
    const a = clone();
    a[0].headline = `built for ${forbidden}`;
    expect(() => assertFableBeatsClean(a)).toThrow();
    const b = clone();
    b[1].chatRequest = `make a post about ${forbidden}`;
    expect(() => assertFableBeatsClean(b)).toThrow();
  });

  it("THROWS when a beat command would leak the OS owner/username", () => {
    for (const leaky of ["ls -la out/image/*.png", "whoami", "echo done; id", "cat /Users/someone/secret"]) {
      const beats = clone();
      beats[2].commands = [leaky];
      expect(() => assertFableBeatsClean(beats)).toThrow();
    }
  });
});

describe("#824 Fable — ownerLeak detector (AC 10)", () => {
  it("CATCHES the owner-leaking forms it must forbid", () => {
    expect(ownerLeak("ls -la out/review/lfah/demo/*.mp4")).toBeTruthy();
    expect(ownerLeak("ls -l")).toBeTruthy();
    expect(ownerLeak("ls -lh out/image/*.png")).toBeTruthy();
    expect(ownerLeak("whoami")).toBeTruthy();
    expect(ownerLeak("echo hi; id")).toBeTruthy();
    expect(ownerLeak("stat -f '%Su %z' file")).toBeTruthy();
    expect(ownerLeak("cat /Users/alice/.ssh/id_rsa")).toBeTruthy();
  });

  it("does NOT false-positive on the owner-less forms the beats actually use", () => {
    expect(ownerLeak("ls -gh out/review/lfah/demo/*.mp4")).toBeNull();
    expect(ownerLeak("ls -gh out/image/*.png")).toBeNull();
    expect(ownerLeak("ls")).toBeNull();
    expect(ownerLeak("cat package.json | head -5")).toBeNull();
    expect(ownerLeak('echo "content-pipeline — open-source, MIT — link below"')).toBeNull();
  });
});

describe("#824 Fable — scrubStreamChunk keeps captured stdout username-clean (AC 10)", () => {
  it("rewrites any /Users/<name> path to ~ and strips ANSI", () => {
    const scrubbed = scrubStreamChunk("\x1b[32mwrote\x1b[0m /Users/jdoe/coding_projects/x/out/a.mp4");
    expect(scrubbed).not.toMatch(/\/Users\//);
    expect(scrubbed).not.toMatch(/\x1b\[/);
    expect(scrubbed).toContain("~");
  });

  it("rewrites an OS /var/folders tmp dir", () => {
    const scrubbed = scrubStreamChunk("frames in /var/folders/ab/cd1234/T/demo-frames-smoke-9Td2lN");
    expect(scrubbed).not.toMatch(/\/var\/folders\//);
    expect(scrubbed).toContain("<tmp>");
  });

  it("collapses the repo-root absolute prefix to a repo-relative path", () => {
    const scrubbed = scrubStreamChunk(`${process.cwd()}/out/review/fable/x.mp4`);
    expect(scrubbed.startsWith("./out/") || scrubbed.startsWith("out/")).toBe(true);
  });
});

describe("#824 Fable — public-safe stdout curation scrubs dev-process text (DEFECT 2)", () => {
  it("DROPS the exact internal lines the producers emit (task refs / Phase / tell me / watch / smoke)", () => {
    for (const leak of [
      "=== #748 demo-video smoke — honest 4-way lfah product demo (60s, silent/free) ===",
      "Watch it and tell me what to change — Phase D / #744 will add the real voiceover.",
      "SMOKE PASS: animated demo MP4 rendered.",
      "SMOKE-PATH: renderer=playwright-chromium file=./out/image/card-9x16.png",
    ]) {
      expect(publicSafeLine(leak)).toBe(false);
    }
  });

  it("KEEPS clean command-result lines a public viewer may see", () => {
    for (const ok of [
      "→ rendering the result card to a real PNG via headless Chromium…",
      "  valid PNG, 1080x1920, 452.7 KB",
      'DEMO-PATH: file="./out/review/lfah/demo/demo-9x16.mp4" bytes=5586668 dur=60s render=12.3s',
    ]) {
      expect(publicSafeLine(ok)).toBe(true);
    }
  });

  it("filterPublicLines removes only the unsafe lines from a multi-line chunk", () => {
    const chunk = "→ rendering the result card…\n=== #748 demo smoke ===\nDEMO-PATH: file=\"./out/x.mp4\"\nWatch it and tell me what to change\n";
    const out = filterPublicLines(chunk);
    expect(out).not.toMatch(/#\d/);
    expect(out).not.toMatch(/tell me/i);
    expect(out).not.toMatch(/\bsmoke\b/i);
    expect(out).toContain("rendering the result card");
    expect(out).toContain("DEMO-PATH");
  });
});

describe("#824 Fable — every page HTML is 9:16 and leaks no path", () => {
  it("all six page builders declare the 1080×1920 frame and contain no /Users path", () => {
    const htmls = [
      buildTerminalHtml(undefined, "content-pipeline"),
      buildChatHtml(),
      buildTitleHtml({ headline: "This tool has no buttons.", sub: "Because you're not the one using it." }),
      buildTransitionHtml("data:image/png;base64,AAAA"),
      buildViewerCardHtml("data:image/png;base64,AAAA"),
      buildViewerVideoHtml("http://127.0.0.1:9/x.mp4"),
    ];
    for (const html of htmls) {
      expect(html).toContain(String(CAP_W));
      expect(html).toContain(String(CAP_H));
      expect(html).not.toMatch(/\/Users\//);
    }
  });
});
