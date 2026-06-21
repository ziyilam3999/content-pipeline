import {
  parseSilenceGaps,
  worstInternalGap,
  assertNoLongSilenceGap,
} from "../silenceGap";

// Real `ffmpeg silencedetect=noise=-30dB:d=0.45` output captured from the SHIPPED kanban hero (#1063) —
// the cut the operator rejected for "the narrator paused too long at 0:36". It carries a 5.76s dead-air gap.
const SHIPPED_HERO_DEADAIR = `
[Parsed_silencedetect_0 @ 0xb] silence_start: 3.450952
[Parsed_silencedetect_0 @ 0xb] silence_end: 3.98322 | silence_duration: 0.532268
[Parsed_silencedetect_0 @ 0xb] silence_start: 23.373424
[Parsed_silencedetect_0 @ 0xb] silence_end: 27.068798 | silence_duration: 3.695374
[Parsed_silencedetect_0 @ 0xb] silence_start: 35.309683
[Parsed_silencedetect_0 @ 0xb] silence_end: 41.069524 | silence_duration: 5.759841
[Parsed_silencedetect_0 @ 0xb] silence_start: 58.896349
[Parsed_silencedetect_0 @ 0xb] silence_end: 63.023991 | silence_duration: 4.127642
`;

// A clean cut: only short beat-to-beat breaths (< 1.5s) + a leading intro hold.
const CLEAN_CUT = `
[Parsed_silencedetect_0 @ 0xb] silence_start: 0.0
[Parsed_silencedetect_0 @ 0xb] silence_end: 0.42 | silence_duration: 0.42
[Parsed_silencedetect_0 @ 0xb] silence_start: 18.2
[Parsed_silencedetect_0 @ 0xb] silence_end: 19.0 | silence_duration: 0.8
[Parsed_silencedetect_0 @ 0xb] silence_start: 41.0
[Parsed_silencedetect_0 @ 0xb] silence_end: 41.9 | silence_duration: 0.9
`;

describe("#1063 silence-gap (dead-air) gate", () => {
  it("parses silencedetect output into gaps", () => {
    const gaps = parseSilenceGaps(SHIPPED_HERO_DEADAIR);
    expect(gaps).toHaveLength(4);
    expect(gaps[2].startSec).toBeCloseTo(35.31, 1);
    expect(gaps[2].durationSec).toBeCloseTo(5.76, 1);
  });

  it("finds the worst INTERNAL gap (ignoring a leading intro hold)", () => {
    const worst = worstInternalGap(parseSilenceGaps(SHIPPED_HERO_DEADAIR));
    expect(worst).not.toBeNull();
    expect(worst!.durationSec).toBeCloseTo(5.76, 1);
    expect(worst!.startSec).toBeCloseTo(35.31, 1);
  });

  it("FAILS on the shipped cut's 5.76s dead-air (recurrence-condition)", () => {
    const gaps = parseSilenceGaps(SHIPPED_HERO_DEADAIR);
    expect(() => assertNoLongSilenceGap(gaps, 1.5)).toThrow(/dead-air/i);
    expect(() => assertNoLongSilenceGap(gaps, 1.5)).toThrow(/5\.76s/);
  });

  it("PASSES a clean cut whose only gaps are sub-threshold breaths + a leading hold (fix-landed)", () => {
    const gaps = parseSilenceGaps(CLEAN_CUT);
    expect(() => assertNoLongSilenceGap(gaps, 1.5)).not.toThrow();
  });

  it("ignores an outro tail hold when durationSec is supplied", () => {
    const gaps = parseSilenceGaps(`
[x] silence_start: 88.0
[x] silence_end: 90.0 | silence_duration: 2.0
`);
    // a 2s gap, but it ends at the clip end (90s) → outro hold, not dead air
    expect(() => assertNoLongSilenceGap(gaps, 1.5, { durationSec: 90, ignoreTailSec: 0.5 })).not.toThrow();
  });
});
