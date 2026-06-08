/**
 * REAL copy adapter — fulfils the orchestrator's injected `writeCopy` slot.
 *
 * Calls the real Claude CLI in print mode (Claude Max OAuth — ambient `claude` login,
 * NEVER a pay-as-you-go ANTHROPIC_API_KEY), parses the JSON copy, number-verifies it
 * against the spec (one repair retry), and maps it to a `CopyResult`.
 *
 * By design there is NO silent local fallback: the default caller is Claude-only and
 * THROWS on failure. A fallback only happens if a caller is explicitly injected. This is
 * what lets the smoke PROVE the primary path instead of quietly passing on a backup.
 */

import { spawn } from "child_process";

import { type ContentSpec } from "../inputs/contentspec";
import { buildCopyPrompt, parseCopyResponse, draftText } from "../copy/generate";
import { verifyDraft } from "../copy/verifier";
import { type CopyResult } from "../pipeline/run";

export type CopyPath = "claude" | "injected";

/** A raw text-in / text-out caller (the real one shells out to `claude`; tests inject a fake). */
export type RawCaller = (prompt: string) => Promise<string>;

/**
 * Build the real Claude caller. Shells out to `claude -p` (print/non-interactive) and
 * feeds the prompt on stdin. Refuses to run if ANTHROPIC_API_KEY is set (we want the Max
 * subscription via OAuth, not metered API billing).
 */
export function claudeCaller(opts?: { model?: string; timeoutMs?: number }): RawCaller {
  return (prompt: string) =>
    new Promise<string>((resolve, reject) => {
      if (process.env.ANTHROPIC_API_KEY) {
        reject(
          new Error(
            "ANTHROPIC_API_KEY is set — refusing pay-as-you-go. Unset it and use the Claude Max OAuth login.",
          ),
        );
        return;
      }
      const args = ["-p"];
      if (opts?.model) args.push("--model", opts.model);
      const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("claude CLI timed out"));
      }, opts?.timeoutMs ?? 120_000);
      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", (d) => (err += d.toString()));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0 && out.trim()) resolve(out);
        else reject(new Error(`claude CLI exited ${code}: ${err.slice(0, 300)}`));
      });
      child.stdin.write(prompt);
      child.stdin.end();
    });
}

/** A CopyResult plus provenance the smoke checks (extra fields are ignored by the orchestrator). */
export interface WriteCopyOutcome extends CopyResult {
  pathUsed: CopyPath;
  attempts: number;
  verify: { ok: boolean; unsupportedNumbers: string[] };
}

/**
 * Generate launch copy for a spec. `deps.caller` defaults to the real Claude caller; tests
 * inject a fake. Parses the model's JSON, number-verifies the combined draft, and on an
 * unsupported-number failure makes ONE repair call. Always returns a CopyResult shape.
 */
export async function writeCopy(
  spec: ContentSpec,
  deps?: { caller?: RawCaller },
): Promise<WriteCopyOutcome> {
  const caller = deps?.caller ?? claudeCaller();
  const pathUsed: CopyPath = deps?.caller ? "injected" : "claude";
  const prompt = buildCopyPrompt(spec);

  const callOnce = async () => {
    const raw = await caller(prompt);
    const parsed = parseCopyResponse(raw);
    const verify = verifyDraft(draftText(parsed), spec);
    return { parsed, verify };
  };

  let { parsed, verify } = await callOnce();
  let attempts = 1;
  if (!verify.ok) {
    ({ parsed, verify } = await callOnce());
    attempts = 2;
  }

  return {
    thread: parsed.x_thread,
    script: parsed.video_script,
    labels: parsed.infographic_labels,
    pathUsed,
    attempts,
    verify: { ok: verify.ok, unsupportedNumbers: verify.unsupportedNumbers },
  };
}
