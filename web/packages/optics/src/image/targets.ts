/** A square or rectangular luminance image in retinal angular units: 0 dark … 1 bright, row-major, row 0 at the top. */
export interface Bitmap {
  width: number;
  height: number;
  data: Float32Array;
  pixelArcmin: number;
}

/** Sub-samples per pixel side for anti-aliased optotypes (numerical). */
const SUPERSAMPLE = 4;

export type EOrientation = "right" | "left" | "up" | "down";

/** Whether the point (u, v) in stroke units (0…5 each, v down) is inside an E that opens to the right. */
function inE(u: number, v: number): boolean {
  if (u < 0 || u >= 5 || v < 0 || v >= 5) return false;
  if (u < 1) return true; // spine
  const row = Math.floor(v);
  return row === 0 || row === 2 || row === 4; // three bars
}

/**
 * A tumbling Snellen E of height `letterArcmin` (five strokes; 5 arcmin is 20/20), dark on a
 * bright field, centered in an n × n bitmap and anti-aliased by supersampling.
 */
export function snellenE(n: number, pixelArcmin: number, letterArcmin: number, orientation: EOrientation = "right"): Bitmap {
  const data = new Float32Array(n * n).fill(1);
  const stroke = letterArcmin / 5;
  const half = letterArcmin / 2;
  // Only pixels that can touch the letter's square need supersampling.
  const lo = Math.max(0, Math.floor(n / 2 - half / pixelArcmin) - 1);
  const hi = Math.min(n - 1, Math.ceil(n / 2 + half / pixelArcmin) + 1);
  for (let i = lo; i <= hi; i++) {
    for (let j = lo; j <= hi; j++) {
      let dark = 0;
      for (let si = 0; si < SUPERSAMPLE; si++) {
        for (let sj = 0; sj < SUPERSAMPLE; sj++) {
          // Arcmin from the bitmap center, x right, y down.
          const x = (j + (sj + 0.5) / SUPERSAMPLE - n / 2) * pixelArcmin;
          const y = (i + (si + 0.5) / SUPERSAMPLE - n / 2) * pixelArcmin;
          // Rotate into the right-opening frame.
          const [xr, yr] =
            orientation === "right" ? [x, y] : orientation === "left" ? [-x, -y] : orientation === "up" ? [y, -x] : [-y, x];
          if (inE((xr + half) / stroke, (yr + half) / stroke)) dark++;
        }
      }
      data[i * n + j] = 1 - dark / (SUPERSAMPLE * SUPERSAMPLE);
    }
  }
  return { width: n, height: n, data, pixelArcmin };
}

/** A sinusoidal grating of `cpd` cycles per degree at `orientationDeg` (0: bars vertical), mean 0.5, contrast 1. */
export function grating(n: number, pixelArcmin: number, cpd: number, orientationDeg = 0): Bitmap {
  const data = new Float32Array(n * n);
  const a = (orientationDeg * Math.PI) / 180;
  const k = (2 * Math.PI * cpd) / 60; // radians per arcmin
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = (j - n / 2) * pixelArcmin;
      const y = (i - n / 2) * pixelArcmin;
      data[i * n + j] = 0.5 + 0.5 * Math.cos(k * (x * Math.cos(a) + y * Math.sin(a)));
    }
  }
  return { width: n, height: n, data, pixelArcmin };
}
