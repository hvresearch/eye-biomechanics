import { buildSurfaces, deriveEyeState, loadPreset, type SceneState } from "@eye/eye-model";
import { describe, expect, it } from "vitest";
import { OpticsClient, StaleRequestError } from "../src/worker/client";
import { handle } from "../src/worker/handle";
import type { OpticsRequest, OpticsWorkerMessage } from "../src/worker/messages";

const scene: SceneState = {
  targetDistanceM: 0.5,
  targetDirectionDeg: { x: 0, y: 0 },
  luminanceCdM2: 100,
  ageYears: 30,
  ipdMm: 63,
  timeS: 0,
  preset: "navarro-1985",
};

function request(over: Partial<OpticsRequest> = {}): OpticsRequest {
  const eye = loadPreset("navarro-1985");
  const state = deriveEyeState(scene, eye, "right");
  return {
    id: 1,
    surfaces: buildSurfaces(eye, state),
    objectDistanceM: scene.targetDistanceM,
    pupilSemiDiamMm: state.pupilMm / 2,
    fanRays: 11,
    ...over,
  };
}

describe("handle", () => {
  it("returns one polyline per fan ray with the launch point plus a vertex per surface", () => {
    const res = handle(request());
    expect(res.id).toBe(1);
    expect(res.fan).toHaveLength(11);
    for (const line of res.fan) expect(line).toHaveLength(1 + 5);
    expect(res.vignettedRays).toBe(0);
    expect(Number.isFinite(res.defocusD)).toBe(true);
    expect(res.retinaZMm).toBeCloseTo(24, 0);
    expect(res.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("works for a distant target with collimated rays", () => {
    const res = handle(request({ objectDistanceM: Number.POSITIVE_INFINITY, fanRays: 3 }));
    expect(res.fan).toHaveLength(3);
    expect(res.fan[1]?.[0]?.[1]).toBe(0);
    expect(res.fan[0]?.[0]?.[2]).toBeLessThan(0);
  });

  it("stays well inside the per-frame budget for the slice", () => {
    const res = handle(request());
    expect(res.elapsedMs).toBeLessThan(100);
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
    const base = request();
    const { id: _id, ...body } = base;
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
