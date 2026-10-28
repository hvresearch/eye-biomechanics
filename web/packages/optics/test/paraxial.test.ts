import { describe, expect, it } from "vitest";
import { objectVergenceForImageD, paraxialPower } from "../src/paraxial/abcd";
import { surfacesFromSequential } from "../src/surfaces/sequential";
import { navarroSurfaces } from "./helpers/navarro";

describe("paraxialPower", () => {
  it("reproduces the published Navarro 1985 power and focuses infinity on the retina", () => {
    const surfaces = navarroSurfaces();
    const p = paraxialPower(surfaces);
    expect(p.powerD).toBeCloseTo(60.416, 1);
    expect(Math.abs(p.powerD - 60.42)).toBeLessThan(0.05);
    const retina = surfaces[surfaces.length - 1];
    expect(Math.abs(p.imageZMm - (retina?.vertexZMm ?? Number.NaN))).toBeLessThan(0.05);
    expect(Math.abs(p.farPointD)).toBeLessThan(0.05);
  });

  it("does not end the system at an index-matched surface that is not flagged as the image", () => {
    const surfaces = navarroSurfaces();
    const p0 = paraxialPower(surfaces);
    const aqueous = surfaces[1];
    if (!aqueous) throw new Error("no aqueous");
    const stop = { ...aqueous, name: "stop", kind: "conic" as const, radiusMm: Infinity, conic: 0, vertexZMm: aqueous.vertexZMm + 2 };
    const withStop = [...surfaces.slice(0, 2), stop, ...surfaces.slice(2)];
    const p1 = paraxialPower(withStop);
    expect(p1.powerD).toBeCloseTo(p0.powerD, 12);
    expect(p1.farPointD).toBeCloseTo(p0.farPointD, 12);
  });

  it("uses each meridian's curvature for a toric cornea", () => {
    const surfaces = navarroSurfaces();
    const c = surfaces[0];
    if (!c || c.kind !== "conic") throw new Error("no cornea");
    const n = c.mediumAfter.index555;
    const toric = { ...c, kind: "toric" as const, rxMm: 7.6, ryMm: 7.8, axisDeg: 0, conicX: c.conic, conicY: c.conic };
    const t = [toric, ...surfaces.slice(1)];
    const px = paraxialPower(t, 1, { meridianDeg: 0 });
    const py = paraxialPower(t, 1, { meridianDeg: 90 });
    // Each meridian is the rotationally symmetric eye with that section's radius.
    const sx = paraxialPower([{ ...c, radiusMm: 7.6 }, ...surfaces.slice(1)]);
    const sy = paraxialPower([{ ...c, radiusMm: 7.8 }, ...surfaces.slice(1)]);
    expect(px.powerD).toBeCloseTo(sx.powerD, 12);
    expect(py.farPointD).toBeCloseTo(sy.farPointD, 12);
    // To first order the difference is that of the anterior surface powers, (n − 1)(1/rx − 1/ry).
    const expected = 1000 * (n - 1) * (1 / 7.6 - 1 / 7.8);
    expect(Math.abs(px.powerD - py.powerD - expected)).toBeLessThan(0.15 * expected);
    expect(px.farPointD).toBeLessThan(py.farPointD); // steeper meridian is more myopic
    // An oblique meridian sees the mean curvature at 45°.
    const p45 = paraxialPower(t, 1, { meridianDeg: 45 });
    expect(p45.powerD).toBeGreaterThan(py.powerD);
    expect(p45.powerD).toBeLessThan(px.powerD);
  });

  it("matches the thin-lens formula for a thin glass lens in air", () => {
    const n = 1.5;
    const s = surfacesFromSequential([
      { name: "front", radiusMm: 50, thicknessToNextMm: 0, mediumAfter: { name: "glass", index555: n }, apertureSemiDiamMm: 5 },
      { name: "back", radiusMm: -50, thicknessToNextMm: 0, mediumAfter: { name: "air", index555: 1 }, apertureSemiDiamMm: 5 },
    ]);
    const p = paraxialPower(s);
    expect(p.powerD).toBeCloseTo(1000 * (n - 1) * (1 / 50 + 1 / 50), 9);
    expect(p.backFocalLengthMm).toBeCloseTo(50, 9);
    expect(Number.isNaN(p.farPointD)).toBe(true);
  });

  it("gives the object vergence conjugate to an image plane (thin lens: 1/v − 1/u = 1/f)", () => {
    const n = 1.5;
    const s = surfacesFromSequential([
      { name: "front", radiusMm: 50, thicknessToNextMm: 0, mediumAfter: { name: "glass", index555: n }, apertureSemiDiamMm: 5 },
      { name: "back", radiusMm: -50, thicknessToNextMm: 0, mediumAfter: { name: "air", index555: 1 }, apertureSemiDiamMm: 5 },
    ]);
    // f = 50 mm (20 D): an image at 100 mm needs an object vergence of 10 − 20 = −10 D.
    expect(objectVergenceForImageD(s, 100)).toBeCloseTo(-10, 9);
    expect(objectVergenceForImageD(s, 50)).toBeCloseTo(0, 9);
    expect(objectVergenceForImageD(s, Number.POSITIVE_INFINITY)).toBeCloseTo(-20, 9);
  });

  it("reports a myopic far point when the eye is lengthened", () => {
    const surfaces = navarroSurfaces();
    const retina = surfaces[surfaces.length - 1];
    if (!retina) throw new Error("no retina");
    const longer = [...surfaces.slice(0, -1), { ...retina, vertexZMm: retina.vertexZMm + 1 }];
    const p = paraxialPower(longer);
    // ≈ −n_vit·Δz/f'² = −1.336 × 1 / (1.336/0.0604)² m → about −2.7 D
    expect(p.farPointD).toBeLessThan(-2);
    expect(p.farPointD).toBeGreaterThan(-3.5);
  });

  it("moves the far point inward by roughly the Navarro accommodation parameter", () => {
    // Navarro's Table 4 is parametrized by nominal accommodation A, which is not exactly
    // the paraxial far-point shift: with the retina held at the axial length, A = 2 D gives
    // −2.18 D here. eye-model therefore solves for the A that realises a given response
    // (lensParameterForAccommodation) instead of passing the response in as A.
    const p0 = paraxialPower(navarroSurfaces(0));
    const p2 = paraxialPower(navarroSurfaces(2));
    expect(p2.powerD - p0.powerD).toBeGreaterThan(1.5);
    expect(p2.powerD - p0.powerD).toBeLessThan(3.0);
    expect(p2.farPointD).toBeLessThan(-2.1);
    expect(p2.farPointD).toBeGreaterThan(-2.25);
  });
});
