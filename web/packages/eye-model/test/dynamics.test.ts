import { describe, expect, it } from "vitest";
import {
  DYNAMICS_TABLE,
  dynamicTargetsFromDirections,
  eyeGazes,
  initialDynamics,
  stepDynamics,
  type DynamicState,
  type DynamicTargets,
} from "../src/gaze/dynamics";
import { eyeDirections } from "../src/gaze/vergence";

const targets = (x: number, y = 0, vergenceDeg = 0, acc = 0): DynamicTargets => ({
  version: { xDeg: x, yDeg: y },
  vergenceDeg,
  verticalVergenceDeg: 0,
  accommodationD: { left: acc, right: acc },
});

function run(s: DynamicState, t: DynamicTargets, seconds: number, dt: number, each?: (s: DynamicState) => void) {
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    s = stepDynamics(s, t, dt);
    each?.(s);
  }
  return s;
}

describe("saccades", () => {
  it("complete a 10 degree step in 21 + 2.2 * 10 = 43 ms and land exactly", () => {
    const { interceptMs, slopeMsPerDeg } = DYNAMICS_TABLE.saccade;
    const durS = (interceptMs + slopeMsPerDeg * 10) / 1000;
    expect(durS).toBeCloseTo(0.043, 12);
    let s = initialDynamics(targets(0));
    let doneAt = Number.NaN;
    s = run(s, targets(10), 0.1, 0.0005, (st) => {
      if (Number.isNaN(doneAt) && Math.abs(st.version.xDeg - 10) < 1e-9) doneAt = st.timeS;
    });
    expect(doneAt).toBeGreaterThan(durS - 0.002);
    expect(doneAt).toBeLessThan(durS + 0.002);
    expect(s.version.xDeg).toBe(10);
    expect(s.saccade).toBeNull();
  });

  it("reach peak velocity at mid-duration (minimum jerk)", () => {
    let s = initialDynamics(targets(0));
    const dt = 0.0005;
    let prev = 0;
    let peakV = 0;
    let peakT = 0;
    run(s, targets(10), 0.06, dt, (st) => {
      const v = (st.version.xDeg - prev) / dt;
      prev = st.version.xDeg;
      if (v > peakV) {
        peakV = v;
        peakT = st.timeS - dt / 2;
      }
    });
    expect(peakT).toBeCloseTo(0.043 / 2, 3);
    expect(peakV).toBeCloseTo((1.875 * 10) / 0.043, -1);
    void s;
  });

  it("retarget mid-flight from the current position without a jump", () => {
    let s = initialDynamics(targets(0));
    const dt = 0.001;
    s = run(s, targets(20), 0.02, dt);
    const before = s.version.xDeg;
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(20);
    const next = stepDynamics(s, targets(-5), dt);
    const peakV = (1.875 * 25) / ((21 + 2.2 * 25) / 1000);
    expect(Math.abs(next.version.xDeg - before)).toBeLessThanOrEqual(peakV * dt + 1e-9);
    const end = run(next, targets(-5), 0.2, dt);
    expect(end.version.xDeg).toBe(-5);
  });
});

describe("vergence and accommodation", () => {
  it("do not move before their latency, then approach first-order", () => {
    const { latencyS, timeConstantS } = DYNAMICS_TABLE.vergence;
    let s = initialDynamics(targets(0, 0, 0, 0));
    const dt = 0.001;
    s = run(s, targets(0, 0, 4, 2), latencyS - 0.002, dt);
    expect(s.vergenceDeg).toBe(0);
    s = run(s, targets(0, 0, 4, 2), 3 * timeConstantS + 0.004, dt);
    expect(s.vergenceDeg).toBeGreaterThan(0.95 * 4);
    expect(s.vergenceDeg).toBeLessThan(4);
  });

  it("holds accommodation until its latency", () => {
    const { latencyS } = DYNAMICS_TABLE.accommodation;
    let s = initialDynamics(targets(0, 0, 0, 0));
    s = run(s, targets(0, 0, 0, 3), latencyS - 0.002, 0.001);
    expect(s.accommodationD.left).toBe(0);
    expect(s.accommodationD.right).toBe(0);
    s = run(s, targets(0, 0, 0, 3), 2, 0.001);
    expect(s.accommodationD.right).toBeCloseTo(3, 2);
  });

  it("handle a latency boundary inside one long step exactly", () => {
    const { latencyS, timeConstantS } = DYNAMICS_TABLE.vergence;
    const s = stepDynamics(initialDynamics(targets(0)), targets(0, 0, 4), latencyS + timeConstantS);
    expect(s.vergenceDeg).toBeCloseTo(4 * (1 - Math.exp(-1)), 12);
  });
});

describe("stepping", () => {
  it("treats dt = 0 as a no-op and rejects negative dt", () => {
    const s = initialDynamics(targets(3));
    expect(stepDynamics(s, targets(10), 0)).toBe(s);
    expect(() => stepDynamics(s, targets(10), -0.01)).toThrow(RangeError);
  });

  it("splits version and vergence into per-eye local gaze (Hering)", () => {
    const g = eyeGazes(initialDynamics(targets(12, -4)));
    expect(g.right).toEqual({ xDeg: 12, yDeg: -4 });
    expect(g.left).toEqual({ xDeg: -12, yDeg: -4 });
  });

  it("round-trips static eye directions through version and vergence", () => {
    const dirs = eyeDirections({ distanceM: 0.3, directionDeg: { x: 15, y: 10 } }, 63);
    const t = dynamicTargetsFromDirections(dirs, { left: 2, right: 2 });
    const g = eyeGazes(initialDynamics(t));
    expect(g.right.xDeg).toBeCloseTo(dirs.right.xDeg, 12);
    expect(g.left.xDeg).toBeCloseTo(dirs.left.xDeg, 12);
    expect(g.right.yDeg).toBeCloseTo(dirs.right.yDeg, 12);
    expect(g.left.yDeg).toBeCloseTo(dirs.left.yDeg, 12);
  });
});
