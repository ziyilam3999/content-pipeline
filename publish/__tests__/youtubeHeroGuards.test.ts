/**
 * Tests for the two YouTube publish-safety guards (#1162 short-classification + #1163 hero eyeball-ack).
 * Pure: NO ffmpeg, NO network. #1162 cases call the decision fns with fixture geometry; #1163 cases use
 * a tmp file + tmp ackRoot so the real #867 ack root is never touched.
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  SHORT_GUARD_MAX_DURATION_SEC,
  shortClassificationWarning,
  enforceShortClassification,
  resolveShortGuardLevel,
  heroAckStatus,
  requireHeroEyeballAck,
  isSixteenByNine,
  enforceDemoAspectByConstruction,
} from "../youtubeHeroGuards";
import { ackPath } from "../../video/eyeballAck";

describe("#1162 short-classification guard", () => {
  it("vertical + short + regular → warns (non-null, mentions SHORT)", () => {
    const msg = shortClassificationWarning("agent-kanban-demo", "regular", {
      width: 1080,
      height: 1920,
      durationSec: 140,
    });
    expect(typeof msg).toBe("string");
    expect(msg).toContain("SHORT");
  });

  it("16:9 regular → null (a real regular video)", () => {
    expect(
      shortClassificationWarning("agent-kanban-demo", "regular", {
        width: 1920,
        height: 1080,
        durationSec: 140,
      }),
    ).toBeNull();
  });

  it("vertical + short BUT format=short → null (it's supposed to be a Short)", () => {
    expect(
      shortClassificationWarning("some-short", "short", {
        width: 1080,
        height: 1920,
        durationSec: 140,
      }),
    ).toBeNull();
  });

  it("boundary: 180s (vertical, regular) → non-null; 181s → null", () => {
    expect(SHORT_GUARD_MAX_DURATION_SEC).toBe(180);
    expect(
      shortClassificationWarning("x", "regular", { width: 1080, height: 1920, durationSec: 180 }),
    ).not.toBeNull();
    expect(
      shortClassificationWarning("x", "regular", { width: 1080, height: 1920, durationSec: 181 }),
    ).toBeNull();
  });

  it("square (w==h, regular) → non-null", () => {
    expect(
      shortClassificationWarning("x", "regular", { width: 1080, height: 1080, durationSec: 60 }),
    ).not.toBeNull();
  });

  it("enforce: default (no env) WARNs (logs, returns msg, does NOT throw)", () => {
    const logged: string[] = [];
    const result = enforceShortClassification(
      "agent-kanban-demo",
      "regular",
      { width: 1080, height: 1920, durationSec: 140 },
      { log: (m) => logged.push(m) },
    );
    expect(result).toContain("SHORT");
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("SHORT");
  });

  it("enforce: level=fail THROWS", () => {
    expect(() =>
      enforceShortClassification(
        "agent-kanban-demo",
        "regular",
        { width: 1080, height: 1920, durationSec: 140 },
        { level: "fail" },
      ),
    ).toThrow(/YOUTUBE_SHORT_GUARD=fail/);
  });

  it("enforce: returns null + no throw when there's nothing to warn", () => {
    expect(
      enforceShortClassification(
        "x",
        "regular",
        { width: 1920, height: 1080, durationSec: 140 },
        { level: "fail" },
      ),
    ).toBeNull();
  });

  it("resolveShortGuardLevel: env fail → 'fail', empty → 'warn'", () => {
    expect(resolveShortGuardLevel({ YOUTUBE_SHORT_GUARD: "fail" })).toBe("fail");
    expect(resolveShortGuardLevel({ YOUTUBE_SHORT_GUARD: "FAIL" })).toBe("fail");
    expect(resolveShortGuardLevel({})).toBe("warn");
  });
});

describe("#1164 demo-aspect fail-closed guard", () => {
  it("isSixteenByNine: true for 1920x1080, false for 1080x1920 and 1080x1080", () => {
    expect(isSixteenByNine({ width: 1920, height: 1080, durationSec: 140 })).toBe(true);
    expect(isSixteenByNine({ width: 1280, height: 720, durationSec: 30 })).toBe(true);
    expect(isSixteenByNine({ width: 1080, height: 1920, durationSec: 140 })).toBe(false);
    expect(isSixteenByNine({ width: 1080, height: 1080, durationSec: 60 })).toBe(false);
  });

  it("demo + non-16:9 hero THROWS unconditionally (no env, no kill-switch)", () => {
    expect(() =>
      enforceDemoAspectByConstruction("agent-kanban-demo", "demo", {
        width: 1080,
        height: 1920,
        durationSec: 140,
      }),
    ).toThrow(/DEMO-ASPECT FAIL-CLOSED/);
  });

  it("demo + 16:9 hero is a no-op (does not throw)", () => {
    expect(() =>
      enforceDemoAspectByConstruction("agent-kanban-demo", "demo", {
        width: 1920,
        height: 1080,
        durationSec: 140,
      }),
    ).not.toThrow();
  });

  it("intro + 9:16 hero is a no-op (an intro is SUPPOSED to be 9:16)", () => {
    expect(() =>
      enforceDemoAspectByConstruction("some-intro", "intro", {
        width: 1080,
        height: 1920,
        durationSec: 35,
      }),
    ).not.toThrow();
  });
});

describe("#1163 hero eyeball-ack guard", () => {
  let tmpRoot: string;
  let ackRoot: string;
  let file: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hero-ack-"));
    ackRoot = path.join(tmpRoot, "ack");
    fs.mkdirSync(ackRoot, { recursive: true });
    file = path.join(tmpRoot, "hero.mp4");
    fs.writeFileSync(file, Buffer.from("fake-video-bytes-#1163"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("ack present for exact sha → live does NOT throw", () => {
    const { sha } = heroAckStatus(file, { ackRoot });
    fs.writeFileSync(ackPath(sha, { ackRoot }), JSON.stringify({ sha }));
    expect(() => requireHeroEyeballAck(file, { live: true, ackRoot })).not.toThrow();
  });

  it("no ack → live THROWS", () => {
    expect(() => requireHeroEyeballAck(file, { live: true, ackRoot })).toThrow(/HERO-ACK BLOCKED/);
  });

  it("no ack → dry-run does NOT throw and WARNs", () => {
    const logged: string[] = [];
    expect(() =>
      requireHeroEyeballAck(file, { live: false, ackRoot, log: (m) => logged.push(m) }),
    ).not.toThrow();
    expect(logged.some((m) => m.includes("WARNING"))).toBe(true);
  });

  it("kill-switch YOUTUBE_HERO_ACK_OFF=1 → live does NOT throw even with no ack", () => {
    const logged: string[] = [];
    expect(() =>
      requireHeroEyeballAck(file, {
        live: true,
        ackRoot,
        env: { YOUTUBE_HERO_ACK_OFF: "1" } as NodeJS.ProcessEnv,
        log: (m) => logged.push(m),
      }),
    ).not.toThrow();
    expect(logged.some((m) => m.includes("YOUTUBE-HERO-ACK-OFF"))).toBe(true);
  });
});
