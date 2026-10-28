import { describe, expect, it } from "vitest";
import {
  LAG_TABLE,
  MIN_TARGET_DISTANCE_M,
  accommodationResponse,
  defaultLag,
  demandFromDistance,
} from "../src/accommodation/controller";

describe("demandFromDistance", () => {
  it("is 0 D at infinity for an emmetrope", () => {
    expect(demandFromDistance(Number.POSITIVE_INFINITY, 0)).toBe(0);
  });
  it("is 2 D at 0.5 m", () => {
    expect(demandFromDistance(0.5, 0)).toBeCloseTo(2, 12);
  });
  it("clamps a zero distance to the minimum without NaN", () => {
    const d = demandFromDistance(0, 0);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeCloseTo(1 / MIN_TARGET_DISTANCE_M, 12);
    expect(MIN_TARGET_DISTANCE_M).toBe(0.05);
  });
  it("subtracts the far-point vergence: a 3 D myope at 0.333 m has zero demand", () => {
    expect(demandFromDistance(1 / 3, -3)).toBeCloseTo(0, 12);
  });
  it("adds demand for a hyperope and never goes negative", () => {
    expect(demandFromDistance(Number.POSITIVE_INFINITY, 2)).toBe(2);
    expect(demandFromDistance(Number.POSITIVE_INFINITY, -3)).toBe(0);
  });
  it("rejects negative or NaN distances", () => {
    expect(() => demandFromDistance(-1, 0)).toThrow(RangeError);
    expect(() => demandFromDistance(Number.NaN, 0)).toThrow(RangeError);
  });
});

describe("accommodationResponse", () => {
  it("applies the default lag above onset: 3 D demand → 2.7 D", () => {
    expect(accommodationResponse(3, 10)).toBeCloseTo(3 - 0.15 * (3 - 1), 12);
  });
  it("has no lag below onset", () => {
    expect(defaultLag(0.5)).toBe(0);
    expect(accommodationResponse(0.5, 10)).toBe(0.5);
  });
  it("never exceeds the amplitude", () => {
    expect(accommodationResponse(8, 2)).toBe(2);
    expect(accommodationResponse(8, 0)).toBe(0);
  });
  it("never goes negative", () => {
    expect(accommodationResponse(0, 5)).toBe(0);
    expect(accommodationResponse(1, 5, () => 4)).toBe(0);
  });
  it("accepts a custom lag model", () => {
    expect(accommodationResponse(3, 10, (d) => 0.5 * d)).toBeCloseTo(1.5, 12);
  });
  it("is flagged as an assumption in the data file", () => {
    expect(LAG_TABLE.verified).toBe(false);
    expect(LAG_TABLE.citation).toMatch(/assumption/);
  });
});
