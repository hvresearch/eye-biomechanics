import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { zernikeCount, zernikeValue } from "../src/math/zernike";

/**
 * Shared fixture for the Python Zernike polynomials (science/eyebiomech/zernike.py): values of
 * Z_j(ρ, θ) for j < 45 at 20 fixed points. Regenerate with UPDATE_ZERNIKE_FIXTURE=1.
 */
const FILE = resolve(import.meta.dirname, "../../../../data/oracle/zernike-values.json");
const POINTS = Array.from({ length: 20 }, (_, i) => ({ rho: (i + 0.5) / 20, theta: -Math.PI + (2 * Math.PI * (i * 7 % 20)) / 20 + 0.1 }));

function table() {
  const n = zernikeCount(8);
  return {
    description: "OSA/ANSI Zernike values Z_j(rho, theta) from web/packages/optics/src/math/zernike.ts (theta from +x toward +y); see web/packages/optics/test/zernike-values.test.ts",
    points: POINTS,
    values: POINTS.map((p) => Array.from({ length: n }, (_, j) => zernikeValue(j, p.rho, p.theta))),
  };
}

describe("shared Zernike fixture (data/oracle/zernike-values.json)", () => {
  it("matches the TypeScript polynomials", () => {
    const fresh = table();
    if (process.env.UPDATE_ZERNIKE_FIXTURE === "1" || !existsSync(FILE)) writeFileSync(FILE, JSON.stringify(fresh, null, 1) + "\n");
    const committed = JSON.parse(readFileSync(FILE, "utf8")) as ReturnType<typeof table>;
    expect(committed.points).toEqual(fresh.points);
    committed.values.forEach((row, i) => row.forEach((v, j) => expect(Math.abs(v - fresh.values[i]![j]!)).toBeLessThan(1e-12)));
  });
});
