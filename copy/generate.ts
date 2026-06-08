import { ContentSpec } from '../inputs/contentspec';
import { verifyDraft } from './verifier';

export type LlmCaller = (prompt: string) => Promise<string>;

/**
 * Build a copy-generation prompt from a ContentSpec.
 *
 * - Feeds each fact verbatim alongside its scope guard (e.g. "scope guard: n=74").
 * - States an ONLY-numbers rule so the LLM only emits numbers present in the context.
 * - Includes the output JSON shape with a "video_script" field.
 */
export function buildCopyPrompt(spec: ContentSpec): string {
  const lines: string[] = [];

  lines.push('Build copy from these facts. ONLY numbers from the context are allowed.');

  for (const fact of spec.facts) {
    const guard = fact.scopeGuard ? ` scope guard: ${fact.scopeGuard}` : '';
    lines.push(`  ${fact.label}: ${fact.value}${guard}  (source: ${fact.source})`);
  }

  if (spec.highlights.length > 0) {
    lines.push('Highlights: ' + spec.highlights.join(', '));
  }

  if (spec.ctas.length > 0) {
    lines.push('CTAs: ' + spec.ctas.join(', '));
  }

  lines.push('');
  lines.push(
    'Output JSON with exactly these fields: "video_script" (string), "x_thread" (array of strings), "infographic_labels" (array of strings).',
  );
  lines.push('{ "video_script": "...", "x_thread": ["...", "..."], "infographic_labels": ["...", "..."] }');

  return lines.join('\n');
}

/**
 * Parse a raw LLM response into the expected copy shape.
 *
 * Handles bare JSON and JSON wrapped in a ```json fenced code block
 * with surrounding prose. Throws with a clear message when any
 * required field (video_script, x_thread, infographic_labels) is absent.
 */
export function parseCopyResponse(
  raw: string,
): { video_script: string; x_thread: string[]; infographic_labels: string[] } {
  let jsonStr = raw;

  // Strip a leading ```json fence and surrounding prose
  const fenceMatch = raw.match(/```json\s*\n?([\s\S]*?)\s*```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1];
  }

  const parsed = JSON.parse(jsonStr) as {
    video_script?: string;
    x_thread?: string[];
    infographic_labels?: string[];
  };

  // Throw on any missing required field
  if (parsed.video_script == null) {
    throw new Error('Missing required field: video_script');
  }
  if (parsed.x_thread == null) {
    throw new Error('Missing required field: x_thread');
  }
  if (parsed.infographic_labels == null) {
    throw new Error('Missing required field: infographic_labels');
  }

  return {
    video_script: parsed.video_script,
    x_thread: parsed.x_thread,
    infographic_labels: parsed.infographic_labels,
  };
}

/**
 * Concatenate every output surface into one combined draft for verification.
 */
export function draftText(
  parsed: { video_script: string; x_thread: string[]; infographic_labels: string[] },
): string {
  const parts: string[] = [
    parsed.video_script,
    ...parsed.x_thread,
    ...parsed.infographic_labels,
  ];
  return parts.join(' ');
}

/**
 * Generate copy in one shot (with one repair attempt).
 *
 * 1. Build the prompt and call the LLM.
 * 2. Parse the response and build a combined draft.
 * 3. Verify the draft against the spec.
 * 4. If verification fails (unsupported numbers), make a second call
 *    and re-verify.  Report the final verify result (ok:true or ok:false
 *    with unsupportedNumbers).
 *
 * @returns { attempts, verify }  attempts is 1 for a clean first pass,
 *   2 if the repair loop fired (even if the second pass was still bad).
 */
export async function generateCopy(
  spec: ContentSpec,
  caller: LlmCaller,
): Promise<{ attempts: number; verify: { ok: boolean; unsupportedNumbers: string[] } }> {
  const prompt = buildCopyPrompt(spec);

  // --- First attempt ---
  const firstRaw = await caller(prompt);
  const firstParsed = parseCopyResponse(firstRaw);
  const firstDraft = draftText(firstParsed);
  let verify = verifyDraft(firstDraft, spec);

  if (verify.ok) {
    return { attempts: 1, verify };
  }

  // --- Repair: one second call ---
  const secondRaw = await caller(prompt);
  const secondParsed = parseCopyResponse(secondRaw);
  const secondDraft = draftText(secondParsed);
  verify = verifyDraft(secondDraft, spec);

  return { attempts: 2, verify: { ok: verify.ok, unsupportedNumbers: verify.unsupportedNumbers } };
}
