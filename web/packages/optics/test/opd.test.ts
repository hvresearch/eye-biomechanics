import { describe, expect, it } from "vitest";
import { pupilBundle } from "../src/trace/aim";
import { fitZernike } from "../src/wavefront/fit";
import { ChiefRayError, opdMap } from "../src/wavefront/opd";
import { onAxisView, stigmaticEllipsoid } from "./helpers/systems";

describe("opdMap", () => {
  it("is flat (RMS < 1e-4 µm) for a stigmatic refracting ellipsoid", () => {
    const s = stigmaticEllipsoid();
    const map = opdMap(s, pupilBundle(onAxisView(3), 32, 555));
    expect(map.validFraction).toBe(1);
    let ss = 0;
    map.opdMicrons.forEach((w) => (ss += w * w));
    expect(Math.sqrt(ss / map.opdMicrons.length)).toBeLessThan(1e-4);
    expect(fitZernike(map).rmsMicrons).toBeLessThan(1e-4);
  });

  it("gives a myopic (positive) C(2,0) when the image plane moves behind focus, with other terms below 1% of it", () => {
    const s = stigmaticEllipsoid(1.5, 10, 0.05);
    const fit = fitZernike(opdMap(s, pupilBundle(onAxisView(3), 48, 555)));
    const c4 = fit.coeffsMicrons[4] ?? 0;
    expect(c4).toBeGreaterThan(0);
    fit.coeffsMicrons.forEach((c, j) => {
      if (j !== 4 && j !== 0) expect(Math.abs(c), `j=${j}`).toBeLessThan(0.01 * c4);
    });
    // Geometric check: the defocus of a converging cone of half-angle u is W ≈ Δz·(1 − cos u)·n.
    const u = Math.atan(3 / 30);
    const pv = 1.5 * 0.05 * (1 - Math.cos(u)) * 1000; // µm, edge relative to center
    expect(2 * Math.sqrt(3) * c4).toBeCloseTo(pv, 1);
  });

  it("refuses a vignetted chief ray", () => {
    const s = stigmaticEllipsoid();
    const blocked = [{ ...s[0]!, decenter: { xMm: 30, yMm: 0 } }, s[1]!];
    expect(() => opdMap(blocked, pupilBundle(onAxisView(1), 5, 555))).toThrow(ChiefRayError);
  });
});
