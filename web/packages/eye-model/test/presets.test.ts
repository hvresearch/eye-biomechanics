import { describe, expect, it } from "vitest";
import { PRESET_NAMES, PresetNotTranscribedError, loadPreset } from "../src/presets/load";
import { validateEyeParameters } from "../src/schema/validate";

describe("loadPreset", () => {
  it("lists both presets", () => {
    expect(PRESET_NAMES).toEqual(["navarro-1985", "zapata-diaz-2019"]);
  });

  it("loads the Navarro 1985 table as a valid EyeParameters document", () => {
    const eye = loadPreset("navarro-1985");
    expect(validateEyeParameters(eye).ok).toBe(true);
    expect(eye.surfaces.map((s) => s.name)).toEqual([
      "cornea.anterior",
      "cornea.posterior",
      "lens.anterior",
      "lens.posterior",
    ]);
    expect(eye.surfaces[0]?.mediumAfter.index555).toBe(1.376);
    expect(eye.axialLengthMm).toBe(24);
    expect(eye.lensAccommodationModel?.form).toBe("navarro1985");
    expect(eye.provenance.citation).toContain("Navarro");
  });

  it("returns a fresh object each call", () => {
    const a = loadPreset("navarro-1985");
    const b = loadPreset("navarro-1985");
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("throws a clear error for the untranscribed Zapata-Díaz table", () => {
    expect(() => loadPreset("zapata-diaz-2019")).toThrow(PresetNotTranscribedError);
    expect(() => loadPreset("zapata-diaz-2019")).toThrow(/zapata-diaz-2019/);
  });
});
