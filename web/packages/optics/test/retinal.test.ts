import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { psf, type Psf } from "../src/image/psf";
import { retinalImage } from "../src/image/retinal";
import { grating, snellenE } from "../src/image/targets";

const optotypes = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../data/acuity/optotypes.json"), "utf8")) as {
  letterArcminAt20_20: number;
};

function deltaPsf(n: number, pixelArcmin: number): Psf {
  const intensity = new Float32Array(n * n);
  intensity[(n / 2) * n + n / 2] = 1;
  return { intensity, n, pixelArcmin, fieldArcmin: n * pixelArcmin, strehl: 1, wavelengthsNm: [555], weights: [1], pupilRadiusMm: 2, aliased: false };
}

describe("targets", () => {
  it("draws a 20/20 Snellen E five arcmin tall", () => {
    const px = 0.1;
    const e = snellenE(128, px, optotypes.letterArcminAt20_20);
    let top = Infinity;
    let bottom = -Infinity;
    let left = Infinity;
    let right = -Infinity;
    for (let i = 0; i < 128; i++) {
      for (let j = 0; j < 128; j++) {
        if ((e.data[i * 128 + j] ?? 1) < 0.5) {
          top = Math.min(top, i);
          bottom = Math.max(bottom, i);
          left = Math.min(left, j);
          right = Math.max(right, j);
        }
      }
    }
    expect((bottom - top + 1) * px).toBeCloseTo(5, 0);
    expect((right - left + 1) * px).toBeCloseTo(5, 0);
    // The opening faces right: the middle of the right edge column is bright between the bars.
    const midRow = Math.round((top + bottom) / 2 - 1.0 / px);
    expect(e.data[midRow * 128 + right]).toBeGreaterThan(0.5);
    expect(e.data[midRow * 128 + left]).toBeLessThan(0.5);
  });

  it("rotates the E", () => {
    const r = snellenE(64, 0.2, 5, "right");
    const l = snellenE(64, 0.2, 5, "left");
    // A 180° turn about the center maps pixel (i, j) onto (n − 1 − i, n − 1 − j).
    let diff = 0;
    for (let i = 0; i < 64; i++) for (let j = 0; j < 64; j++) diff += Math.abs((r.data[i * 64 + j] ?? 0) - (l.data[(63 - i) * 64 + (63 - j)] ?? 0));
    expect(diff).toBeLessThan(1e-9);
    expect(Array.from(snellenE(64, 0.2, 5, "up").data)).not.toEqual(Array.from(r.data));
  });

  it("draws gratings with mean 0.5", () => {
    const g = grating(64, 0.5, 15, 0); // 32 arcmin field: exactly 8 cycles
    const mean = g.data.reduce((a, b) => a + b, 0) / g.data.length;
    expect(mean).toBeCloseTo(0.5, 2);
  });
});

describe("retinalImage", () => {
  it("returns the target for a delta PSF", () => {
    const t = snellenE(64, 0.25, 5);
    const out = retinalImage(t, deltaPsf(64, 0.25));
    for (let i = 0; i < 64 * 64; i++) expect(Math.abs((out.data[i] ?? 0) - (t.data[i] ?? 0))).toBeLessThan(1e-6);
  });

  it("keeps a uniform field uniform and conserves energy", () => {
    const p = psf({ coeffsMicrons: [0, 0, 0, 0.1, 0.4, -0.2], pupilRadiusMm: 2, wavelengthNm: 555 });
    const flat = { width: p.n, height: p.n, data: new Float32Array(p.n * p.n).fill(0.7), pixelArcmin: p.pixelArcmin };
    const out = retinalImage(flat, p);
    for (let i = 0; i < out.data.length; i += 97) expect(Math.abs((out.data[i] ?? 0) - 0.7)).toBeLessThan(1e-6);
    const t = snellenE(p.n, p.pixelArcmin, 10);
    const o2 = retinalImage(t, p);
    const s1 = t.data.reduce((a, b) => a + b, 0);
    const s2 = o2.data.reduce((a, b) => a + b, 0);
    expect(Math.abs(s2 - s1) / s1).toBeLessThan(1e-6);
  });

  it("rejects a target on another grid", () => {
    const p = deltaPsf(64, 0.25);
    expect(() => retinalImage(snellenE(32, 0.25, 5), p)).toThrow();
    expect(() => retinalImage(snellenE(64, 0.3, 5), p)).toThrow();
  });
});
