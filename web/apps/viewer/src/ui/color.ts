/**
 * Color arithmetic shared by the theme tests and the color maps: parsing, WCAG contrast,
 * alpha compositing, and OKLCH (Björn Ottosson's OKLab, 2020) for hue checks.
 */

export type RGB = [number, number, number];
export interface RGBA {
  rgb: RGB;
  alpha: number;
}

/** Parse `#rgb`, `#rrggbb`, `rgb(r, g, b)`, or `rgba(r, g, b, a)`; throws on anything else. */
export function parseColor(text: string): RGBA {
  const s = text.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join("") : hex[1]!;
    const n = Number.parseInt(h, 16);
    return { rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (fn) return { rgb: [Number(fn[1]), Number(fn[2]), Number(fn[3])], alpha: fn[4] === undefined ? 1 : Number(fn[4]) };
  throw new Error(`Unsupported color "${text}"`);
}

/** `#rrggbb` of an RGB triple (channels rounded and clamped). */
export function toHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** A translucent color painted over an opaque backdrop. */
export function composite(top: RGBA, under: RGB): RGB {
  const a = top.alpha;
  return [top.rgb[0] * a + under[0] * (1 - a), top.rgb[1] * a + under[1] * (1 - a), top.rgb[2] * a + under[2] * (1 - a)];
}

const linear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** Relative luminance (WCAG 2.x) of an sRGB color. */
export function luminance([r, g, b]: RGB): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two opaque colors (1 to 21). */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** OKLCH of an sRGB color: lightness 0–1, chroma, hue in degrees [0, 360). */
export function oklch(rgb: RGB): { l: number; c: number; h: number } {
  const [r, g, b] = rgb.map(linear) as RGB;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

/** Smallest angle between two hues, degrees (0–180). */
export function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Half-width of the hot hue family around `--hot` in OKLCH, degrees, and the chroma below which a
 * color reads as a neutral rather than a hue (palette design choices: reds through oranges are
 * reserved for muscle activation, spec §6.2).
 */
export const HOT_HUE_HALF_WIDTH_DEG = 35;
export const NEUTRAL_CHROMA = 0.06;

/** True when a color would read as the reserved hot color: inside its hue family and not near-neutral. */
export function readsAsHot(color: RGB, hot: RGB): boolean {
  const c = oklch(color);
  return c.c >= NEUTRAL_CHROMA && hueDistance(c.h, oklch(hot).h) <= HOT_HUE_HALF_WIDTH_DEG;
}
