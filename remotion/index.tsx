/**
 * Remotion composition entry for the launch video.
 *
 * Kept OUT of the project tsconfig include on purpose: Remotion's own bundler compiles this
 * JSX/TSX with the right loaders, so the project's CommonJS/no-JSX `tsc --noEmit` gate stays
 * simple. The adapter (`adapters/video.ts`) points Remotion's `bundle()` at this file by path.
 *
 * Props (all driven by the adapter via inputProps + calculateMetadata):
 *   imageSrc        file:// URL of the result-card PNG (background, contain-fit)
 *   audioSrc        file:// URL of the voiceover (optional; omitted → silent)
 *   captions        [{ text, startSec, endSec }] timed caption cues
 *   bandY           caption band top, in px
 *   width/height    frame size
 *   fps             frames per second
 *   durationInFrames total length
 */

import React from "react";
import {
  AbsoluteFill,
  Audio,
  Composition,
  Img,
  Sequence,
  registerRoot,
} from "remotion";

interface CaptionCue {
  text: string;
  startSec: number;
  endSec: number;
}

interface LaunchProps {
  imageSrc: string;
  audioSrc?: string;
  captions: CaptionCue[];
  bandY: number;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
}

const LaunchVideo: React.FC<LaunchProps> = ({ imageSrc, audioSrc, captions, bandY, fps }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0f1e" }}>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        {imageSrc ? (
          <Img src={imageSrc} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        ) : null}
      </AbsoluteFill>

      {audioSrc ? <Audio src={audioSrc} /> : null}

      {captions.map((c, i) => {
        const from = Math.round(c.startSec * fps);
        const durationInFrames = Math.max(1, Math.round((c.endSec - c.startSec) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames}>
            <div
              style={{
                position: "absolute",
                top: bandY,
                left: 0,
                width: "100%",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  background: "rgba(0,0,0,0.62)",
                  color: "#fff",
                  fontSize: 48,
                  fontFamily: "sans-serif",
                  fontWeight: 600,
                  padding: "16px 28px",
                  borderRadius: 14,
                  maxWidth: "85%",
                  textAlign: "center",
                }}
              >
                {c.text}
              </div>
            </div>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const Root: React.FC = () => {
  return (
    <Composition
      id="launch"
      component={LaunchVideo}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{
        imageSrc: "",
        audioSrc: undefined,
        captions: [] as CaptionCue[],
        bandY: 1500,
        width: 1080,
        height: 1920,
        fps: 30,
        durationInFrames: 300,
      }}
      calculateMetadata={({ props }) => ({
        durationInFrames: props.durationInFrames,
        width: props.width,
        height: props.height,
        fps: props.fps,
      })}
    />
  );
};

registerRoot(Root);
