import { describe, expect, it } from "vitest";
import { loadPreset } from "../src/presets/load";
import { vergenceDemandMA } from "../src/pupil/nearResponse";
import { watsonYellottMm } from "../src/pupil/watsonYellott";
import { SchemaVersionError, deriveEyeState } from "../src/state/derive";
import type { SceneState } from "../src/state/types";

const scene = (over: Partial<SceneState> = {}): SceneState => ({
  targetDistanceM: 0.5,
  targetDirectionDeg: { x: 0, y: 0 },
  luminanceCdM2: 100,
  ageYears: 30,
  ipdMm: 63,
  timeS: 0,
  preset: "navarro-1985",
  ...over,
});

describe("deriveEyeState", () => {
  it("fills accommodation for a 30-year-old at 0.5 m", () => {
    const s = deriveEyeState(scene(), loadPreset("navarro-1985"), "right");
    // Demand from this eye's own distance: 0.5 m ahead of the midpoint, 31.5 mm to the side.
    expect(s.demandD).toBeCloseTo(1 / Math.hypot(0.5, 0.0315), 12);
    expect(s.accommodationD).toBeGreaterThanOrEqual(1.5);
    expect(s.accommodationD).toBeLessThanOrEqual(2);
    expect(s.amplitudeD).toBeGreaterThan(5);
    // Watson & Yellott at the scene's luminance and age, less the near miosis at 0.5 m (2 MA).
    expect(s.pupilBaseMm).toBeCloseTo(watsonYellottMm(100, 3600, 30, 2), 12);
    expect(s.pupilMm).toBeCloseTo(Math.max(2, s.pupilBaseMm - 0.305 * vergenceDemandMA(2 * Math.atan(0.0315 / 0.5) * (180 / Math.PI), 63)), 9);
    expect(s.gazeDeg.xDeg).toBeLessThan(0); // converged: the right eye turns nasally
    expect(s.eomActivation).toHaveLength(6);
    expect(s.ciliaryActivation).toBeCloseTo(s.accommodationD / s.amplitudeD, 12);
  });

  it("is presbyopic at 60", () => {
    const s = deriveEyeState(scene({ ageYears: 60, targetDistanceM: 1 / 3 }), loadPreset("navarro-1985"), "right");
    expect(s.demandD).toBeCloseTo(1 / Math.hypot(1 / 3, 0.0315), 12);
    expect(s.accommodationD).toBeLessThan(0.2);
  });

  it("has zero demand and response at infinity", () => {
    const s = deriveEyeState(scene({ targetDistanceM: Number.POSITIVE_INFINITY }), loadPreset("navarro-1985"), "left");
    expect(s.demandD).toBe(0);
    expect(s.accommodationD).toBe(0);
    expect(s.ciliaryActivation).toBe(0);
  });

  it("reduces demand for an uncorrected myope via farPointD", () => {
    const s = deriveEyeState(scene({ targetDistanceM: 0.5 }), loadPreset("navarro-1985"), "right", -2);
    expect(s.demandD).toBe(0);
  });

  it("throws SchemaVersionError for an unsupported major version", () => {
    const eye = { ...loadPreset("navarro-1985"), schemaVersion: "2.0.0" };
    expect(() => deriveEyeState(scene(), eye, "right")).toThrow(SchemaVersionError);
    expect(() => deriveEyeState(scene(), eye, "right")).toThrow(/2\.0\.0/);
  });

  it("keeps a fixed pupil fixed (fixtures)", () => {
    const eye = loadPreset("navarro-1985");
    eye.pupil = { model: "fixed", params: { diameterMm: 4 } };
    const s = deriveEyeState(scene({ targetDistanceM: 0.25 }), eye, "right");
    expect(s.pupilMm).toBe(4);
    expect(s.pupilBaseMm).toBe(4);
  });

  it("throws a plain Error for an unknown pupil model", () => {
    const eye = loadPreset("navarro-1985");
    eye.pupil = { model: "watson-yellott", params: {} };
    expect(() => deriveEyeState(scene(), eye, "right")).toThrow(/pupil model/);
  });
});

describe("documents without a lens accommodation model", () => {
  it("cannot accommodate: amplitude, response, and lens parameter are zero", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const { defaultScene } = await import("../src/scene/defaults");
    const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../data/fixtures/emmetrope-right.eye.json"), "utf8"));
    expect(fixture.lensAccommodationModel).toBeUndefined();
    const s = deriveEyeState({ ...defaultScene("navarro-1985"), targetDistanceM: 0.33 }, fixture, "right", 0, () => 0);
    expect(s.amplitudeD).toBe(0);
    expect(s.accommodationD).toBe(0);
    expect(s.lensParameterA).toBe(0);
    expect(s.ciliaryActivation).toBe(0);
  });
});
