import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDeformation } from "../src/schema/deformation";
import { validateEyeParameters } from "../src/schema/validate";

const DIR = resolve(import.meta.dirname, "../../../../data/results/fem");
const results = readdirSync(DIR).filter((f) => f.endsWith(".eye.json"));
const read = (f: string): unknown => JSON.parse(readFileSync(resolve(DIR, f), "utf8"));

describe("committed biomechanics results (data/results/fem)", () => {
  it("has at least the M4 result", () => {
    expect(results).toContain("emmetrope-right-primary-15mmHg.eye.json");
  });

  for (const f of results) {
    it(`${f} and its sidecar validate on the TypeScript side`, () => {
      const eye = validateEyeParameters(read(f));
      expect(eye.ok, eye.ok ? "" : eye.errors.join("; ")).toBe(true);
      const side = validateDeformation(read(f.replace(/\.eye\.json$/, ".deformation.json")));
      expect(side.ok, side.ok ? "" : side.errors.join("; ")).toBe(true);
    });
  }

  it("rejects a sidecar with an unknown major version or a missing field", () => {
    const side = read(results[0]!.replace(/\.eye\.json$/, ".deformation.json")) as Record<string, unknown>;
    const future = validateDeformation({ ...side, schemaVersion: "2.0.0" });
    expect(future.ok).toBe(false);
    if (!future.ok) expect(future.errors[0]).toContain("2.0.0");
    const { triangles: _t, ...rest } = side;
    const missing = validateDeformation(rest);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.errors.join(" ")).toContain("triangles");
  });
});
