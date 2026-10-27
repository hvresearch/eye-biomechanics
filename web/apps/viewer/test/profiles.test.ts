import { buildSurfaces, deriveEyeState, loadPreset, type SceneState } from "@eye/eye-model";
import { describe, expect, it } from "vitest";
import { globeProfiles } from "../src/scene/profiles";
import { derive } from "../src/store/derive";

const scene: SceneState = {
  targetDistanceM: 6,
  targetDirectionDeg: { x: 0, y: 0 },
  luminanceCdM2: 100,
  ageYears: 30,
  ipdMm: 63,
  timeS: 0,
  preset: "navarro-1985",
};

describe("globeProfiles", () => {
  it("produces finite, non-negative-radius profiles that start on the axis for solids", () => {
    const eye = loadPreset("navarro-1985");
    const s = buildSurfaces(eye, deriveEyeState(scene, eye, "right"));
    const p = globeProfiles(s, eye.axialLengthMm, eye.retina.radiusMm);
    for (const [name, profile] of Object.entries(p)) {
      expect(profile.length, name).toBeGreaterThan(2);
      for (const [r, z] of profile) {
        expect(Number.isFinite(r) && Number.isFinite(z), name).toBe(true);
        expect(r, name).toBeGreaterThanOrEqual(0);
      }
    }
    expect(p.cornea[0]?.[0]).toBe(0);
    expect(p.lens[0]?.[0]).toBe(0);
    expect(p.sclera[0]?.[1]).toBeCloseTo(eye.axialLengthMm + 0.8, 6);
    expect(p.retina[0]?.[1]).toBeCloseTo(eye.axialLengthMm - 0.25, 6);
  });

  it("thickens the lens profile with accommodation", () => {
    const eye = loadPreset("navarro-1985");
    const near = derive({ ...scene, targetDistanceM: 0.25 }, eye);
    const far = derive(scene, eye);
    const span = (pf: ReturnType<typeof globeProfiles>) => {
      const zs = pf.lens.map(([, z]) => z);
      return Math.max(...zs) - Math.min(...zs);
    };
    expect(span(globeProfiles(near.surfaces, eye.axialLengthMm, eye.retina.radiusMm))).toBeGreaterThan(
      span(globeProfiles(far.surfaces, eye.axialLengthMm, eye.retina.radiusMm)),
    );
    expect(near.eye.accommodationD).toBeGreaterThan(far.eye.accommodationD);
  });
});

describe("derive", () => {
  it("uses the relaxed far point so an emmetropic preset has zero demand at 6 m", () => {
    const d = derive(scene, loadPreset("navarro-1985"));
    expect(Math.abs(d.farPointD)).toBeLessThan(0.05);
    expect(d.eye.demandD).toBeCloseTo(1 / 6 + d.farPointD, 12);
    // At 6 m the eye accommodates 0.17 D, so the accommodated power sits just above relaxed.
    expect(d.paraxialPowerD).toBeGreaterThan(60.42);
    expect(d.paraxialPowerD).toBeLessThan(60.9);
    const inf = derive({ ...scene, targetDistanceM: Number.POSITIVE_INFINITY }, loadPreset("navarro-1985"));
    expect(inf.paraxialPowerD).toBeCloseTo(60.42, 1);
  });
});
