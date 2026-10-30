import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { cutPlane } from "../src/scene/cut";
import { VIEW_KEYS, cameraFor, type ViewName } from "../src/scene/views";

const IPD = 63;
const VIEWS: ViewName[] = ["anterior", "lateral", "superior", "sagittal"];
const dir = (c: ReturnType<typeof cameraFor>) => new Vector3(...c.target).sub(new Vector3(...c.position)).normalize();

describe("cameraFor", () => {
  it("maps the number keys to the four clinical views", () => {
    expect(Object.values(VIEW_KEYS).sort()).toEqual([...VIEWS].sort());
  });

  for (const side of ["right", "left"] as const) {
    it(`looks at the ${side} eye's center with a unit up orthogonal to the view direction`, () => {
      const cx = side === "right" ? IPD / 2 : -IPD / 2;
      for (const v of VIEWS) {
        const c = cameraFor(v, side, IPD);
        expect(c.target).toEqual([cx, 0, 0]);
        const up = new Vector3(...c.up);
        expect(up.length()).toBeCloseTo(1, 12);
        expect(up.dot(dir(c))).toBeCloseTo(0, 12);
      }
    });
  }

  it("looks along +z of the head for the anterior view and down from +y for the superior view", () => {
    expect(dir(cameraFor("anterior", "right", IPD)).toArray()).toEqual([0, 0, 1]);
    const sup = cameraFor("superior", "right", IPD);
    expect(dir(sup).toArray()).toEqual([0, -1, 0]);
    expect(sup.position[1]).toBeGreaterThan(0);
  });

  it("looks from the temporal side of each eye for the lateral view", () => {
    expect(dir(cameraFor("lateral", "right", IPD)).toArray()).toEqual([-1, 0, 0]);
    expect(dir(cameraFor("lateral", "left", IPD)).toArray()).toEqual([1, 0, 0]);
    expect(cameraFor("lateral", "right", IPD).position[0]).toBeGreaterThan(IPD / 2);
  });

  it("looks perpendicular to the sagittal cut plane, at its kept section", () => {
    const c = cameraFor("sagittal", "right", IPD);
    const n = cutPlane({ orientation: "sagittal", depthMm: 0, side: "right" }, 24).normal;
    expect(Math.abs(dir(c).dot(n))).toBeCloseTo(1, 12);
    // The camera is on the removed (temporal) side, so it sees the cut face.
    const camLocal = new Vector3(c.position[0] - IPD / 2, c.position[1], c.position[2]);
    expect(n.dot(camLocal)).toBeLessThan(0);
  });
});
