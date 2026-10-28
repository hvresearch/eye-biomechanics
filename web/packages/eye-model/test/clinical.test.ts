import { powerVectors, sphereCylFromPowerVectors } from "@eye/optics";
import { describe, expect, it } from "vitest";
import { clinicalAxisDeg, localAxisDeg, toClinicalRefraction } from "../src/optics/clinical";

describe("TABO axes", () => {
  it("maps the local frame to TABO for each eye", () => {
    expect(clinicalAxisDeg(30, "right")).toBe(150);
    expect(clinicalAxisDeg(30, "left")).toBe(30);
    expect(clinicalAxisDeg(180, "right")).toBe(180);
    expect(clinicalAxisDeg(90, "right")).toBe(90);
    expect(clinicalAxisDeg(0, "left")).toBe(180);
  });

  it("round-trips for both sides and stays in (0, 180]", () => {
    for (const side of ["left", "right"] as const) {
      for (let a = 0.5; a <= 180; a += 7.25) {
        const t = clinicalAxisDeg(a, side);
        expect(t).toBeGreaterThan(0);
        expect(t).toBeLessThanOrEqual(180);
        expect(localAxisDeg(t, side)).toBeCloseTo(a, 12);
      }
    }
  });

  it("gives mirror-symmetric eyes TABO axes that sum to 180", () => {
    for (const local of [20, 45, 75, 120]) expect(clinicalAxisDeg(local, "right") + clinicalAxisDeg(local, "left")).toBeCloseTo(180, 12);
  });

  it("converts a refraction's axis and J45 consistently", () => {
    const pv = powerVectors(-1, -1.5, 30);
    const r = { ...sphereCylFromPowerVectors(pv.M, pv.J0, pv.J45), ...pv };
    const c = toClinicalRefraction(r, "right");
    expect(c.axisDeg).toBeCloseTo(150, 9);
    const back = sphereCylFromPowerVectors(c.M, c.J0, c.J45);
    expect(back.axisDeg).toBeCloseTo(c.axisDeg, 9);
    expect(toClinicalRefraction(r, "left")).toEqual(r);
  });
});
