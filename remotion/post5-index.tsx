/**
 * Post #5 — three-role-model demo composition (id="post5-demo").
 *
 * "four AI subagents, nobody grades their own homework" — a 6-scene kinetic-typography story over the
 * SHARED, dimmed, ANIMATED card art (the same `_art-base-three-role-model-post5.png` the cards use).
 * DISTINCT from the Post #1 `demo`, Post #2 `builder-demo` and Post #3 `post3-demo` compositions:
 * those are hard-wired to their own stories, so Post #5 gets its OWN composition rather than
 * re-skinning theirs (which would ship mismatched visuals).
 *
 * Self-contained ON PURPOSE: this file is a SEPARATE Remotion entry point with its own
 * `registerRoot`, so it never double-registers against `remotion/index.tsx` and never collides with
 * concurrent edits there. It re-implements the small shared primitives (SceneShell / entrance /
 * caption band / animated art background) inline and imports ONLY the unit-tested motion curve
 * (`video/artBackgroundMotion.ts`) so the background stays perceptible (#807).
 *
 * Every scene's COPY is data-driven from `video/post5Timeline.ts` (sourced from
 * `inputs/threeRoleModelSpec.ts` facts) — no number or claim is hard-coded here.
 */

import * as React from "react";
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

import { artBackgroundTransform } from "../video/artBackgroundMotion";

// ───────────────────────────── shared primitives ────────────────────────────

const BG = "#0a0f1e";
const FONT = "Inter, Helvetica, Arial, sans-serif";
const MONO = "SFMono-Regular, Menlo, Consolas, monospace";
const GREEN = "#34d399"; // the verified / pass accent
const BLUE = "#60a5fa";
const AMBER = "#fbbf24";
const MUTED = "#94a3b8";
const KICKER = "#64748b";
const DIM_TILE = "#1e293b";
const DIM_BORDER = "#334155";

interface CaptionCue {
  text: string;
  startSec: number;
  endSec: number;
}

interface Layout {
  aspectRatio: number;
  fill: boolean;
  justify: "center" | "space-evenly" | "space-between";
  padTopFraction: number;
  padBottomFraction: number;
  typeScale: number;
  gapScale: number;
  usableSpanFraction: number;
  // HORIZONTAL title-safe band (keep in sync with video/demoLayout.ts DemoLayout). Content stays
  // inside `contentMaxWidthPx` so a full-screen tall-phone crop (~9-12%/side) never clips it.
  safeAreaXFraction: number;
  contentMaxWidthPx: number;
}

const DEFAULT_LAYOUT_9X16: Layout = {
  aspectRatio: 1920 / 1080,
  fill: true,
  justify: "space-between",
  padTopFraction: 0.045,
  padBottomFraction: 0.045,
  typeScale: 1.34,
  gapScale: 1.1,
  usableSpanFraction: 0.91,
  safeAreaXFraction: 0.8, // SSOT = CONFIG.demo.safeAreaXFraction
  contentMaxWidthPx: Math.floor(1080 * 0.8), // 864 at 1080w → ~108px (10%) clear each side
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

/** Per-scene font scaler — multiplies a base px size by the aspect's type scale. */
function scaler(layout: Layout): (px: number) => number {
  return (px: number) => Math.round(px * layout.typeScale);
}

/** The per-aspect frame box every scene lives in (fills tall cuts; centers the square cut). */
const SceneShell: React.FC<{
  layout: Layout;
  header?: React.ReactNode;
  gap?: number;
  children: React.ReactNode;
}> = ({ layout, header, gap = 0, children }) => {
  const { width, height } = useVideoConfig();
  const items = React.Children.toArray(children);
  // HORIZONTAL title-safe band: content lives inside contentMaxWidthPx (≈80% of width), so a
  // full-screen tall-phone crop (~9-12%/side) never clips it. Bg art is rendered separately and
  // stays full-bleed.
  const contentWidth = layout.contentMaxWidthPx ?? Math.floor(width * (layout.safeAreaXFraction ?? 0.8));
  const sideMargin = Math.round((width - contentWidth) / 2);
  return (
    <AbsoluteFill
      style={{
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: Math.round(layout.padTopFraction * height),
        paddingBottom: Math.round(layout.padBottomFraction * height),
        paddingLeft: sideMargin,
        paddingRight: sideMargin,
      }}
    >
      <div
        style={{
          width: contentWidth,
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
      textAlign: "center",
    }}
  >
    {children}
  </div>
);

const Kicker: React.FC<{ children: React.ReactNode; size: number; frame: number; fps: number }> = ({
  children,
  size,
  frame,
  fps,
}) => (
  <div
    style={{
      ...entrance(frame, fps),
      color: KICKER,
      fontFamily: FONT,
      fontSize: size,
      fontWeight: 700,
      letterSpacing: 5,
      textAlign: "center",
    }}
  >
    {children}
  </div>
);

// ───────────────────────────── animated art background ──────────────────────

const AnimatedArtBackground: React.FC<{ src: string; scrimOpacity: number; blurPx: number }> = ({
  src,
  scrimOpacity,
  blurPx,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { scale, panXPct, panYPct } = artBackgroundTransform(frame, fps);
  return (
    <AbsoluteFill style={{ backgroundColor: BG, overflow: "hidden" }}>
      <Img
        src={src}
        style={{
          position: "absolute",
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${panXPct}%, ${panYPct}%)`,
          transformOrigin: "center center",
          filter: blurPx > 0 ? `blur(${blurPx}px)` : undefined,
        }}
      />
      <AbsoluteFill style={{ backgroundColor: BG, opacity: scrimOpacity }} />
    </AbsoluteFill>
  );
};

// ───────────────────────────── caption band ─────────────────────────────────

const CaptionBand: React.FC<{
  captions: CaptionCue[];
  bandY: number;
  fps: number;
  typeScale: number;
  maxWidthPx: number;
}> = ({ captions, bandY, fps, typeScale, maxWidthPx }) => (
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
                maxWidth: maxWidthPx, // HORIZONTAL title-safe band — within the crop-safe width
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

// ───────────────────────────── scenes ───────────────────────────────────────

interface Post5Role {
  name: string;
  job: string;
}

interface SceneContent {
  title: string;
  tagline: string;
  kitchen: { headline: string; sub: string; pill: string };
  problem: { kicker: string; headline: string; items: string[]; footer: string };
  roles: { kicker: string; headline: string; roles: Post5Role[]; footer: string };
  knobs: {
    kicker: string;
    headline: string;
    executorLabel: string;
    executorOptions: string[];
    evaluatorLabel: string;
    evaluatorOptions: string[];
    footer: string;
  };
  enforced: { kicker: string; headline: string; chip: string; sub: string; footer: string };
  cta: { headline: string; lines: string[]; badge: string; cta: string; repoUrl?: string };
}

const KitchenScene: React.FC<{ c: SceneContent; layout: Layout }> = ({ c, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  return (
    <SceneShell layout={layout} gap={Math.round(24 * layout.gapScale)}>
      <div style={{ ...entrance(frame, fps), color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: f(82), textAlign: "center", lineHeight: 1.05 }}>
        {c.title}
      </div>
      <div style={{ ...entrance(frame, fps, 8), color: KICKER, fontFamily: FONT, fontSize: f(28), letterSpacing: 2, textAlign: "center", lineHeight: 1.25 }}>
        {c.tagline}
      </div>
      <div style={{ ...entrance(frame, fps, 16), color: "#fff", fontFamily: FONT, fontWeight: 700, fontSize: f(48), lineHeight: 1.2, textAlign: "center" }}>
        {c.kitchen.headline}
      </div>
      <div style={{ ...entrance(frame, fps, 24), color: MUTED, fontFamily: FONT, fontSize: f(30), lineHeight: 1.35, textAlign: "center" }}>
        {c.kitchen.sub}
      </div>
      <div style={{ ...entrance(frame, fps, 32), textAlign: "center" }}>
        <Pill color={GREEN} filled size={f(34)}>{c.kitchen.pill}</Pill>
      </div>
    </SceneShell>
  );
};

const ProblemScene: React.FC<{ c: SceneContent; layout: Layout }> = ({ c, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  const p = c.problem;
  return (
    <SceneShell layout={layout} gap={Math.round(22 * layout.gapScale)} header={<Kicker size={f(32)} frame={frame} fps={fps}>{p.kicker}</Kicker>}>
      <div style={{ ...entrance(frame, fps, 6), color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: f(54), lineHeight: 1.15, textAlign: "center" }}>
        {p.headline}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(16 * layout.gapScale) }}>
        {p.items.map((it, i) => (
          <div
            key={i}
            style={{
              ...entrance(frame, fps, 14 + i * 8),
              color: BLUE,
              fontFamily: MONO,
              fontSize: f(36),
              fontWeight: 600,
              background: "rgba(96,165,250,0.10)",
              border: `2px solid ${BLUE}`,
              borderRadius: 16,
              padding: "12px 26px",
              textAlign: "center",
            }}
          >
            {it}
          </div>
        ))}
      </div>
      <div style={{ ...entrance(frame, fps, 44), color: AMBER, fontFamily: FONT, fontSize: f(34), fontWeight: 700, lineHeight: 1.25, textAlign: "center" }}>
        {p.footer}
      </div>
    </SceneShell>
  );
};

const RolesScene: React.FC<{ c: SceneContent; layout: Layout }> = ({ c, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  const r = c.roles;
  // reviewers (the even-indexed "vet" roles) glow green; doers are blue — visually "nobody reviews
  // their own work" reads as alternating doer → reviewer pairs.
  const isReviewer = (i: number) => i % 2 === 1;
  return (
    <SceneShell layout={layout} gap={Math.round(16 * layout.gapScale)} header={<Kicker size={f(30)} frame={frame} fps={fps}>{r.kicker}</Kicker>}>
      <div style={{ ...entrance(frame, fps, 6), color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: f(50), lineHeight: 1.15, textAlign: "center" }}>
        {r.headline}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: Math.round(8 * layout.gapScale) }}>
        {r.roles.map((role, i) => {
          const accent = isReviewer(i) ? GREEN : BLUE;
          return (
            <React.Fragment key={i}>
              <div
                style={{
                  ...entrance(frame, fps, 12 + i * 8),
                  width: "100%",
                  maxWidth: f(640),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: f(18),
                  background: "rgba(255,255,255,0.05)",
                  border: `2px solid ${accent}`,
                  borderRadius: 16,
                  padding: "12px 24px",
                }}
              >
                <div style={{ color: accent, fontFamily: MONO, fontWeight: 800, fontSize: f(34) }}>{role.name}</div>
                <div style={{ color: MUTED, fontFamily: FONT, fontSize: f(28), textAlign: "right" }}>{role.job}</div>
              </div>
              {i < r.roles.length - 1 ? (
                <div style={{ ...entrance(frame, fps, 16 + i * 8), color: KICKER, fontSize: f(26), fontWeight: 800 }}>↓</div>
              ) : null}
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ ...entrance(frame, fps, 48), color: "#fff", fontFamily: FONT, fontSize: f(32), fontWeight: 700, lineHeight: 1.3, textAlign: "center" }}>
        {r.footer}
      </div>
    </SceneShell>
  );
};

const KnobsScene: React.FC<{ c: SceneContent; layout: Layout }> = ({ c, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  const k = c.knobs;
  const Knob: React.FC<{ label: string; options: string[]; accent: string; delay: number }> = ({
    label,
    options,
    accent,
    delay,
  }) => (
    <div
      style={{
        ...entrance(frame, fps, delay),
        width: "100%",
        background: "rgba(255,255,255,0.05)",
        border: `2px solid ${DIM_BORDER}`,
        borderRadius: 18,
        padding: "16px 22px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: Math.round(10 * layout.gapScale),
      }}
    >
      <div style={{ color: accent, fontFamily: FONT, fontWeight: 800, fontSize: f(32), textAlign: "center" }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: f(10) }}>
        {options.map((opt, i) => (
          <div
            key={i}
            style={{
              color: "#fff",
              fontFamily: MONO,
              fontSize: f(26),
              fontWeight: 600,
              background: "rgba(255,255,255,0.06)",
              border: `2px solid ${accent}`,
              borderRadius: 12,
              padding: "8px 16px",
            }}
          >
            {opt}
          </div>
        ))}
      </div>
    </div>
  );
  return (
    <SceneShell layout={layout} gap={Math.round(18 * layout.gapScale)} header={<Kicker size={f(32)} frame={frame} fps={fps}>{k.kicker}</Kicker>}>
      <div style={{ ...entrance(frame, fps, 6), color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: f(50), lineHeight: 1.15, textAlign: "center" }}>
        {k.headline}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: Math.round(16 * layout.gapScale) }}>
        <Knob label={k.executorLabel} options={k.executorOptions} accent={BLUE} delay={14} />
        <Knob label={k.evaluatorLabel} options={k.evaluatorOptions} accent={GREEN} delay={26} />
      </div>
      <div style={{ ...entrance(frame, fps, 44), color: AMBER, fontFamily: FONT, fontSize: f(34), fontWeight: 700, lineHeight: 1.25, textAlign: "center" }}>
        {k.footer}
      </div>
    </SceneShell>
  );
};

const EnforcedScene: React.FC<{ c: SceneContent; layout: Layout }> = ({ c, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  const e = c.enforced;
  return (
    <SceneShell layout={layout} gap={Math.round(22 * layout.gapScale)} header={<Kicker size={f(32)} frame={frame} fps={fps}>{e.kicker}</Kicker>}>
      <div style={{ ...entrance(frame, fps, 6), color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: f(50), lineHeight: 1.15, textAlign: "center" }}>
        {e.headline}
      </div>
      <div style={{ ...entrance(frame, fps, 16), display: "flex", justifyContent: "center" }}>
        <div
          style={{
            color: BG,
            background: GREEN,
            fontFamily: MONO,
            fontWeight: 800,
            fontSize: f(40),
            padding: "16px 32px",
            borderRadius: 16,
            textAlign: "center",
          }}
        >
          ✓ {e.chip}
        </div>
      </div>
      <div style={{ ...entrance(frame, fps, 26), color: MUTED, fontFamily: FONT, fontSize: f(32), lineHeight: 1.3, textAlign: "center" }}>
        {e.sub}
      </div>
      <div style={{ ...entrance(frame, fps, 36), color: "#fff", fontFamily: FONT, fontSize: f(34), fontWeight: 700, letterSpacing: 1, lineHeight: 1.3, textAlign: "center" }}>
        {e.footer}
      </div>
    </SceneShell>
  );
};

const CtaScene: React.FC<{ c: SceneContent; layout: Layout }> = ({ c, layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = scaler(layout);
  const cta = c.cta;
  return (
    <SceneShell layout={layout} gap={Math.round(24 * layout.gapScale)}>
      <div style={{ ...entrance(frame, fps), color: "#fff", fontFamily: FONT, fontWeight: 800, fontSize: f(60), lineHeight: 1.1, textAlign: "center" }}>
        {cta.headline}
      </div>
      {cta.lines.map((ln, i) => (
        <div key={i} style={{ ...entrance(frame, fps, 10 + i * 8), color: MUTED, fontFamily: FONT, fontSize: f(34), lineHeight: 1.3, textAlign: "center" }}>
          {ln}
        </div>
      ))}
      <div style={{ ...entrance(frame, fps, 30), textAlign: "center" }}>
        <Pill color={GREEN} filled size={f(32)}>{cta.badge}</Pill>
      </div>
      <div style={{ ...entrance(frame, fps, 40), color: GREEN, fontFamily: FONT, fontWeight: 800, fontSize: f(40), textAlign: "center" }}>
        {cta.cta}
      </div>
      {cta.repoUrl ? (
        <div style={{ ...entrance(frame, fps, 48), color: "#fff", fontFamily: MONO, fontSize: f(28), textAlign: "center", wordBreak: "break-all" }}>
          {cta.repoUrl.replace(/^https?:\/\//, "")}
        </div>
      ) : null}
    </SceneShell>
  );
};

// ───────────────────────────── composition ──────────────────────────────────

interface Post5Props extends SceneContent {
  scenes: { id: string; fromSec: number; durationSec: number }[];
  audioSrc?: string;
  captions?: CaptionCue[];
  captionBandY?: number;
  layout: Layout;
  width: number;
  height: number;
  fps: number;
  durationInFrames: number;
  backgroundSrc?: string;
  backgroundScrimOpacity?: number;
  backgroundBlurPx?: number;
}

const Post5DemoVideo: React.FC<Post5Props> = (props) => {
  const { scenes, fps } = props;
  const layout = props.layout ?? DEFAULT_LAYOUT_9X16;
  const c: SceneContent = props;
  const sceneEl: Record<string, React.ReactNode> = {
    kitchen: <KitchenScene c={c} layout={layout} />,
    problem: <ProblemScene c={c} layout={layout} />,
    roles: <RolesScene c={c} layout={layout} />,
    knobs: <KnobsScene c={c} layout={layout} />,
    enforced: <EnforcedScene c={c} layout={layout} />,
    cta: <CtaScene c={c} layout={layout} />,
  };
  const captions = props.captions ?? [];
  const hasAnimatedBg = typeof props.backgroundSrc === "string" && props.backgroundSrc.length > 0;
  const scrimOpacity = props.backgroundScrimOpacity ?? 0.72;
  const blurPx = props.backgroundBlurPx ?? 0;
  return (
    <AbsoluteFill style={{ backgroundColor: BG }}>
      {hasAnimatedBg ? (
        <AnimatedArtBackground src={props.backgroundSrc!} scrimOpacity={scrimOpacity} blurPx={blurPx} />
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
        <CaptionBand
          captions={captions}
          bandY={props.captionBandY ?? Math.round((props.height ?? 1920) * 0.82)}
          fps={fps}
          typeScale={layout.typeScale}
          maxWidthPx={layout.contentMaxWidthPx ?? Math.floor((props.width ?? 1080) * (layout.safeAreaXFraction ?? 0.8))}
        />
      ) : null}
    </AbsoluteFill>
  );
};

const EMPTY_CONTENT: SceneContent = {
  title: "the 3-role model",
  tagline: "",
  kitchen: { headline: "", sub: "", pill: "" },
  problem: { kicker: "", headline: "", items: [], footer: "" },
  roles: { kicker: "", headline: "", roles: [], footer: "" },
  knobs: { kicker: "", headline: "", executorLabel: "", executorOptions: [], evaluatorLabel: "", evaluatorOptions: [], footer: "" },
  enforced: { kicker: "", headline: "", chip: "", sub: "", footer: "" },
  cta: { headline: "", lines: [], badge: "", cta: "", repoUrl: undefined },
};

const Root: React.FC = () => (
  <Composition
    id="post5-demo"
    component={Post5DemoVideo}
    durationInFrames={2700}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{
      ...EMPTY_CONTENT,
      scenes: [] as { id: string; fromSec: number; durationSec: number }[],
      audioSrc: undefined,
      captions: [] as CaptionCue[],
      captionBandY: Math.round(1920 * 0.82),
      layout: DEFAULT_LAYOUT_9X16,
      width: 1080,
      height: 1920,
      fps: 30,
      durationInFrames: 2700,
      backgroundSrc: undefined,
      backgroundScrimOpacity: 0.72,
      backgroundBlurPx: 0,
    }}
    calculateMetadata={({ props }) => ({
      durationInFrames: props.durationInFrames,
      width: props.width,
      height: props.height,
      fps: props.fps,
    })}
  />
);

registerRoot(Root);
