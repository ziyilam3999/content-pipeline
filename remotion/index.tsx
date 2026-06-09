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

// ───────────────────────────── demo (#748) ──────────────────────────────────

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

interface DemoArm {
  key: "opus" | "sonnet" | "fullcloud" | "hybrid";
  name: string;
  resolved: string;
  totalCost: string;
  perResolved: string;
  topResolve: boolean;
  isLfah: boolean;
  note: string;
}
interface DemoCostRole { role: string; backend: string; cost: string; sharePct: number }
interface DemoVerdictAxis { axis: string; winner: string; note: string }
interface DemoVerdict {
  axes: DemoVerdictAxis[];
  concession: string;
  bottomLine: string;
}

interface DemoProps {
  title: string;
  hookHeadline: string;
  scenes: DemoScene[];
  nodes: DemoNode[];
  edges: DemoEdge[];
  numbers: DemoNumber[];
  arms: DemoArm[];
  costSplit: DemoCostRole[];
  verdict: DemoVerdict;
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

/** Fade + rise driven by a spring; returns inline style for an entrance. */
function entrance(frame: number, fps: number, delay = 0, rise = 36) {
  const s = spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: 18 });
  const opacity = interpolate(frame - delay, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return { opacity, transform: `translateY(${interpolate(s, [0, 1], [rise, 0])}px)` };
}

/**
 * HOOK (first 30s) — the single most compelling HONEST claim: fixes real bugs at
 * ~half the cloud relay's cost-per-fix because the heavy work runs FREE locally.
 * NOT a "best at everything" claim.
 */
const HookScene: React.FC<{ title: string; headline: string }> = ({ title, headline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 }}>
      <div style={{ ...entrance(frame, fps), textAlign: "center" }}>
        <div style={{ color: "#64748b", fontFamily: FONT, fontSize: 32, letterSpacing: 6, marginBottom: 18 }}>
          {title}
        </div>
        <div
          style={{
            ...entrance(frame, fps, 8),
            color: "#fff",
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 64,
            lineHeight: 1.15,
            marginBottom: 28,
          }}
        >
          {headline}
        </div>
        <div
          style={{
            ...entrance(frame, fps, 20),
            display: "inline-block",
            color: BG,
            background: LANE_COLOR.local,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: 34,
            padding: "12px 26px",
            borderRadius: 999,
          }}
        >
          Executor runs LOCAL · $0
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * COMPARE (after 30s) — the honest 4-way table. ALL four arms, including the
 * LOSING 1-shot Sonnet (dimmed, marked "weakest"). The full-cloud relay's
 * resolve % is badged as the ceiling; the hybrid (lfah) is highlighted green.
 */
const ArmRow: React.FC<{ arm: DemoArm; show: number }> = ({ arm, show }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = arm.isLfah ? LANE_COLOR.local : arm.topResolve ? LANE_COLOR.cloud : "#475569";
  const dim = arm.key === "sonnet"; // the loser — present but visually de-emphasised
  return (
    <div
      style={{
        ...entrance(frame, fps, show),
        width: 940,
        background: arm.isLfah ? "#0f2a22" : "#111a30",
        border: `3px solid ${accent}`,
        borderRadius: 18,
        padding: "20px 26px",
        opacity: dim ? 0.62 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: 38 }}>
          {arm.name}
          {arm.isLfah ? <span style={{ color: LANE_COLOR.local, fontSize: 26 }}>  ← this is lfah</span> : null}
        </div>
        <div style={{ display: "flex", gap: 22, alignItems: "baseline" }}>
          <div style={{ color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: 44 }}>{arm.resolved}</div>
          {arm.topResolve ? (
            <div style={{ color: LANE_COLOR.cloud, fontFamily: FONT, fontSize: 24, fontWeight: 700 }}>top resolve</div>
          ) : null}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <div style={{ color: "#94a3b8", fontFamily: FONT, fontSize: 26 }}>{arm.note}</div>
        <div style={{ color: "#cbd5e1", fontFamily: FONT, fontSize: 28 }}>
          {arm.totalCost} total · <span style={{ color: arm.isLfah ? LANE_COLOR.local : "#cbd5e1", fontWeight: 700 }}>{arm.perResolved}/fix</span>
        </div>
      </div>
    </div>
  );
};

const CompareScene: React.FC<{ arms: DemoArm[] }> = ({ arms }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: "center" }}>
        <div style={{ ...entrance(frame, fps), color: "#64748b", fontFamily: FONT, fontSize: 34, letterSpacing: 4, marginBottom: 8 }}>
          ALL 4 WAYS, COMPARED — n=13
        </div>
        {arms.map((a, i) => (
          <ArmRow key={a.key} arm={a} show={10 + i * 12} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/**
 * COSTSPLIT (after 30s) — where the hybrid's money actually goes, per role.
 * The executor runs LOCAL at $0 / 0% of spend — the honest selling point.
 */
const CostSplitScene: React.FC<{ costSplit: DemoCostRole[] }> = ({ costSplit }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, width: 900 }}>
        <div style={{ ...entrance(frame, fps), color: "#64748b", fontFamily: FONT, fontSize: 34, letterSpacing: 4, marginBottom: 8 }}>
          WHERE THE MONEY GOES
        </div>
        {costSplit.map((r, i) => {
          const isFree = r.sharePct === 0;
          const accent = isFree ? LANE_COLOR.local : LANE_COLOR.cloud;
          const barW = interpolate(frame - (10 + i * 10), [0, 24], [0, Math.max(2, r.sharePct) / 100 * 720], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div key={r.role} style={{ ...entrance(frame, fps, 10 + i * 10, 18), width: 880 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ color: "#fff", fontFamily: FONT, fontSize: 32, fontWeight: 700 }}>
                  {r.role} <span style={{ color: "#64748b", fontSize: 24, fontWeight: 400 }}>· {r.backend}</span>
                </div>
                <div style={{ color: isFree ? LANE_COLOR.local : "#fff", fontFamily: FONT, fontWeight: 800, fontSize: 40 }}>
                  {r.cost} · {r.sharePct}%
                </div>
              </div>
              <div style={{ height: 16, background: "#1e293b", borderRadius: 8, marginTop: 8, overflow: "hidden" }}>
                <div style={{ width: barW, height: "100%", background: accent, borderRadius: 8 }} />
              </div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

/**
 * VERDICT (after 30s) — honest, axis by axis. CONCEDES the full-cloud relay's
 * higher raw resolve % up front, then recommends lfah on VALUE / as the default.
 */
const VerdictScene: React.FC<{ verdict: DemoVerdict }> = ({ verdict }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 60 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 940 }}>
        <div style={{ ...entrance(frame, fps), color: "#64748b", fontFamily: FONT, fontSize: 34, letterSpacing: 4 }}>
          THE HONEST VERDICT
        </div>
        {verdict.axes.map((ax, i) => {
          const hybridWins = /hybrid|local/i.test(ax.winner);
          return (
            <div
              key={ax.axis}
              style={{
                ...entrance(frame, fps, 8 + i * 8),
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "#111a30",
                border: `2px solid ${hybridWins ? LANE_COLOR.local : LANE_COLOR.cloud}`,
                borderRadius: 14,
                padding: "14px 22px",
              }}
            >
              <div style={{ color: "#cbd5e1", fontFamily: FONT, fontSize: 30 }}>{ax.axis}</div>
              <div style={{ color: hybridWins ? LANE_COLOR.local : LANE_COLOR.cloud, fontFamily: FONT, fontSize: 30, fontWeight: 800 }}>
                {ax.winner}
              </div>
            </div>
          );
        })}
        <div style={{ ...entrance(frame, fps, 48), color: "#94a3b8", fontFamily: FONT, fontSize: 28, marginTop: 8, lineHeight: 1.3 }}>
          {verdict.concession}
        </div>
        <div style={{ ...entrance(frame, fps, 58), color: "#fff", fontFamily: FONT, fontSize: 32, fontWeight: 700, lineHeight: 1.3 }}>
          {verdict.bottomLine}
        </div>
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
    hook: <HookScene title={props.title} headline={props.hookHeadline} />,
    compare: <CompareScene arms={props.arms} />,
    costsplit: <CostSplitScene costSplit={props.costSplit} />,
    verdict: <VerdictScene verdict={props.verdict} />,
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
          hookHeadline: "",
          scenes: [] as DemoScene[],
          nodes: [] as DemoNode[],
          edges: [] as DemoEdge[],
          numbers: [] as DemoNumber[],
          arms: [] as DemoArm[],
          costSplit: [] as DemoCostRole[],
          verdict: { axes: [], concession: "", bottomLine: "" } as DemoVerdict,
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
