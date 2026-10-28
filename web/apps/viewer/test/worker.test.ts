import {
  applyRefraction,
  applyRefractivePreset,
  buildSurfacesAt,
  deriveBinocular,
  defaultScene,
  lensParameterFor,
  loadPreset,
  type EyeParameters,
  type SceneState,
} from "@eye/eye-model";
import { DEFAULT_LAUNCH_OFFSET_MM, SPECTACLE_DEFAULTS, lensSurfaces, paraxialPower, type Surface } from "@eye/optics";
import { describe, expect, it } from "vitest";
import { OpticsClient, StaleRequestError } from "../src/worker/client";
import { handle, lensPrescription, relaxedFarPointD } from "../src/worker/handle";
import { WAVE_REQUEST } from "../src/store/scene";
import { transferables, type ClinicalLens, type OpticsRequest, type OpticsWorkerMessage } from "../src/worker/messages";

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
    const req = request();
    const res = handle(req);
    const first = res.eyes[0]!.surfaces[0]!.vertexZMm;
    const aimZ = first - DEFAULT_LAUNCH_OFFSET_MM;
    const n = res.eyes[0]!.fan.length;
    const R = req.eyes[0]!.pupilSemiDiamMm;
    // Each fan ray crosses the aim plane at its pupil height (an off-axis ray, not only the chief).
    for (const i of [0, 2, n - 1]) {
      const [a, b] = res.eyes[0]!.fan[i]!;
      if (!a || !b) throw new Error("short fan line");
      const t = (aimZ - a[2]) / (b[2] - a[2]);
      expect(a[1] + t * (b[1] - a[1])).toBeCloseTo(-R + (2 * R * i) / (n - 1), 9);
    }
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

  it("returns wave optics for the right eye: PSF, MTF, retinal image, and a refraction near 0 for the emmetrope at 6 m", () => {
    const far: SceneState = { ...scene, targetDistanceM: 6 };
    const b = deriveBinocular(far, { left: eye, right: eye });
    const res = handle({
      id: 2,
      eyes: [{ side: "right", params: eye, accommodationD: b.right.accommodationD, objectDistanceM: 6, pupilSemiDiamMm: b.right.pupilMm / 2, fanRays: 0, wave: WAVE_REQUEST }],
    });
    const w = res.eyes[0]!.wave;
    if (!w) throw new Error("no wave optics");
    expect(w.corrected).toBeNull();
    const u = w.uncorrected;
    expect(Math.abs(u.refraction.M)).toBeLessThan(0.35);
    expect(u.psf).toHaveLength(256 * 256);
    expect(u.retinal).toHaveLength(256 * 256);
    expect(u.opdGrid).toHaveLength(64 * 64);
    expect(u.mtf.radial[0]).toBeCloseTo(1, 6);
    expect(u.strehl).toBeGreaterThan(0);
    expect(u.strehl).toBeLessThanOrEqual(1);
    expect(u.coeffsMicrons).toHaveLength(45);
    expect(transferables(res)).toHaveLength(6);
    // NaN outside the pupil, finite inside.
    expect(Number.isNaN(u.opdGrid[0]!)).toBe(true);
    expect(Number.isFinite(u.opdGrid[32 * 64 + 32]!)).toBe(true);
  });

  const farPointOf = (s: Surface[], meridianDeg = 0) => paraxialPower(s, 1, { meridianDeg }).farPointD;
  const myope = applyRefractivePreset(eye, "myope-3-axial", farPointOf);
  const lens = (sphereD: number): ClinicalLens => ({ sphereD, cylinderD: 0, axisDeg: 180, ...SPECTACLE_DEFAULTS });
  const myopeRequest = (over: Partial<OpticsRequest["eyes"][number]>): OpticsRequest => ({
    id: 3,
    eyes: [{ side: "right", params: myope, accommodationD: 0, objectDistanceM: Number.POSITIVE_INFINITY, pupilSemiDiamMm: 1.5, fanRays: 5, wave: WAVE_REQUEST, ...over }],
  });

  it("corrects a −3 D axial myope with a −3.1 D spectacle at 12 mm", () => {
    const res = handle(myopeRequest({ spectacles: lens(-3.1), corrected: true }));
    const e = res.eyes[0]!;
    const w = e.wave!;
    expect(w.uncorrected.refraction.M).toBeLessThan(-2.8);
    // At the fovea (angle alpha) even the emmetrope reads slightly myopic with oblique astigmatism,
    // so the corrected myope is compared with the emmetrope seen the same way.
    const emm = handle({ ...myopeRequest({}), eyes: [{ ...myopeRequest({}).eyes[0]!, params: eye }] }).eyes[0]!.wave!.uncorrected;
    expect(Math.abs(w.corrected!.refraction.M - emm.refraction.M)).toBeLessThan(0.1);
    expect(Math.abs(w.corrected!.refraction.cylinderD - emm.refraction.cylinderD)).toBeLessThan(0.1);
    expect(w.corrected!.rmsMicrons).toBeLessThan(0.25 * w.uncorrected.rmsMicrons);
    // Worn: the far point and defocus follow the corrected eye; the lens surfaces come back for drawing.
    expect(Math.abs(e.farPointD)).toBeLessThan(0.15);
    expect(Math.abs(e.defocusD)).toBeLessThan(0.3);
    expect(e.lensSurfaces).toHaveLength(2);
    expect(e.surfaces).toHaveLength(5);
    expect(e.fan[0]).toHaveLength(1 + 7);
    // Not worn: the lens is still analyzed, but the eye drives the readouts.
    const off = handle(myopeRequest({ spectacles: lens(-3.1), corrected: false })).eyes[0]!;
    expect(off.farPointD).toBeLessThan(-2.8);
    expect(off.wave?.corrected).not.toBeNull();
    expect(off.lensSurfaces).toHaveLength(0);
  });

  it("auto-prescribes a lens that beats the manual one", () => {
    const res = handle(myopeRequest({ spectacles: lens(-2.5), corrected: true, wave: { ...WAVE_REQUEST, autoPrescribe: true } }));
    const w = res.eyes[0]!.wave!;
    const auto = w.autoRx!;
    expect(auto.sphereD).toBeLessThan(-2.9);
    expect(auto.residualRmsMicrons).toBeLessThan(w.corrected!.rmsMicrons);
    expect(auto.vertexMm).toBe(12);
    expect(auto.axisDeg).toBeGreaterThan(0);
    expect(auto.axisDeg).toBeLessThanOrEqual(180);
  });

  // A young hyperope at 6 m accommodates about 2 D uncorrected; refraction must relax that away.
  const hyperope = applyRefractivePreset(eye, "hyperope+2-axial", farPointOf);
  const far6: SceneState = { ...scene, targetDistanceM: 6, ageYears: 30 };
  const hyperopeRequest = (over: Partial<OpticsRequest["eyes"][number]>): OpticsRequest => {
    const fp = relaxedFarPointD(hyperope);
    const b = deriveBinocular(far6, { left: hyperope, right: hyperope }, { farPointD: { left: fp, right: fp } });
    const r = b.right;
    return {
      id: 4,
      eyes: [{ side: "right", params: hyperope, accommodationD: r.accommodationD, amplitudeD: r.amplitudeD, objectDistanceM: r.targetDistanceM, pupilSemiDiamMm: r.pupilMm / 2, fanRays: 0, wave: WAVE_REQUEST, ...over }],
    };
  };

  it("auto-prescribes the relaxed eye: a young +2 D hyperope gets about +2 D", () => {
    const req = hyperopeRequest({ wave: { ...WAVE_REQUEST, autoPrescribe: true } });
    expect(req.eyes[0]!.accommodationD).toBeGreaterThan(1.5);
    const auto = handle(req).eyes[0]!.wave!.autoRx!;
    expect(auto.sphereD + auto.cylinderD / 2).toBeGreaterThan(1.7);
    expect(auto.sphereD + auto.cylinderD / 2).toBeLessThan(2.3);
  });

  it("analyzes each configuration at its own accommodation: a +2 D lens not worn still corrects the hyperope", () => {
    const w = handle(hyperopeRequest({ spectacles: lens(2), corrected: false })).eyes[0]!.wave!;
    const accEmm = deriveBinocular(far6, { left: eye, right: eye }).right.accommodationD;
    const emm = handle({ id: 5, eyes: [{ ...hyperopeRequest({}).eyes[0]!, params: eye, accommodationD: accEmm }] }).eyes[0]!.wave!.uncorrected;
    // Uncorrected, the hyperope accommodates onto the target; with the lens it relaxes and stays in focus.
    expect(Math.abs(w.uncorrected.refraction.M - emm.refraction.M)).toBeLessThan(0.3);
    expect(Math.abs(w.corrected!.refraction.M - emm.refraction.M)).toBeLessThan(0.3);
    // Worn, the uncorrected comparison row accommodates as the bare eye would.
    const fpWorn = relaxedFarPointD(hyperope, lensSurfaces(lensPrescription(lens(2), "right")));
    const accWorn = deriveBinocular(far6, { left: hyperope, right: hyperope }, { farPointD: { left: fpWorn, right: fpWorn } }).right.accommodationD;
    const worn = handle(hyperopeRequest({ spectacles: lens(2), corrected: true, accommodationD: accWorn })).eyes[0]!.wave!;
    expect(Math.abs(worn.uncorrected.refraction.M - emm.refraction.M)).toBeLessThan(0.3);
    expect(Math.abs(worn.corrected!.refraction.M - emm.refraction.M)).toBeLessThan(0.3);
  });

  it("takes the far point of an astigmat as its spherical equivalent, whatever the cylinder axis", () => {
    const meridianFp = (doc: EyeParameters, deg: number) => paraxialPower(buildSurfacesAt(doc, 0), 1, { meridianDeg: deg }).farPointD;
    const fps = [90, 180, 45].map((axisDegTabo) => {
      const astigmat = applyRefraction(eye, { mechanism: "corneal", sphereD: 0, cylinderD: -1.5, axisDegTabo }, farPointOf);
      const se = (meridianFp(astigmat, 0) + meridianFp(astigmat, 90)) / 2;
      expect(relaxedFarPointD(astigmat)).toBeCloseTo(se, 9);
      const b = deriveBinocular(scene, { left: astigmat, right: astigmat }, { farPointD: { left: se, right: se } });
      const res = handle({ ...request(), eyes: [{ ...request().eyes[0]!, params: astigmat, accommodationD: b.right.accommodationD }] });
      expect(res.eyes[0]!.farPointD).toBeCloseTo(se, 9);
      return se;
    });
    // −1.5 D of cylinder about plano: −0.75 D spherical equivalent, the same at every axis.
    for (const fp of fps) {
      expect(fp).toBeCloseTo(fps[0]!, 3);
      expect(fp - relaxedFarPointD(eye)).toBeCloseTo(-0.75, 1);
    }
  });

  it("stays inside the per-frame budget for two eyes (median of 5)", () => {
    const req = request();
    handle(req); // warm up
    const times = Array.from({ length: 5 }, () => handle(req).elapsedMs).sort((x, y) => x - y);
    expect(times[2]!).toBeLessThan(16); // without wave optics: the M2 per-frame pipeline
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

  it("keeps one request in flight and sends only the latest of those made meanwhile", async () => {
    const fake = new FakeWorker();
    const client = new OpticsClient(fake as unknown as Worker);
    const { id: _id, ...body } = request();
    const p1 = client.request(body);
    const p2 = client.request(body);
    const p3 = client.request(body);
    expect(fake.posted).toHaveLength(1);
    await expect(p2).rejects.toBeInstanceOf(StaleRequestError);
    const first = handle({ ...body, id: fake.posted[0]!.id });
    client.receive(first);
    await expect(p1).resolves.toMatchObject({ id: first.id });
    expect(fake.posted).toHaveLength(2); // the first and the last
    const last = handle({ ...body, id: fake.posted[1]!.id });
    client.receive({ ...last, id: 999 }); // an unknown id is ignored
    client.receive(last);
    await expect(p3).resolves.toMatchObject({ id: last.id });
    expect(fake.posted).toHaveLength(2);
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
