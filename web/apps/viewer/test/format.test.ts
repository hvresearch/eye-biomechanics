import { describe, expect, it } from "vitest";
import { formatDelta, formatSigned } from "../src/ui/format";

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
