import { DEFAULT_LAUNCH_OFFSET_MM, pupilBundle, traceRay } from "@eye/optics";
import { describe, expect, it } from "vitest";
import { buildSurfacesAt } from "../src/build/surfaces";
import { PUPIL_PLANE_OFFSET_MM, VISUAL_AXIS_DEFAULTS, eyeView, onAxisView } from "../src/optics/view";
import { loadPreset } from "../src/presets/load";

describe("eyeView", () => {
  it("uses the optics pupil plane convention", () => {
    expect(PUPIL_PLANE_OFFSET_MM).toBe(DEFAULT_LAUNCH_OFFSET_MM);
  });

  it("gives the presets angle alpha and a centered pupil (unverified defaults)", () => {
    const eye = loadPreset("navarro-1985");
    expect(eye.visualAxis?.alphaDeg).toBe(VISUAL_AXIS_DEFAULTS.alphaDeg);
    expect(VISUAL_AXIS_DEFAULTS.verified).toBe(false);
    const v = eyeView(eye, 6, 3);
    expect(v.fieldDeg).toEqual({ x: 5, y: 0 });
    expect(v.pupilRadiusMm).toBe(1.5);
    expect(v.pupilPlaneZMm).toBe(-1);
  });

  it("puts the fovea temporal of the optical axis (the chief ray lands at +x on the retina)", () => {
    const eye = loadPreset("navarro-1985");
    const s = buildSurfacesAt(eye, 0);
    const b = pupilBundle(eyeView(eye, Number.POSITIVE_INFINITY, 3), 3, 555);
    const r = traceRay(b.chief, s, 1);
    expect(r.vignetted).toBe(false);
    const retina = r.hits[r.hits.length - 1];
    expect(retina?.surface).toBe("retina");
    expect(retina?.point[0]).toBeGreaterThan(1); // ≈ 17 mm × tan 5° ≈ 1.4 mm
    expect(retina?.point[0]).toBeLessThan(2);
  });

  it("looks along the optical axis without a visual axis", () => {
    const { visualAxis: _v, ...eye } = loadPreset("navarro-1985");
    expect(eyeView(eye, 1, 4).fieldDeg).toEqual({ x: 0, y: 0 });
    expect(onAxisView(1, 4).fieldDeg).toEqual({ x: 0, y: 0 });
  });
});
