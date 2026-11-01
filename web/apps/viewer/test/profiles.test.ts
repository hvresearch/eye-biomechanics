import { buildSurfaces, deriveEyeState, loadPreset, type EyeParameters, type SceneState } from "@eye/eye-model";
import { describe, expect, it } from "vitest";
import { ANATOMY, globeProfiles } from "../src/scene/profiles";
import { handle } from "../src/worker/handle";

/** The right eye's optics as the store would request them. */
function derive(scene: SceneState, eye: EyeParameters) {
  const state = deriveEyeState(scene, eye, "right");
  const res = handle({
    id: 1,
    eyes: [{ side: "right", params: eye, accommodationD: state.accommodationD, objectDistanceM: state.targetDistanceM, pupilSemiDiamMm: 2, fanRays: 0 }],
  });
  const optics = res.eyes[0]!;
  return { eye: state, surfaces: optics.surfaces, paraxialPowerD: optics.paraxialPowerD, farPointD: optics.farPointD };
}

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
    const p = globeProfiles(s, eye.axialLengthMm, eye.retina.radiusMm, deriveEyeState(scene, eye, "right").pupilMm);
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

  it("bridges the lens equator and the ciliary body with the zonules", () => {
    const eye = loadPreset("navarro-1985");
    const s = buildSurfaces(eye, deriveEyeState(scene, eye, "right"));
    const p = globeProfiles(s, eye.axialLengthMm, eye.retina.radiusMm, 4);
    const la = s.find((x) => x.name === "lens.anterior")!;
    const rs = p.zonules.map(([r]) => r);
    expect(Math.min(...rs)).toBeCloseTo(la.apertureSemiDiamMm, 9);
    const [apexR, apexZ] = p.ciliaryBody[1]!;
    expect(Math.max(...rs)).toBeCloseTo(apexR, 9);
    expect(p.zonules[1]).toEqual([apexR, apexZ - ANATOMY.zonuleBandMm / 2]);
  });

  it("thickens the lens profile with accommodation", () => {
    const eye = loadPreset("navarro-1985");
    const near = derive({ ...scene, targetDistanceM: 0.25 }, eye);
    const far = derive(scene, eye);
    const span = (pf: ReturnType<typeof globeProfiles>) => {
      const zs = pf.lens.map(([, z]) => z);
      return Math.max(...zs) - Math.min(...zs);
    };
    expect(span(globeProfiles(near.surfaces, eye.axialLengthMm, eye.retina.radiusMm, 4))).toBeGreaterThan(
      span(globeProfiles(far.surfaces, eye.axialLengthMm, eye.retina.radiusMm, 4)),
    );
    expect(near.eye.accommodationD).toBeGreaterThan(far.eye.accommodationD);
  });

  it("draws the pupil from the document's pupil model, not a fixed size", () => {
    const eye = loadPreset("navarro-1985");
    const s = buildSurfaces(eye, deriveEyeState(scene, eye, "right"));
    const iris = globeProfiles(s, eye.axialLengthMm, eye.retina.radiusMm, 3).iris;
    expect(iris[0]?.[0]).toBeCloseTo(1.5, 12);
    const pupilMm = deriveEyeState(scene, eye, "right").pupilMm;
    expect(globeProfiles(s, eye.axialLengthMm, eye.retina.radiusMm, pupilMm).iris[0]?.[0]).toBeCloseTo(pupilMm / 2, 12);
  });
});
