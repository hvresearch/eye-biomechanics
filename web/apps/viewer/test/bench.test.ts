import { SCENE_DEFAULTS, defaultScene, deriveBinocular, loadPreset } from "@eye/eye-model";
import { SPECTACLE_DEFAULTS } from "@eye/optics";
import { describe, expect, it } from "vitest";
import { WAVE_REQUEST } from "../src/store/scene";
import { handle } from "../src/worker/handle";
import type { OpticsRequest } from "../src/worker/messages";

/** Worker budget for results at the spec's 64 × 64 pupil grid and 256 PSF grid (spec §6.6), ms. */
const BUDGET_MS = 100;

describe("worker budget", () => {
  it(`computes both eyes with right-eye wave optics, corrected and uncorrected, in under ${BUDGET_MS} ms (median of 5)`, () => {
    const eye = loadPreset("navarro-1985");
    const scene = { ...defaultScene("navarro-1985"), targetDistanceM: SCENE_DEFAULTS.targetDistanceM };
    const b = deriveBinocular(scene, { left: eye, right: eye });
    const spectacles = { sphereD: -0.5, cylinderD: -0.25, axisDeg: 90, ...SPECTACLE_DEFAULTS };
    const req: OpticsRequest = {
      id: 1,
      eyes: (["right", "left"] as const).map((side) => ({
        side,
        params: eye,
        accommodationD: b[side].accommodationD,
        objectDistanceM: b[side].targetDistanceM,
        pupilSemiDiamMm: b[side].pupilMm / 2,
        fanRays: side === "right" ? 15 : 0,
        spectacles,
        corrected: true,
        wave: side === "right" ? WAVE_REQUEST : null,
      })),
    };
    // Each run sees a slightly different pupil, as during an interaction, so per-layout caches
    // (fit factorization, diffraction-limited PSF) are shared only within a request, never across runs.
    const run = (k: number) =>
      handle({ ...req, eyes: req.eyes.map((e) => ({ ...e, pupilSemiDiamMm: e.pupilSemiDiamMm + 0.001 * (k + 1) })) }).elapsedMs;
    run(-0.5); // warm up
    run(-0.25);
    const times = Array.from({ length: 5 }, (_, k) => run(k)).sort((x, y) => x - y);
    process.stdout.write(`worker times (ms): ${times.map((t) => t.toFixed(1)).join(", ")}\n`);
    expect(times[2]!).toBeLessThan(BUDGET_MS);
  });
});
