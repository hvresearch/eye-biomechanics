/**
 * Scene colors, mirrored from the tokens in theme.css so the 3D stage and the UI share one
 * palette. `hot` is reserved for muscle activation.
 */
export const PALETTE = {
  bg: "#0f1419",
  accent: "#6fc3c1",
  accentStrong: "#8fe0dd",
  warn: "#e0b35a",
  hot: "#ff6a3d",
  muscleRest: "#8a6f6a",
  orbit: "#3a4652",
  nerve: "#e8dcc0",
  sclera: "#ece7df",
  cornea: "#a9d6ea",
  iris: "#4d6b8a",
} as const;

function parse(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
}

/** Muscle color for an activation in [0, 1]: the neutral muscle tone blending into the hot token. */
export function activationColor(a: number): string {
  const t = Math.min(1, Math.max(0, Number.isFinite(a) ? a : 0));
  const from = parse(PALETTE.muscleRest);
  const to = parse(PALETTE.hot);
  return toHex([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]);
}
