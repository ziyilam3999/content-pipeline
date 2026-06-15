/**
 * #871 forge-demo — the copy is within every platform's length limit (#809/#827) AND clean of dev
 * tokens / placeholder URLs / OS-owner paths, and carries the number_verification block + the CTA
 * (github.com/ziyilam3999/forge-harness + MIT).
 */

import * as fs from "fs";
import * as path from "path";

import { assertCopyWithinPlatformLimits } from "../copyLimits";
import { assertNoInternalDevTokens, assertNoPlaceholderUrls } from "../../video/visualRedFlags";

interface ForgeCopy {
  x_thread: string[];
  threads_post: string;
  number_verification: Record<string, string>;
}

const COPY_PATH = path.join(process.cwd(), ".ai-workspace", "posts", "forge-demo-copy.json");
const copy: ForgeCopy = JSON.parse(fs.readFileSync(COPY_PATH, "utf8"));

describe("#871 forge-demo copy", () => {
  test("every X tweet + the Threads post are within the per-platform limits", () => {
    expect(() =>
      assertCopyWithinPlatformLimits({ xThread: copy.x_thread, threadsText: copy.threads_post }),
    ).not.toThrow();
  });

  test("the X thread has 3–4 tweets and the CTA tweet carries the repo URL + MIT", () => {
    expect(copy.x_thread.length).toBeGreaterThanOrEqual(3);
    expect(copy.x_thread.length).toBeLessThanOrEqual(4);
    const cta = copy.x_thread[copy.x_thread.length - 1];
    expect(cta).toContain("github.com/ziyilam3999/forge-harness");
    expect(cta).toContain("MIT");
  });

  test("the public copy is clean of dev tokens / brand and placeholder URLs", () => {
    const strings = [...copy.x_thread, copy.threads_post];
    expect(() => assertNoInternalDevTokens(strings, "forge-demo copy")).not.toThrow();
    expect(() => assertNoPlaceholderUrls(strings, "forge-demo copy")).not.toThrow();
    // no OS-owner home-path leak.
    for (const s of strings) expect(/\/Users\/[^/\s"']+/i.test(s)).toBe(false);
  });

  test("a number_verification block exists and cites the external Sonar source for the stats", () => {
    expect(copy.number_verification).toBeDefined();
    const blob = JSON.stringify(copy.number_verification).toLowerCase();
    expect(blob).toContain("external-cited");
    expect(blob).toContain("sonar state of code");
  });
});
