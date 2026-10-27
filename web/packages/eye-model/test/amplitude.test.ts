import { describe, expect, it } from "vitest";
import { AMPLITUDE_TABLE, amplitudeForAge } from "../src/accommodation/amplitude";

describe("amplitudeForAge (Anderson 2008)", () => {
  it("is monotone non-increasing from 6 to 90", () => {
    let prev = Number.POSITIVE_INFINITY;
    for (let age = 6; age <= 90; age += 0.5) {
      const a = amplitudeForAge(age);
      expect(a).toBeLessThanOrEqual(prev + 1e-12);
      expect(a).toBeGreaterThanOrEqual(0);
      prev = a;
    }
  });

  it("clamps below the age range to the age-6 value", () => {
    expect(amplitudeForAge(3)).toBe(amplitudeForAge(6));
    expect(amplitudeForAge(-10)).toBe(amplitudeForAge(6));
  });

  it("returns 0 above the age range", () => {
    expect(amplitudeForAge(95)).toBe(0);
    expect(amplitudeForAge(90.01)).toBe(0);
  });

  it("matches hand evaluations of the published sigmoid", () => {
    // 7.083 / (1 + exp(0.2031 (age − 36.2) − 0.6109))
    expect(amplitudeForAge(20)).toBeCloseTo(6.944, 2);
    expect(amplitudeForAge(36.2)).toBeCloseTo(7.083 / (1 + Math.exp(-0.6109)), 6);
    expect(amplitudeForAge(50)).toBeCloseTo(0.711, 2);
    expect(amplitudeForAge(60)).toBeLessThan(0.15);
  });

  it("has the shape the paper describes: flat before 20, steep 20–50, near zero after 50", () => {
    expect(amplitudeForAge(6) - amplitudeForAge(20)).toBeLessThan(0.2);
    expect(amplitudeForAge(20) - amplitudeForAge(50)).toBeGreaterThan(5);
    expect(amplitudeForAge(55)).toBeLessThan(0.3);
  });

  it("rejects NaN", () => {
    expect(() => amplitudeForAge(Number.NaN)).toThrow(RangeError);
  });

  it("is backed by a verified data file", () => {
    expect(AMPLITUDE_TABLE.verified).toBe(true);
    expect(AMPLITUDE_TABLE.doi).toBe("10.1167/iovs.07-1492");
  });
});
