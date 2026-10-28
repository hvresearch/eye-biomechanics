import {
  buildSurfacesAt,
  deriveBinocular,
  defaultScene,
  lensParameterFor,
  loadPreset,
  type EyeParameters,
  type SceneState,
} from "@eye/eye-model";
import { DEFAULT_LAUNCH_OFFSET_MM, paraxialPower } from "@eye/optics";
import { describe, expect, it } from "vitest";
import { OpticsClient, StaleRequestError } from "../src/worker/client";
import { handle, relaxedFarPointD } from "../src/worker/handle";
import type { OpticsRequest, OpticsWorkerMessage } from "../src/worker/messages";

const eye = loadPreset("navarro-1985");
const scene: SceneState = { ...defaultScene("navarro-1985"), targetDistanceM: 0.5 };

function request(over: Partial<OpticsRequest["eyes"][number]> = {}, fanRays = 11): OpticsRequest {
  const b = deriveBinocular(scene, { left: eye, right: eye });
  return {
    id: 1,
    eyes: (["right", "left"] as const).map((side) => ({
      side,
      params: eye,
      accommodationD: b[side].accommodationD,
      objectDistanceM: b[side].targetDistanceM,
      pupilSemiDiamMm: b[side].pupilMm / 2,
      fanRays,
      ...over,
    })),
  };
}

describe("handle", () => {
  it("returns optics for both eyes, one polyline per fan ray with a vertex per surface", () => {
    const res = handle(request());
    expect(res.id).toBe(1);
    expect(res.eyes.map((e) => e.side)).toEqual(["right", "left"]);
    for (const e of res.eyes) {
      expect(e.fan).toHaveLength(11);
      for (const line of e.fan) expect(line).toHaveLength(1 + 5);
      expect(e.vignettedRays).toBe(0);
      expect(e.surfaces).toHaveLength(5);
      expect(e.retinaZMm).toBeCloseTo(24, 0);
    }
    // A 30-year-old at 0.5 m accommodates with a small lag: in focus within 0.6 D.
    expect(Math.abs(res.eyes[0]!.defocusD)).toBeLessThan(0.6);
    expect(res.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("solves the lens parameter and reports the power of the surfaces it built", () => {
    const res = handle(request({ accommodationD: 2 }));
    const farPointOf = (s: Parameters<typeof paraxialPower>[0]) => paraxialPower(s).farPointD;
    const A = lensParameterFor(eye, 2, farPointOf);
    const right = res.eyes[0]!;
    expect(right.lensParameterA).toBeCloseTo(A, 12);
    expect(right.paraxialPowerD).toBeCloseTo(paraxialPower(buildSurfacesAt(eye, A)).powerD, 12);
    expect(right.farPointD).toBeCloseTo(relaxedFarPointD(eye), 12);
    expect(Math.abs(right.farPointD)).toBeLessThan(0.05); // the Navarro fixture is emmetropic
  });

  it("aims the drawn fan at the same plane as the defocus bundle", () => {
    const res = handle(request());
    const first = res.eyes[0]!.surfaces[0]!.vertexZMm;
    // The chief ray of a point source on the axis stays on the axis through the aim plane.
    const chief = res.eyes[0]!.fan[5]!;
    expect(chief[0]![1]).toBeCloseTo(0, 12);
    expect(first - DEFAULT_LAUNCH_OFFSET_MM).toBeLessThan(first);
  });

  it("works for a distant target with collimated rays, and draws no fan when asked for none", () => {
    const res = handle(request({ objectDistanceM: Number.POSITIVE_INFINITY, accommodationD: 0 }, 3));
    expect(res.eyes[0]!.fan).toHaveLength(3);
    expect(res.eyes[0]!.fan[1]?.[0]?.[1]).toBe(0);
    expect(res.eyes[0]!.fan[0]?.[0]?.[2]).toBeLessThan(0);
    expect(handle(request({}, 0)).eyes[0]!.fan).toHaveLength(0);
  });

  it("caches the relaxed far point per document contents", () => {
    const a = relaxedFarPointD(eye);
    const copy = JSON.parse(JSON.stringify(eye)) as EyeParameters;
    expect(relaxedFarPointD(copy)).toBe(a);
  });

  it("stays inside the per-frame budget for two eyes (median of 5)", () => {
    const req = request();
    handle(req); // warm up
    const times = Array.from({ length: 5 }, () => handle(req).elapsedMs).sort((x, y) => x - y);
    expect(times[2]!).toBeLessThan(16);
  });
});

describe("OpticsClient", () => {
  class FakeWorker {
    onmessage: ((ev: MessageEvent<OpticsWorkerMessage>) => void) | null = null;
    onerror: ((ev: ErrorEvent) => void) | null = null;
    posted: OpticsRequest[] = [];
    postMessage(m: OpticsRequest) {
      this.posted.push(m);
    }
    terminate() {}
  }

  it("resolves only the latest request and rejects stale ones", async () => {
    const fake = new FakeWorker();
    const client = new OpticsClient(fake as unknown as Worker);
    const { id: _id, ...body } = request();
    const p1 = client.request(body);
    const p2 = client.request(body);
    await expect(p1).rejects.toBeInstanceOf(StaleRequestError);
    const res = handle({ ...body, id: fake.posted[1]?.id ?? -1 });
    client.receive(res);
    await expect(p2).resolves.toMatchObject({ id: res.id });
  });

  it("rejects when the worker reports a failure", async () => {
    const fake = new FakeWorker();
    const client = new OpticsClient(fake as unknown as Worker);
    const { id: _id, ...body } = request();
    const p = client.request(body);
    client.receive({ id: fake.posted[0]?.id ?? -1, error: "boom" });
    await expect(p).rejects.toThrow("boom");
  });
});
