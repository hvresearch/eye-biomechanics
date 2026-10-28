/**
 * Chart colors (drawing choices, validated with the dataviz palette checks on the panel surface
 * #161c23): two series hues for uncorrected and corrected, a blue ↔ yellow diverging map through
 * a neutral gray for the wavefront (red and orange stay reserved for muscle activation), and a
 * one-hue blue sequential ramp for the PSF.
 */
export const CHART = {
  uncorrected: "#3987e5",
  corrected: "#199e70",
  diffraction: "#898781",
  grid: "#2c2c2a",
  axis: "#383835",
  muted: "#898781",
  text: "#c3c2b7",
} as const;

type RGB = [number, number, number];

const NEUTRAL: RGB = [0x38, 0x38, 0x35];
const NEGATIVE: RGB = [0x6d, 0xa7, 0xec]; // blue pole (phase lag)
const POSITIVE: RGB = [0xed, 0xa1, 0x00]; // yellow pole (phase advance)
const SEQ_LOW: RGB = [0x16, 0x1c, 0x23];
const SEQ_MID: RGB = [0x25, 0x6a, 0xbf];
const SEQ_HIGH: RGB = [0xcd, 0xe2, 0xfb];

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const clamp = (t: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(t) ? t : 0));

/** Diverging color for t in [−1, 1]: the neutral gray at 0, blue toward −1, yellow toward +1. */
export function divergingColor(t: number): RGB {
  const v = clamp(t, -1, 1);
  return v < 0 ? mix(NEUTRAL, NEGATIVE, -v) : mix(NEUTRAL, POSITIVE, v);
}

/** Sequential color for t in [0, 1]: the surface at 0, through blue, to pale blue at 1. */
export function sequentialColor(t: number): RGB {
  const v = clamp(t, 0, 1);
  return v < 0.5 ? mix(SEQ_LOW, SEQ_MID, v * 2) : mix(SEQ_MID, SEQ_HIGH, (v - 0.5) * 2);
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

/** Relative luminance (WCAG) of an sRGB color, for tests of monotone lightness. */
export function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** CSS color of an RGB triple. */
export function css([r, g, b]: RGB): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}
