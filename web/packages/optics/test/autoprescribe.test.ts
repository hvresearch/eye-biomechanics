import { describe, expect, it } from "vitest";
import { autoPrescribe } from "../src/lenses/autoprescribe";
import { SPECTACLE_DEFAULTS, lensSurfaces } from "../src/lenses/prescription";
import { paraxialPower } from "../src/paraxial/abcd";
import { analyzeWavefront } from "../src/wavefront/analyze";
import { lengthenedNavarro, toricNavarro } from "./helpers/eyes";
import { onAxisView } from "./helpers/systems";

const view = onAxisView(1.5);

describe("autoPrescribe", () => {
  const myope = lengthenedNavarro(-3);
  const result = autoPrescribe(myope, view);

  it("corrects a −3 D axial myope to under 0.05 D of residual refraction", () => {
    const corrected = analyzeWavefront([...lensSurfaces(result.prescription), ...myope], view, { gridN: 64 });
    expect(Math.abs(corrected.refraction.M)).toBeLessThan(0.05);
    expect(Math.abs(result.prescription.cylinderD)).toBeLessThan(0.05);
    // The lens is the eye's own (minimum-RMS) refraction moved to the 11 mm lens–pupil-plane distance.
    const R = analyzeWavefront(myope, view, { gridN: 64 }).refraction.M;
    expect(Math.abs(result.prescription.sphereD - R / (1 + 0.011 * R))).toBeLessThan(0.1);
    expect(result.residualRmsMicrons).toBeLessThan(0.2 * analyzeWavefront(myope, view, { gridN: 64 }).fit.rmsMicrons);
  });

  it("spec §5.6: the vertex-adjusted −3 D lens corrects the −3 D myope to under 0.05 D (paraxial)", () => {
    // The far point is 1/3 m in front of the cornea and the lens vertexMm in front of the cornea.
    const { vertexMm } = SPECTACLE_DEFAULTS;
    const sphereD = -3 / (1 - (vertexMm / 1000) * 3);
    const corrected = [...lensSurfaces({ ...SPECTACLE_DEFAULTS, sphereD, cylinderD: 0, axisDeg: 180 }), ...myope];
    expect(Math.abs(paraxialPower(corrected).farPointD)).toBeLessThan(0.05);
    const wave = analyzeWavefront(corrected, view, { gridN: 64, refractionMethod: "paraxial" });
    expect(Math.abs(wave.refraction.M)).toBeLessThan(0.05);
    expect(Math.abs(wave.refraction.cylinderD)).toBeLessThan(0.05);
  });

  it("reads −3 D within 0.15 D at a small pupil, where spherical aberration does not bias the refraction", () => {
    const small = autoPrescribe(myope, onAxisView(1));
    expect(small.prescription.sphereD).toBeGreaterThan(-3.25);
    expect(small.prescription.sphereD).toBeLessThan(-2.95);
  });

  it("finds the cylinder and axis of a 1.5 D toric cornea", () => {
    const eye = toricNavarro(1.5);
    const own = analyzeWavefront(eye, view, { gridN: 64 }).refraction;
    const r = autoPrescribe(eye, view).prescription;
    expect(Math.abs(Math.abs(r.cylinderD) - Math.abs(own.cylinderD))).toBeLessThan(0.1);
    const dAxis = Math.abs(r.axisDeg - own.axisDeg);
    expect(Math.min(dAxis, 180 - dAxis)).toBeLessThan(3);
  });

  it("under-corrects the myope when the same lens moves from 12 to 14 mm", () => {
    const at = (vertexMm: number) =>
      analyzeWavefront([...lensSurfaces({ ...result.prescription, vertexMm }), ...myope], view, { gridN: 32 }).refraction.M;
    expect(at(14)).toBeLessThan(at(12) - 0.02);
  });

  it("maximizing Strehl does at least as well on Strehl as minimizing RMS", () => {
    const s = autoPrescribe(myope, view, { metric: "strehl" });
    expect(s.strehl).toBeGreaterThanOrEqual(result.strehl - 0.01);
  });
});
