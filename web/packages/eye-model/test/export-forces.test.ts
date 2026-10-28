import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildForceTable } from "../scripts/export-forces";
import { EOM_TABLE, MUSCLE_NAMES } from "../src/eom/geometry";

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
});
