import { describe, expect, it } from "vitest";
import { muscleTooltip, readoutTooltips, vergenceTooltip } from "../src/ui/tooltips";

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
});

describe("muscle and vergence tooltips", () => {
  it("label the length-proxy activation and the geometry approximations", () => {
    expect(muscleTooltip()).toMatch(/^Approximation: length-proxy activation/);
    expect(muscleTooltip()).toMatch(/pulley/);
    expect(vergenceTooltip()).toMatch(/^Approximation: /);
  });
});
