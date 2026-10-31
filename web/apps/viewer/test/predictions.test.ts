import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { at, interpolate, onsetCriteria, onsetFromCurve, onsetRange, parsePredictionGrid, reanchor, thresholdLabel, trajectoryFor, type Trajectory } from "../src/data/predictions";
import { synthetic } from "./syntheticGrid";

describe("prediction grid", () => {
  it("validates the committed grid", () => {
    const dir = resolve(import.meta.dirname, "../../../../data/results/predictions");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const grid = parsePredictionGrid(JSON.parse(readFileSync(resolve(dir, f), "utf8")));
      expect(grid.remodeled).toBe(true);
      expect(grid.axes.ages[0]).toBe(grid.baselineAgeYears);
    }
  });

  it("rejects a malformed grid", () => {
    expect(() => parsePredictionGrid({ schemaVersion: "1.0.0" })).toThrow(/Prediction grid/);
    expect(() => parsePredictionGrid({ ...synthetic(), schemaVersion: "2.0.0" })).toThrow(/major version/);
  });

  it("returns a node's values exactly at a grid node", () => {
    const g = synthetic();
    const t = interpolate(g, { nearHours: 4, baselineSphereD: -1, baselineCylinderD: -1 });
    expect(t.sphere.p50).toEqual(g.sphere.p50[1]![0]![1]!.map((v) => expect.closeTo(v, 12)));
    expect(t.cylinder.p50).toEqual(g.cylinder.p50[1]![0]![1]!.map((v) => expect.closeTo(v, 12)));
    expect(t.sphere.p95).toEqual(g.sphere.p95[1]![0]![1]!);
    // The −1 D cylinder already meets the 0.75 D criterion at the first age.
    expect(t.onset.refraction).toBe(6);
    expect(t.clamped).toEqual([]);
  });

  it("blends linearly between nodes", () => {
    const g = synthetic();
    const t = interpolate(g, { nearHours: 1, baselineSphereD: 0.5, baselineCylinderD: -0.5 });
    // sphere = s + h(a − 6)/100 and cylinder = c − h(a − 6)/200 are multilinear, so the blend is exact.
    expect(t.sphere.p50[2]).toBeCloseTo(0.5 + 0.84, 10);
    expect(t.cylinder.p50[2]).toBeCloseTo(-0.5 - 0.42, 10);
    expect(t.axisDeg[2]).toBeCloseTo(180, 10);
    expect(t.sphere.p05[1]).toBeCloseTo(0.5 + 0.34 - 0.5, 10);
  });

  it("accepts the cylinder with either sign", () => {
    const g = synthetic();
    const a = interpolate(g, { nearHours: 2, baselineSphereD: 0, baselineCylinderD: 0.5 });
    const b = interpolate(g, { nearHours: 2, baselineSphereD: 0, baselineCylinderD: -0.5 });
    expect(a).toEqual(b);
  });

  it("clamps inputs outside the grid and names the clamped axes", () => {
    const g = synthetic();
    const t = interpolate(g, { nearHours: 12, baselineSphereD: -5, baselineCylinderD: 0 });
    expect(t.clamped).toEqual(["nearHours", "baselineSphereD"]);
    const edge = interpolate(g, { nearHours: 4, baselineSphereD: -1, baselineCylinderD: 0 });
    expect(t.sphere.p50).toEqual(edge.sphere.p50);
  });

  it("samples a trajectory linearly in age and clamps ages to its range", () => {
    const t = interpolate(synthetic(), { nearHours: 4, baselineSphereD: 0, baselineCylinderD: 0 });
    expect(at(t, 23).sphereD).toBeCloseTo((4 * 17) / 100, 10);
    expect(at(t, 2).sphereD).toBeCloseTo(at(t, 6).sphereD, 12);
    expect(at(t, 120).sphereD).toBeCloseTo(at(t, 90).sphereD, 12);
    expect(at(t, 90).cylinderD).toBeCloseTo((-4 * 84) / 200, 10);
  });

  it("re-anchors to the baseline at the baseline age as the identity", () => {
    const t = interpolate(synthetic(), { nearHours: 4, baselineSphereD: 1, baselineCylinderD: -1 });
    expect(reanchor(t, 6, at(t, 6))).toEqual(t);
  });

  it("re-anchors a later baseline by shifting the median through it", () => {
    const g = synthetic();
    const t = trajectoryFor(g, { nearHours: 4, baselineSphereD: -2, baselineCylinderD: 0, anchorAgeYears: 40 });
    expect(at(t, 40).sphereD).toBeCloseTo(-2, 10);
    // The change after the anchor is the model's: +0.04 D/yr of sphere for 4 h of near work.
    expect(at(t, 90).sphereD - at(t, 40).sphereD).toBeCloseTo(0.04 * 50, 10);
    // −2 D of sphere at the anchor already needs correction.
    expect(t.onset.refraction).toBe(40);
  });

  it("recomputes the onsets on the re-anchored median from the anchor age on", () => {
    const g = synthetic();
    // Re-anchored at 0 D at 60, the plotted median sphere runs straight from −0.40 D at 40 to
    // +1.20 D at 90 (the grid's ages), so the drawn line passes 0.5 D at 68.125; the search starts
    // at the anchor, and the cylinder (−0.60 D at 90) never reaches 0.75 D.
    const late = trajectoryFor(g, { nearHours: 4, baselineSphereD: 0, baselineCylinderD: 0, anchorAgeYears: 60 });
    expect(late.sphere.p50[1]).toBeCloseTo(-0.4, 10);
    expect(late.sphere.p50[2]).toBeCloseTo(1.2, 10);
    expect(late.onset.refraction).toBeCloseTo(40 + (0.9 / 1.6) * 50, 10);
    expect(late.onset).toEqual(onsetFromCurve(late.ages, medianOf(late), null, g.thresholds, 60));
    // The grid's acuity and draw ranges do not follow a shifted refraction.
    expect(late.logMAR).toBeNull();
    expect(late.onset.acuity).toBeNull();
    expect(late.onsetRange).toBeNull();
  });
});

describe("onset criteria", () => {
  it("states the grid's thresholds with the spec's strict sphere criterion", () => {
    expect(onsetCriteria({ cylinderD: 0.75, sphereD: 0.5, logMAR: 0.3 })).toEqual(["cylinder of 0.75 D or more", "sphere beyond ±0.50 D", "acuity worse than 20/40"]);
  });
  it("leaves out thresholds the grid does not carry", () => {
    expect(onsetCriteria({ cylinderD: 1, citation: "x" })).toEqual(["cylinder of 1.00 D or more"]);
    expect(onsetCriteria(undefined)).toEqual([]);
  });
});

const medianOf = (t: Trajectory) => t.sphere.p50.map((sphereD, i) => ({ sphereD, cylinderD: t.cylinder.p50[i]! }));

describe("onsets from the displayed median", () => {
  const TH = { cylinderD: 0.75, sphereD: 0.5, logMAR: 0.3 };

  it("is the crossing of the plotted median, interpolated between ages", () => {
    const g = synthetic();
    const t = interpolate(g, { nearHours: 4, baselineSphereD: 0, baselineCylinderD: 0 });
    // Sphere 0.04 (a − 6) passes 0.5 D at 18.5; logMAR −0.1 + 0.02 (a − 6) passes 0.3 at 26.
    expect(t.onset.refraction).toBeCloseTo(18.5, 10);
    expect(t.onset.acuity).toBeCloseTo(26, 10);
    expect(onsetFromCurve(t.ages, medianOf(t), t.logMAR, g.thresholds)).toEqual(t.onset);
    // Off the nodes the onset still sits on the displayed (blended) curve, not the nearest node's.
    const mid = interpolate(g, { nearHours: 1, baselineSphereD: 0, baselineCylinderD: 0 });
    expect(mid.onset.refraction).toBeCloseTo(6 + 0.5 / 0.01, 10);
  });

  it("applies the strict sphere and inclusive cylinder criteria of spec §8", () => {
    expect(onsetFromCurve([0, 10], [{ sphereD: 0.5, cylinderD: 0 }, { sphereD: -0.5, cylinderD: 0 }], null, TH).refraction).toBeNull();
    expect(onsetFromCurve([0, 10], [{ sphereD: 0, cylinderD: -0.75 }, { sphereD: 0, cylinderD: -0.75 }], null, TH).refraction).toBe(0);
    expect(onsetFromCurve([0, 10], [{ sphereD: 0, cylinderD: 0 }, { sphereD: -1, cylinderD: -0.5 }], [0.3, 0.4], TH)).toEqual({ refraction: 5, acuity: expect.closeTo(0, 10) });
  });

  it("leaves out criteria the grid has no threshold for, and searches from a given age", () => {
    const m = [{ sphereD: 0, cylinderD: 0 }, { sphereD: 2, cylinderD: -2 }];
    expect(onsetFromCurve([0, 10], m, [0, 1], undefined)).toEqual({ refraction: null, acuity: null });
    expect(onsetFromCurve([0, 10], m, null, { cylinderD: 1 }).refraction).toBe(5);
    expect(onsetFromCurve([0, 10], m, null, { cylinderD: 1 }, 7).refraction).toBe(7);
  });

  it("takes the 5–95% onset range from the grid's draws", () => {
    const g = synthetic();
    expect(onsetRange(g, { nearHours: 4, baselineSphereD: 1, baselineCylinderD: 0 })).toEqual({ refraction: [30, null], acuity: [null, null] });
    expect(interpolate(g, { nearHours: 4, baselineSphereD: 1, baselineCylinderD: 0 }).onsetRange).toEqual({ refraction: [30, null], acuity: [null, null] });
  });
});

describe("threshold label", () => {
  it("states the grid's acuity threshold as a Snellen fraction", () => {
    expect(thresholdLabel({ logMAR: 0.3 })).toBe("acuity 20/40");
    expect(thresholdLabel({ logMAR: 0 })).toBe("acuity 20/20");
    expect(thresholdLabel(undefined)).toBe("acuity");
  });
});
