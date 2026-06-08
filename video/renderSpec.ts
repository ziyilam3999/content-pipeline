/**
 * P4d — render-spec plan (the BLUEPRINT a video renderer follows).
 *
 * Takes the audio-visual plan from the wiring step (the spoken script, the voice clip,
 * and the timed captions) plus a handle to the result-card picture, and produces one
 * render spec per screen shape. No real video is rendered here — pure deterministic
 * functions, no network / API.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Aspect {
  name: string;
  width: number;
  height: number;
}

export const ASPECTS: Aspect[] = [
  { name: "1:1", width: 1080, height: 1080 },
  { name: "9:16", width: 1080, height: 1920 },
  { name: "4:5", width: 1080, height: 1350 },
];

export const CAPTION_BAND_Y = 0.78;

export interface CaptionCue {
  text: string;
  startSec: number;
  endSec: number;
}

export interface AudioVisualLike {
  script: string;
  voiceover: { clip: { durationSec: number; audio: string } };
  captions: { captions: CaptionCue[]; durationSec: number };
}

export interface RenderSpec {
  aspect: Aspect;
  width: number;
  height: number;
  durationSec: number;
  image: { ref: string; x: number; y: number };
  audio: { ref: string; durationSec: number };
  captions: { cues: CaptionCue[]; bandY: number };
  pathLine: string;
}

// ---------------------------------------------------------------------------
// Core logic
// ---------------------------------------------------------------------------

export function buildRenderSpecs(
  av: AudioVisualLike,
  imageRef: string,
  opts?: { aspects?: Aspect[] },
): RenderSpec[] {
  const aspects = opts?.aspects ?? ASPECTS;
  const durationSec: number = av.voiceover.clip.durationSec;
  const audioRef: string = av.voiceover.clip.audio;
  const cues: CaptionCue[] = av.captions.captions.map(
    (c) => ({ text: c.text, startSec: c.startSec, endSec: c.endSec }),
  );

  return aspects.map((aspect) => {
    const width: number = aspect.width;
    const height: number = aspect.height;
    const bandY: number = Math.round(height * CAPTION_BAND_Y);

    return {
      aspect,
      width,
      height,
      durationSec,
      image: { ref: imageRef, x: width / 2, y: height / 2 },
      audio: { ref: audioRef, durationSec },
      captions: { cues, bandY },
      pathLine: `RENDER-PATH: aspect="${aspect.name}" size=${width}x${height} dur=${durationSec}s cues=${cues.length}`,
    };
  });
}

export function assertRenderSpecValid(spec: RenderSpec): void {
  if (spec.captions.bandY <= 0 || spec.captions.bandY >= spec.height) {
    throw new Error(
      `caption bandY ${spec.captions.bandY} is outside frame (height=${spec.height})`,
    );
  }
  if (spec.audio.durationSec !== spec.durationSec) {
    throw new Error(
      `audio duration ${spec.audio.durationSec} does not match spec duration ${spec.durationSec}`,
    );
  }
}
