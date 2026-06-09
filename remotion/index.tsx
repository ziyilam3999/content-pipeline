/**
 * Remotion compositions for the launch content.
 *
 * Kept OUT of the project tsconfig include on purpose: Remotion's own bundler compiles this
 * JSX/TSX with the right loaders, so the project's CommonJS/no-JSX `tsc --noEmit` gate stays
 * simple. The adapter (`adapters/video.ts`) points Remotion's `bundle()` at this file by path.
 *
 * Two compositions:
 *   id="launch" — static result-card over a dark bg with timed captions + optional audio.
 *   id="demo"   — #743 ANIMATED product demo: hook → pipeline diagram → escalation →
 *                 count-up results → CTA, all driven by `video/demoTimeline.ts` (data-driven,
 *                 brand-safe). Props are the flattened timeline (see adapters/video.ts).
 */

import React from "react";
import {
  AbsoluteFill,
  Audio,
  Composition,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  registerRoot,
} from "remotion";

// ───────────────────────────── launch (existing) ────────────────────────────

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

// ───────────────────────────── demo (#743) ──────────────────────────────────

type Lane = "local" | "cloud" | "test";
interface DemoNode { id: string; label: string; lane: Lane; badge: string }
interface DemoEdge { from: string; to: string; kind: "flow" | "escalate" }
interface DemoNumber {
  label: string;
  value: string;
  prefix: string;
  numeric: number;
  suffix: string;
  scopeGuard?: string;
}
interface DemoScene { id: string; fromSec: number; durationSec: number }

interface DemoProps {
  title: string;
  scenes: DemoScene[];
  nodes: DemoNode[];
  edges: DemoEdge[];
  numbers: DemoNumber[];
  cta: string;
  repoUrl?: string;
  audioSrc?: string;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
}

const BG = "#0a0f1e";
const FONT = "Inter, Helvetica, Arial, sans-serif";
const LANE_COLOR: Record<Lane, string> = {
  local: "#34d399", // green — runs free on your laptop
  cloud: "#60a5fa", // blue — cloud
  test: "#fbbf24", // amber — real test oracle
};
const LANE_LABEL: Record<Lane, string> = { local: "LOCAL", cloud: "CLOUD", test: "TESTS" };

/** Fade + rise driven by a spring; returns inline style for an entrance. */
function entrance(frame: number, fps: number, delay = 0, rise = 36) {
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 18 });
  const opacity = interpolate(frame - delay, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { opacity, transform: `translateY(${interpolate(s, [0, 1], [rise, 0])}px)` };
}

const HookScene: React.FC<{ title: string }> = ({ title }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ ...entrance(frame, fps), textAlign: "center" }}>
        <div style={{ color: "#64748b", fontFamily: FONT, fontSize: 34, letterSpacing: 6, marginBottom: 24 }}>
          HOW IT WORKS
        </div>
        <div style={{ color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: 72, lineHeight: 1.1 }}>
          {title}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const NodeBox: React.FC<{ node: DemoNode; show: number; stuck?: boolean }> = ({ node, show, stuck }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const color = LANE_COLOR[node.lane];
  const pulse = stuck ? 1 + 0.04 * Math.sin(frame / 3) : 1;
  return (
    <div
      style={{
        ...entrance(frame, fps, show),
        width: 620,
        background: "#111a30",
        border: `3px solid ${color}`,
        borderRadius: 20,
        padding: "26px 32px",
        transform: `${entrance(frame, fps, show).transform} scale(${pulse})`,
        boxShadow: stuck ? `0 0 40px ${color}` : "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 40 }}>{node.label}</div>
        <div
          style={{
            color: BG,
            background: color,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 22,
            padding: "6px 14px",
            borderRadius: 999,
          }}
        >
          {LANE_LABEL[node.lane]}
        </div>
      </div>
      <div style={{ color: "#94a3b8", fontFamily: FONT, fontSize: 28, marginTop: 8 }}>{node.badge}</div>
    </div>
  );
};

const PipelineScene: React.FC<{ nodes: DemoNode[] }> = ({ nodes }) => {
  const frame = useCurrentFrame();
  // Main flow nodes only (exclude the cloud-helper, which stars in the escalation scene).
  const flow = nodes.filter((n) => n.id !== "cloud");
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, alignItems: "center" }}>
        {flow.map((n, i) => (
          <React.Fragment key={n.id}>
            <NodeBox node={n} show={i * 12} />
            {i < flow.length - 1 ? (
              <div
                style={{
                  width: 6,
                  height: interpolate(frame, [i * 12 + 8, i * 12 + 20], [0, 36], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                  background: "#334155",
                  borderRadius: 3,
                }}
              />
            ) : null}
          </React.Fragment>
        ))}
      </div>
    </AbsoluteFill>
  );
};

const EscalationScene: React.FC<{ nodes: DemoNode[] }> = ({ nodes }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const fix = nodes.find((n) => n.id === "fix");
  const cloud = nodes.find((n) => n.id === "cloud");
  // Resolve to green in the last third of the scene.
  const resolved = frame > durationInFrames * 0.62;
  const arrow = interpolate(frame, [10, 28], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center", width: 680 }}>
        <div style={{ ...entrance(frame, fps), color: "#fff", fontFamily: FONT, fontSize: 40, fontWeight: 700, textAlign: "center" }}>
          {resolved ? "Hardest bugs → solved ✓" : "Stuck? Escalate — only when needed"}
        </div>
        {cloud ? <NodeBox node={cloud} show={6} /> : null}
        <div
          style={{
            width: 6,
            height: 48 * arrow,
            background: resolved ? LANE_COLOR.local : LANE_COLOR.cloud,
            borderRadius: 3,
          }}
        />
        {fix ? <NodeBox node={{ ...fix, badge: resolved ? "fixed locally + cloud help" : fix.badge }} show={0} stuck={!resolved} /> : null}
      </div>
    </AbsoluteFill>
  );
};

const CountUp: React.FC<{ n: DemoNumber; delay: number }> = ({ n, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const decimals = n.value.includes(".") ? 1 : 0;
  const v = interpolate(frame - delay, [0, 26], [0, n.numeric], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const display = `${n.prefix}${v.toFixed(decimals)}${n.suffix}`;
  // Bar width is proportional to the value within a 0..100-ish range (percentages),
  // or normalised by the largest cost for $-values — kept simple/relative.
  const barFrac = Math.max(0.06, Math.min(1, n.numeric / (n.suffix === "%" ? 100 : 40)));
  const barW = interpolate(frame - delay, [0, 26], [0, barFrac * 560], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div style={{ ...entrance(frame, fps, delay, 18), width: 760 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ color: "#cbd5e1", fontFamily: FONT, fontSize: 30 }}>{n.label}</div>
        <div style={{ color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: 52 }}>{display}</div>
      </div>
      <div style={{ height: 16, background: "#1e293b", borderRadius: 8, marginTop: 8, overflow: "hidden" }}>
        <div style={{ width: barW, height: "100%", background: LANE_COLOR.local, borderRadius: 8 }} />
      </div>
      {n.scopeGuard ? (
        <div style={{ color: "#64748b", fontFamily: FONT, fontSize: 22, marginTop: 4 }}>{n.scopeGuard}</div>
      ) : null}
    </div>
  );
};

const ResultsScene: React.FC<{ numbers: DemoNumber[] }> = ({ numbers }) => {
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
        {numbers.map((n, i) => (
          <CountUp key={n.label} n={n} delay={i * 8} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

const CtaScene: React.FC<{ cta: string; repoUrl?: string }> = ({ cta, repoUrl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Split "<verb>: <command>" on the first colon so the (long) install command
  // gets its own wrapping monospace box instead of overflowing the frame.
  const idx = cta.indexOf(":");
  const head = idx >= 0 ? cta.slice(0, idx).trim() : cta.trim();
  const command = idx >= 0 ? cta.slice(idx + 1).trim() : "";
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 70 }}>
      <div style={{ ...entrance(frame, fps), textAlign: "center", width: "100%" }}>
        <div style={{ color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: 72, marginBottom: 28 }}>
          {head}
        </div>
        {command ? (
          <div
            style={{
              color: "#e2e8f0",
              background: "#111a30",
              border: `2px solid ${LANE_COLOR.local}`,
              fontFamily: "SFMono-Regular, Menlo, Consolas, monospace",
              fontSize: 30,
              lineHeight: 1.4,
              padding: "20px 26px",
              borderRadius: 16,
              maxWidth: 860,
              margin: "0 auto 26px",
              overflowWrap: "anywhere",
              wordBreak: "break-word",
              textAlign: "left",
            }}
          >
            {command}
          </div>
        ) : null}
        {repoUrl ? (
          <div
            style={{
              color: BG,
              background: LANE_COLOR.local,
              fontFamily: FONT,
              fontWeight: 700,
              fontSize: 28,
              padding: "12px 24px",
              borderRadius: 999,
              display: "inline-block",
              maxWidth: 900,
              overflowWrap: "anywhere",
            }}
          >
            {repoUrl.replace(/^https?:\/\//, "")}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const DemoVideo: React.FC<DemoProps> = (props) => {
  const { scenes, fps } = props;
  const sceneEl: Record<string, React.ReactNode> = {
    hook: <HookScene title={props.title} />,
    pipeline: <PipelineScene nodes={props.nodes} />,
    escalation: <EscalationScene nodes={props.nodes} />,
    results: <ResultsScene numbers={props.numbers} />,
    cta: <CtaScene cta={props.cta} repoUrl={props.repoUrl} />,
  };
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {props.audioSrc ? <Audio src={props.audioSrc} /> : null}
      {scenes.map((s) => {
        const from = Math.round(s.fromSec * fps);
        const durationInFrames = Math.max(1, Math.round(s.durationSec * fps));
        return (
          <Sequence key={s.id} from={from} durationInFrames={durationInFrames} name={s.id}>
            {sceneEl[s.id] ?? null}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

// ───────────────────────────── root ─────────────────────────────────────────

const Root: React.FC = () => {
  return (
    <>
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

      <Composition
        id="demo"
        component={DemoVideo}
        durationInFrames={540}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          title: "How it works",
          scenes: [] as DemoScene[],
          nodes: [] as DemoNode[],
          edges: [] as DemoEdge[],
          numbers: [] as DemoNumber[],
          cta: "",
          repoUrl: undefined,
          audioSrc: undefined,
          width: 1080,
          height: 1920,
          fps: 30,
          durationInFrames: 540,
        }}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.durationInFrames,
          width: props.width,
          height: props.height,
          fps: props.fps,
        })}
      />
    </>
  );
};

registerRoot(Root);
