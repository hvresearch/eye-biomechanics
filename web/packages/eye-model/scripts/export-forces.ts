import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { FORCE_TABLE, muscleForces, type MuscleForce } from "../src/eom/forces";
import { EOM_TABLE, MUSCLE_NAMES } from "../src/eom/geometry";
import { gazeQuaternion } from "../src/gaze/listing";

/**
 * One gaze of the table: Fick angles in the eye's local frame (x temporal, y up), degrees, and
 * the Listing's-law orientation [x, y, z, w] that carries the globe from primary position to
 * this gaze. Entries are in the orbit frame; rotating them by the inverse orientation gives
 * them in the globe's own (body) frame, the frame of the FEM.
 */
export interface ForceTableGaze {
  xDeg: number;
  yDeg: number;
  quaternion: [number, number, number, number];
  entries: MuscleForce[];
}

/** The JSON written by `export-forces` and read by `eyebiomech.forces.from_viewer`. */
export interface ForceTableFile {
  schema: "eye-forces/1";
  frame: string;
  muscles: string[];
  gazes: ForceTableGaze[];
  provenance: { generatedBy: string; gitHash: string; date: string; citation: string };
}

/**
 * Insertion forces on a `grid × grid` lattice of gazes spanning ±`rangeDeg` in both directions
 * (Listing's-law orientations), row-major from (−range, −range) with x varying fastest. `grid`
 * must be odd so the lattice contains primary position.
 */
export function buildForceTable(opts: { grid: number; rangeDeg: number }, generatedBy = "buildForceTable", gitHash = ""): ForceTableFile {
  const { grid, rangeDeg } = opts;
  if (!Number.isInteger(grid) || grid < 1 || grid % 2 === 0) throw new RangeError(`grid must be an odd positive integer, got ${grid}`);
  if (!(rangeDeg > 0) && grid > 1) throw new RangeError(`range must be positive, got ${rangeDeg}`);
  const step = grid > 1 ? (2 * rangeDeg) / (grid - 1) : 0;
  const gazes: ForceTableGaze[] = [];
  for (let iy = 0; iy < grid; iy++) {
    for (let ix = 0; ix < grid; ix++) {
      // Rounded so the center is exactly 0 and the JSON is stable (numerical).
      const xDeg = Math.round((-rangeDeg + ix * step) * 1e9) / 1e9;
      const yDeg = Math.round((-rangeDeg + iy * step) * 1e9) / 1e9;
      const q = gazeQuaternion({ xDeg, yDeg });
      // `+ 0` turns −0 into 0 so the JSON round-trips exactly.
      gazes.push({ xDeg, yDeg, quaternion: [q[0] + 0, q[1] + 0, q[2] + 0, q[3] + 0], entries: muscleForces(q) });
    }
  }
  return {
    schema: "eye-forces/1",
    frame: EOM_TABLE.frame,
    muscles: [...MUSCLE_NAMES],
    gazes,
    provenance: {
      generatedBy,
      gitHash,
      date: new Date().toISOString().slice(0, 10),
      citation: `Eye model (web/packages/eye-model) with data/eom/geometry-default.json, activation.json, and forces.json; ${FORCE_TABLE.equation}. Not verified (see those tables).`,
    },
  };
}

function arg(argv: string[], name: string, fallback?: string): string {
  const i = argv.indexOf(`--${name}`);
  const v = i >= 0 ? argv[i + 1] : fallback;
  if (v === undefined) throw new Error(`missing --${name}`);
  return v;
}

/** HEAD's hash, with "-dirty" when the working tree differs from it; "" outside a checkout. */
function gitHead(): string {
  try {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim() !== "";
    return dirty ? `${head}-dirty` : head;
  } catch {
    return "";
  }
}

/** `export-forces --grid 5 --range 30 --out <path>` */
export function main(argv: string[]): void {
  const grid = Number(arg(argv, "grid", "5"));
  const rangeDeg = Number(arg(argv, "range", "30"));
  const out = resolve(process.env.INIT_CWD ?? process.cwd(), arg(argv, "out"));
  const table = buildForceTable({ grid, rangeDeg }, `pnpm --filter @eye/eye-model export-forces ${argv.join(" ")}`, gitHead());
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(table, null, 1) + "\n");
  console.log(`wrote ${table.gazes.length} gazes × ${table.muscles.length} muscles to ${out}`);
}
