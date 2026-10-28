import { describe, expect, it } from "vitest";
import { nelderMead } from "../src/lenses/nelderMead";

describe("nelderMead", () => {
  it("minimizes the Rosenbrock function", () => {
    const f = ([x = 0, y = 0]: number[]) => (1 - x) ** 2 + 100 * (y - x * x) ** 2;
    const r = nelderMead(f, [-1.2, 1], { step: [0.5, 0.5], tolerance: 1e-14, maxEvaluations: 4000 });
    expect(Math.abs((r.x[0] ?? 0) - 1)).toBeLessThan(1e-6);
    expect(Math.abs((r.x[1] ?? 0) - 1)).toBeLessThan(1e-6);
  });

  it("minimizes a shifted quadratic in three dimensions and counts evaluations", () => {
    const f = (x: number[]) => (x[0]! - 1) ** 2 + 2 * (x[1]! + 2) ** 2 + 3 * (x[2]! - 0.5) ** 2;
    const r = nelderMead(f, [0, 0, 0], { step: [1, 1, 1], tolerance: 1e-16, maxEvaluations: 2000 });
    expect(r.fx).toBeLessThan(1e-10);
    expect(r.evaluations).toBeLessThanOrEqual(2000);
  });
});
