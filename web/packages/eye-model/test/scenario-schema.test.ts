import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateScenario, type Scenario } from "../src/schema/scenario";

const ROOT = resolve(import.meta.dirname, "../../../..");
const DIR = resolve(ROOT, "data/scenarios");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
const eye = JSON.parse(readFileSync(resolve(ROOT, "data/fixtures/emmetrope-right.eye.json"), "utf8")) as Scenario["eyes"]["left"];

function minimal(): Scenario {
  return structuredClone({
    schemaVersion: "1.0.0",
    name: "minimal",
    description: "",
    scene: { targetDistanceM: null, targetDirectionDeg: { x: 0, y: 0 }, luminanceCdM2: 100, ageYears: 30, ipdMm: 63, preset: "navarro-1985" },
    eyes: { left: eye, right: eye },
    prescription: null,
    corrected: false,
    result: null,
    timeline: [],
  });
}

const errorsOf = (doc: unknown) => {
  const r = validateScenario(doc);
  return r.ok ? [] : r.errors;
};

describe("scenario schema", () => {
  it("compiles with the referenced EyeParameters schema and accepts a minimal scenario", () => {
    expect(errorsOf(minimal())).toEqual([]);
  });

  it("has the four committed scenarios", () => {
    expect(files.sort()).toEqual(["astigmat-corrected-vs-uncorrected.json", "fem-result-loaded.json", "near-to-far-refocus.json", "presbyopia-20-to-60.json"]);
  });

  it.each(files)("validates %s", (f) => {
    expect(errorsOf(JSON.parse(readFileSync(resolve(DIR, f), "utf8")))).toEqual([]);
  });

  it("rejects an unknown major version, naming it", () => {
    const r = validateScenario({ ...minimal(), schemaVersion: "2.0.0" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("version");
      expect(r.errors[0]).toMatch(/"2\.0\.0".*major version 1/);
    }
  });

  it("rejects an extra key, naming it and its path", () => {
    const doc = minimal() as unknown as { scene: Record<string, unknown> };
    doc.scene.zoom = 2;
    expect(errorsOf(doc).join(" ")).toMatch(/\/scene .*'zoom'/);
  });

  it("rejects a bad embedded eye with its path", () => {
    const doc = minimal() as unknown as { eyes: { left: Record<string, unknown> } };
    delete doc.eyes.left.axialLengthMm;
    expect(errorsOf(doc).join(" ")).toMatch(/\/eyes\/left.*axialLengthMm/);
  });

  it("rejects an embedded eye of another major version as a version error", () => {
    const doc = minimal();
    doc.eyes.right = { ...doc.eyes.right, schemaVersion: "2.0.0" };
    const r = validateScenario(doc);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.kind).toBe("version");
      expect(r.errors[0]).toMatch(/\/eyes\/right.*2\.0\.0/);
    }
  });

  it("rejects unsorted keyframes, naming the late one", () => {
    expect(errorsOf({ ...minimal(), timeline: [{ timeS: 2 }, { timeS: 1 }] }).join(" ")).toMatch(/\/timeline\/1/);
  });

  it("rejects a zero or negative target distance but accepts null (infinity)", () => {
    const doc = minimal();
    expect(errorsOf({ ...doc, scene: { ...doc.scene, targetDistanceM: 0 } }).length).toBeGreaterThan(0);
    expect(errorsOf({ ...doc, timeline: [{ timeS: 0, scene: { targetDistanceM: null } }] })).toEqual([]);
  });
});
