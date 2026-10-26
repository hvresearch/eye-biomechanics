import { describe, expect, it } from "vitest";
import { paraxialPower } from "../src/paraxial/abcd";
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
    // Navarro's Table 4 is parametrized by nominal accommodation A; the paraxial far
    // point it produces overshoots A by about 15% at 2 D (−2.33 D here, vitreous held
    // fixed). The eye-model controller treats A as the response; the overshoot is a
    // property of the published model, recorded here rather than hidden.
    const p0 = paraxialPower(navarroSurfaces(0));
    const p2 = paraxialPower(navarroSurfaces(2));
    expect(p2.powerD - p0.powerD).toBeGreaterThan(1.5);
    expect(p2.powerD - p0.powerD).toBeLessThan(3.0);
    expect(p2.farPointD).toBeLessThan(-1.7);
    expect(p2.farPointD).toBeGreaterThan(-2.6);
  });
});
