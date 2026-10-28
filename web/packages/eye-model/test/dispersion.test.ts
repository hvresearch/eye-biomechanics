import { cauchyFit, indexAt, paraxialPower } from "@eye/optics";
import { describe, expect, it } from "vitest";
import { buildSurfacesAt } from "../src/build/surfaces";
import { DISPERSION_TABLE, MEDIA_DISPERSION, PHOTOPIC, withDispersion } from "../src/optics/dispersion";
import { loadPreset } from "../src/presets/load";

describe("media dispersion", () => {
  it("agrees with optics' Cauchy fit for every medium", () => {
    for (const [name, values] of Object.entries(DISPERSION_TABLE.media)) {
      const f = cauchyFit(DISPERSION_TABLE.wavelengthsNm, values);
      const d = MEDIA_DISPERSION[name as keyof typeof MEDIA_DISPERSION];
      expect(d.bUm2).toBeCloseTo(f.bUm2, 9);
      expect(d.cUm4).toBeCloseTo(f.cUm4, 9);
    }
  });

  it("attaches by medium name and leaves other media alone", () => {
    const s = buildSurfacesAt(loadPreset("navarro-1985"), 0);
    for (const x of s) expect(x.mediumAfter.dispersion?.form).toBe("cauchy");
    const air = { ...s[0]!, mediumAfter: { name: "air", index555: 1 } };
    expect(withDispersion([air])[0]?.mediumAfter.dispersion).toBeUndefined();
    const own = { ...s[0]!, mediumAfter: { name: "cornea", index555: 1.376, dispersion: { form: "cauchy" as const, bUm2: 1, cUm4: 0 } } };
    expect(withDispersion([own])[0]?.mediumAfter.dispersion?.bUm2).toBe(1);
  });

  it("keeps the 555 nm optics of the document unchanged", () => {
    const s = buildSurfacesAt(loadPreset("navarro-1985"), 0);
    for (const x of s) expect(indexAt(x.mediumAfter, 555)).toBe(x.mediumAfter.index555);
    expect(paraxialPower(s).powerD).toBeCloseTo(60.416, 2);
    expect(paraxialPower(s, 1, { wavelengthNm: 450 }).powerD).toBeGreaterThan(paraxialPower(s).powerD);
  });

  it("weights the polychromatic wavelengths by V(λ), normalized", () => {
    expect(PHOTOPIC.wavelengthsNm).toEqual([450, 500, 555, 600, 650]);
    expect(PHOTOPIC.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(Math.max(...PHOTOPIC.weights)).toBe(PHOTOPIC.weights[2]);
  });
});
