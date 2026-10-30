import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildDutyCycleTable, buildForceTable, type ForceTableFile } from "../scripts/export-forces";
import { eyeDirections } from "../src/gaze/vergence";
import { EOM_TABLE, MUSCLE_NAMES } from "../src/eom/geometry";
import { quatRotate } from "../src/math/quat";

describe("force table export", () => {
  it("covers a grid × grid lattice of gazes with six muscles each, primary in the center", () => {
    const table = buildForceTable({ grid: 5, rangeDeg: 30 });
    expect(table.schema).toBe("eye-forces/1");
    expect(table.frame).toBe(EOM_TABLE.frame);
    expect(table.muscles).toEqual([...MUSCLE_NAMES]);
    expect(table.gazes).toHaveLength(25);
    for (const g of table.gazes) expect(g.entries.map((e) => e.name)).toEqual([...MUSCLE_NAMES]);
    expect(table.gazes[12]).toMatchObject({ xDeg: 0, yDeg: 0 });
    expect(table.gazes[0]).toMatchObject({ xDeg: -30, yDeg: -30 });
    expect(JSON.parse(JSON.stringify(table))).toEqual(table);
  });

  it("carries each gaze's orientation so the loads can be taken back to the globe's frame", () => {
    const table = buildForceTable({ grid: 3, rangeDeg: 20 });
    expect(table.gazes[4]!.quaternion).toEqual([0, 0, 0, 1]);
    for (const g of table.gazes) {
      const q = g.quaternion;
      expect(Math.hypot(...q)).toBeCloseTo(1, 12);
      // Rotating the primary-position insertion by the gaze gives the exported insertion.
      g.entries.forEach((e, i) => {
        const back = quatRotate([-q[0], -q[1], -q[2], q[3]], e.insertionMm);
        const primary = table.gazes[4]!.entries[i]!.insertionMm;
        for (let k = 0; k < 3; k++) expect(back[k]).toBeCloseTo(primary[k]!, 10);
      });
    }
  });

  it("rejects a grid without a center or a non-positive range", () => {
    expect(() => buildForceTable({ grid: 4, rangeDeg: 30 })).toThrow(/odd/);
    expect(() => buildForceTable({ grid: 5, rangeDeg: 0 })).toThrow(/range/);
  });

  it("writes the file from the command line through the Vite module runner", () => {
    const out = join(mkdtempSync(join(tmpdir(), "forces-")), "f.json");
    const root = resolve(import.meta.dirname, "..");
    execFileSync(process.execPath, ["scripts/run.mjs", "scripts/export-forces.ts", "--grid", "3", "--range", "20", "--out", out], { cwd: root, stdio: "pipe" });
    const written = JSON.parse(readFileSync(out, "utf8")) as { gazes: unknown[]; provenance: { generatedBy: string } };
    expect(written.gazes).toHaveLength(9);
    expect(written.provenance.generatedBy).toContain("--grid 3");
  }, 60_000);

  it("writes a list of labeled gazes", () => {
    const table = buildForceTable({ gazes: [{ label: "a", xDeg: 0, yDeg: 0 }, { label: "b", xDeg: -5, yDeg: -20 }] });
    expect(table.gazes.map((g) => [g.label, g.xDeg, g.yDeg])).toEqual([
      ["a", 0, 0],
      ["b", -5, -20],
    ]);
    expect(table.gazes[0]!.quaternion).toEqual([0, 0, 0, 1]);
  });

  it("builds the duty-cycle gazes from the near target and the interpupillary distance", () => {
    const table = buildDutyCycleTable();
    expect(table.gazes.map((g) => g.label)).toEqual(["distance", "near"]);
    expect(table.gazes[0]).toMatchObject({ xDeg: 0, yDeg: 0 });
    const near = eyeDirections({ distanceM: 0.35, directionDeg: { x: 0, y: -20 } }, 63).right;
    expect(table.gazes[1]!.xDeg).toBeCloseTo(near.xDeg, 9);
    expect(table.gazes[1]!.yDeg).toBeCloseTo(near.yDeg, 9);
    expect(table.gazes[1]!.xDeg).toBeLessThan(0); // the right eye turns nasally to converge
  });

  // Drift tests: the committed tables are what the current eye model writes (M4 follow-up).
  const withoutProvenance = (t: ForceTableFile) => ({ ...t, provenance: null });
  const committed = (name: string) =>
    JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../../data/results/forces", name), "utf8")) as ForceTableFile;

  it("matches the committed lattice table", () => {
    expect(withoutProvenance(committed("default.json"))).toEqual(withoutProvenance(buildForceTable({ grid: 5, rangeDeg: 30 })));
  });

  it("matches the committed duty-cycle table", () => {
    expect(withoutProvenance(committed("duty-cycle.json"))).toEqual(withoutProvenance(buildDutyCycleTable()));
  });
});
