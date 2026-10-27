import { describe, expect, it } from "vitest";
import { readoutTooltips } from "../src/ui/tooltips";

describe("readoutTooltips", () => {
  const t = readoutTooltips(3.5);

  it("labels every readout that rests on a modeling approximation", () => {
    for (const key of ["defocus", "bestFocus", "accommodation", "ciliaryActivation", "paraxialPower", "pupil"] as const) {
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
});
