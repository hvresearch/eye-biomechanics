import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { EyeParameters, MuscleGeometry, Surface } from "../src/schema/types";

/**
 * Guard against the hand-written types drifting from the schema: every property the
 * schema declares must be a key of a fully populated object of the TS type, and the
 * fully populated object must validate. Adding a property to one side without the other
 * fails here.
 */

const schema = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../../../schemas/eye-parameters.schema.json"), "utf8"),
) as {
  properties: Record<string, unknown>;
  $defs: Record<string, { properties: Record<string, unknown> }>;
};

const surface: Required<Surface> = {
  name: "s",
  type: "conic",
  radiusMm: 1,
  rxMm: 1,
  ryMm: 1,
  axisDeg: 0,
  conic: 0,
  conicX: 0,
  conicY: 0,
  zernikeHeight: { normRadiusMm: 1, coeffsMicrons: [] },
  tilt: { xDeg: 0, yDeg: 0 },
  decenter: { xMm: 0, yMm: 0 },
  thicknessToNextMm: 1,
  mediumAfter: { name: "m", index555: 1, dispersion: {} },
  apertureSemiDiamMm: 1,
};

const muscle: Required<MuscleGeometry> = {
  name: "medialRectus",
  originMm: [0, 0, 0],
  pulleyMm: null,
  insertionDistFromLimbusMm: 5.5,
  insertionWidthMm: 10,
  tendon: { stiffnessNPerMm: 1, slackLengthMm: 1 },
};

const full: Required<EyeParameters> = {
  schemaVersion: "1.0.0",
  id: "x",
  label: "x",
  provenance: { source: "", citation: "", generatedBy: "", gitHash: "", date: "", verified: false },
  surfaces: [surface, surface],
  pupil: { model: "fixed", params: {} },
  axialLengthMm: 24,
  retina: { radiusMm: -12, conic: 0 },
  age: 30,
  interpupillaryDistanceMm: 63,
  lensAccommodationModel: { form: "navarro1985", coefficients: {} },
  visualAxis: { alphaDeg: 0, kappaDeg: 0 },
  pupilDecenterMm: { x: 0, y: 0 },
  extraocularMuscles: [muscle, muscle, muscle, muscle, muscle, muscle],
  eyelid: null,
};

describe("types.ts mirrors the schema", () => {
  it("top-level keys match", () => {
    expect(Object.keys(full).sort()).toEqual(Object.keys(schema.properties).sort());
  });
  it("Surface keys match", () => {
    expect(Object.keys(surface).sort()).toEqual(Object.keys(schema.$defs.Surface?.properties ?? {}).sort());
  });
  it("MuscleGeometry keys match", () => {
    expect(Object.keys(muscle).sort()).toEqual(Object.keys(schema.$defs.MuscleGeometry?.properties ?? {}).sort());
  });
  it("Medium and Provenance keys match", () => {
    expect(Object.keys(surface.mediumAfter).sort()).toEqual(Object.keys(schema.$defs.Medium?.properties ?? {}).sort());
    expect(Object.keys(full.provenance).sort()).toEqual(Object.keys(schema.$defs.Provenance?.properties ?? {}).sort());
  });
  it("the fully populated document validates", async () => {
    const { validateEyeParameters } = await import("../src/schema/validate");
    const r = validateEyeParameters(full);
    expect(r.ok, r.ok ? "" : r.errors.join("; ")).toBe(true);
  });
});
