import { analyzeWavefront, paraxialPower, type Surface } from "@eye/optics";
import { describe, expect, it } from "vitest";
import { buildSurfacesAt } from "../src/build/surfaces";
import { toClinicalRefraction } from "../src/optics/clinical";
import { eyeView, onAxisView } from "../src/optics/view";
import { loadPreset } from "../src/presets/load";
import { REFRACTIVE_PRESETS, applyRefraction, applyRefractivePreset, decomposeRefraction, mirrorEye } from "../src/presets/refractive";
import { validateEyeParameters } from "../src/schema/validate";

const farPointOf = (s: Surface[], meridianDeg = 0) => paraxialPower(s, 1, { meridianDeg }).farPointD;
const base = loadPreset("navarro-1985");

/** Traced paraxial-method refraction, clinical (TABO) for the given side, 3 mm pupil on axis. */
function traced(doc: ReturnType<typeof loadPreset>, side: "left" | "right" = "right") {
  const r = analyzeWavefront(buildSurfacesAt(doc, 0), onAxisView(Number.POSITIVE_INFINITY, 3), { gridN: 40, refractionMethod: "paraxial" }).refraction;
  return toClinicalRefraction(r, side);
}

const axisDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 180;
  return Math.min(d, 180 - d);
};

describe("refractive presets", () => {
  const emmetrope = traced(base);

  for (const p of REFRACTIVE_PRESETS) {
    it(`${p.name}: traced refraction relative to the emmetrope matches its nominal values`, () => {
      const doc = applyRefractivePreset(base, p.name, farPointOf);
      expect(validateEyeParameters(doc).ok).toBe(true);
      const t = traced(doc);
      expect(Math.abs(t.M - emmetrope.M - (p.sphereD + p.cylinderD / 2)), "M").toBeLessThan(0.15);
      expect(Math.abs(t.cylinderD - p.cylinderD), "cylinder").toBeLessThan(0.15);
      if (p.cylinderD !== 0) expect(axisDiff(t.axisDeg, p.axisDegTabo), "axis").toBeLessThan(3);
      if (p.ageYears !== undefined) expect(doc.age).toBe(p.ageYears);
    });
  }

  it("makes the against-the-rule cornea steepest horizontally", () => {
    const doc = applyRefractivePreset(base, "astigmat-1.5-atr-corneal", farPointOf);
    const c = doc.surfaces[0];
    expect(c?.type).toBe("toric");
    // Local axis 90 (vertical section) keeps the base radius; the horizontal section is steeper.
    expect(c?.axisDeg).toBe(90);
    expect(c?.rxMm).toBeCloseTo(7.72, 9);
    expect(c?.ryMm).toBeLessThan(7.72);
  });

  it("rejects cylinder on an axial preset and unknown names", () => {
    expect(() => applyRefraction(base, { mechanism: "axial", sphereD: -1, cylinderD: -1, axisDegTabo: 90 }, farPointOf)).toThrow();
    expect(() => applyRefractivePreset(base, "nope", farPointOf)).toThrow(/Unknown/);
  });
});

describe("decomposeRefraction", () => {
  it("sums its parts to the total within 0.05 D for every preset", () => {
    for (const p of REFRACTIVE_PRESETS) {
      const d = decomposeRefraction(applyRefractivePreset(base, p.name, farPointOf), base, farPointOf);
      expect(Math.abs(d.residualD), p.name).toBeLessThan(0.05);
      expect(Math.abs(d.totalD - d.baseD - (p.sphereD + p.cylinderD / 2)), p.name).toBeLessThan(0.05);
    }
  });

  it("attributes each preset to its own mechanism", () => {
    const axial = decomposeRefraction(applyRefractivePreset(base, "myope-3-axial", farPointOf), base, farPointOf);
    expect(axial.axialD).toBeCloseTo(-3, 4);
    expect(Math.abs(axial.cornealD) + Math.abs(axial.lenticularD)).toBeLessThan(1e-9);
    const corneal = decomposeRefraction(applyRefractivePreset(base, "myope-3-corneal", farPointOf), base, farPointOf);
    expect(corneal.cornealD).toBeCloseTo(-3, 4);
    const astig = decomposeRefraction(applyRefractivePreset(base, "astigmat-1.5-atr-corneal", farPointOf), base, farPointOf);
    expect(astig.cylinderCornealD).toBeCloseTo(-1.5, 4);
    expect(astig.cylinderLenticularD).toBeCloseTo(0, 9);
    expect(astig.cylinderTotalD).toBeCloseTo(-1.5, 4);
    const lent = decomposeRefraction(applyRefractivePreset(base, "astigmat-1.5-lenticular", farPointOf), base, farPointOf);
    expect(lent.cylinderLenticularD).toBeCloseTo(-1.5, 4);
    expect(lent.cylinderCornealD).toBeCloseTo(0, 9);
  });
});

describe("mirrorEye", () => {
  it("gives TABO axes that sum to 180 across the two eyes, oblique axes included", () => {
    for (const axis of [90, 60, 135]) {
      const right = applyRefraction(base, { mechanism: "corneal", sphereD: 0, cylinderD: -1.5, axisDegTabo: axis }, farPointOf, "right");
      const left = mirrorEye({ ...right, id: "x-right", label: "astigmat, right eye" }, "left");
      expect(left.id).toBe("x-left");
      expect(left.label).toBe("astigmat, left eye");
      const r = traced(right, "right");
      const l = traced(left, "left");
      expect(axisDiff(r.axisDeg, axis)).toBeLessThan(3);
      expect(axisDiff(r.axisDeg + l.axisDeg, 180)).toBeLessThan(3);
      expect(Math.abs(r.cylinderD - l.cylinderD)).toBeLessThan(1e-9);
    }
  });

  it("keeps the fovea temporal in both eyes (the target nasal of each optical axis)", () => {
    const left = mirrorEye(base, "left");
    expect(eyeView(left, 1, 3).fieldDeg.x).toBe(eyeView(base, 1, 3).fieldDeg.x);
    expect(eyeView(left, 1, 3).fieldDeg.x).toBeGreaterThan(0);
  });
});
