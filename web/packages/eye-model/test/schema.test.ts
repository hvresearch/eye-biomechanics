import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateEyeParameters } from "../src/schema/validate";

const fixture = (): Record<string, unknown> =>
  JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../../../../data/fixtures/emmetrope-right.eye.json"), "utf8"),
  ) as Record<string, unknown>;

describe("validateEyeParameters", () => {
  it("accepts the emmetrope fixture", () => {
    const r = validateEyeParameters(fixture());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.surfaces.length).toBe(4);
  });

  it("rejects a different major version with the version in the message", () => {
    const r = validateEyeParameters({ ...fixture(), schemaVersion: "2.0.0" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("version");
      expect(r.errors.some((e) => e.includes("2.0.0"))).toBe(true);
    }
  });

  it.each(["1", "1e0.0.0", " 1.0.0", "1.0", "1.0.0-beta"])(
    "rejects malformed schemaVersion %j naming schemaVersion",
    (v) => {
      const r = validateEyeParameters({ ...fixture(), schemaVersion: v });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.some((e) => e.includes("schemaVersion"))).toBe(true);
    },
  );

  it("rejects a missing surfaces array", () => {
    const { surfaces: _surfaces, ...rest } = fixture();
    expect(validateEyeParameters(rest).ok).toBe(false);
  });

  it("rejects unknown top-level keys", () => {
    const r = validateEyeParameters({ ...fixture(), bogus: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("bogus"))).toBe(true);
  });

  it("rejects a toric surface lacking axisDeg", () => {
    const doc = fixture();
    const surfaces = [...(doc.surfaces as Record<string, unknown>[])];
    const { radiusMm: _r, ...base } = surfaces[0] as Record<string, unknown>;
    surfaces[0] = { ...base, type: "toric", rxMm: 7.7, ryMm: 7.9 };
    const r = validateEyeParameters({ ...doc, surfaces });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.includes("axisDeg"))).toBe(true);
  });

  it("never throws on non-object input", () => {
    expect(validateEyeParameters(null).ok).toBe(false);
    expect(validateEyeParameters("x").ok).toBe(false);
  });
});
