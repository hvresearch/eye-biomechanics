import { describe, expect, it } from "vitest";
import { presetTable } from "@eye/eye-model";
import { decompositionTooltip, gazeTooltip, heatMapTooltip, inducedTooltip, muscleTooltip, opticsTooltips, readoutTooltips, spectaclesTooltip, vergenceTooltip } from "../src/ui/tooltips";

describe("readoutTooltips", () => {
  const t = readoutTooltips(3.5, "fixed");

  it("labels every readout that rests on a modeling approximation", () => {
    for (const key of ["defocus", "bestFocus", "accommodation", "demand", "ciliaryActivation", "paraxialPower", "pupil"] as const) {
      expect(t[key], key).toMatch(/^Approximation: /);
    }
  });

  it("names the homogeneous lens index wherever the optics depend on it", () => {
    for (const key of ["defocus", "bestFocus", "paraxialPower"] as const) {
      expect(t[key], key).toMatch(/homogeneous lens index/i);
    }
  });

  it("quotes the traced pupil rather than a fixed diameter", () => {
    expect(t.defocus).toContain("3.5 mm pupil");
    expect(t.bestFocus).toContain("3.5 mm pupil");
  });

  it("says that ages above 70 extrapolate the Anderson fit", () => {
    expect(t.amplitude).toContain("70");
    expect(t.amplitude).toMatch(/extrapolat/);
  });

  it("names the far-point approximation behind demand", () => {
    expect(t.demand).toMatch(/paraxial/);
    expect(t.demand).toMatch(/homogeneous lens index/i);
  });

  it("names the document's pupil model", () => {
    expect(t.pupil).toContain("fixed");
  });

  it("lists the document's unverified lens-model coefficients in the defocus tooltip", () => {
    const unverified = presetTable("navarro-1985").accommodation?.unverified ?? [];
    expect(unverified).toEqual(["anteriorConicPerLn", "posteriorConicPerLn"]);
    const tips = readoutTooltips(3.5, "fixed", unverified);
    for (const key of unverified) expect(tips.defocus).toContain(key);
    expect(tips.defocus).toMatch(/unverified/);
    expect(t.defocus).not.toMatch(/unverified/);
  });
});

describe("muscle and vergence tooltips", () => {
  it("label the length-proxy activation and the geometry approximations", () => {
    expect(muscleTooltip()).toMatch(/^Approximation: length-proxy activation/);
    expect(muscleTooltip()).toMatch(/pulley/);
    expect(vergenceTooltip()).toMatch(/^Approximation: /);
  });

  it("label the gaze readout's center of rotation", () => {
    expect(gazeTooltip()).toMatch(/^Approximation: /);
    expect(gazeTooltip()).toMatch(/globe center/);
  });
});

describe("optics tooltips", () => {
  const t = opticsTooltips();
  it("label every wave-optics readout as an approximation and name what it rests on", () => {
    for (const [key, text] of Object.entries(t)) expect(text, key).toMatch(/^Approximation: /);
    for (const key of ["wavefront", "zernike", "refraction", "rms", "figures"] as const) expect(t[key], key).toMatch(/1 mm in front of the cornea/);
    for (const key of ["zernike", "psf", "rms", "strehl"] as const) expect(t[key], key).toMatch(/order-8|order 8/);
    for (const key of ["wavefront", "psf", "mtf", "strehl", "refraction"] as const) expect(t[key], key).toMatch(/homogeneous lens index/i);
    expect(spectaclesTooltip()).toMatch(/^Approximation: /);
    expect(decompositionTooltip()).toMatch(/^Approximation: /);
  });

  it("names the pupil formula and its unverified coefficients", () => {
    const p = readoutTooltips(3, "watsonYellott2012").pupil;
    expect(p).toMatch(/^Approximation: Watson & Yellott 2012/);
    expect(p).toMatch(/unverified/);
  });
});

describe("biomechanics tooltips", () => {
  it("labels the induced refraction as an elastic approximation", () => {
    const t = inducedTooltip();
    expect(t.startsWith("Approximation:")).toBe(true);
    expect(t).toMatch(/elastic/);
    expect(t).toMatch(/stress-free/);
    expect(t).toMatch(/fixed optic-nerve cap/);
    expect(t).toMatch(/torque balancing changes the lateral and medial rectus forces/);
  });
  it("says what the heat map shows and how it is exaggerated", () => {
    const t = heatMapTooltip(50);
    expect(t).toMatch(/^Approximation: /);
    expect(t).toMatch(/fixed optic-nerve cap/);
    expect(t).toMatch(/orbital reaction/);
    expect(t).toMatch(/rigid motion/);
    expect(t).toMatch(/×50/);
    expect(t).toMatch(/IOP-only/);
  });
});
