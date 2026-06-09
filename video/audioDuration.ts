/**
 * #774 — pure-Node audio duration reader (no ffprobe — it is broken/absent in CI, and
 * afinfo is macOS-only). Supports WAV (exact, from the RIFF chunks) and MP3 (from the
 * MPEG frame header, honoring a Xing/Info VBR header when present, else CBR estimate).
 *
 * WHY this exists: a voiceover's timing alignment (sceneEndTimesSec) is only valid for
 * the EXACT audio it was derived from. The render-time guard
 * (`assertAudioMatchesSync`) reads the audio's REAL duration and refuses a render whose
 * audio length disagrees with the alignment — catching a wrong/old audio file that an
 * internal "sceneEnds[last] === durationSec" check would miss (both can be wrong-but
 * -consistent). See feedback_audio_sync_provenance_binding (#744 incident: a 64.86s old
 * mp3 paired with 84.847s scene timing → 20s drift).
 */

import * as fs from "fs";

/** Read a 16-bit little-endian uint (helper kept local; no deps). */
function readWavDuration(buf: Buffer): number | null {
  if (buf.length < 12 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }
  let byteRate = 0;
  let dataSize = 0;
  let off = 12;
  // Walk the chunks: 4-byte id + 4-byte little-endian size + payload (padded to even).
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === "fmt " && body + 16 <= buf.length) {
      // byteRate is at offset 8 within the fmt body (avg bytes/sec) — the exact divisor.
      byteRate = buf.readUInt32LE(body + 8);
    } else if (id === "data") {
      // Use the chunk's declared size, but clamp to what's actually present (some writers
      // over-declare). The real audio bytes can't exceed the file.
      dataSize = Math.min(size, buf.length - body);
    }
    off = body + size + (size % 2); // chunks are word-aligned
  }
  if (byteRate > 0 && dataSize > 0) return dataSize / byteRate;
  return null;
}

const MPEG_BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG_BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const MPEG_SAMPLERATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG1
  2: [22050, 24000, 16000], // MPEG2
  0: [11025, 12000, 8000], // MPEG2.5
};

function readMp3Duration(buf: Buffer): number | null {
  let off = 0;
  // Skip an ID3v2 tag if present: "ID3" + ver(2) + flags(1) + size(4 syncsafe).
  if (buf.length > 10 && buf.toString("ascii", 0, 3) === "ID3") {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    off = 10 + size;
  }
  // Find the first MPEG audio frame sync (11 bits set).
  while (off + 4 <= buf.length && !(buf[off] === 0xff && (buf[off + 1] & 0xe0) === 0xe0)) off++;
  if (off + 4 > buf.length) return null;
  const b1 = buf[off + 1];
  const b2 = buf[off + 2];
  const versionBits = (b1 >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
  const layerBits = (b1 >> 1) & 0x03; // 1 = Layer III
  const bitrateIdx = (b2 >> 4) & 0x0f;
  const sampleRateIdx = (b2 >> 2) & 0x03;
  if (layerBits !== 0x01 || bitrateIdx === 0 || bitrateIdx === 0x0f || sampleRateIdx === 0x03) return null;
  const sampleRate = (MPEG_SAMPLERATES[versionBits] ?? [])[sampleRateIdx];
  if (!sampleRate) return null;
  const bitrate = (versionBits === 3 ? MPEG_BITRATES_V1_L3 : MPEG_BITRATES_V2_L3)[bitrateIdx] * 1000;
  const samplesPerFrame = versionBits === 3 ? 1152 : 576;

  // Look for a Xing/Info VBR header — ONLY within the first frame's header+side-info
  // region (a legit tag sits ~9..36 bytes after the frame sync). Bounding the search
  // prevents a stray "Xing"/"Info" byte sequence deep in the audio payload from being
  // mistaken for a VBR header (which would yield a wildly wrong frame count / duration).
  const searchEnd = Math.min(buf.length, off + 40);
  const window = buf.subarray(off + 4, searchEnd);
  let rel = window.indexOf("Xing", 0, "ascii");
  if (rel < 0) rel = window.indexOf("Info", 0, "ascii");
  const tagOff = rel >= 0 ? off + 4 + rel : -1;
  if (tagOff >= 0 && tagOff + 12 <= buf.length) {
    const flags = buf.readUInt32BE(tagOff + 4);
    if (flags & 0x1) {
      const frames = buf.readUInt32BE(tagOff + 8);
      if (frames > 0) return (frames * samplesPerFrame) / sampleRate;
    }
  }
  // CBR estimate: audio bytes * 8 / bitrate.
  const audioBytes = buf.length - off;
  if (bitrate > 0) return (audioBytes * 8) / bitrate;
  return null;
}

/**
 * Best-effort audio duration in seconds for a WAV or MP3 file. Returns null when the
 * format can't be parsed (the caller decides whether that is fatal).
 */
export function audioDurationSec(filePath: string): number | null {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF") return readWavDuration(buf);
  // MP3 (with or without a leading ID3 tag, or a bare frame sync).
  if (
    (buf.length >= 3 && buf.toString("ascii", 0, 3) === "ID3") ||
    (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)
  ) {
    return readMp3Duration(buf);
  }
  // Fall back to trying both shapes.
  return readWavDuration(buf) ?? readMp3Duration(buf);
}

/** How far the audio length may differ from the alignment's last scene end (seconds). */
export const AUDIO_SYNC_TOLERANCE_SEC = 1.5;

/**
 * Provenance guard: refuse a render whose audio length disagrees with the alignment the
 * scene cuts are timed to. Catches a wrong/old audio file paired with a saved
 * sceneEndTimesSec (#744). No-op when the duration can't be read (don't false-block on an
 * unparseable but possibly-fine file — log via the returned reason instead).
 */
export function assertAudioMatchesSync(
  audioPath: string,
  sceneEndTimesSec: number[],
  opts?: { toleranceSec?: number },
): void {
  if (!sceneEndTimesSec || sceneEndTimesSec.length === 0) return;
  const expected = sceneEndTimesSec[sceneEndTimesSec.length - 1];
  const tol = opts?.toleranceSec ?? AUDIO_SYNC_TOLERANCE_SEC;
  const actual = audioDurationSec(audioPath);
  if (actual == null) return; // unparseable → don't false-block; the smoke still eyeballs sync
  if (Math.abs(actual - expected) > tol) {
    throw new Error(
      `audio/sync provenance mismatch: audio "${audioPath}" is ${actual.toFixed(2)}s but the ` +
        `scene alignment ends at ${expected.toFixed(2)}s (tolerance ${tol}s). The sceneEndTimesSec ` +
        `was derived from a DIFFERENT audio synth — render with the audio the alignment came from, ` +
        `or re-derive the alignment from this audio. See feedback_audio_sync_provenance_binding.`,
    );
  }
}
