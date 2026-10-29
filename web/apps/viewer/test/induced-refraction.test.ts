import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EyeParameters } from "@eye/eye-model";
import { describe, expect, it } from "vitest";
import { inducedRefraction } from "../src/worker/handle";

/**
 * Shared fixture for the Python paraxial refraction (science/eyebiomech/optics/paraxial.py):
 * the worker's induced refraction (paraxial method, 4 mm pupil, right eye, TABO) of the
 * committed FEM result against its reference, and of two synthetic changes of the fixture eye
 * (an oblique anterior astigmatism with a longer vitreous; a posterior with-the-rule change
 * with a thinner cornea), so both J45's sign and the axial terms are exercised. Regenerate with
 * UPDATE_INDUCED_FIXTURE=1.
 */
const ROOT = resolve(import.meta.dirname, "../../../..");
const FILE = resolve(ROOT, "data/oracle/induced-refraction.json");
const PUPIL_MM = 4;
const read = (path: string) => JSON.parse(readFileSync(resolve(ROOT, path), "utf8")) as unknown;

function zernike(doc: EyeParameters, index: number, coeffs: number[], normRadiusMm: number): EyeParameters {
  const out = JSON.parse(JSON.stringify(doc)) as EyeParameters;
  const s = out.surfaces[index]!;
  out.surfaces[index] = { ...s, type: "zernike", zernikeHeight: { normRadiusMm, coeffsMicrons: coeffs } } as EyeParameters["surfaces"][number];
  return out;
}

function cases(): Array<{ name: string; loaded: EyeParameters; reference: EyeParameters }> {
  const base = read("data/fixtures/emmetrope-right.eye.json") as EyeParameters;
  const result = read("data/results/fem/emmetrope-right-primary-15mmHg.eye.json") as EyeParameters;
  const sidecar = read("data/results/fem/emmetrope-right-primary-15mmHg.deformation.json") as { reference: EyeParameters };
  const oblique = zernike(base, 0, [0, 0, 0, 1.0, 0.3], 4);
  oblique.surfaces[3]!.thicknessToNextMm += 0.05;
  oblique.axialLengthMm += 0.05; // the viewer places the retina at the axial length
  const posterior = zernike(base, 1, [0, 0, 0, 0, -0.4, 2.0], 4);
  posterior.surfaces[0]!.thicknessToNextMm -= 0.02;
  return [
    { name: "committed-fem-result", loaded: result, reference: sidecar.reference },
    { name: "oblique-anterior-longer-vitreous", loaded: oblique, reference: base },
    { name: "posterior-wtr-thinner-cornea", loaded: posterior, reference: base },
  ];
}

function table() {
  return {
    description: "Induced refraction (loaded minus reference; M, J0, J45 in D, right eye, TABO) from web/apps/viewer/src/worker/handle.ts inducedRefraction (paraxial Zernike method, 4 mm pupil); see web/apps/viewer/test/induced-refraction.test.ts",
    pupilDiameterMm: PUPIL_MM,
    cases: cases().map(({ name, loaded, reference }) => {
      const d = inducedRefraction(loaded, reference, PUPIL_MM, "right").delta;
      return { name, loaded, reference, M: d.M, J0: d.J0, J45: d.J45 };
    }),
  };
}

describe("shared induced-refraction fixture (data/oracle/induced-refraction.json)", () => {
  it("matches the worker", () => {
    const fresh = table();
    if (process.env.UPDATE_INDUCED_FIXTURE === "1" || !existsSync(FILE)) writeFileSync(FILE, JSON.stringify(fresh, null, 1) + "\n");
    const committed = JSON.parse(readFileSync(FILE, "utf8")) as ReturnType<typeof table>;
    expect(committed.cases.map((c) => c.name)).toEqual(fresh.cases.map((c) => c.name));
    committed.cases.forEach((c, i) => {
      const f = fresh.cases[i]!;
      expect(c.loaded).toEqual(f.loaded);
      for (const k of ["M", "J0", "J45"] as const) expect(Math.abs(c[k] - f[k])).toBeLessThan(1e-9);
    });
  });
});
