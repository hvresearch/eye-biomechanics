import table from "../../../../../data/eom/dynamics.json";
import type { GazeDeg } from "./listing";
import type { EyeDirections } from "./vergence";

/** Shape of data/eom/dynamics.json. */
export interface DynamicsTable {
  saccade: { interceptMs: number; slopeMsPerDeg: number; citation: string; verified: boolean };
  vergence: { latencyS: number; timeConstantS: number; citation: string; verified: boolean };
  accommodation: { latencyS: number; timeConstantS: number; citation: string; verified: boolean };
}

export const DYNAMICS_TABLE: DynamicsTable = table;

export interface PerEye {
  left: number;
  right: number;
}

/**
 * What the oculomotor system is driven toward. `version` is the conjugate gaze in the head
 * frame (x to the subject's right, y up; Hering's law), `vergenceDeg` the horizontal
 * vergence (left azimuth minus right azimuth in the head frame), and `verticalVergenceDeg`
 * the left elevation minus the right (nonzero only for eccentric near targets).
 */
export interface DynamicTargets {
  version: GazeDeg;
  vergenceDeg: number;
  verticalVergenceDeg: number;
  accommodationD: PerEye;
}

interface Vergence {
  horizontalDeg: number;
  verticalDeg: number;
}

interface Scheduled<T> {
  atS: number;
  value: T;
}

export interface DynamicState {
  timeS: number;
  version: GazeDeg;
  vergenceDeg: number;
  verticalVergenceDeg: number;
  accommodationD: PerEye;
  saccade: { from: GazeDeg; to: GazeDeg; startS: number; durationS: number } | null;
  /** Targets that take effect after the latency, oldest first; the first is in effect. */
  vergenceQueue: Array<Scheduled<Vergence>>;
  accommodationQueue: Array<Scheduled<PerEye>>;
  lastTargets: DynamicTargets;
}

/** At rest on the targets. */
export function initialDynamics(targets: DynamicTargets, timeS = 0): DynamicState {
  return {
    timeS,
    version: { ...targets.version },
    vergenceDeg: targets.vergenceDeg,
    verticalVergenceDeg: targets.verticalVergenceDeg,
    accommodationD: { ...targets.accommodationD },
    saccade: null,
    vergenceQueue: [{ atS: Number.NEGATIVE_INFINITY, value: vergenceOf(targets) }],
    accommodationQueue: [{ atS: Number.NEGATIVE_INFINITY, value: { ...targets.accommodationD } }],
    lastTargets: targets,
  };
}

/** Version and vergence that reproduce a static fixation (inverse of `eyeGazes`). */
export function dynamicTargetsFromDirections(dirs: EyeDirections, accommodationD: PerEye): DynamicTargets {
  const rightHead = dirs.right.xDeg;
  const leftHead = -dirs.left.xDeg;
  return {
    version: { xDeg: (rightHead + leftHead) / 2, yDeg: (dirs.left.yDeg + dirs.right.yDeg) / 2 },
    vergenceDeg: leftHead - rightHead,
    verticalVergenceDeg: dirs.left.yDeg - dirs.right.yDeg,
    accommodationD: { ...accommodationD },
  };
}

/** Per-eye gaze in each eye's local frame (x temporal) from version and vergence. */
export function eyeGazes(state: Pick<DynamicState, "version" | "vergenceDeg" | "verticalVergenceDeg">): {
  left: GazeDeg;
  right: GazeDeg;
} {
  const { xDeg, yDeg } = state.version;
  const half = state.vergenceDeg / 2;
  const vHalf = state.verticalVergenceDeg / 2;
  return { right: { xDeg: xDeg - half, yDeg: yDeg - vHalf }, left: { xDeg: -(xDeg + half), yDeg: yDeg + vHalf } };
}

function vergenceOf(t: Pick<DynamicTargets, "vergenceDeg" | "verticalVergenceDeg">): Vergence {
  return { horizontalDeg: t.vergenceDeg, verticalDeg: t.verticalVergenceDeg };
}

/** Minimum-jerk position profile on normalized time s in [0, 1]. */
function minimumJerk(s: number): number {
  const c = Math.min(1, Math.max(0, s));
  return c * c * c * (10 + c * (-15 + 6 * c));
}

function sameGaze(a: GazeDeg, b: GazeDeg): boolean {
  return a.xDeg === b.xDeg && a.yDeg === b.yDeg;
}

function samePerEye(a: PerEye, b: PerEye): boolean {
  return a.left === b.left && a.right === b.right;
}

/**
 * First-order approach toward the latency-delayed target over [t0, t1], splitting the step
 * where a queued target takes effect. Returns the new value and the pruned queue.
 */
function approach<T>(
  x: T,
  queue: Array<Scheduled<T>>,
  t0: number,
  t1: number,
  tau: number,
  blend: (x: T, target: T, k: number) => T,
): { value: T; queue: Array<Scheduled<T>> } {
  let value = x;
  let t = t0;
  let i = 0;
  while (t < t1) {
    while (i + 1 < queue.length && queue[i + 1]!.atS <= t) i++;
    const nextAt = i + 1 < queue.length ? Math.min(queue[i + 1]!.atS, t1) : t1;
    value = blend(value, queue[i]!.value, 1 - Math.exp(-(nextAt - t) / tau));
    t = nextAt;
  }
  while (i + 1 < queue.length && queue[i + 1]!.atS <= t1) i++;
  return { value, queue: queue.slice(i) };
}

const blendVergence = (x: Vergence, target: Vergence, k: number): Vergence => ({
  horizontalDeg: x.horizontalDeg + (target.horizontalDeg - x.horizontalDeg) * k,
  verticalDeg: x.verticalDeg + (target.verticalDeg - x.verticalDeg) * k,
});
const blendPerEye = (x: PerEye, target: PerEye, k: number): PerEye => ({
  left: x.left + (target.left - x.left) * k,
  right: x.right + (target.right - x.right) * k,
});

/**
 * Advance the oculomotor state by `dtS` toward `targets` (spec §4.4 dynamics): a change of
 * version starts a main-sequence saccade with a minimum-jerk profile from the current
 * position; vergence and accommodation follow a changed target after a latency with a
 * first-order time constant. Constants in data/eom/dynamics.json.
 */
export function stepDynamics(
  prev: DynamicState,
  targets: DynamicTargets,
  dtS: number,
  consts: DynamicsTable = DYNAMICS_TABLE,
): DynamicState {
  if (!(dtS >= 0)) throw new RangeError(`dt must be non-negative, got ${dtS}`);
  if (dtS === 0) return prev;
  const t0 = prev.timeS;
  const t1 = t0 + dtS;

  let saccade = prev.saccade;
  if (!sameGaze(targets.version, prev.lastTargets.version)) {
    const from = prev.version;
    const amp = Math.hypot(targets.version.xDeg - from.xDeg, targets.version.yDeg - from.yDeg);
    const durationS = (consts.saccade.interceptMs + consts.saccade.slopeMsPerDeg * amp) / 1000;
    saccade = amp > 0 ? { from, to: { ...targets.version }, startS: t0, durationS } : null;
  }
  let version = prev.version;
  if (saccade) {
    const s = (t1 - saccade.startS) / saccade.durationS;
    if (s >= 1) {
      version = saccade.to;
      saccade = null;
    } else {
      const p = minimumJerk(s);
      version = {
        xDeg: saccade.from.xDeg + (saccade.to.xDeg - saccade.from.xDeg) * p,
        yDeg: saccade.from.yDeg + (saccade.to.yDeg - saccade.from.yDeg) * p,
      };
    }
  }

  const vq =
    targets.vergenceDeg === prev.lastTargets.vergenceDeg && targets.verticalVergenceDeg === prev.lastTargets.verticalVergenceDeg
      ? prev.vergenceQueue
      : [...prev.vergenceQueue, { atS: t0 + consts.vergence.latencyS, value: vergenceOf(targets) }];
  const aq = samePerEye(targets.accommodationD, prev.lastTargets.accommodationD)
    ? prev.accommodationQueue
    : [...prev.accommodationQueue, { atS: t0 + consts.accommodation.latencyS, value: { ...targets.accommodationD } }];
  const verg = approach(vergenceOf(prev), vq, t0, t1, consts.vergence.timeConstantS, blendVergence);
  const acc = approach(prev.accommodationD, aq, t0, t1, consts.accommodation.timeConstantS, blendPerEye);

  return {
    timeS: t1,
    version,
    vergenceDeg: verg.value.horizontalDeg,
    verticalVergenceDeg: verg.value.verticalDeg,
    accommodationD: acc.value,
    saccade,
    vergenceQueue: verg.queue,
    accommodationQueue: acc.queue,
    lastTargets: targets,
  };
}
