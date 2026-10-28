import { describe, expect, it } from "vitest";
import { loadPreset } from "../src/presets/load";
import { DEFAULT_PUPIL, pupilBaseMm, pupilDiameterMm } from "../src/pupil/model";
import { NEAR_RESPONSE, nearMiosisMm, vergenceDemandMA } from "../src/pupil/nearResponse";
import { stanleyDaviesMm, watsonYellottMm } from "../src/pupil/watsonYellott";

describe("Watson & Yellott 2012 unified pupil", () => {
  it("reproduces three points computed with luxpy's implementation within 0.01 mm", () => {
    // luxpy 1.12.5 get_pupil_diameter_watson2012 (unified form), 3600 deg², binocular, age 30;
    // evaluated once with the function body copied verbatim (docs: data/pupil/README.md).
    expect(Math.abs(watsonYellottMm(1, 3600, 30, 2) - 4.979912)).toBeLessThan(0.01);
    expect(Math.abs(watsonYellottMm(100, 3600, 30, 2) - 2.815508)).toBeLessThan(0.01);
    expect(Math.abs(watsonYellottMm(1000, 3600, 30, 2) - 2.349486)).toBeLessThan(0.01);
    expect(Math.abs(watsonYellottMm(1, 3600, 60, 1) - 5.043725)).toBeLessThan(0.01);
  });

  it("shrinks with luminance and with age, and is larger for one eye", () => {
    expect(watsonYellottMm(10, 3600, 30, 2)).toBeLessThan(watsonYellottMm(1, 3600, 30, 2));
    expect(watsonYellottMm(10, 3600, 70, 2)).toBeLessThan(watsonYellottMm(10, 3600, 30, 2));
    expect(stanleyDaviesMm(10, 3600, 1)).toBeGreaterThan(stanleyDaviesMm(10, 3600, 2));
  });

  it("clamps age to the formula's 20–83 year domain", () => {
    expect(watsonYellottMm(50, 3600, 200, 2)).toBe(watsonYellottMm(50, 3600, 90, 2));
    expect(watsonYellottMm(50, 3600, 90, 2)).toBe(watsonYellottMm(50, 3600, 83, 2));
    expect(watsonYellottMm(50, 3600, 6, 2)).toBe(watsonYellottMm(50, 3600, 20, 2));
    expect(() => watsonYellottMm(50, 3600, Number.NaN, 2)).toThrow();
  });

  it("rejects negative luminance", () => {
    expect(() => stanleyDaviesMm(-1, 3600, 2)).toThrow();
  });
});

describe("near response", () => {
  it("is zero without vergence and linear in meter angles", () => {
    expect(nearMiosisMm(0)).toBe(0);
    expect(nearMiosisMm(-1)).toBe(0);
    expect(nearMiosisMm(3)).toBeCloseTo(3 * NEAR_RESPONSE.miosisMmPerMA, 12);
  });

  it("converts the vergence angle to meter angles (1/d on the midline)", () => {
    const d = 0.4;
    const v = 2 * Math.atan(0.0315 / d) * (180 / Math.PI);
    expect(vergenceDemandMA(v, 63)).toBeCloseTo(1 / d, 12);
    expect(vergenceDemandMA(0, 63)).toBe(0);
  });
});

describe("pupilDiameterMm", () => {
  const eye = loadPreset("navarro-1985");

  it("gives the presets the default Watson & Yellott model", () => {
    expect(eye.pupil).toEqual(DEFAULT_PUPIL);
  });

  it("subtracts the near miosis from the light-adapted diameter", () => {
    const far = { luminanceCdM2: 10, ageYears: 30, vergenceMA: 0 };
    const near = { ...far, vergenceMA: 3 };
    expect(pupilDiameterMm(eye, far)).toBeCloseTo(pupilBaseMm(eye, far), 12);
    expect(pupilBaseMm(eye, far) - pupilDiameterMm(eye, near)).toBeCloseTo(3 * NEAR_RESPONSE.miosisMmPerMA, 12);
  });

  it("never goes below the 2 mm floor", () => {
    expect(pupilDiameterMm(eye, { luminanceCdM2: 1e5, ageYears: 30, vergenceMA: 10 })).toBe(NEAR_RESPONSE.floorMm);
  });

  it("keeps the fixed model for fixtures and rejects unknown models", () => {
    const fixed = { ...eye, pupil: { model: "fixed", params: { diameterMm: 4 } } };
    expect(pupilDiameterMm(fixed, { luminanceCdM2: 1e4, ageYears: 80, vergenceMA: 4 })).toBe(4);
    expect(() => pupilDiameterMm({ ...eye, pupil: { model: "x", params: {} } }, { luminanceCdM2: 1, ageYears: 30, vergenceMA: 0 })).toThrow(/pupil model/);
    expect(() => pupilDiameterMm({ ...eye, pupil: { model: "watsonYellott2012", params: { eyes: 3, fieldAreaDeg2: 1 } } }, { luminanceCdM2: 1, ageYears: 30, vergenceMA: 0 })).toThrow(/eyes/);
  });
});
