import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { at, interpolate, parsePredictionGrid, reanchor, trajectoryFor } from "../src/data/predictions";
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
    expect(t.onset.refraction).toBe(50);
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
    expect(t.onset.refraction).toBe(50);
    const late = trajectoryFor(g, { nearHours: 4, baselineSphereD: 0, baselineCylinderD: 0, anchorAgeYears: 60 });
    expect(late.onset.refraction).toBeNull();
  });
});
