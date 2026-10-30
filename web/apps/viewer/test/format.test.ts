import { describe, expect, it } from "vitest";
import { formatDelta, formatSigned, inducedReadouts } from "../src/ui/format";

describe("formatDelta", () => {
  it("signs changes and shows a true minus", () => {
    expect(formatDelta(0.04)).toBe("+0.04");
    expect(formatDelta(-1.234)).toBe("−1.23");
  });

  it("shows no sign for values that round to zero", () => {
    expect(formatDelta(-0)).toBe("0.00");
    expect(formatDelta(-0.004)).toBe("0.00");
    expect(formatDelta(0.0049)).toBe("0.00");
  });

  it("formats with a chosen precision", () => {
    expect(formatSigned(-0.125, 3)).toBe("−0.125");
    expect(formatSigned(2, 1)).toBe("+2.0");
  });
});

describe("induced-refraction readouts", () => {
  const delta = { M: -0.01, J0: 0.02, J45: 0, sphereD: 0.01, cylinderD: -0.04, axisDeg: 90 };
  it("read \"no reference\" in all three without a sidecar", () => {
    expect(inducedReadouts(null, false)).toEqual({ sphere: "no reference", cylinder: "no reference", vectors: "no reference" });
  });
  it("wait for the worker when there is a reference", () => {
    expect(inducedReadouts(null, true)).toEqual({ sphere: "…", cylinder: "…", vectors: "…" });
  });
  it("format the change", () => {
    expect(inducedReadouts({ delta }, true)).toEqual({ sphere: "+0.010", cylinder: "−0.040 × 90", vectors: "−0.010 +0.020 0.000" });
  });
});
