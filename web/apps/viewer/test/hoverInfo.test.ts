import { MUSCLE_NAMES, deriveBinocular, defaultScene, loadPreset, lensGeometry } from "@eye/eye-model";
import { describe, expect, it } from "vitest";
import { STRUCTURE_KEYS, hoverInfo, sameTarget } from "../src/ui/hoverInfo";

const eye = loadPreset("navarro-1985");
const near = { ...defaultScene("navarro-1985"), targetDistanceM: 0.33, ageYears: 25 };
const state = deriveBinocular(near, { left: eye, right: eye }, { farPointD: { left: 0, right: 0 } }).right;
const UNIT = / (mm|D)\b/;

describe("hoverInfo", () => {
  it("gives every structure a title and at least two rows with units", () => {
    for (const key of STRUCTURE_KEYS) {
      const info = hoverInfo({ kind: "structure", key, side: "right" }, eye, state);
      expect(info.title).toMatch(/\(right eye\)$/);
      expect(info.rows.filter((r) => UNIT.test(r.value)).length, key).toBeGreaterThanOrEqual(2);
      for (const r of info.rows) expect(r.value, `${key} ${r.label}`).not.toMatch(/NaN/);
      expect(info.tooltip.length).toBeGreaterThan(0);
    }
  });

  it("reads the cornea from the document", () => {
    const ca = eye.surfaces.find((s) => s.name === "cornea.anterior")!;
    const rows = hoverInfo({ kind: "structure", key: "cornea", side: "right" }, eye, state).rows;
    expect(rows.find((r) => r.label === "Anterior radius")?.value).toBe(`${ca.radiusMm!.toFixed(2)} mm`);
    expect(rows.find((r) => r.label === "Central thickness")?.value).toBe(`${ca.thicknessToNextMm.toFixed(3)} mm`);
  });

  it("gives the lens at the current accommodation, labeled as a homogeneous-index approximation", () => {
    expect(state.accommodationD).toBeGreaterThan(2);
    const info = hoverInfo({ kind: "structure", key: "lens", side: "right" }, eye, state);
    const accommodated = lensGeometry(eye, state.lensParameterA).thicknessMm;
    const relaxed = lensGeometry(eye, 0).thicknessMm;
    expect(accommodated).toBeGreaterThan(relaxed);
    expect(info.rows.find((r) => r.label === "Thickness")?.value).toBe(`${accommodated.toFixed(3)} mm`);
    expect(info.tooltip).toContain("Approximation: homogeneous lens index");
  });

  it("gives each muscle its length, change, activation, and the length-proxy approximation", () => {
    for (let i = 0; i < MUSCLE_NAMES.length; i++) {
      const info = hoverInfo({ kind: "muscle", side: "left", index: i }, eye, state);
      const labels = info.rows.map((r) => r.label);
      expect(labels).toEqual(expect.arrayContaining(["Length", "Change from primary", "Activation"]));
      expect(info.rows.find((r) => r.label === "Length")?.value).toBe(`${state.eomLengthMm[i]!.toFixed(1)} mm`);
      expect(info.tooltip).toContain("Approximation: length-proxy activation");
    }
  });

  it("says when the pulleys are not tabled", () => {
    const info = hoverInfo({ kind: "marker", side: "right", index: 0, marker: "insertion" }, eye, state);
    expect(info.rows.find((r) => r.label === "Width")?.value).toMatch(/ mm$/);
    expect(info.tooltip).toContain("Fixed pulleys not tabled");
  });

  it("compares targets by identity", () => {
    expect(sameTarget({ kind: "structure", key: "lens", side: "right" }, { kind: "structure", key: "lens", side: "right" })).toBe(true);
    expect(sameTarget({ kind: "structure", key: "lens", side: "right" }, { kind: "structure", key: "lens", side: "left" })).toBe(false);
    expect(sameTarget({ kind: "muscle", side: "right", index: 1 }, { kind: "marker", side: "right", index: 1, marker: "insertion" })).toBe(false);
  });
});

describe("heat-map readout", () => {
  it("gives the largest displacement and the drawing scale", () => {
    const info = hoverInfo({ kind: "heatMap", side: "right" }, eye, state, { heatMap: { maxUm: 3.21, exaggeration: 10 } });
    expect(info.rows.map((r) => r.value)).toEqual(["3.2 µm", "×10"]);
    expect(info.tooltip).toMatch(/^Approximation:/);
  });
});
