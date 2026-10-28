import { describe, expect, it } from "vitest";
import { norm, normalize, type Vec3 } from "../src/math/vec3";
import { intersect, meridianCurvature, normalAt, sag } from "../src/surfaces/geometry";
import type { ConicSurface, ToricSurface, ZernikeSurface } from "../src/surfaces/types";

const air = { name: "air", index555: 1 };
const base = {
  name: "s",
  apertureSemiDiamMm: 6,
  vertexZMm: 0,
  tilt: { xDeg: 0, yDeg: 0 },
  decenter: { xMm: 0, yMm: 0 },
  mediumAfter: air,
};
const conic = (radiusMm: number, k = 0): ConicSurface => ({ ...base, kind: "conic", radiusMm, conic: k });
const toric = (rxMm: number, ryMm: number, axisDeg = 0, conicX = 0, conicY = 0): ToricSurface => ({
  ...base,
  kind: "toric",
  rxMm,
  ryMm,
  axisDeg,
  conicX,
  conicY,
});
const zern = (coeffsMicrons: number[], radiusMm = 8, k = -0.2, normRadiusMm = 3): ZernikeSurface => ({
  ...base,
  kind: "zernike",
  radiusMm,
  conic: k,
  normRadiusMm,
  coeffsMicrons,
});

/** Deterministic pseudo-random points in a disk. */
function points(n: number, rMax: number): Array<[number, number]> {
  let s = 12345;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  return Array.from({ length: n }, () => {
    const r = rMax * Math.sqrt(rnd());
    const t = 2 * Math.PI * rnd();
    return [r * Math.cos(t), r * Math.sin(t)];
  });
}

describe("toric sag", () => {
  it("equals the conic sag when rx = ry", () => {
    const t = toric(7.8, 7.8, 37, -0.25, -0.25);
    const c = conic(7.8, -0.25);
    for (const [x, y] of points(50, 4)) expect(Math.abs(sag(t, x, y) - sag(c, x, y))).toBeLessThan(1e-12);
  });

  it("follows rx along the axis meridian and ry across it", () => {
    const deg = 30;
    const a = (deg * Math.PI) / 180;
    const t = toric(7.5, 8.0, deg);
    for (const r of [0.5, 1.5, 3]) {
      expect(sag(t, r * Math.cos(a), r * Math.sin(a))).toBeCloseTo(sag(conic(7.5), r, 0), 12);
      expect(sag(t, -r * Math.sin(a), r * Math.cos(a))).toBeCloseTo(sag(conic(8.0), r, 0), 12);
    }
  });

  it("swaps the two sections when the axis turns by 90°", () => {
    const t0 = toric(7.5, 8.0, 10);
    const t90 = toric(8.0, 7.5, 100);
    for (const [x, y] of points(20, 3)) expect(sag(t0, x, y)).toBeCloseTo(sag(t90, x, y), 12);
  });

  it("is a cylinder when one radius is infinite", () => {
    const t = toric(10, Number.POSITIVE_INFINITY, 0);
    expect(sag(t, 0, 2)).toBe(0);
    expect(sag(t, 2, 0)).toBeCloseTo(sag(conic(10), 2, 0), 12);
  });
});

describe("Zernike-perturbed sag", () => {
  it("equals its base with all-zero coefficients", () => {
    const z = zern(new Array(15).fill(0));
    for (const [x, y] of points(20, 3)) expect(sag(z, x, y)).toBe(sag(conic(8, -0.2), x, y));
  });

  it("adds C(2,0) = 1 µm as √3(2ρ² − 1) µm", () => {
    const coeffs = new Array(6).fill(0);
    coeffs[4] = 1;
    const z = zern(coeffs);
    const d = sag(z, 3, 0) - sag(conic(8, -0.2), 3, 0);
    expect(Math.abs(d - Math.sqrt(3) * (2 - 1) * 1e-3)).toBeLessThan(1e-12);
    const d0 = sag(z, 0, 0);
    expect(Math.abs(d0 + Math.sqrt(3) * 1e-3)).toBeLessThan(1e-12);
  });
});

describe("normals", () => {
  it("are unit vectors facing −z, and match the conic normal for an isotropic toric", () => {
    const t = toric(7.8, 7.8, 12, -0.3, -0.3);
    const c = conic(7.8, -0.3);
    for (const [x, y] of points(20, 4)) {
      const n = normalAt(t, x, y);
      expect(norm(n)).toBeCloseTo(1, 12);
      expect(n[2]).toBeLessThan(0);
      const nc = normalAt(c, x, y);
      for (let i = 0; i < 3; i++) expect(n[i]).toBeCloseTo(nc[i] ?? 0, 10);
    }
  });

  it("are perpendicular to the surface (finite-difference tangents)", () => {
    const coeffs = [0, 0, 0, 0.5, 1.2, -0.7, 0.3, 0.2, -0.1, 0.4];
    for (const s of [toric(7.5, 8.2, 25, -0.2, 0.1), zern(coeffs)]) {
      for (const [x, y] of points(10, 2.5)) {
        const h = 1e-5;
        const tx: Vec3 = [2 * h, 0, sag(s, x + h, y) - sag(s, x - h, y)];
        const ty: Vec3 = [0, 2 * h, sag(s, x, y + h) - sag(s, x, y - h)];
        const n = normalAt(s, x, y);
        expect(Math.abs(n[0] * tx[0] + n[1] * tx[1] + n[2] * tx[2]) / norm(tx)).toBeLessThan(1e-7);
        expect(Math.abs(n[0] * ty[0] + n[1] * ty[1] + n[2] * ty[2]) / norm(ty)).toBeLessThan(1e-7);
      }
    }
  });
});

describe("intersect", () => {
  const oblique = normalize([Math.sin(Math.PI / 6), 0.1, Math.cos(Math.PI / 6)]);

  it("converges by Newton for a 30° oblique ray on toric and Zernike surfaces", () => {
    const coeffs = [0, 0, 0, 0.5, 1.2, -0.7, 0.3, 0.2, -0.1, 0.4];
    for (const s of [toric(7.5, 8.2, 25, -0.2, 0.1), zern(coeffs)]) {
      const hit = intersect(s, [-2, -0.3, -5], oblique);
      expect(hit).not.toBeNull();
      if (hit === null || hit === "miss") throw new Error("no hit");
      expect(Math.abs(hit.point[2] - s.vertexZMm - sag(s, hit.point[0], hit.point[1]))).toBeLessThan(1e-9);
      // The point lies on the ray.
      const t = hit.t;
      expect(hit.point[0]).toBeCloseTo(-2 + t * oblique[0], 12);
    }
  });

  it("agrees with the closed-form conic intersection for an isotropic toric", () => {
    const t = toric(7.8, 7.8, 0, -0.26, -0.26);
    const c = conic(7.8, -0.26);
    const ht = intersect(t, [1, 0.5, -3], oblique);
    const hc = intersect(c, [1, 0.5, -3], oblique);
    if (ht === null || ht === "miss" || hc === null || hc === "miss") throw new Error("no hit");
    for (let i = 0; i < 3; i++) expect(ht.point[i]).toBeCloseTo(hc.point[i] ?? 0, 10);
  });

  it("reports a miss (no forward intersection) separately from an aperture clip", () => {
    expect(intersect(toric(7.5, 8, 0), [0, 0, 5], [0, 0, 1])).toBe("miss");
    expect(intersect(conic(10), [0, 0, 5], [0, 0, 1])).toBe("miss");
    expect(intersect({ ...toric(7.5, 8, 0), apertureSemiDiamMm: 1 }, [2, 0, -3], [0, 0, 1])).toBeNull();
    // A ray parallel to the vertex plane far outside the steep sphere never meets it.
    expect(intersect(conic(5), [0, -20, -1], [0, 1, 0])).toBe("miss");
  });

  it("rejects tilted surfaces loudly", () => {
    expect(() => intersect({ ...toric(7, 7, 0), tilt: { xDeg: 2, yDeg: 0 } }, [0, 0, -1], [0, 0, 1])).toThrow(/tilt/);
  });
});

describe("meridianCurvature", () => {
  it("is 1/R for a conic in every meridian", () => {
    expect(meridianCurvature(conic(8), 0.3)).toBeCloseTo(1 / 8, 15);
    expect(meridianCurvature(conic(Number.POSITIVE_INFINITY), 0.3)).toBe(0);
  });

  it("is 1/rx along the toric axis and 1/ry across it", () => {
    const t = toric(7.5, 8.0, 30);
    expect(meridianCurvature(t, Math.PI / 6)).toBeCloseTo(1 / 7.5, 14);
    expect(meridianCurvature(t, Math.PI / 6 + Math.PI / 2)).toBeCloseTo(1 / 8, 14);
    expect(meridianCurvature(t, Math.PI / 6 + Math.PI / 4)).toBeCloseTo((1 / 7.5 + 1 / 8) / 2, 14);
  });

  it("adds the second-order Zernike terms to the base curvature", () => {
    const c = 0.8;
    const a = 3;
    const coeffs = new Array(6).fill(0);
    coeffs[4] = c;
    const z = zern(coeffs, 8, 0, a);
    expect(meridianCurvature(z, 1)).toBeCloseTo(1 / 8 + (4 * Math.sqrt(3) * c * 1e-3) / (a * a), 14);
    const astig = new Array(6).fill(0);
    astig[5] = c;
    const za = zern(astig, 8, 0, a);
    // √6 ρ² cos 2θ: curvature 2√6 c cos(2φ)/a² about the base.
    expect(meridianCurvature(za, 0)).toBeCloseTo(1 / 8 + (2 * Math.sqrt(6) * c * 1e-3) / (a * a), 14);
    expect(meridianCurvature(za, Math.PI / 2)).toBeCloseTo(1 / 8 - (2 * Math.sqrt(6) * c * 1e-3) / (a * a), 14);
  });
});
