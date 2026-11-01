import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Release gate (master plan, Verification 5; spec §3.4 and §9): every data file the shipped
 * app reads for its default state must be `verified: true`.
 *
 * "Default-preset files" are the `data/**\/*.json` files that the source of `eye-model`,
 * `optics`, or the viewer imports statically: everything the app can show before the user
 * loads a scenario, result, or prediction (those are reached through `import.meta.glob` and
 * carry their own provenance). A file counts as unverified when any `verified` flag in it,
 * at any depth, is false.
 *
 * The literature hosts were unreachable from the cloud sessions that built M1–M6 (M6 plan,
 * Deviation 1), so the gate runs against an explicit allowlist of the files still unverified.
 * Each entry names the follow-up file and the line that owns its verification. The test fails
 * on a new unverified default, on an allowlisted file that has become verified or is no longer
 * imported, and on an entry whose follow-up line is gone, so the list can only shrink.
 */

const REPO = resolve(import.meta.dirname, "../../../..");
const DATA = join(REPO, "data");
const PLANS = join(REPO, "docs/superpowers/plans");

/** Source trees whose static data imports define the default state. */
const SOURCE_ROOTS = ["web/packages/eye-model/src", "web/packages/optics/src", "web/apps/viewer/src"];

/** A static `import … from "…/data/….json"` (not `import.meta.glob`, which is user-loaded). */
const DATA_IMPORT = /from\s+"([^"]*\/data\/[^"]+\.json)"/g;

interface Owner {
  /** Follow-up file under docs/superpowers/plans that owns the item. */
  followups: string;
}

const M6 = "2026-10-30-m6-followups.md";
const M3 = "2026-10-28-m3-followups.md";

/** Unverified default-preset files, relative to data/, each with the follow-up that owns it. */
const UNVERIFIED_ALLOWLIST: Record<string, Owner> = {
  "accommodation/anderson-2008-amplitude.json": { followups: M6 },
  "accommodation/lag-default.json": { followups: M6 },
  "acuity/optotypes.json": { followups: M6 },
  "anatomy/globe-cutaway.json": { followups: M6 },
  "anatomy/orbit-drawing.json": { followups: M6 },
  "dispersion/escudero-sanz-1999.json": { followups: M6 },
  "eom/activation.json": { followups: M6 },
  "eom/dynamics.json": { followups: M6 },
  "eom/forces.json": { followups: M6 },
  "eom/geometry-default.json": { followups: M6 },
  "pupil/near-response.json": { followups: M3 },
  "pupil/watson-yellott-2012.json": { followups: M3 },
  "scene/defaults.json": { followups: M6 },
  "schematic-eyes/zapata-diaz-2019.json": { followups: M6 },
  "spectacles/defaults.json": { followups: M6 },
  "visual-axis/defaults.json": { followups: M6 },
};

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Paths relative to data/ of every data file the app imports statically. */
function defaultPresetFiles(): string[] {
  const found = new Set<string>();
  for (const root of SOURCE_ROOTS) {
    for (const file of sourceFiles(join(REPO, root))) {
      for (const match of readFileSync(file, "utf8").matchAll(DATA_IMPORT)) {
        const target = resolve(dirname(file), match[1]!);
        const rel = relative(DATA, target);
        if (!rel.startsWith("..")) found.add(rel.split("\\").join("/"));
      }
    }
  }
  return [...found].sort();
}

/** Every `verified` flag in a JSON document, at any depth. */
function verifiedFlags(node: unknown): unknown[] {
  if (Array.isArray(node)) return node.flatMap(verifiedFlags);
  if (node === null || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([key, value]) => (key === "verified" ? [value, ...verifiedFlags(value)] : verifiedFlags(value)));
}

function readData(rel: string): unknown {
  return JSON.parse(readFileSync(join(DATA, rel), "utf8"));
}

describe("release gate: default-preset data is verified (master plan Verification 5)", () => {
  const files = defaultPresetFiles();

  it("finds the default state's data files, the default schematic eye among them", () => {
    expect(files).toContain("schematic-eyes/navarro-1985.json");
    expect(files).toContain("scene/defaults.json");
    expect(files.length).toBeGreaterThan(10);
  });

  it("gives every default-preset file a boolean verified flag", () => {
    for (const rel of files) {
      const flags = verifiedFlags(readData(rel));
      expect(flags.length, `${rel} has no verified flag`).toBeGreaterThan(0);
      for (const flag of flags) expect(typeof flag, `${rel} has a non-boolean verified flag`).toBe("boolean");
    }
  });

  it("has verified: true everywhere except the allowlisted files, and the allowlist is exact", () => {
    const unverified = files.filter((rel) => verifiedFlags(readData(rel)).includes(false));
    const allowlisted = Object.keys(UNVERIFIED_ALLOWLIST).sort();
    const newlyUnverified = unverified.filter((rel) => !(rel in UNVERIFIED_ALLOWLIST));
    const noLongerUnverified = allowlisted.filter((rel) => !unverified.includes(rel));
    expect(newlyUnverified, "unverified default-preset files missing from the allowlist").toEqual([]);
    expect(noLongerUnverified, "allowlisted files that are verified or no longer imported: remove them from the allowlist").toEqual([]);
  });

  it("names, for every allowlisted file, a follow-up line that owns its verification", () => {
    for (const [rel, owner] of Object.entries(UNVERIFIED_ALLOWLIST)) {
      const text = readFileSync(join(PLANS, owner.followups), "utf8");
      expect(text, `${owner.followups} has no line for data/${rel}`).toContain(`data/${rel}`);
    }
  });
});
