import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import duty from "../../../../data/calibration/duty-cycle.json";
import { FORCE_TABLE, muscleForces, type MuscleForce } from "../src/eom/forces";
import { EOM_TABLE, MUSCLE_NAMES } from "../src/eom/geometry";
import { gazeQuaternion } from "../src/gaze/listing";
import { eyeDirections } from "../src/gaze/vergence";
import { SCENE_DEFAULTS } from "../src/scene/defaults";

/**
 * One gaze of the table: Fick angles in the eye's local frame (x temporal, y up), degrees, and
 * the Listing's-law orientation [x, y, z, w] that carries the globe from primary position to
 * this gaze. Entries are in the orbit frame; rotating them by the inverse orientation gives
 * them in the globe's own (body) frame, the frame of the FEM.
 */
export interface ForceTableGaze {
  /** A name for the gaze in a gaze-list table ("distance", "near"); absent on a lattice. */
  label?: string;
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

/** A gaze of a gaze-list table: Fick angles of the right eye (x temporal, y up), degrees. */
export interface GazeSpec {
  label?: string;
  xDeg: number;
  yDeg: number;
}

/** Lattice options: `grid × grid` gazes spanning ±`rangeDeg`. */
export interface LatticeOptions {
  grid: number;
  rangeDeg: number;
}

function latticeGazes({ grid, rangeDeg }: LatticeOptions): GazeSpec[] {
  if (!Number.isInteger(grid) || grid < 1 || grid % 2 === 0) throw new RangeError(`grid must be an odd positive integer, got ${grid}`);
  if (!(rangeDeg > 0) && grid > 1) throw new RangeError(`range must be positive, got ${rangeDeg}`);
  const step = grid > 1 ? (2 * rangeDeg) / (grid - 1) : 0;
  const gazes: GazeSpec[] = [];
  for (let iy = 0; iy < grid; iy++) {
    for (let ix = 0; ix < grid; ix++) {
      // Rounded so the center is exactly 0 and the JSON is stable (numerical).
      const xDeg = Math.round((-rangeDeg + ix * step) * 1e9) / 1e9;
      const yDeg = Math.round((-rangeDeg + iy * step) * 1e9) / 1e9;
      gazes.push({ xDeg, yDeg });
    }
  }
  return gazes;
}

/**
 * Insertion forces on a `grid × grid` lattice of gazes spanning ±`rangeDeg` in both directions
 * (Listing's-law orientations), row-major from (−range, −range) with x varying fastest (`grid`
 * must be odd so the lattice contains primary position), or at a list of labeled gazes.
 */
export function buildForceTable(opts: LatticeOptions | { gazes: GazeSpec[] }, generatedBy = "buildForceTable", gitHash = ""): ForceTableFile {
  const specs = "gazes" in opts ? opts.gazes : latticeGazes(opts);
  const gazes: ForceTableGaze[] = specs.map(({ label, xDeg, yDeg }) => {
    const q = gazeQuaternion({ xDeg, yDeg });
    // `+ 0` turns −0 into 0 so the JSON round-trips exactly.
    const gaze: ForceTableGaze = { xDeg: xDeg + 0, yDeg: yDeg + 0, quaternion: [q[0] + 0, q[1] + 0, q[2] + 0, q[3] + 0], entries: muscleForces(q) };
    return label === undefined ? gaze : { label, ...gaze };
  });
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

/**
 * The right eye's gazes of the daily duty cycle (data/calibration/duty-cycle.json): "distance"
 * and "near", each the line of sight to the state's target from the right eye's center of
 * rotation with the default interpupillary distance (data/scene/defaults.json).
 */
export function dutyCycleGazes(): GazeSpec[] {
  const states = [
    ["distance", duty.distance],
    ["near", duty.near],
  ] as const;
  return states.map(([label, state]) => {
    const distanceM = state.targetDistanceM ?? Number.POSITIVE_INFINITY;
    const g = eyeDirections({ distanceM, directionDeg: state.directionDeg }, SCENE_DEFAULTS.ipdMm).right;
    return { label, xDeg: g.xDeg, yDeg: g.yDeg };
  });
}

/** The force table at the duty-cycle gazes (`export-forces --duty-cycle`). */
export function buildDutyCycleTable(generatedBy = "buildDutyCycleTable", gitHash = ""): ForceTableFile {
  return buildForceTable({ gazes: dutyCycleGazes() }, generatedBy, gitHash);
}

/** `--gazes "label=h,v;h,v"` → gaze specs. */
export function parseGazes(text: string): GazeSpec[] {
  return text.split(";").map((part) => {
    const [label, angles] = part.includes("=") ? part.split("=") : [undefined, part];
    const [x, y] = (angles ?? "").split(",").map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`--gazes: cannot read "${part}"`);
    return label === undefined ? { xDeg: x!, yDeg: y! } : { label, xDeg: x!, yDeg: y! };
  });
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

/** `export-forces [--grid 5 --range 30 | --gazes "label=h,v;..." | --duty-cycle] --out <path>` */
export function main(argv: string[]): void {
  const out = resolve(process.env.INIT_CWD ?? process.cwd(), arg(argv, "out"));
  const generatedBy = `pnpm --filter @eye/eye-model export-forces ${argv.join(" ")}`;
  const table = argv.includes("--duty-cycle")
    ? buildDutyCycleTable(generatedBy, gitHead())
    : argv.includes("--gazes")
      ? buildForceTable({ gazes: parseGazes(arg(argv, "gazes")) }, generatedBy, gitHead())
      : buildForceTable({ grid: Number(arg(argv, "grid", "5")), rangeDeg: Number(arg(argv, "range", "30")) }, generatedBy, gitHead());
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(table, null, 1) + "\n");
  console.log(`wrote ${table.gazes.length} gazes × ${table.muscles.length} muscles to ${out}`);
}
