import { describe, expect, it } from "vitest";
import { divergingColor, luminance, sequentialColor, symmetricLimit } from "../src/ui/optics/colormap";

describe("chart color maps", () => {
  it("puts the diverging map's neutral gray at 0 and grows lighter monotonically toward both poles", () => {
    const mid = divergingColor(0);
    expect(mid[0]).toBeCloseTo(mid[1], -1);
    for (const sign of [-1, 1]) {
      let prev = luminance(mid);
      for (let t = 0.1; t <= 1.0001; t += 0.1) {
        const l = luminance(divergingColor(sign * t));
        expect(l).toBeGreaterThan(prev);
        prev = l;
      }
    }
    // The poles are different hues (blue below, yellow above).
    const neg = divergingColor(-1);
    const pos = divergingColor(1);
    expect(neg[2]).toBeGreaterThan(neg[0]);
    expect(pos[0]).toBeGreaterThan(pos[2]);
  });

  it("clamps out-of-range and non-finite inputs", () => {
    expect(divergingColor(5)).toEqual(divergingColor(1));
    expect(divergingColor(Number.NaN)).toEqual(divergingColor(0));
    expect(sequentialColor(-1)).toEqual(sequentialColor(0));
  });

  it("makes the sequential ramp monotone in lightness", () => {
    let prev = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const l = luminance(sequentialColor(t));
      expect(l).toBeGreaterThan(prev);
      prev = l;
    }
  });

  it("takes a symmetric limit from the largest finite magnitude", () => {
    expect(symmetricLimit([0.1, -0.4, Number.NaN, 0.3])).toBe(0.4);
    expect(symmetricLimit([0, 0])).toBeGreaterThan(0);
  });
});
