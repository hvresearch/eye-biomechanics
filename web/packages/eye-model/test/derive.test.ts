import { describe, expect, it } from "vitest";
import { loadPreset } from "../src/presets/load";
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
    expect(s.demandD).toBeCloseTo(2, 12);
    expect(s.accommodationD).toBeGreaterThanOrEqual(1.5);
    expect(s.accommodationD).toBeLessThanOrEqual(2);
    expect(s.amplitudeD).toBeGreaterThan(5);
    expect(s.pupilMm).toBe(4);
    expect(s.gaze).toEqual([0, 0, 0, 1]);
    expect(s.eomActivation).toEqual([]);
    expect(s.ciliaryActivation).toBeCloseTo(s.accommodationD / s.amplitudeD, 12);
  });

  it("is presbyopic at 60", () => {
    const s = deriveEyeState(scene({ ageYears: 60, targetDistanceM: 1 / 3 }), loadPreset("navarro-1985"), "right");
    expect(s.demandD).toBeCloseTo(3, 12);
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

  it("throws a plain Error for an unknown pupil model", () => {
    const eye = loadPreset("navarro-1985");
    eye.pupil = { model: "watson-yellott", params: {} };
    expect(() => deriveEyeState(scene(), eye, "right")).toThrow(/pupil model/);
  });
});
