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

/**
 * #765 — per-aspect layout, computed by `video/demoLayout.ts` and passed in as plain
 * data (the TSX stays free of project imports, like the other interfaces here). Tall
 * cuts FILL the height (`fill`+`space-between`/`space-evenly`, scaled type); the square
 * cut stays centered. See `SceneShell`.
 */
interface DemoLayout {
  aspectRatio: number;
  fill: boolean;
  justify: "center" | "space-evenly" | "space-between";
  padTopFraction: number;
  padBottomFraction: number;
  typeScale: number;
  gapScale: number;
  usableSpanFraction: number;
}

const DEFAULT_LAYOUT_9X16: DemoLayout = {
  aspectRatio: 1920 / 1080,
  fill: true,
  justify: "space-between",
  padTopFraction: 0.045,
  padBottomFraction: 0.045,
  typeScale: 1.34,
  gapScale: 1.1,
  usableSpanFraction: 0.91,
};

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
  /**
   * #775 — synced captions for the animated demo, timed from the voice engine's real
   * per-character timestamps. Drawn in a reserved bottom band (see `captionBandY`) that the
   * per-aspect layout already cleared of content (`reserveCaptionBand`). Empty → no band.
   */
  captions?: CaptionCue[];
  /** #775 — top Y (px) of the caption band; from `captionBandTopY` (below the content). */
  captionBandY?: number;
  layout: DemoLayout;
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
 * #765 — the per-aspect frame box every demo scene lives in. The outer AbsoluteFill
 * applies the aspect's top/bottom safe margins (a fraction of the real frame height);
 * the inner full-height column distributes the scene's blocks with the aspect's
 * `justify`: tall cuts use `space-between`/`space-evenly` so the first/last block sit at
 * the safe edges and the content FILLS the height; the square cut centers (its prior
 * look). Children passed in become the spaced blocks. `gap` is the minimum spacing
 * (already scaled by the caller); `contentWidth` defaults to the frame width minus side
 * margins.
 */
const SceneShell: React.FC<{
  layout: DemoLayout;
  header?: React.ReactNode; // a small section label that should NOT grow (flex:0)
  gap?: number;
  contentWidth?: number;
  children: React.ReactNode;
}> = ({ layout, header, gap = 0, contentWidth, children }) => {
  const { width, height } = useVideoConfig();
  const items = React.Children.toArray(children);
  return (
    <AbsoluteFill
      style={{
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: Math.round(layout.padTopFraction * height),
        paddingBottom: Math.round(layout.padBottomFraction * height),
        paddingLeft: 56,
        paddingRight: 56,
      }}
    >
      <div
        style={{
          width: contentWidth ?? Math.min(984, width - 96),
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: layout.fill ? "flex-start" : "center",
          gap,
        }}
      >
        {header ? <div style={{ width: "100%", flex: "0 0 auto" }}>{header}</div> : null}
        {items.map((it, i) => (
          <div
            key={i}
            style={{
              width: "100%",
              // #773 — in fill mode the body rows GROW to divide the height so the cards
              // STRETCH to fill the frame (not stay small and get pushed apart). Centered
              // so a row's own content sits in the middle of its grown slot.
              flex: layout.fill ? "1 1 0" : "0 0 auto",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
            }}
          >
            {it}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Per-scene font scaler — multiplies a base px size by the aspect's type scale. */
function scaler(layout: DemoLayout): (px: number) => number {
  return (px: number) => Math.round(px * layout.typeScale);
}

/**
 * HOOK (first 30s) — the single most compelling HONEST claim: fixes real bugs at
 * ~half the cloud relay's cost-per-fix because the heavy work runs FREE locally.
 * NOT a "best at everything" claim.
 */
const HookScene: React.FC<{ title: string; headline: string; layout: DemoLayout }> = ({ title, headline, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  // Three blocks (eyebrow / headline / badge) spaced top→bottom so the tall cut fills
  // the frame; on the square cut they cluster centered (the prior look).
  return (
    <SceneShell layout={layout} gap={Math.round(24 * layout.gapScale)}>
      <div style={{ ...entrance(frame, fps), color: "#64748b", fontFamily: FONT, fontSize: f(32), letterSpacing: 6, textAlign: "center" }}>
        {title}
      </div>
      <div
        style={{
          ...entrance(frame, fps, 8),
          color: "#fff",
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: f(64),
          lineHeight: 1.15,
          textAlign: "center",
        }}
      >
        {headline}
      </div>
      <div
        style={{
          ...entrance(frame, fps, 20),
          color: BG,
          background: LANE_COLOR.local,
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: f(34),
          padding: "12px 26px",
          borderRadius: 999,
        }}
      >
        Executor runs LOCAL · $0
      </div>
    </SceneShell>
  );
};

/**
 * COMPARE (after 30s) — the honest 4-way table. ALL four arms, including the
 * LOSING 1-shot Sonnet (dimmed, marked "weakest"). The full-cloud relay's
 * resolve % is badged as the ceiling; the hybrid (lfah) is highlighted green.
 */
const ArmRow: React.FC<{ arm: DemoArm; show: number; layout: DemoLayout }> = ({ arm, show, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  const accent = arm.isLfah ? LANE_COLOR.local : arm.topResolve ? LANE_COLOR.cloud : "#475569";
  const dim = arm.key === "sonnet"; // the loser — present but visually de-emphasised
  return (
    <div
      style={{
        ...entrance(frame, fps, show),
        width: "100%",
        // #773 — in fill mode the card stretches to its grown slot (height 100%) and
        // pushes its two rows to the top/bottom edges so the big card reads FULL, not empty.
        height: layout.fill ? "100%" : undefined,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: layout.fill ? "space-between" : "center",
        background: arm.isLfah ? "#0f2a22" : "#111a30",
        border: `3px solid ${accent}`,
        borderRadius: 18,
        padding: layout.fill ? "30px 30px" : "20px 26px",
        opacity: dim ? 0.62 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: f(38) }}>
          {arm.name}
          {arm.isLfah ? <span style={{ color: LANE_COLOR.local, fontSize: f(26) }}>  ← this is lfah</span> : null}
        </div>
        <div style={{ display: "flex", gap: 22, alignItems: "baseline" }}>
          <div style={{ color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: f(44) }}>{arm.resolved}</div>
          {arm.topResolve ? (
            <div style={{ color: LANE_COLOR.cloud, fontFamily: FONT, fontSize: f(24), fontWeight: 700 }}>top resolve</div>
          ) : null}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, marginTop: layout.fill ? 0 : 8 }}>
        <div style={{ color: "#94a3b8", fontFamily: FONT, fontSize: f(26), maxWidth: "54%", lineHeight: 1.25 }}>{arm.note}</div>
        <div style={{ color: "#cbd5e1", fontFamily: FONT, fontSize: f(28), flexShrink: 0, textAlign: "right" }}>
          {arm.totalCost} total · <span style={{ color: arm.isLfah ? LANE_COLOR.local : "#cbd5e1", fontWeight: 700 }}>{arm.perResolved}/fix</span>
        </div>
      </div>
    </div>
  );
};

const CompareScene: React.FC<{ arms: DemoArm[]; layout: DemoLayout }> = ({ arms, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  // header (fixed) + the 4 arm rows GROW to fill the height on tall cuts.
  return (
    <SceneShell
      layout={layout}
      gap={Math.round(16 * layout.gapScale)}
      contentWidth={984}
      header={
        <div style={{ ...entrance(frame, fps), color: "#64748b", fontFamily: FONT, fontSize: f(34), letterSpacing: 4, paddingBottom: 6 }}>
          ALL 4 WAYS, COMPARED — n=13
        </div>
      }
    >
      {arms.map((a, i) => (
        <ArmRow key={a.key} arm={a} show={10 + i * 12} layout={layout} />
      ))}
    </SceneShell>
  );
};

/**
 * COSTSPLIT (after 30s) — where the hybrid's money actually goes, per role.
 * The executor runs LOCAL at $0 / 0% of spend — the honest selling point.
 */
const CostSplitScene: React.FC<{ costSplit: DemoCostRole[]; layout: DemoLayout }> = ({ costSplit, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  return (
    <SceneShell
      layout={layout}
      gap={Math.round(20 * layout.gapScale)}
      contentWidth={920}
      header={
        <div style={{ ...entrance(frame, fps), color: "#64748b", fontFamily: FONT, fontSize: f(34), letterSpacing: 4, paddingBottom: 6 }}>
          WHERE THE MONEY GOES
        </div>
      }
    >
      {costSplit.map((r, i) => {
        const isFree = r.sharePct === 0;
        const accent = isFree ? LANE_COLOR.local : LANE_COLOR.cloud;
        const barW = interpolate(frame - (10 + i * 10), [0, 24], [0, Math.max(2, r.sharePct) / 100 * 720], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <div key={r.role} style={{ ...entrance(frame, fps, 10 + i * 10, 18), width: "100%" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ color: "#fff", fontFamily: FONT, fontSize: f(32), fontWeight: 700 }}>
                {r.role} <span style={{ color: "#64748b", fontSize: f(24), fontWeight: 400 }}>· {r.backend}</span>
              </div>
              <div style={{ color: isFree ? LANE_COLOR.local : "#fff", fontFamily: FONT, fontWeight: 800, fontSize: f(40) }}>
                {r.cost} · {r.sharePct}%
              </div>
            </div>
            <div style={{ height: 16, background: "#1e293b", borderRadius: 8, marginTop: 8, overflow: "hidden" }}>
              <div style={{ width: barW, height: "100%", background: accent, borderRadius: 8 }} />
            </div>
          </div>
        );
      })}
    </SceneShell>
  );
};

/**
 * VERDICT (after 30s) — honest, axis by axis. CONCEDES the full-cloud relay's
 * higher raw resolve % up front, then recommends lfah on VALUE / as the default.
 */
const VerdictScene: React.FC<{ verdict: DemoVerdict; layout: DemoLayout }> = ({ verdict, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  return (
    <SceneShell
      layout={layout}
      gap={Math.round(14 * layout.gapScale)}
      contentWidth={952}
      header={
        <div style={{ ...entrance(frame, fps), color: "#64748b", fontFamily: FONT, fontSize: f(34), letterSpacing: 4, paddingBottom: 6 }}>
          THE HONEST VERDICT
        </div>
      }
    >
      {verdict.axes.map((ax, i) => {
        const hybridWins = /hybrid|local/i.test(ax.winner);
        return (
          <div
            key={ax.axis}
            style={{
              ...entrance(frame, fps, 8 + i * 8),
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#111a30",
              border: `2px solid ${hybridWins ? LANE_COLOR.local : LANE_COLOR.cloud}`,
              borderRadius: 14,
              padding: "14px 22px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ color: "#cbd5e1", fontFamily: FONT, fontSize: f(30) }}>{ax.axis}</div>
            <div style={{ color: hybridWins ? LANE_COLOR.local : LANE_COLOR.cloud, fontFamily: FONT, fontSize: f(30), fontWeight: 800 }}>
              {ax.winner}
            </div>
          </div>
        );
      })}
      <div style={{ ...entrance(frame, fps, 48), color: "#94a3b8", fontFamily: FONT, fontSize: f(28), lineHeight: 1.3, textAlign: "center" }}>
        {verdict.concession}
      </div>
      <div style={{ ...entrance(frame, fps, 58), color: "#fff", fontFamily: FONT, fontSize: f(32), fontWeight: 700, lineHeight: 1.3, textAlign: "center" }}>
        {verdict.bottomLine}
      </div>
    </SceneShell>
  );
};

const CtaScene: React.FC<{ cta: string; repoUrl?: string; layout: DemoLayout }> = ({ cta, repoUrl, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  // Split "<verb>: <command>" on the first colon so the (long) install command
  // gets its own wrapping monospace box instead of overflowing the frame.
  const idx = cta.indexOf(":");
  const head = idx >= 0 ? cta.slice(0, idx).trim() : cta.trim();
  const command = idx >= 0 ? cta.slice(idx + 1).trim() : "";
  // head / command / repo become spaced blocks so the tall cut fills the frame.
  return (
    <SceneShell layout={layout} gap={Math.round(26 * layout.gapScale)}>
      <div style={{ ...entrance(frame, fps), color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: f(72), textAlign: "center" }}>
        {head}
      </div>
      {command ? (
        <div
          style={{
            ...entrance(frame, fps, 8),
            color: "#e2e8f0",
            background: "#111a30",
            border: `2px solid ${LANE_COLOR.local}`,
            fontFamily: "SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: f(30),
            lineHeight: 1.4,
            padding: "20px 26px",
            borderRadius: 16,
            maxWidth: 860,
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
            ...entrance(frame, fps, 16),
            color: BG,
            background: LANE_COLOR.local,
            fontFamily: FONT,
            fontWeight: 700,
            fontSize: f(28),
            padding: "12px 24px",
            borderRadius: 999,
            maxWidth: 900,
            overflowWrap: "anywhere",
            textAlign: "center",
          }}
        >
          {repoUrl.replace(/^https?:\/\//, "")}
        </div>
      ) : null}
    </SceneShell>
  );
};

/**
 * #775 — the synced caption band for the demo. Each cue shows for its own [startSec, endSec)
 * window in a dark pill at `bandY` (the reserved bottom strip the layout already cleared of
 * content). Mirrors the `launch` composition's caption styling so the two stay consistent.
 */
const DemoCaptionBand: React.FC<{ captions: CaptionCue[]; bandY: number; fps: number; typeScale: number }> = ({
  captions,
  bandY,
  fps,
  typeScale,
}) => {
  return (
    <>
      {captions.map((c, i) => {
        const from = Math.round(c.startSec * fps);
        const durationInFrames = Math.max(1, Math.round((c.endSec - c.startSec) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={durationInFrames} name={`caption-${i}`}>
            <div style={{ position: "absolute", top: bandY, left: 0, width: "100%", display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  background: "rgba(0,0,0,0.68)",
                  color: "#fff",
                  fontSize: Math.round(40 * typeScale),
                  fontFamily: FONT,
                  fontWeight: 600,
                  lineHeight: 1.25,
                  padding: "14px 26px",
                  borderRadius: 14,
                  maxWidth: "86%",
                  textAlign: "center",
                }}
              >
                {c.text}
              </div>
            </div>
          </Sequence>
        );
      })}
    </>
  );
};

const DemoVideo: React.FC<DemoProps> = (props) => {
  const { scenes, fps } = props;
  // #765 — the per-aspect layout drives every scene's vertical fill. Fall back to the
  // 9:16 default if a caller (e.g. the Remotion preview) omits it.
  const layout = props.layout ?? DEFAULT_LAYOUT_9X16;
  const sceneEl: Record<string, React.ReactNode> = {
    hook: <HookScene title={props.title} headline={props.hookHeadline} layout={layout} />,
    compare: <CompareScene arms={props.arms} layout={layout} />,
    costsplit: <CostSplitScene costSplit={props.costSplit} layout={layout} />,
    verdict: <VerdictScene verdict={props.verdict} layout={layout} />,
    cta: <CtaScene cta={props.cta} repoUrl={props.repoUrl} layout={layout} />,
  };
  const captions = props.captions ?? [];
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
      {captions.length > 0 ? (
        <DemoCaptionBand
          captions={captions}
          bandY={props.captionBandY ?? Math.round((props.height ?? 1920) * 0.82)}
          fps={fps}
          typeScale={layout.typeScale}
        />
      ) : null}
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
          captions: [] as CaptionCue[],
          captionBandY: Math.round(1920 * 0.82),
          layout: DEFAULT_LAYOUT_9X16,
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
