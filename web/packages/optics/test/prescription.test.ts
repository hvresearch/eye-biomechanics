import { describe, expect, it } from "vitest";
import { SPECTACLE_DEFAULTS, lensSurfaces, type Prescription } from "../src/lenses/prescription";
import { paraxialPower } from "../src/paraxial/abcd";

const rx = (sphereD: number, cylinderD: number, axisDeg: number): Prescription => ({
  sphereD,
  cylinderD,
  axisDeg,
  vertexMm: SPECTACLE_DEFAULTS.vertexMm,
  baseCurveD: SPECTACLE_DEFAULTS.baseCurveD,
  index: SPECTACLE_DEFAULTS.index,
  centerThicknessMm: SPECTACLE_DEFAULTS.centerThicknessMm,
});

const bvp = (s: ReturnType<typeof lensSurfaces>, meridianDeg: number) => 1000 / paraxialPower(s, 1, { meridianDeg }).backFocalLengthMm;

describe("lensSurfaces", () => {
  it("realizes the back-vertex power in both principal meridians within 0.01 D", () => {
    for (const p of [rx(-3, 0, 180), rx(2, -1, 90), rx(-1.25, -2, 30), rx(4.5, -0.75, 160), rx(-6, -1.5, 5)]) {
      const s = lensSurfaces(p);
      expect(Math.abs(bvp(s, p.axisDeg) - p.sphereD), `${p.sphereD}/${p.cylinderD}×${p.axisDeg}`).toBeLessThan(0.01);
      expect(Math.abs(bvp(s, p.axisDeg + 90) - (p.sphereD + p.cylinderD))).toBeLessThan(0.01);
    }
  });

  it("places the back vertex at the vertex distance and the front one thickness ahead", () => {
    const s = lensSurfaces(rx(-3, -1, 20), 0);
    expect(s[1]?.vertexZMm).toBe(-12);
    expect(s[0]?.vertexZMm).toBe(-14);
    expect(s[1]?.mediumAfter.index555).toBe(1);
    expect(s[0]?.mediumAfter.index555).toBe(1.5);
    expect(s[1]?.kind).toBe("toric");
    expect(lensSurfaces(rx(-3, 0, 180))[1]?.kind).toBe("conic");
  });
});
