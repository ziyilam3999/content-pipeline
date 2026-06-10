/**
 * Remotion compositions for the launch content.
 *
 * Kept OUT of the project tsconfig include on purpose: Remotion's own bundler compiles this
 * JSX/TSX with the right loaders, so the project's CommonJS/no-JSX `tsc --noEmit` gate stays
 * simple. The adapter (`adapters/video.ts`) points Remotion's `bundle()` at this file by path.
 *
 * Two compositions:
 *   id="launch" — static result-card over a dark bg with timed captions + optional audio.
 *   id="demo"   — ANIMATED product demo: hook → pipeline flow diagram (#780) → 4-way compare →
 *                 cost split → honest verdict → CTA, all driven by `video/demoTimeline.ts`
 *                 (data-driven, brand-safe). Props are the flattened timeline (see adapters/video.ts).
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
 * PIPELINE (#780 — the 2nd scene, after the hook) — the lfah FLOW DIAGRAM. Renders the
 * `nodes`/`edges` from the timeline as a clean TOP-TO-BOTTOM flow: each node is a lane-colored
 * card (local = green with a "$0 · free" badge, cloud = blue, test = amber); normal flow edges
 * draw a solid down-arrow between consecutive cards; the `fix -> cloud` edge is a DASHED
 * "escalate — only when stuck" arrow drawn to the side. Staggered entrance via `entrance()`.
 *
 * Honest framing: the heavy executor card is the only LOCAL/free one; the cloud only shows up at
 * the bottom as the escalation, never the default — the same honesty the rest of the demo carries.
 */
const LANE_BADGE_LABEL: Record<Lane, string> = {
  local: "$0 · free",
  cloud: "cloud",
  test: "real tests",
};

const PipelineScene: React.FC<{ nodes: DemoNode[]; edges: DemoEdge[]; layout: DemoLayout }> = ({
  nodes,
  edges,
  layout,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  // The vertical flow = the nodes that are on a normal "flow" edge path, in order, starting at the
  // first edge's source. The escalate target (`cloud`) is drawn as a side branch off its source.
  const flowEdges = edges.filter((e) => e.kind === "flow");
  const escalate = edges.find((e) => e.kind === "escalate");
  // Order the spine: start node + each flow edge's target (plan → fix → grade → tests).
  const spineIds: string[] = [];
  if (flowEdges.length > 0) {
    spineIds.push(flowEdges[0].from);
    for (const e of flowEdges) if (!spineIds.includes(e.to)) spineIds.push(e.to);
  }
  const byId = (id: string) => nodes.find((n) => n.id === id);
  const spine = spineIds.map(byId).filter((n): n is DemoNode => !!n);
  const escNode = escalate ? byId(escalate.to) : undefined;
  const escFromIdx = escalate ? spineIds.indexOf(escalate.from) : -1;

  const card = (node: DemoNode, delay: number, dashed = false) => {
    const color = LANE_COLOR[node.lane];
    return (
      <div
        style={{
          ...entrance(frame, fps, delay),
          width: "100%",
          boxSizing: "border-box",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 18,
          background: node.lane === "local" ? "#0f2a22" : "#111a30",
          border: `3px ${dashed ? "dashed" : "solid"} ${color}`,
          borderRadius: 18,
          padding: layout.fill ? "26px 28px" : "18px 24px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: f(38) }}>{node.label}</div>
          <div style={{ color: "#94a3b8", fontFamily: FONT, fontSize: f(26) }}>{node.badge}</div>
        </div>
        <div
          style={{
            color: node.lane === "local" ? BG : "#fff",
            background: node.lane === "local" ? color : "transparent",
            border: node.lane === "local" ? "none" : `2px solid ${color}`,
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: f(26),
            padding: "8px 18px",
            borderRadius: 999,
            flexShrink: 0,
          }}
        >
          {LANE_BADGE_LABEL[node.lane]}
        </div>
      </div>
    );
  };

  // A solid down-arrow between two flow cards.
  const arrow = (delay: number) => (
    <div
      style={{
        ...entrance(frame, fps, delay, 14),
        color: "#64748b",
        fontFamily: FONT,
        fontSize: f(30),
        lineHeight: 1,
        textAlign: "center",
        width: "100%",
      }}
    >
      ↓
    </div>
  );

  return (
    <SceneShell
      layout={layout}
      gap={Math.round(12 * layout.gapScale)}
      contentWidth={920}
      header={
        <div style={{ ...entrance(frame, fps), color: "#64748b", fontFamily: FONT, fontSize: f(34), letterSpacing: 4, paddingBottom: 6 }}>
          HOW THE LOOP WORKS
        </div>
      }
    >
      {spine.map((node, i) => (
        <React.Fragment key={node.id}>
          {card(node, 8 + i * 12)}
          {i < spine.length - 1 ? arrow(12 + i * 12) : null}
          {/* The dashed escalate branch is drawn right after its source card. */}
          {escNode && i === escFromIdx ? (
            <div style={{ ...entrance(frame, fps, 14 + i * 12, 14), width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(8 * layout.gapScale) }}>
              <div style={{ color: LANE_COLOR.cloud, fontFamily: FONT, fontSize: f(24), fontWeight: 700, textAlign: "center" }}>
                ⤷ escalate — only when stuck
              </div>
              {card(escNode, 18 + i * 12, true)}
            </div>
          ) : null}
        </React.Fragment>
      ))}
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
    pipeline: <PipelineScene nodes={props.nodes} edges={props.edges} layout={layout} />,
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

// ─────────────────────── builder demo (#799 — Post #2) ──────────────────────
// "lfah builds an app, test-first" — an 8-scene story DISTINCT from the 4-way demo above.
// Reuses the shared SceneShell / scaler / entrance / DemoCaptionBand primitives; only the
// per-scene CONTENT differs. Props are the flattened `video/builderDemoTimeline.ts` spec.

interface BuilderScene { id: string; fromSec: number; durationSec: number }
interface BuilderPhase { id: string; rescued: boolean }
interface BuilderNumber { label: string; value: string; scopeGuard?: string }

interface BuilderProps {
  title: string;
  nameExpansion: string;
  introHeadline: string;
  scenes: BuilderScene[];
  phases: BuilderPhase[];
  numbers: BuilderNumber[];
  cta: string;
  repoUrl?: string;
  audioSrc?: string;
  captions?: CaptionCue[];
  captionBandY?: number;
  layout: DemoLayout;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  /**
   * #805 — OPTIONAL animated generative-art background. When `backgroundSrc` is set (a data URI
   * for the post-2 card art), the solid `#0a0f1e` fill is replaced by that art rendered FULL-FRAME
   * (`objectFit: cover`, per-aspect, never letterboxed — #765) under a slow Ken-Burns drift
   * (deterministic scale ~1.0->~1.12 + a few-percent pan via `interpolate(useCurrentFrame())`),
   * then DIMMED by a dark `#0a0f1e` scrim at `backgroundScrimOpacity` so the foreground UI +
   * caption band stay legible ("subtle living texture behind the same dark UI"). Omitted/empty ->
   * behaviour is byte-identical to today (solid bg). See `AnimatedArtBackground`.
   */
  backgroundSrc?: string;
  /** #805 — dark-scrim opacity over the moving art (0..1). Higher = dimmer art / more legible. Default 0.7. */
  backgroundScrimOpacity?: number;
  /** #805 — optional CSS blur (px) on the art to further calm the busy infographic. Default 0 (none). */
  backgroundBlurPx?: number;
}

/**
 * #805 — the animated generative-art background for the builder demo. The square card art
 * (`src`) is rendered full-frame with `objectFit: cover` (fills 9:16 / 1:1 / 4:5 alike — #765),
 * driven by a SLOW, DETERMINISTIC Ken-Burns move: scale eases 1.0 -> ~1.12 and a gentle
 * few-percent pan across the WHOLE clip (single monotonic interpolation over [0, durationInFrames]
 * -> no abrupt loop seam). A dark `#0a0f1e` scrim at `scrimOpacity` sits ON TOP of the art so the
 * foreground content + caption band keep strong contrast. The over-scale (>=1.12) also guarantees
 * the panned art never reveals an edge. Legibility-first: when in doubt the caller dims MORE.
 */
const AnimatedArtBackground: React.FC<{
  src: string;
  scrimOpacity: number;
  blurPx: number;
  durationInFrames: number;
}> = ({ src, scrimOpacity, blurPx, durationInFrames }) => {
  const frame = useCurrentFrame();
  const span = Math.max(1, durationInFrames - 1);
  const opts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  // Slow continuous zoom + drift over the full clip. Over-scale base 1.12 keeps the panned
  // edges off-frame at the widest pan; the pan is a few percent of the frame.
  const scale = interpolate(frame, [0, span], [1.0, 1.12], opts);
  const panX = interpolate(frame, [0, span], [-2.2, 2.2], opts); // % of frame width
  const panY = interpolate(frame, [0, span], [1.6, -1.6], opts); // % of frame height
  return (
    <AbsoluteFill style={{ backgroundColor: BG, overflow: "hidden" }}>
      <Img
        src={src}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${panX}%, ${panY}%)`,
          transformOrigin: "center center",
          filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
        }}
      />
      <AbsoluteFill style={{ backgroundColor: BG, opacity: scrimOpacity }} />
    </AbsoluteFill>
  );
};

const RED = "#f87171"; // failing test
const GREEN = LANE_COLOR.local; // passing / local / free

/** A small pill used across builder scenes. */
const Pill: React.FC<{ color: string; filled?: boolean; size: number; children: React.ReactNode }> = ({
  color,
  filled = false,
  size,
  children,
}) => (
  <div
    style={{
      color: filled ? BG : color,
      background: filled ? color : "transparent",
      border: `2px solid ${color}`,
      fontFamily: FONT,
      fontWeight: 800,
      fontSize: size,
      padding: "10px 22px",
      borderRadius: 999,
      display: "inline-block",
    }}
  >
    {children}
  </div>
);

/** Scene 1 — name-expand intro + the test-first claim. */
const BIntroScene: React.FC<{ title: string; nameExpansion: string; headline: string; layout: DemoLayout }> = ({
  title,
  nameExpansion,
  headline,
  layout,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  return (
    <SceneShell layout={layout} gap={Math.round(24 * layout.gapScale)}>
      <div style={{ ...entrance(frame, fps), color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: f(76), textAlign: "center", lineHeight: 1.1 }}>
        {title}
      </div>
      <div style={{ ...entrance(frame, fps, 8), color: "#64748b", fontFamily: FONT, fontSize: f(30), letterSpacing: 3, textAlign: "center" }}>
        {nameExpansion}
      </div>
      <div style={{ ...entrance(frame, fps, 16), color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: f(48), lineHeight: 1.2, textAlign: "center" }}>
        {headline}
      </div>
      <div style={{ ...entrance(frame, fps, 26), textAlign: "center" }}>
        <Pill color={GREEN} filled size={f(34)}>builds whole apps · test-first</Pill>
      </div>
    </SceneShell>
  );
};

/** Scene 2 — test-first = the failing test is the SPEC and the PROOF. */
const BTestFirstScene: React.FC<{ layout: DemoLayout }> = ({ layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  const chip = (label: string, sub: string, delay: number) => (
    <div
      style={{
        ...entrance(frame, fps, delay),
        width: "100%",
        height: layout.fill ? "100%" : undefined,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 10,
        background: "#111a30",
        border: `3px solid ${GREEN}`,
        borderRadius: 18,
        padding: layout.fill ? "30px 30px" : "22px 26px",
      }}
    >
      <div style={{ color: GREEN, fontFamily: FONT, fontWeight: 800, fontSize: f(44) }}>{label}</div>
      <div style={{ color: "#cbd5e1", fontFamily: FONT, fontSize: f(30), lineHeight: 1.3 }}>{sub}</div>
    </div>
  );
  return (
    <SceneShell
      layout={layout}
      gap={Math.round(18 * layout.gapScale)}
      contentWidth={952}
      header={
        <div style={{ ...entrance(frame, fps), color: "#64748b", fontFamily: FONT, fontSize: f(34), letterSpacing: 4, paddingBottom: 6 }}>
          EVERY FEATURE STARTS AS A FAILING TEST
        </div>
      }
    >
      {chip("The spec", "a plain-English goal — what the feature must do", 10)}
      {chip("The proof", "a test that's only true when it actually works", 22)}
    </SceneShell>
  );
};

/** A RED/GREEN test chip used by scenes 3 and 4. `state` flips on `flipAtFrame`. */
const TestChip: React.FC<{ layout: DemoLayout; green: boolean; runner?: string; delay: number }> = ({
  layout,
  green,
  runner,
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  const color = green ? GREEN : RED;
  return (
    <div
      style={{
        ...entrance(frame, fps, delay),
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 18,
        background: green ? "#0f2a22" : "#2a1518",
        border: `3px solid ${color}`,
        borderRadius: 18,
        padding: layout.fill ? "30px 32px" : "22px 28px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ color: "#fff", fontFamily: "SFMono-Regular, Menlo, Consolas, monospace", fontSize: f(34), fontWeight: 700 }}>
          {green ? "✓ test passing" : "✗ test failing"}
        </div>
        {runner ? (
          <div style={{ color: "#94a3b8", fontFamily: FONT, fontSize: f(26) }}>{runner}</div>
        ) : null}
      </div>
      <Pill color={color} filled size={f(34)}>{green ? "GREEN" : "RED"}</Pill>
    </div>
  );
};

/** Scene 3 — RED: scaffold empty project, drop the first failing test. */
const BRedScene: React.FC<{ layout: DemoLayout }> = ({ layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  return (
    <SceneShell
      layout={layout}
      gap={Math.round(18 * layout.gapScale)}
      contentWidth={952}
      header={
        <div style={{ ...entrance(frame, fps), color: "#64748b", fontFamily: FONT, fontSize: f(34), letterSpacing: 4, paddingBottom: 6 }}>
          STEP 1 · SCAFFOLD + FIRST FAILING TEST
        </div>
      }
    >
      <div style={{ ...entrance(frame, fps, 8), color: "#cbd5e1", fontFamily: FONT, fontSize: f(32), textAlign: "center", lineHeight: 1.3 }}>
        Empty project. The first test goes in. No code yet.
      </div>
      <TestChip layout={layout} green={false} runner="jest · 0 passing" delay={16} />
    </SceneShell>
  );
};

/** Scene 4 — GREEN: a free local model writes code till the REAL test suite passes (not an LLM judge). */
const BGreenScene: React.FC<{ layout: DemoLayout }> = ({ layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  return (
    <SceneShell
      layout={layout}
      gap={Math.round(18 * layout.gapScale)}
      contentWidth={952}
      header={
        <div style={{ ...entrance(frame, fps), color: "#64748b", fontFamily: FONT, fontSize: f(34), letterSpacing: 4, paddingBottom: 6 }}>
          STEP 2 · FREE LOCAL MODEL WRITES CODE → GREEN
        </div>
      }
    >
      <TestChip layout={layout} green delay={10} runner="the real test runner: jest, or pytest" />
      <div style={{ ...entrance(frame, fps, 22), textAlign: "center" }}>
        <Pill color={GREEN} filled size={f(32)}>real test suite · NOT an LLM judge</Pill>
      </div>
    </SceneShell>
  );
};

/** Scene 5 — GATE + COMMIT: ships only when test green AND reviewer agrees; a broken phase HALTS. */
const BGateScene: React.FC<{ layout: DemoLayout }> = ({ layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  const gate = (label: string, delay: number) => (
    <div
      style={{
        ...entrance(frame, fps, delay),
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        gap: 16,
        background: "#0f2a22",
        border: `3px solid ${GREEN}`,
        borderRadius: 16,
        padding: layout.fill ? "24px 28px" : "18px 24px",
      }}
    >
      <div style={{ color: GREEN, fontSize: f(40), fontWeight: 800 }}>✅</div>
      <div style={{ color: "#fff", fontFamily: FONT, fontSize: f(34), fontWeight: 700 }}>{label}</div>
    </div>
  );
  return (
    <SceneShell
      layout={layout}
      gap={Math.round(16 * layout.gapScale)}
      contentWidth={952}
      header={
        <div style={{ ...entrance(frame, fps), color: "#64748b", fontFamily: FONT, fontSize: f(34), letterSpacing: 4, paddingBottom: 6 }}>
          STEP 3 · SHIP ONLY WHEN BOTH AGREE
        </div>
      }
    >
      {gate("the real test suite is green", 10)}
      {gate("an independent reviewer agrees", 20)}
      <div style={{ ...entrance(frame, fps, 32), textAlign: "center" }}>
        <Pill color={GREEN} filled size={f(40)}>→ 🚢 commit &amp; move on</Pill>
      </div>
      <div style={{ ...entrance(frame, fps, 42), color: RED, fontFamily: FONT, fontSize: f(28), fontWeight: 700, textAlign: "center", lineHeight: 1.3 }}>
        can't go green? the build HALTS — never stack on a broken phase
      </div>
    </SceneShell>
  );
};

/** Scene 6 — DOGFOOD REVEAL: it built THIS pipeline — 13 phases, all shipped (2 cloud-rescued). */
const BDogfoodScene: React.FC<{ phases: BuilderPhase[]; layout: DemoLayout }> = ({ phases, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  // The chips animate to green in sequence; the 2 cloud-rescued ones get a blue ring + label.
  return (
    <SceneShell
      layout={layout}
      gap={Math.round(18 * layout.gapScale)}
      contentWidth={952}
      header={
        <div style={{ ...entrance(frame, fps), color: "#64748b", fontFamily: FONT, fontSize: f(34), letterSpacing: 4, paddingBottom: 6 }}>
          IT BUILT THIS VERY PIPELINE
        </div>
      }
    >
      <div style={{ ...entrance(frame, fps, 6), color: "#cbd5e1", fontFamily: FONT, fontSize: f(32), textAlign: "center", lineHeight: 1.3 }}>
        The copy, the cards, the render — 13 build phases. Every one shipped.
      </div>
      <div
        style={{
          width: "100%",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
          gap: Math.round(14 * layout.gapScale),
        }}
      >
        {phases.map((p, i) => {
          const ring = p.rescued ? LANE_COLOR.cloud : GREEN;
          return (
            <div
              key={p.id}
              style={{
                ...entrance(frame, fps, 12 + i * 4, 14),
                minWidth: f(96),
                boxSizing: "border-box",
                background: "#0f2a22",
                border: `3px solid ${ring}`,
                borderRadius: 14,
                padding: "12px 14px",
                textAlign: "center",
              }}
            >
              <div style={{ color: GREEN, fontFamily: FONT, fontWeight: 800, fontSize: f(28) }}>✓ {p.id}</div>
              {p.rescued ? (
                <div style={{ color: LANE_COLOR.cloud, fontFamily: FONT, fontSize: f(18), fontWeight: 700, marginTop: 4 }}>cloud-rescued</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </SceneShell>
  );
};

/** Scene 7 — NUMBERS panel: the honest dogfood stats. */
const BNumbersScene: React.FC<{ numbers: BuilderNumber[]; layout: DemoLayout }> = ({ numbers, layout }) => {
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
          THE NUMBERS · n=13 BUILD PHASES
        </div>
      }
    >
      {numbers.map((num, i) => {
        const isFree = /free local/i.test(num.label);
        const accent = isFree ? GREEN : "#fff";
        return (
          <div
            key={num.label}
            style={{
              ...entrance(frame, fps, 8 + i * 8),
              width: "100%",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#111a30",
              border: `2px solid ${isFree ? GREEN : "#1e293b"}`,
              borderRadius: 14,
              padding: layout.fill ? "18px 24px" : "14px 22px",
              boxSizing: "border-box",
            }}
          >
            <div style={{ color: "#cbd5e1", fontFamily: FONT, fontSize: f(30), textTransform: "capitalize" }}>{num.label}</div>
            <div style={{ color: accent, fontFamily: FONT, fontWeight: 800, fontSize: f(44) }}>{num.value}</div>
          </div>
        );
      })}
    </SceneShell>
  );
};

const BCtaScene: React.FC<{ cta: string; repoUrl?: string; layout: DemoLayout }> = ({ cta, repoUrl, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  const idx = cta.indexOf(":");
  const head = idx >= 0 ? cta.slice(0, idx).trim() : cta.trim();
  const command = idx >= 0 ? cta.slice(idx + 1).trim() : "";
  return (
    <SceneShell layout={layout} gap={Math.round(24 * layout.gapScale)}>
      <div style={{ ...entrance(frame, fps), color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: f(58), textAlign: "center", lineHeight: 1.15 }}>
        Your tests are the spec &amp; the proof.
      </div>
      <div style={{ ...entrance(frame, fps, 8), color: GREEN, fontFamily: FONT, fontWeight: 800, fontSize: f(40), textAlign: "center" }}>
        {head}
      </div>
      {command ? (
        <div
          style={{
            ...entrance(frame, fps, 14),
            color: "#e2e8f0",
            background: "#111a30",
            border: `2px solid ${GREEN}`,
            fontFamily: "SFMono-Regular, Menlo, Consolas, monospace",
            fontSize: f(28),
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
      <div style={{ ...entrance(frame, fps, 22), textAlign: "center" }}>
        <Pill color={GREEN} filled size={f(30)}>then: lfah build</Pill>
      </div>
    </SceneShell>
  );
};

const DEFAULT_LAYOUT_1X1: DemoLayout = {
  aspectRatio: 1,
  fill: false,
  justify: "center",
  padTopFraction: 0.18,
  padBottomFraction: 0.18,
  typeScale: 1,
  gapScale: 1,
  usableSpanFraction: 0.64,
};

const BuilderDemoVideo: React.FC<BuilderProps> = (props) => {
  const { scenes, fps } = props;
  const layout = props.layout ?? DEFAULT_LAYOUT_1X1;
  const sceneEl: Record<string, React.ReactNode> = {
    intro: <BIntroScene title={props.title} nameExpansion={props.nameExpansion} headline={props.introHeadline} layout={layout} />,
    testfirst: <BTestFirstScene layout={layout} />,
    red: <BRedScene layout={layout} />,
    green: <BGreenScene layout={layout} />,
    gate: <BGateScene layout={layout} />,
    dogfood: <BDogfoodScene phases={props.phases} layout={layout} />,
    numbers: <BNumbersScene numbers={props.numbers} layout={layout} />,
    cta: <BCtaScene cta={props.cta} repoUrl={props.repoUrl} layout={layout} />,
  };
  const captions = props.captions ?? [];
  // #805 — animated generative-art background mode: when a background image is supplied, the
  // solid fill becomes the slow-drifting, dimmed card art (legibility preserved by the scrim).
  // Omitted -> the original solid `#0a0f1e` fill (byte-identical to pre-#805 behaviour).
  const hasAnimatedBg = typeof props.backgroundSrc === "string" && props.backgroundSrc.length > 0;
  const scrimOpacity = props.backgroundScrimOpacity ?? 0.7;
  const blurPx = props.backgroundBlurPx ?? 0;
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {hasAnimatedBg ? (
        <AnimatedArtBackground
          src={props.backgroundSrc!}
          scrimOpacity={scrimOpacity}
          blurPx={blurPx}
          durationInFrames={props.durationInFrames}
        />
      ) : null}
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

      <Composition
        id="builder-demo"
        component={BuilderDemoVideo}
        durationInFrames={2700}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          title: "local-first-agent-harness",
          nameExpansion: "local first agent harness",
          introHeadline: "",
          scenes: [] as BuilderScene[],
          phases: [] as BuilderPhase[],
          numbers: [] as BuilderNumber[],
          cta: "",
          repoUrl: undefined,
          audioSrc: undefined,
          captions: [] as CaptionCue[],
          captionBandY: Math.round(1920 * 0.82),
          layout: DEFAULT_LAYOUT_9X16,
          width: 1080,
          height: 1920,
          fps: 30,
          durationInFrames: 2700,
          backgroundSrc: undefined,
          backgroundScrimOpacity: 0.7,
          backgroundBlurPx: 0,
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
