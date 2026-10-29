import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validatePredictions } from "../src/schema/predictions";

const DIR = resolve(import.meta.dirname, "../../../../data/results/predictions");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
const read = (f: string): Record<string, unknown> => JSON.parse(readFileSync(resolve(DIR, f), "utf8")) as Record<string, unknown>;

describe("prediction grid schema", () => {
  it("has a committed grid", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("validates %s", (f) => {
    const r = validatePredictions(read(f));
    expect(r.ok ? [] : r.errors).toEqual([]);
  });

  it("rejects an unknown major version with a clear error", () => {
    const r = validatePredictions({ ...read(files[0]!), schemaVersion: "2.0.0" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/major version 1/);
  });

  it("rejects a band of the wrong shape", () => {
    const doc = read(files[0]!) as { sphere: { p50: unknown[] } };
    const r = validatePredictions({ ...doc, sphere: { ...doc.sphere, p50: doc.sphere.p50.slice(1) } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/sphere\/p50/);
  });
});
