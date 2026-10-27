import { describe, expect, it } from "vitest";
import { InsufficientRaysError, retinalDefocusD } from "../src/metrics/defocus";
import { paraxialPower } from "../src/paraxial/abcd";
import { navarroSurfaces } from "./helpers/navarro";

describe("retinalDefocusD", () => {
  it("is near zero for the relaxed Navarro eye viewing infinity through a 2 mm pupil", () => {
    const r = retinalDefocusD(navarroSurfaces(), Number.POSITIVE_INFINITY, 1);
    expect(Math.abs(r.defocusD)).toBeLessThan(0.1);
    expect(r.rmsSpotMm).toBeLessThan(0.005);
  });

  it("shifts the best-RMS focus forward by the model's spherical aberration at a 4 mm pupil", () => {
    // Marginal rays of the Navarro eye focus short (undercorrected SA), so the minimum
    // RMS spot sits about 0.13 mm in front of the paraxial focus: ≈ −0.34 D.
    const r = retinalDefocusD(navarroSurfaces(), Number.POSITIVE_INFINITY, 2);
    expect(r.defocusD).toBeLessThan(-0.2);
    expect(r.defocusD).toBeGreaterThan(-0.5);
  });

  it("is about +2 D (focus behind the retina) for a 0.5 m object with no accommodation", () => {
    const r = retinalDefocusD(navarroSurfaces(), 0.5, 1);
    expect(r.defocusD).toBeGreaterThan(2 - 0.15);
    expect(r.defocusD).toBeLessThan(2 + 0.15);
    expect(r.bestFocusZMm).toBeGreaterThan(r.retinaZMm);
  });

  it("is small for a 0.5 m object once the Navarro lens is set to A = 2 D", () => {
    // Navarro's A = 2 moves the paraxial far point to −2.18 D (see paraxial.test.ts), so
    // a residual of about −0.2 D remains at 0.5 m.
    const r = retinalDefocusD(navarroSurfaces(2), 0.5, 1);
    expect(Math.abs(r.defocusD)).toBeLessThan(0.5);
  });

  it("converges with grid density", () => {
    const coarse = retinalDefocusD(navarroSurfaces(), Number.POSITIVE_INFINITY, 2, { gridN: 16 });
    const fine = retinalDefocusD(navarroSurfaces(), Number.POSITIVE_INFINITY, 2, { gridN: 32 });
    expect(Math.abs(coarse.defocusD - fine.defocusD)).toBeLessThan(0.02);
  });

  it("agrees with the paraxial far point for a lengthened eye", () => {
    const surfaces = navarroSurfaces();
    const retina = surfaces[surfaces.length - 1];
    if (!retina) throw new Error("no retina");
    const longer = [...surfaces.slice(0, -1), { ...retina, vertexZMm: retina.vertexZMm + 1 }];
    const r = retinalDefocusD(longer, Number.POSITIVE_INFINITY, 2);
    // Focus is in front of the retina: negative (myopic) defocus of roughly 2.7 D.
    expect(r.defocusD).toBeLessThan(-2.2);
    expect(r.defocusD).toBeGreaterThan(-3.2);
  });

  it("tracks large defocus beyond a few millimetres of the retina (no search window)", () => {
    // A relaxed eye viewing an object at 0.1 m has a paraxial residual of +10 D; with a
    // 2 mm pupil the spherical aberration contributes only a few hundredths of a diopter.
    const r = retinalDefocusD(navarroSurfaces(), 0.1, 1);
    expect(r.bestFocusZMm - r.retinaZMm).toBeGreaterThan(3);
    expect(Math.abs(r.defocusD - 10)).toBeLessThan(0.5);
    // Same for a strongly myopic (lengthened by 5 mm) eye viewing infinity.
    const surfaces = navarroSurfaces();
    const retina = surfaces[surfaces.length - 1];
    if (!retina) throw new Error("no retina");
    const longer = [...surfaces.slice(0, -1), { ...retina, vertexZMm: retina.vertexZMm + 5 }];
    const far = paraxialPower(longer).farPointD;
    const m = retinalDefocusD(longer, Number.POSITIVE_INFINITY, 1);
    expect(far).toBeLessThan(-10);
    expect(Math.abs(m.defocusD - far)).toBeLessThan(0.3);
  });

  it("matches the paraxial far point exactly in the small-pupil limit, not to first order only", () => {
    const surfaces = navarroSurfaces();
    const retina = surfaces[surfaces.length - 1];
    if (!retina) throw new Error("no retina");
    const longer = [...surfaces.slice(0, -1), { ...retina, vertexZMm: retina.vertexZMm + 3 }];
    const far = paraxialPower(longer).farPointD;
    const m = retinalDefocusD(longer, Number.POSITIVE_INFINITY, 0.1);
    expect(Math.abs(m.defocusD - far)).toBeLessThan(0.02);
  });

  it("throws when most rays are vignetted", () => {
    expect(() => retinalDefocusD(navarroSurfaces(), Number.POSITIVE_INFINITY, 12)).toThrow(InsufficientRaysError);
  });

  it("rejects a non-positive object distance", () => {
    expect(() => retinalDefocusD(navarroSurfaces(), 0, 2)).toThrow(RangeError);
  });
});
