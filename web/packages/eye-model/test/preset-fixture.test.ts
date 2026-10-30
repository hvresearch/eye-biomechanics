import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPreset } from "../src/presets/load";
import { validateEyeParameters } from "../src/schema/validate";

/**
 * The relaxed navarro-1985 preset as the eye model builds it (surfaces, lens accommodation
 * model, muscles, visual axis), committed for the Python FEM so the committed biomechanics
 * result carries a lens that accommodates in the viewer (M4 follow-up; M5 plan, Task 5.5).
 * Regenerate with UPDATE_PRESET_FIXTURE=1.
 */
const FILE = resolve(import.meta.dirname, "../../../../data/fixtures/navarro-1985-preset.eye.json");

describe("preset fixture (data/fixtures/navarro-1985-preset.eye.json)", () => {
  it("is the eye model's navarro-1985 preset", () => {
    const fresh = loadPreset("navarro-1985");
    if (process.env.UPDATE_PRESET_FIXTURE === "1" || !existsSync(FILE)) writeFileSync(FILE, JSON.stringify(fresh, null, 1) + "\n");
    const committed: unknown = JSON.parse(readFileSync(FILE, "utf8"));
    expect(committed).toEqual(fresh);
    expect(validateEyeParameters(committed).ok).toBe(true);
    expect(fresh.lensAccommodationModel).toBeDefined();
  });
});
