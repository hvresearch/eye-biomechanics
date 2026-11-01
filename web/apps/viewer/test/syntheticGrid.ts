import { parsePredictionGrid, type PredictionGrid } from "../src/data/predictions";

export const AXES = { ages: [6, 40, 90], nearHours: [0, 4], baselineSphereD: [-1, 1], baselineCylinderD: [0, -1] };

/**
 * A synthetic grid whose median sphere is s + h·(age − 6)/100, cylinder c − h·(age − 6)/200, axis
 * 180, and logMAR −0.1 + h·(age − 6)/200, with the spec's default thresholds.
 */
export function synthetic(): PredictionGrid {
  const field = (f: (h: number, s: number, c: number, a: number) => number) =>
    AXES.nearHours.map((h) => AXES.baselineSphereD.map((s) => AXES.baselineCylinderD.map((c) => AXES.ages.map((a) => f(h, s, c, a)))));
  const sph = (h: number, s: number, _c: number, a: number) => s + (h * (a - 6)) / 100;
  const cyl = (h: number, _s: number, c: number, a: number) => c - (h * (a - 6)) / 200;
  const onset = (v: (h: number) => number | null) => AXES.nearHours.map((h) => AXES.baselineSphereD.map(() => AXES.baselineCylinderD.map(() => v(h))));
  return parsePredictionGrid({
    schemaVersion: "1.0.0",
    id: "synthetic",
    provenance: {},
    remodeled: true,
    baselineAgeYears: 6,
    baselineAxisDeg: 180,
    axes: AXES,
    sphere: { p05: field((...x) => sph(...x) - 0.5), p50: field(sph), p95: field((...x) => sph(...x) + 0.5) },
    cylinder: { p05: field((...x) => Math.min(0, cyl(...x) + 0.25)), p50: field(cyl), p95: field((...x) => cyl(...x) - 0.25) },
    axisDeg: { p50: field(() => 180) },
    logMAR: { p50: field((h, _s, _c, a) => -0.1 + (h * (a - 6)) / 200) },
    onset: {
      refraction: { p05: onset((h) => (h > 0 ? 30 : null)), p50: onset((h) => (h > 0 ? 50 : null)), p95: onset(() => null) },
      acuity: { p05: onset(() => null), p50: onset(() => null), p95: onset(() => null) },
    },
    thresholds: { cylinderD: 0.75, sphereD: 0.5, logMAR: 0.3 },
  });
}
