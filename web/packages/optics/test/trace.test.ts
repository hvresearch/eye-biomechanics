import { describe, expect, it } from "vitest";
import { collimatedBundle, pointSourceBundle } from "../src/trace/bundle";
import { refract } from "../src/trace/refract";
import { traceRay } from "../src/trace/sequential";
import { navarroSurfaces } from "./helpers/navarro";

const deg = (d: number) => (d * Math.PI) / 180;

describe("refract", () => {
  it("leaves a normally incident ray unchanged", () => {
    expect(refract([0, 0, 1], [0, 0, -1], 1, 1.5)).toEqual([0, 0, 1]);
  });
  it("obeys Snell's law at 30° from n=1 to n=1.5", () => {
    const dir = [Math.sin(deg(30)), 0, Math.cos(deg(30))] as const;
    const out = refract(dir, [0, 0, -1], 1, 1.5);
    expect(out).not.toBeNull();
    if (out) {
      expect(Math.asin(out[0])).toBeCloseTo(Math.asin(Math.sin(deg(30)) / 1.5), 12);
      expect(Math.hypot(...out)).toBeCloseTo(1, 12);
      expect(out[2]).toBeGreaterThan(0);
    }
  });
  it("returns null on total internal reflection (1.5 → 1 at 60°)", () => {
    const dir = [Math.sin(deg(60)), 0, Math.cos(deg(60))] as const;
    expect(refract(dir, [0, 0, -1], 1.5, 1)).toBeNull();
  });
  it("is index-independent when n1 === n2", () => {
    const dir = [0.3, 0.1, Math.sqrt(1 - 0.1)] as const;
    const out = refract(dir, [0.1, 0, -Math.sqrt(0.99)], 1.336, 1.336);
    expect(out?.[0]).toBeCloseTo(dir[0], 12);
    expect(out?.[2]).toBeCloseTo(dir[2], 12);
  });
});

describe("traceRay through the Navarro eye", () => {
  const surfaces = navarroSurfaces();
  const retinaZ = surfaces[surfaces.length - 1]?.vertexZMm ?? Number.NaN;

  it("sends the axial ray to the retina vertex", () => {
    const r = traceRay({ origin: [0, 0, -10], dir: [0, 0, 1], wavelengthNm: 555 }, surfaces, 1);
    expect(r.vignetted).toBe(false);
    expect(r.hits).toHaveLength(5);
    const last = r.hits[r.hits.length - 1];
    expect(last?.surface).toBe("retina");
    expect(Math.abs(last?.point[0] ?? 1)).toBeLessThan(1e-9);
    expect(Math.abs(last?.point[1] ?? 1)).toBeLessThan(1e-9);
    expect(last?.point[2]).toBeCloseTo(retinaZ, 9);
  });

  it("accumulates optical path as Σ n·thickness for the axial ray", () => {
    const r = traceRay({ origin: [0, 0, -1], dir: [0, 0, 1], wavelengthNm: 555 }, surfaces, 1);
    const expected = 1 * 1 + 0.55 * 1.376 + 3.05 * 1.3374 + 4.0 * 1.42 + 16.4 * 1.336;
    expect(r.opticalPathMm).toBeCloseTo(expected, 9);
  });

  it("brings a 1.5 mm marginal ray within 0.05 mm of the axis at the retina", () => {
    const r = traceRay({ origin: [1.5, 0, -10], dir: [0, 0, 1], wavelengthNm: 555 }, surfaces, 1);
    expect(r.vignetted).toBe(false);
    const last = r.hits[r.hits.length - 1];
    expect(Math.abs(last?.point[0] ?? 1)).toBeLessThan(0.05);
  });

  it("vignettes a 10 mm ray at the anterior cornea", () => {
    const r = traceRay({ origin: [10, 0, -10], dir: [0, 0, 1], wavelengthNm: 555 }, surfaces, 1);
    expect(r.vignetted).toBe(true);
    expect(r.vignettedAt).toBe("cornea.anterior");
    expect(r.hits).toHaveLength(0);
  });

  it("vignettes a ray that clears the cornea but misses the lens aperture", () => {
    const r = traceRay({ origin: [5.9, 0, -10], dir: [0, 0, 1], wavelengthNm: 555 }, surfaces, 1);
    expect(r.vignetted).toBe(true);
    expect(["cornea.posterior", "lens.anterior"]).toContain(r.vignettedAt);
  });

  it("reports a miss when the ray never reaches a surface and an aperture clip otherwise", () => {
    const miss = traceRay({ origin: [0, -20, -1], dir: [0, 1, 0], wavelengthNm: 555 }, surfaces, 1);
    expect(miss.vignetted).toBe(true);
    expect(miss.reason).toBe("miss");
    const clipped = traceRay({ origin: [6.5, 0, -10], dir: [0, 0, 1], wavelengthNm: 555 }, surfaces, 1);
    expect(clipped.reason).toBe("aperture");
  });

  it("flags total internal reflection", () => {
    const glass = { name: "glass", index555: 1.8 };
    const air = { name: "air", index555: 1 };
    const slab = [
      { name: "in", kind: "conic" as const, radiusMm: Infinity, conic: 0, apertureSemiDiamMm: 50, vertexZMm: 0, tilt: { xDeg: 0, yDeg: 0 }, decenter: { xMm: 0, yMm: 0 }, mediumAfter: glass },
      { name: "out", kind: "conic" as const, radiusMm: Infinity, conic: 0, apertureSemiDiamMm: 50, vertexZMm: 1, tilt: { xDeg: 0, yDeg: 0 }, decenter: { xMm: 0, yMm: 0 }, mediumAfter: air },
    ];
    // Start inside the glass at a steep angle so the exit face reflects.
    const r = traceRay({ origin: [0, 0, 0.5], dir: [Math.sin(deg(60)), 0, Math.cos(deg(60))], wavelengthNm: 555 }, slab.slice(1), 1.8);
    expect(r.vignetted).toBe(true);
    expect(r.vignettedAt).toBe("out");
    expect(r.reason).toBe("tir");
  });
});

describe("bundles", () => {
  it("collimated bundle fills a disk of the pupil radius on a square grid", () => {
    const rays = collimatedBundle({ x: 0, y: 0 }, 2, 9, -5);
    expect(rays.length).toBeGreaterThan(40); // ≈ π/4 of 81 grid points
    expect(rays.length).toBeLessThanOrEqual(81);
    for (const r of rays) {
      expect(Math.hypot(r.origin[0], r.origin[1])).toBeLessThanOrEqual(2 + 1e-12);
      expect(r.origin[2]).toBe(-5);
      expect(r.dir).toEqual([0, 0, 1]);
    }
    expect(rays.some((r) => r.origin[0] === 0 && r.origin[1] === 0)).toBe(true);
  });

  it("collimated bundle tilts by the field angle", () => {
    const rays = collimatedBundle({ x: 10, y: 0 }, 1, 3, 0);
    const d = rays[0]?.dir;
    expect(d?.[0]).toBeCloseTo(Math.sin(deg(10)), 12);
    expect(d?.[2]).toBeCloseTo(Math.cos(deg(10)), 12);
  });

  it("point-source bundle aims every ray from the point at the pupil grid", () => {
    const rays = pointSourceBundle([0, 0, -500], 2, 5, 0);
    for (const r of rays) {
      expect(r.origin).toEqual([0, 0, -500]);
      expect(Math.hypot(...r.dir)).toBeCloseTo(1, 12);
      const t = 500 / r.dir[2];
      expect(Math.hypot(r.dir[0] * t, r.dir[1] * t)).toBeLessThanOrEqual(2 + 1e-9);
    }
  });

  it("collimated bundle with a single ray is the chief ray", () => {
    expect(collimatedBundle({ x: 0, y: 0 }, 2, 1, 0)).toHaveLength(1);
  });
});

describe("traceToEnd", () => {
  it("matches traceRay's last hit, direction, and optical path through conic and toric surfaces", async () => {
    const { traceToEnd } = await import("../src/trace/sequential");
    const { toricNavarro } = await import("./helpers/eyes");
    for (const surfaces of [navarroSurfaces(), navarroSurfaces(3), toricNavarro(1.5)]) {
      for (const [x, y, ax] of [[0, 0, 0], [1.2, -0.7, 0.05], [-2, 1.5, -0.08], [0.3, 2.4, 0.1]] as const) {
        const dir = [Math.sin(ax), 0, Math.cos(ax)] as const;
        const ray = { origin: [x, y, -5] as const, dir, wavelengthNm: 555 };
        const full = traceRay(ray, surfaces, 1);
        const end = traceToEnd(ray, surfaces, 1);
        expect(full.vignetted).toBe(false);
        if (!end) throw new Error("lean trace vignetted");
        const last = full.hits[full.hits.length - 1]!;
        for (let i = 0; i < 3; i++) {
          expect(end.point[i]).toBeCloseTo(last.point[i]!, 10);
          expect(end.dir[i]).toBeCloseTo(last.dirAfter[i]!, 10);
        }
        expect(end.opticalPathMm).toBeCloseTo(full.opticalPathMm, 8); // Newton tolerances: 1e-9 mm in z
      }
    }
    // Vignetting agrees: a ray outside the corneal aperture.
    expect(traceToEnd({ origin: [6.5, 0, -10], dir: [0, 0, 1], wavelengthNm: 555 }, navarroSurfaces(), 1)).toBeNull();
  });
});
