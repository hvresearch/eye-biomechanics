import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { cauchyFit, indexAt } from "../src/color/dispersion";
import { paraxialPower } from "../src/paraxial/abcd";
import type { Surface } from "../src/surfaces/types";
import { traceRay } from "../src/trace/sequential";
import { navarroSurfaces } from "./helpers/navarro";

interface Table {
  wavelengthsNm: number[];
  media: Record<"cornea" | "aqueous" | "lens" | "vitreous", number[]>;
}
const table = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../../data/dispersion/escudero-sanz-1999.json"), "utf8"),
) as Table;

function dispersive(surfaces: Surface[]): Surface[] {
  return surfaces.map((s) => {
    const values = table.media[s.mediumAfter.name as keyof Table["media"]];
    if (!values) return s;
    const f = cauchyFit(table.wavelengthsNm, values);
    return { ...s, mediumAfter: { ...s.mediumAfter, dispersion: { form: "cauchy", bUm2: f.bUm2, cUm4: f.cUm4 } } };
  });
}

describe("Cauchy dispersion", () => {
  it("fits each medium's four tabulated indices within 2e-4", () => {
    for (const [name, values] of Object.entries(table.media)) {
      expect(cauchyFit(table.wavelengthsNm, values).maxResidual, name).toBeLessThan(2e-4);
    }
  });

  it("leaves the 555 nm index unchanged and reproduces the table's spread", () => {
    const f = cauchyFit(table.wavelengthsNm, table.media.lens);
    const lens = { name: "lens", index555: 1.42, dispersion: { form: "cauchy" as const, bUm2: f.bUm2, cUm4: f.cUm4 } };
    expect(indexAt(lens, 555)).toBe(1.42);
    const spread = (table.media.lens[0] ?? 0) - (table.media.lens[3] ?? 0);
    expect(Math.abs(indexAt(lens, 458) - indexAt(lens, 632.8) - spread)).toBeLessThan(2e-4);
    expect(indexAt({ name: "air", index555: 1 }, 450)).toBe(1);
  });

  it("gives the Navarro eye a myopic shift in blue light (longitudinal chromatic aberration)", () => {
    const s = dispersive(navarroSurfaces());
    const blue = paraxialPower(s, 1, { wavelengthNm: 450 }).farPointD;
    const red = paraxialPower(s, 1, { wavelengthNm: 650 }).farPointD;
    const green = paraxialPower(s, 1, { wavelengthNm: 555 }).farPointD;
    expect(green).toBeCloseTo(paraxialPower(navarroSurfaces()).farPointD, 12);
    // Plausibility band for the 450–650 nm difference of the human eye, not a published fit.
    expect(red - blue).toBeGreaterThan(0.8);
    expect(red - blue).toBeLessThan(1.6);
  });

  it("refracts a traced ray with the ray's wavelength", () => {
    const s = dispersive(navarroSurfaces());
    const at = (wl: number) => traceRay({ origin: [1.5, 0, -5], dir: [0, 0, 1], wavelengthNm: wl }, s, 1);
    const b = at(450).hits.at(-1)?.point[0] ?? Number.NaN;
    const r = at(650).hits.at(-1)?.point[0] ?? Number.NaN;
    // Blue focuses in front of the retina, so its marginal ray has crossed the axis further.
    expect(b).toBeLessThan(r);
  });
});
