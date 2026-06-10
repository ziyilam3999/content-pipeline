/**
 * #808 RULE 1 — the perceptible animated generative-art background is the DEFAULT, not opt-in.
 *
 * #805 made the moving background OPT-IN via env (DEMO_BG=on). #808 flips it: whenever a post's
 * art-base image EXISTS, the committed multi-aspect demo producer renders the moving background
 * AUTOMATICALLY. The escape hatch survives — DEMO_BG=0/off/false disables it (solid bg). The motion
 * curve itself (perceptibility-gated) lives in `video/artBackgroundMotion.ts`; this module only
 * decides whether the background is ON and with what scrim.
 *
 * Factored out of the smoke so the default-on decision is a PURE, unit-testable function — a future
 * change that silently reverts the default to opt-in is caught by `demoBackground.test.ts`.
 */

import { CONFIG } from "../config";

export interface DemoBackground {
  backgroundImagePath: string;
  backgroundScrimOpacity: number;
  backgroundBlurPx: number;
}

/** Inputs the resolver reads — injected so the resolver stays pure (no direct fs/env access). */
export interface DemoBackgroundInputs {
  /** Does the post's art-base image exist on disk? (caller stats the path) */
  artImageExists: boolean;
  /** The resolved art image path (used only when `artImageExists`). */
  artImagePath: string;
  /** Raw DEMO_BG env value (undefined = unset). The escape hatch. */
  demoBgEnv?: string;
  /** Raw DEMO_BG_SCRIM env override (undefined = config default). */
  demoBgScrimEnv?: string;
  /** Raw DEMO_BG_BLUR env override (undefined = 0). */
  demoBgBlurEnv?: string;
}

/** The off-switch values that disable the animated background. */
const OFF_VALUES = new Set(["0", "off", "false", "no"]);

/**
 * Resolve whether (and how) the animated generative-art background renders.
 *
 * DEFAULT-ON contract (#808): when the art image exists AND DEMO_BG is not an explicit off-value,
 * return a background config (the moving art renders). Returns null — solid bg — only when the
 * operator explicitly disables it (DEMO_BG=0/off/...) OR the art image is absent.
 */
export function resolveDemoBackground(inputs: DemoBackgroundInputs): DemoBackground | null {
  const bgEnv = inputs.demoBgEnv?.trim().toLowerCase();
  if (bgEnv !== undefined && OFF_VALUES.has(bgEnv)) return null; // explicit escape hatch
  if (!CONFIG.demo.animatedBackgroundDefault && bgEnv === undefined) {
    // Defensive: if the SSOT default were ever flipped off, an unset env stays off.
    return null;
  }
  if (!inputs.artImageExists) return null; // no art → solid bg (can't animate a missing image)

  const scrim =
    inputs.demoBgScrimEnv !== undefined ? Number(inputs.demoBgScrimEnv) : CONFIG.demo.backgroundScrimOpacity;
  const blur = inputs.demoBgBlurEnv !== undefined ? Number(inputs.demoBgBlurEnv) : 0;
  return {
    backgroundImagePath: inputs.artImagePath,
    backgroundScrimOpacity: scrim,
    backgroundBlurPx: blur,
  };
}
