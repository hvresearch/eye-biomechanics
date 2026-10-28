import { paraxialPower, retinalDefocusD, type Surface } from "@eye/optics";
import { describe, expect, it } from "vitest";
import { lensGeometry } from "../src/accommodation/lens";
import { RETINA_SURFACE_NAME, buildSurfaces } from "../src/build/surfaces";
import { loadPreset } from "../src/presets/load";
import { deriveEyeState } from "../src/state/derive";
import type { EyeState, SceneState } from "../src/state/types";

const relaxed: EyeState = {
  accommodationD: 0,
  demandD: 0,
  amplitudeD: 6,
  pupilMm: 4,
  pupilBaseMm: 4,
  gaze: [0, 0, 0, 1],
  gazeDeg: { xDeg: 0, yDeg: 0 },
  targetDistanceM: Number.POSITIVE_INFINITY,
  ciliaryActivation: 0,
  lensParameterA: 0,
  eomActivation: [],
  eomLengthMm: [],
  eomRestLengthMm: [],
  eomPaths: [],
};

/** The i-th built surface, asserted conic (the presets' surfaces are). */
function conicAt(s: Surface[], i: number): Extract<Surface, { kind: "conic" }> {
  const x = s[i];
  if (x?.kind !== "conic") throw new Error(`surface ${i} is not conic`);
  return x;
}

describe("buildSurfaces", () => {
  it("returns the four refracting surfaces plus the retina at the axial length", () => {
    const eye = loadPreset("navarro-1985");
    const s = buildSurfaces(eye, relaxed);
    expect(s.map((x) => x.name)).toEqual(["cornea.anterior", "cornea.posterior", "lens.anterior", "lens.posterior", RETINA_SURFACE_NAME]);
    expect(s[0]?.vertexZMm).toBe(0);
    expect(s[4]?.vertexZMm).toBeCloseTo(eye.axialLengthMm, 12);
    expect(s[4]?.mediumAfter.index555).toBe(1.336);
    expect(paraxialPower(s).powerD).toBeCloseTo(60.416, 2);
  });

  it("applies the accommodated lens geometry", () => {
    const eye = loadPreset("navarro-1985");
    const state = { ...relaxed, accommodationD: 2, lensParameterA: 2 };
    const g = lensGeometry(eye, 2);
    const s = buildSurfaces(eye, state);
    expect(conicAt(s, 2).radiusMm).toBe(g.anteriorRadiusMm);
    expect(conicAt(s, 2).conic).toBe(g.anteriorConic);
    expect(s[2]?.mediumAfter.index555).toBe(g.index555);
    expect(conicAt(s, 3).radiusMm).toBe(g.posteriorRadiusMm);
    expect(s[2]?.vertexZMm).toBeCloseTo(0.55 + g.anteriorChamberDepthMm, 12);
    expect(s[3]?.vertexZMm).toBeCloseTo(0.55 + g.anteriorChamberDepthMm + g.thicknessMm, 12);
    expect(retinalDefocusD(s, 0.5, 1).defocusD).toBeLessThan(0.5);
  });

  it("keeps the retina at the document's axial length during accommodation", () => {
    const eye = loadPreset("navarro-1985");
    const s = buildSurfaces(eye, { ...relaxed, accommodationD: 4, lensParameterA: 4 });
    expect(s[4]?.vertexZMm).toBeCloseTo(eye.axialLengthMm, 12);
  });

  it("drives the lens with the Table 4 parameter, not the accommodation readout", () => {
    const eye = loadPreset("navarro-1985");
    const g = lensGeometry(eye, 1.7);
    const s = buildSurfaces(eye, { ...relaxed, accommodationD: 2, lensParameterA: 1.7 });
    expect(conicAt(s, 2).radiusMm).toBe(g.anteriorRadiusMm);
  });

  it("defaults absent conic, tilt, and decenter to zero", () => {
    const eye = loadPreset("navarro-1985");
    eye.surfaces = eye.surfaces.map(({ conic: _c, tilt: _t, decenter: _d, ...rest }) => rest);
    const s = buildSurfaces(eye, relaxed);
    expect(conicAt(s, 0).conic).toBe(0);
    expect(s[0]?.tilt).toEqual({ xDeg: 0, yDeg: 0 });
    expect(s[0]?.decenter).toEqual({ xMm: 0, yMm: 0 });
  });

  it("marks the retina as the image surface", () => {
    const s = buildSurfaces(loadPreset("navarro-1985"), relaxed);
    expect(s[4]?.image).toBe(true);
    expect(s.slice(0, 4).some((x) => x.image)).toBe(false);
  });

  it("builds a toric anterior cornea from the document's radii, axis, and conics", () => {
    const eye = loadPreset("navarro-1985");
    const first = eye.surfaces[0];
    if (!first) throw new Error("no surfaces");
    const { radiusMm: _r, conic: _k, ...rest } = first;
    eye.surfaces[0] = { ...rest, type: "toric", rxMm: 7.6, ryMm: 7.9, axisDeg: 20, conicX: -0.2, conicY: -0.3 };
    const c = buildSurfaces(eye, relaxed)[0];
    if (c?.kind !== "toric") throw new Error("expected a toric surface");
    expect([c.rxMm, c.ryMm, c.axisDeg, c.conicX, c.conicY]).toEqual([7.6, 7.9, 20, -0.2, -0.3]);
  });

  it("builds a Zernike-perturbed surface from zernikeHeight", () => {
    const eye = loadPreset("navarro-1985");
    const first = eye.surfaces[0];
    if (!first) throw new Error("no surfaces");
    eye.surfaces[0] = { ...first, type: "zernike", zernikeHeight: { normRadiusMm: 4, coeffsMicrons: [0, 0, 0, 0, 0.5] } };
    const c = buildSurfaces(eye, relaxed)[0];
    if (c?.kind !== "zernike") throw new Error("expected a Zernike surface");
    expect(c.radiusMm).toBe(7.72);
    expect(c.normRadiusMm).toBe(4);
    expect(c.coeffsMicrons).toEqual([0, 0, 0, 0, 0.5]);
  });

  it("applies accommodation to a toric lens surface as a shift of both sections", () => {
    const eye = loadPreset("navarro-1985");
    const la = eye.surfaces[2];
    if (!la) throw new Error("no lens");
    const { radiusMm: _r, conic: _k, ...rest } = la;
    eye.surfaces[2] = { ...rest, type: "toric", rxMm: 10.2, ryMm: 9.8, axisDeg: 0, conicX: -3.1316, conicY: -3.1316 };
    const g0 = lensGeometry(loadPreset("navarro-1985"), 0);
    const g2 = lensGeometry(loadPreset("navarro-1985"), 2);
    const s = buildSurfaces(eye, { ...relaxed, lensParameterA: 2 })[2];
    if (s?.kind !== "toric") throw new Error("expected a toric lens");
    const dR = g2.anteriorRadiusMm - g0.anteriorRadiusMm;
    expect(s.rxMm).toBeCloseTo(10.2 + dR, 12);
    expect(s.ryMm).toBeCloseTo(9.8 + dR, 12);
    expect(s.conicX).toBeCloseTo(-3.1316 + (g2.anteriorConic - g0.anteriorConic), 12);
  });

  it("realises the controller's response optically when given a paraxial far point", () => {
    const eye = loadPreset("navarro-1985");
    const farPointOf = (surfaces: Surface[]) => paraxialPower(surfaces).farPointD;
    for (const [age, dist] of [
      [30, 1 / 3],
      [20, 0.25],
      [10, 0.1],
      [45, 0.5],
    ] as const) {
      const scene: SceneState = {
        targetDistanceM: dist,
        targetDirectionDeg: { x: 0, y: 0 },
        luminanceCdM2: 100,
        ageYears: age,
        ipdMm: 63,
        timeS: 0,
        preset: "navarro-1985",
      };
      const state = deriveEyeState(scene, eye, "right", 0, farPointOf);
      expect(state.accommodationD).toBeGreaterThan(0);
      const far0 = paraxialPower(buildSurfaces(eye, { ...state, lensParameterA: 0 })).farPointD;
      const far = paraxialPower(buildSurfaces(eye, state)).farPointD;
      expect(Math.abs(far0 - far - state.accommodationD)).toBeLessThan(0.05);
    }
  });

  it("composes with deriveEyeState: a 30-year-old at 0.33 m is within 0.6 D of focus", () => {
    const eye = loadPreset("navarro-1985");
    const scene: SceneState = {
      targetDistanceM: 1 / 3,
      targetDirectionDeg: { x: 0, y: 0 },
      luminanceCdM2: 100,
      ageYears: 30,
      ipdMm: 63,
      timeS: 0,
      preset: "navarro-1985",
    };
    const farPointOf = (surfaces: Surface[]) => paraxialPower(surfaces).farPointD;
    const state = deriveEyeState(scene, eye, "right", 0, farPointOf);
    const d = retinalDefocusD(buildSurfaces(eye, state), scene.targetDistanceM, state.pupilMm / 2);
    expect(Math.abs(d.defocusD)).toBeLessThan(0.6);
    // Through a small pupil the residual is the modeled lag (demand − response), so the lag
    // reaches the optics rather than being cancelled by the lens model.
    const small = retinalDefocusD(buildSurfaces(eye, state), scene.targetDistanceM, 0.5);
    expect(Math.abs(small.defocusD - (state.demandD - state.accommodationD))).toBeLessThan(0.05);
    const old = deriveEyeState({ ...scene, ageYears: 60 }, eye, "right");
    const dOld = retinalDefocusD(buildSurfaces(eye, old), scene.targetDistanceM, old.pupilMm / 2);
    expect(dOld.defocusD).toBeGreaterThan(1.5);
  });
});
