/**
 * #824 Fable LEG 1 — capture-harness gate tests (AC 1 + AC 10).
 *
 * Proves the PURE pieces with NO Playwright / NO ffmpeg / NO capture: the 6-beat plan, the
 * paid-free + brand-clean + owner-leak pre-flight gates, and the on-screen stdout scrub. The live
 * capture run is the prove-primary (run locally, out/ artefacts inspected) — these are the
 * mechanical regression contract.
 */

import {
  FABLE_BEATS,
  type FableBeat,
  assertFableBeatsClean,
  ownerLeak,
  scrubStreamChunk,
  buildTerminalHtml,
  buildViewerCardHtml,
  buildViewerVideoHtml,
  CAP_W,
  CAP_H,
} from "../captureFable";

const clone = (): FableBeat[] => FABLE_BEATS.map((b) => ({ ...b, commands: [...b.commands] }));

describe("#824 Fable — the 6-beat storyboard", () => {
  it("has exactly 6 beats, numbered 1..6, with the two HERO viewer beats at 3 (card) and 4 (video)", () => {
    expect(FABLE_BEATS).toHaveLength(6);
    expect(FABLE_BEATS.map((b) => b.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(FABLE_BEATS[2].kind).toBe("viewer-card");
    expect(FABLE_BEATS[3].kind).toBe("viewer-video");
  });

  it("the shipped beats pass the paid-free + brand-clean + owner-clean pre-flight", () => {
    expect(() => assertFableBeatsClean(FABLE_BEATS)).not.toThrow();
  });
});

describe("#824 Fable — assertFableBeatsClean is a REAL gate (AC 1)", () => {
  it("THROWS when any beat types a PAID script (ElevenLabs/nano-banana/Claude denylist)", () => {
    const beats = clone();
    beats[1].commands.push("npm run smoke:voice"); // ElevenLabs — paid
    expect(() => assertFableBeatsClean(beats)).toThrow(/PAID/i);
  });

  it("THROWS on any :paid / :live script variant", () => {
    const beats = clone();
    beats[1].commands = ["npm run smoke:launch-card:paid"];
    expect(() => assertFableBeatsClean(beats)).toThrow(/PAID/i);
  });

  it("THROWS when a beat label carries an employer-brand token (brand gate is wired)", () => {
    // Build the forbidden token programmatically so the literal never appears in source (privacy rule).
    const forbidden = ["sho", "pee"].join("");
    const beats = clone();
    beats[0].stepLabel = `a label mentioning ${forbidden}`;
    expect(() => assertFableBeatsClean(beats)).toThrow();
  });

  it("THROWS when a beat command would leak the OS owner/username", () => {
    for (const leaky of ["ls -la out/image/*.png", "whoami", "echo done; id", "cat /Users/someone/secret"]) {
      const beats = clone();
      beats[4].commands = [leaky];
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
    expect(ownerLeak("ls -gh out/review/lfah/demo/*.mp4")).toBeNull(); // -g suppresses the owner column
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

describe("#824 Fable — page HTML is 9:16 and leaks no path", () => {
  it("terminal + viewer pages declare the 1080×1920 frame and contain no /Users path", () => {
    for (const html of [buildTerminalHtml(), buildViewerCardHtml("data:image/png;base64,AAAA"), buildViewerVideoHtml("http://127.0.0.1:9/x.mp4")]) {
      expect(html).toContain(String(CAP_W));
      expect(html).toContain(String(CAP_H));
      expect(html).not.toMatch(/\/Users\//);
    }
  });
});
