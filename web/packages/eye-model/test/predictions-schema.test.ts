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

  type Doc = Record<string, unknown> & { sphere: Record<string, unknown[]>; cylinder: Record<string, unknown[]>; axisDeg: { p50: unknown[] }; logMAR: { p50: unknown[] }; onset: Record<string, Record<string, unknown[]>> };
  const edit = (f: (d: Doc) => void): Doc => {
    const d = JSON.parse(JSON.stringify(read(files[0]!))) as Doc;
    f(d);
    return d;
  };
  const nested = (x: unknown, ...idx: number[]): unknown[] => idx.reduce<unknown[]>((a, i) => a[i] as unknown[], x as unknown[]);

  it.each([
    // A ragged row deep in the array (the old check looked only at the first element at each depth).
    ["/sphere/p50/1/1/1", (d: Doc) => nested(d.sphere.p50, 1, 1, 1).pop()],
    ["/cylinder/p95/0/1", (d: Doc) => nested(d.cylinder.p95, 0, 1).push(nested(d.cylinder.p95, 0, 1)[0])],
    // An empty inner array.
    ["/cylinder/p05/0/0", (d: Doc) => nested(d.cylinder.p05, 0, 0).splice(0)],
    ["/axisDeg/p50/1/0/0", (d: Doc) => nested(d.axisDeg.p50, 1, 0, 0).splice(3)],
    ["/logMAR/p50/0", (d: Doc) => nested(d.logMAR.p50, 0).splice(1)],
    ["/onset/acuity/p95/1/1", (d: Doc) => nested(d.onset.acuity!.p95, 1, 1).push(null)],
    ["/onset/refraction/p05/0", (d: Doc) => nested(d.onset.refraction!.p05, 0).splice(1)],
  ] as const)("checks every row: %s", (path, f) => {
    const r = validatePredictions(edit(f));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toContain(path);
  });

  it("accepts any 1.x grid with or without a closed summary (1.1.0)", () => {
    const doc = read(files[0]!);
    expect(doc.schemaVersion).toBe("1.1.0");
    const r = validatePredictions(doc);
    expect(r.ok && r.value.summary?.stance).toMatch(/not a clinical prediction/);
    const { summary: _s, ...old } = doc;
    expect(validatePredictions({ ...old, schemaVersion: "1.0.0" }).ok).toBe(true);
    expect(validatePredictions({ ...doc, summary: { stance: "s" } }).ok).toBe(false);
    expect(validatePredictions({ ...doc, summary: { stance: "s", finding: "f", extra: 1 } }).ok).toBe(false);
  });
});
