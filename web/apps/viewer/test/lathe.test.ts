import { buildSurfaces, deriveEyeState, loadPreset, pupilDiameterMm, type SceneState } from "@eye/eye-model";
import { describe, expect, it } from "vitest";
import { LATHE_SEGMENTS, lathe } from "../src/scene/lathe";
import { globeProfiles } from "../src/scene/profiles";

const scene: SceneState = {
  targetDistanceM: 0.33,
  targetDirectionDeg: { x: 0, y: 0 },
  luminanceCdM2: 100,
  ageYears: 30,
  ipdMm: 63,
  timeS: 0,
  preset: "navarro-1985",
};

const profiles = () => {
  const eye = loadPreset("navarro-1985");
  return globeProfiles(buildSurfaces(eye, deriveEyeState(scene, eye, "right")), eye.axialLengthMm, eye.retina.radiusMm, pupilDiameterMm(eye));
};

describe("lathe", () => {
  it("builds only the kept half (x ≤ 0) about the world z axis", () => {
    for (const [name, profile] of Object.entries(profiles())) {
      const pos = lathe(profile).getAttribute("position");
      expect(pos.count, name).toBe(profile.length * (LATHE_SEGMENTS + 1));
      for (let i = 0; i < pos.count; i++) {
        const [r, z] = profile[i % profile.length] ?? [Number.NaN, Number.NaN];
        expect(pos.getX(i), name).toBeLessThanOrEqual(1e-9);
        expect(Math.hypot(pos.getX(i), pos.getY(i)), name).toBeCloseTo(Math.max(0, r), 5);
        expect(pos.getZ(i), name).toBeCloseTo(z, 5);
      }
    }
  });

  it("keeps the generated normals consistent with the face winding", () => {
    const g = lathe(profiles().lens);
    const own = Float32Array.from(g.getAttribute("normal").array);
    g.computeVertexNormals();
    const fromFaces = g.getAttribute("normal").array;
    let inverted = 0;
    for (let i = 0; i < own.length; i += 3) {
      const dot = (own[i] ?? 0) * (fromFaces[i] ?? 0) + (own[i + 1] ?? 0) * (fromFaces[i + 1] ?? 0) + (own[i + 2] ?? 0) * (fromFaces[i + 2] ?? 0);
      if (dot < 0) inverted++;
    }
    expect(inverted).toBe(0);
  });

  it("builds all eight cutaway structures within a frame budget", () => {
    const p = profiles();
    const run = () => {
      for (const profile of Object.values(p)) lathe(profile).dispose();
    };
    run(); // warm up
    let best = Number.POSITIVE_INFINITY;
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      run();
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(16);
  });
});
