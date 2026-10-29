import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { amplitudeForAge } from "../src/accommodation/amplitude";
import { accommodationResponse, demandFromDistance } from "../src/accommodation/controller";

/**
 * Shared fixture for the Python accommodation functions (science/eyebiomech/accommodation.py):
 * amplitudes, demands, and responses of the TypeScript eye model at fixed inputs. Regenerate
 * with UPDATE_ACCOMMODATION_FIXTURE=1.
 */
const FILE = resolve(import.meta.dirname, "../../../../data/oracle/accommodation-values.json");
const AGES = [3, 6, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90, 95];
const DISTANCES = [Number.POSITIVE_INFINITY, 6, 1, 0.5, 0.35, 0.25, 0.1, 0.02];
const PAIRS = [
  [0, 5],
  [0.5, 5],
  [1, 5],
  [2, 5],
  [2.857142857142857, 5],
  [3, 2],
  [4, 1],
  [6, 8],
];

function table() {
  return {
    description: "Accommodation values of web/packages/eye-model/src/accommodation (amplitude by age; demand by target distance with an emmetropic far point; response by demand and amplitude); see web/packages/eye-model/test/accommodation-values.test.ts",
    amplitude: AGES.map((age) => ({ ageYears: age, amplitudeD: amplitudeForAge(age) })),
    demand: DISTANCES.map((d) => ({ distanceM: Number.isFinite(d) ? d : null, demandD: demandFromDistance(d, 0) })),
    response: PAIRS.map(([demandD, amplitudeD]) => ({ demandD, amplitudeD, responseD: accommodationResponse(demandD!, amplitudeD!) })),
  };
}

describe("shared accommodation fixture (data/oracle/accommodation-values.json)", () => {
  it("matches the TypeScript eye model", () => {
    const fresh = table();
    if (process.env.UPDATE_ACCOMMODATION_FIXTURE === "1" || !existsSync(FILE)) writeFileSync(FILE, JSON.stringify(fresh, null, 1) + "\n");
    expect(JSON.parse(readFileSync(FILE, "utf8"))).toEqual(JSON.parse(JSON.stringify(fresh)));
  });
});
