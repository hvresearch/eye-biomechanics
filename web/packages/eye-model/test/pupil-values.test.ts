import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { watsonYellottMm } from "../src/pupil/watsonYellott";

/**
 * Shared fixture for the Python pupil formula (science/eyebiomech/predict/acuity.py): Watson &
 * Yellott diameters of the eye model at fixed inputs. Regenerate with UPDATE_PUPIL_FIXTURE=1.
 */
const FILE = resolve(import.meta.dirname, "../../../../data/oracle/pupil-values.json");
const INPUTS: Array<[number, number, number, 1 | 2]> = [
  [100, 3600, 30, 2],
  [100, 3600, 6, 2],
  [100, 3600, 70, 2],
  [1, 3600, 25, 2],
  [1000, 100, 50, 1],
  [10, 10, 90, 1],
];

function table() {
  return {
    description: "Watson & Yellott 2012 pupil diameters from web/packages/eye-model/src/pupil/watsonYellott.ts; see web/packages/eye-model/test/pupil-values.test.ts",
    values: INPUTS.map(([luminanceCdM2, fieldDeg2, ageYears, eyes]) => ({ luminanceCdM2, fieldDeg2, ageYears, eyes, diameterMm: watsonYellottMm(luminanceCdM2, fieldDeg2, ageYears, eyes) })),
  };
}

describe("shared pupil fixture (data/oracle/pupil-values.json)", () => {
  it("matches the eye model", () => {
    const fresh = table();
    if (process.env.UPDATE_PUPIL_FIXTURE === "1" || !existsSync(FILE)) writeFileSync(FILE, JSON.stringify(fresh, null, 1) + "\n");
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(fresh);
  });
});
