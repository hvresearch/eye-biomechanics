import { defaultScene, deriveBinocular, loadPreset } from "@eye/eye-model";
import { describe, expect, it, vi } from "vitest";
import type { OpticsRequest } from "../src/worker/messages";

/** The next wave analysis on the request's 16 × 16 grid fails with a ChiefRayError; others run normally. */
const failures = vi.hoisted(() => ({ remaining: 0 }));
vi.mock("@eye/optics", async (importOriginal) => {
  const optics = await importOriginal<typeof import("@eye/optics")>();
  return {
    ...optics,
    analyzeWavefront: (...args: Parameters<typeof optics.analyzeWavefront>) => {
      if (failures.remaining > 0 && args[2]?.gridN === 16) {
        failures.remaining--;
        throw new optics.ChiefRayError("cornea", "aperture");
      }
      return optics.analyzeWavefront(...args);
    },
  };
});

const { handle } = await import("../src/worker/handle");

describe("worker failure isolation (Review Focus 4)", () => {
  it("returns wave: null with the error for the failing eye and keeps the other eye's results", () => {
    const eye = loadPreset("navarro-1985");
    const scene = { ...defaultScene("navarro-1985"), targetDistanceM: 6 };
    const b = deriveBinocular(scene, { left: eye, right: eye });
    const wave = { gridN: 16, psfN: 64, polychromatic: false, letterArcmin: 5, autoPrescribe: false };
    const req: OpticsRequest = {
      id: 7,
      eyes: (["right", "left"] as const).map((side) => ({
        side,
        params: eye,
        accommodationD: b[side].accommodationD,
        objectDistanceM: 6,
        pupilSemiDiamMm: b[side].pupilMm / 2,
        fanRays: 3,
        wave,
      })),
    };
    failures.remaining = 1;
    const res = handle(req);
    const [right, left] = res.eyes;
    expect(right?.wave).toBeNull();
    expect(right?.waveError).toMatch(/ChiefRayError/);
    expect(right?.waveError).toMatch(/cornea/);
    // The failing eye's paraxial readouts still arrive.
    expect(Number.isFinite(right?.defocusD)).toBe(true);
    expect(right?.fan).toHaveLength(3);
    expect(left?.wave).not.toBeNull();
    expect(left?.waveError).toBeNull();
  });

  it("fails the whole request on errors that are not wave-optics failures", () => {
    const eye = loadPreset("navarro-1985");
    const bad = { ...eye, axialLengthMm: Number.NaN };
    expect(() =>
      handle({ id: 8, eyes: [{ side: "right", params: bad, accommodationD: 0, objectDistanceM: 6, pupilSemiDiamMm: 1.5, fanRays: 0 }] }),
    ).toThrow();
  });
});
