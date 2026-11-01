import { parseColor, toHex } from "../ui/color";

/** The two UI themes; dark is the default the viewer starts in. */
export type Theme = "dark" | "light";
export const THEMES: readonly Theme[] = ["dark", "light"];

/** Colors of the drawn anatomy (drawing choices, not data), keyed like the cutaway's structures. */
export interface StructureColors {
  sclera: string;
  retina: string;
  vitreous: string;
  ciliaryBody: string;
  zonules: string;
  iris: string;
  lens: string;
  aqueous: string;
  cornea: string;
}

export interface StagePalette {
  /** Canvas clear color; equals the theme's `--stage` token. */
  bg: string;
  /** Hemisphere light: sky and ground colors (soft studio lighting). */
  sky: string;
  ground: string;
  accent: string;
  accentStrong: string;
  warn: string;
  /** Reserved for muscle activation. */
  hot: string;
  muscleRest: string;
  orbit: string;
  nerve: string;
  structures: StructureColors;
}

/**
 * Anatomy colors shared by both themes. None of them sits in the hot hue family (see
 * `readsAsHot` in ui/color.ts): the retina and ciliary body are drawn in muted mauves rather
 * than the warm reds and oranges that belong to muscle activation.
 */
const STRUCTURES: StructureColors = {
  sclera: "#ece7df",
  retina: "#b9849f",
  vitreous: "#d9e6ea",
  ciliaryBody: "#ad8fa3",
  zonules: "#e2d6bf",
  iris: "#4d6b8a",
  lens: "#f1d9a3",
  aqueous: "#cfe8f2",
  cornea: "#a9d6ea",
};

/**
 * Scene colors per theme, mirroring the tokens in theme.css (`--stage`, `--accent`,
 * `--accent-strong`, `--warn`, `--hot`; a test checks they agree) so the 3D stage and the UI
 * share one palette. The light theme keeps a mid-gray studio backdrop so the pale sclera and
 * lens still read against it.
 */
const PALETTES: Record<Theme, StagePalette> = {
  dark: {
    bg: "#0f1419",
    sky: "#dfe8ef",
    ground: "#1a2129",
    accent: "#6fc3c1",
    accentStrong: "#8fe0dd",
    warn: "#e0b35a",
    hot: "#ff6a3d",
    muscleRest: "#8a6f6a",
    orbit: "#3a4652",
    nerve: "#e8dcc0",
    structures: STRUCTURES,
  },
  light: {
    bg: "#c9d1d9",
    sky: "#ffffff",
    ground: "#8a96a3",
    accent: "#1f7f7c",
    accentStrong: "#145855",
    warn: "#6f4a00",
    hot: "#d9502a",
    muscleRest: "#8a6f6a",
    orbit: "#66727f",
    nerve: "#b7a47a",
    structures: STRUCTURES,
  },
};

export function paletteFor(theme: Theme): StagePalette {
  return PALETTES[theme];
}

/** Muscle color for an activation in [0, 1]: the neutral muscle tone blending into the hot token. */
export function activationColor(a: number, theme: Theme = "dark"): string {
  const p = PALETTES[theme];
  const t = Math.min(1, Math.max(0, Number.isFinite(a) ? a : 0));
  const from = parseColor(p.muscleRest).rgb;
  const to = parseColor(p.hot).rgb;
  return toHex([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]);
}
