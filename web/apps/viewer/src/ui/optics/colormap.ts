import type { Theme } from "../../scene/palette";
import type { RGB } from "../color";

export { luminance } from "../color";

/**
 * Color maps for the canvas-drawn figures (the SVG charts take their ink from the `--chart-*`
 * tokens in theme.css), per theme. Diverging (wavefront): blue ↔ ochre through a neutral gray
 * in the surface's lightness band (dark gray on dark, light gray on light), so zero recedes and
 * both poles stand out; red and orange stay reserved for activation. Sequential (PSF, heat
 * map): one blue hue from the surface toward the high-contrast end (pale on dark, deep on light).
 */
const MAPS: Record<Theme, { neutral: RGB; negative: RGB; positive: RGB; seq: [RGB, RGB, RGB] }> = {
  dark: {
    neutral: [0x38, 0x38, 0x35],
    negative: [0x6d, 0xa7, 0xec],
    positive: [0xed, 0xa1, 0x00],
    seq: [
      [0x16, 0x1c, 0x23],
      [0x25, 0x6a, 0xbf],
      [0xcd, 0xe2, 0xfb],
    ],
  },
  light: {
    neutral: [0xf0, 0xef, 0xec],
    negative: [0x1c, 0x5c, 0xab],
    positive: [0x8a, 0x5c, 0x00],
    seq: [
      [0xfb, 0xfc, 0xfd],
      [0x39, 0x87, 0xe5],
      [0x0d, 0x36, 0x6b],
    ],
  },
};

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const clamp = (t: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(t) ? t : 0));

/** Diverging color for t in [−1, 1]: the neutral gray at 0, blue toward −1, ochre toward +1. */
export function divergingColor(t: number, theme: Theme = "dark"): RGB {
  const m = MAPS[theme];
  const v = clamp(t, -1, 1);
  return v < 0 ? mix(m.neutral, m.negative, -v) : mix(m.neutral, m.positive, v);
}

/** Sequential color for t in [0, 1]: the surface at 0, through blue, to the far end at 1. */
export function sequentialColor(t: number, theme: Theme = "dark"): RGB {
  const [lo, mid, hi] = MAPS[theme].seq;
  const v = clamp(t, 0, 1);
  return v < 0.5 ? mix(lo, mid, v * 2) : mix(mid, hi, (v - 0.5) * 2);
}

/** Symmetric limit for a diverging scale: the largest |value| (finite values only), or 1e-9 when all are 0. */
export function symmetricLimit(values: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (Number.isFinite(v)) m = Math.max(m, Math.abs(v));
  }
  return m > 0 ? m : 1e-9;
}

/** CSS color of an RGB triple. */
export function css([r, g, b]: RGB): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
