import { describe, expect, it } from "vitest";
import { presetTable } from "@eye/eye-model";
import { appliedPredictionTooltip, decompositionTooltip, hasTiltOrDecenter, pupilDetail, gazeTooltip, heatMapTooltip, inducedTooltip, muscleTooltip, opticsTooltips, readoutTooltips, spectaclesTooltip, timelineTooltip, vergenceTooltip } from "../src/ui/tooltips";

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

  it("names the far-point measure behind demand: the minimum-RMS refraction auto-prescribe zeroes", () => {
    expect(t.demand).toMatch(/minimum-RMS refraction/);
    expect(t.demand).toMatch(/auto-prescribe/);
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
    expect(t).toMatch(/static equilibrium with a linear passive orbital moment/);
  });
  it("says what the heat map shows and how it is exaggerated", () => {
    const t = heatMapTooltip(50);
    expect(t).toMatch(/^Approximation: /);
    expect(t).toMatch(/fixed optic-nerve cap/);
    expect(t).toMatch(/orbital reaction/);
    expect(t).toMatch(/rigid motion/);
    expect(t).toMatch(/×50/);
    expect(t).toMatch(/IOP-only/);
    expect(t).toMatch(/relative to the lens/);
  });
});

describe("prediction tooltips", () => {
  it("labels the timeline an approximation of a remodeled model with parameter-only bands", () => {
    const t = timelineTooltip();
    expect(t.startsWith("Approximation:")).toBe(true);
    expect(t).toMatch(/remodeled/);
    expect(t).toMatch(/linear superposition about the pressurized eye/);
    expect(t).toMatch(/parameter uncertainty only/);
    expect(t).toMatch(/A hypothesis test, not a clinical prediction/);
    expect(t).toMatch(/onset markers are where the plotted median crosses/);
  });
  it("carries the grid's calibration summary instead of hard-coded findings", () => {
    const t = timelineTooltip({ stance: "Calibrated to X only.", finding: "Found Y." });
    expect(t.endsWith(" Calibrated to X only. Found Y.")).toBe(true);
    expect(t).not.toMatch(/prior's floor/);
  });
  it("says the applied prediction is a corneal change", () => {
    const t = appliedPredictionTooltip();
    expect(t.startsWith("Approximation:")).toBe(true);
    expect(t).toMatch(/applied to the eye as a corneal change/);
  });
});

describe("near-miosis detail", () => {
  it("shows nearMiosisMm of the vergence demand, not base minus final", () => {
    // 2 MA asks for 0.61 mm (0.305 mm per MA, data/pupil/near-response.json).
    const t = pupilDetail(5, 4.39, 2);
    expect(t).toContain("near miosis 0.61 mm at 2.00 MA");
    expect(t).not.toMatch(/floor/);
  });

  it("says when the 2 mm floor binds", () => {
    // Base 2.3 mm minus 0.61 mm would be 1.69 mm: the floor holds the pupil at 2 mm.
    const t = pupilDetail(2.3, 2, 2);
    expect(t).toContain("near miosis 0.61 mm");
    expect(t).toMatch(/2 mm floor binds/);
    expect(t).not.toMatch(/-0\./);
  });
});

describe("tilt and decenter", () => {
  it("detects tilted or decentered surfaces", () => {
    const doc = { surfaces: [{ tilt: { xDeg: 0, yDeg: 0 }, decenter: { xMm: 0, yMm: 0 } }, {}] } as unknown as Parameters<typeof hasTiltOrDecenter>[0];
    expect(hasTiltOrDecenter(doc)).toBe(false);
    expect(hasTiltOrDecenter({ surfaces: [{ tilt: { xDeg: 2, yDeg: 0 } }] } as unknown as Parameters<typeof hasTiltOrDecenter>[0])).toBe(true);
    expect(hasTiltOrDecenter({ surfaces: [{ decenter: { xMm: 0, yMm: 0.1 } }] } as unknown as Parameters<typeof hasTiltOrDecenter>[0])).toBe(true);
  });

  it("labels the paraxial readouts (power, accommodation's lens solve, the decomposition's far points) only when the eye is tilted or decentered", () => {
    const plain = readoutTooltips(3, "fixed");
    const tilted = readoutTooltips(3, "fixed", [], true);
    // Demand's far point is traced exactly, tilt and decenter included.
    expect(tilted.demand).not.toContain("ignores surface tilt");
    for (const key of ["paraxialPower", "accommodation"] as const) {
      expect(plain[key]).not.toContain("ignores surface tilt and decenter");
      expect(tilted[key]).toContain("Approximation: ignores surface tilt and decenter");
    }
    expect(decompositionTooltip()).not.toContain("tilt");
    expect(decompositionTooltip(true)).toContain("Approximation: ignores surface tilt and decenter");
  });
});
