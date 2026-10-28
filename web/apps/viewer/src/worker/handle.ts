import {
  PHOTOPIC,
  buildSurfacesAt,
  clinicalAxisDeg,
  eyeView,
  lensParameterFor,
  localAxisDeg,
  toClinicalRefraction,
  type EyeParameters,
} from "@eye/eye-model";
import {
  DEFAULT_LAUNCH_OFFSET_MM,
  SPECTACLE_DEFAULTS,
  analyzeWavefront,
  autoPrescribe,
  lensSurfaces,
  mtf,
  normalize,
  otf,
  otfPair,
  paraxialPower,
  polychromaticPsf,
  psf,
  retinalDefocusD,
  retinalImage,
  retinalImagePair,
  snellenE,
  splitImageSurface,
  sub,
  traceRay,
  type Bitmap,
  type Otf,
  type Prescription,
  type Psf,
  type Ray,
  type Surface,
  type Vec3,
  type ViewSpec,
} from "@eye/optics";
import type { ClinicalLens, EyeOptics, EyeOpticsRequest, EyeWave, OpticsRequest, OpticsResponse, WaveRequest, WaveResult } from "./messages";

/** How far in front of the cornea a drawn ray starts, mm (a drawing choice, not physiology). */
export const FAN_LAUNCH_MM = 8;

/** Sagittal fan of `n` rays spanning the pupil in y, aimed like the defocus bundle. */
export function fanRays(req: Pick<EyeOpticsRequest, "fanRays" | "objectDistanceM" | "pupilSemiDiamMm">, firstVertexZ: number): Ray[] {
  const n = Math.max(0, Math.floor(req.fanRays));
  const rays: Ray[] = [];
  const launchZ = firstVertexZ - FAN_LAUNCH_MM;
  const aimZ = firstVertexZ - DEFAULT_LAUNCH_OFFSET_MM;
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : -req.pupilSemiDiamMm + (2 * req.pupilSemiDiamMm * i) / (n - 1);
    if (Number.isFinite(req.objectDistanceM)) {
      const obj: Vec3 = [0, 0, firstVertexZ - req.objectDistanceM * 1000];
      const dir = normalize(sub([0, y, aimZ], obj));
      // Start drawing FAN_LAUNCH_MM in front of the cornea along the same ray.
      const t = (launchZ - obj[2]) / dir[2];
      rays.push({ origin: [obj[0] + t * dir[0], obj[1] + t * dir[1], launchZ], dir, wavelengthNm: 555 });
    } else {
      rays.push({ origin: [0, y, launchZ], dir: [0, 0, 1], wavelengthNm: 555 });
    }
  }
  return rays;
}

const farPointOf = (s: Surface[]) => paraxialPower(s).farPointD;

/** The lens of a clinical prescription in the optics frame of this eye (TABO → local axis). */
export function lensPrescription(lens: ClinicalLens, side: "left" | "right"): Prescription {
  return { ...lens, axisDeg: localAxisDeg(lens.axisDeg, side) };
}

/** Snellen targets by (n, pixel, letter): reusing the bitmap object keeps its cached spectrum. */
const targets = new Map<string, Bitmap>();
function target(n: number, pixelArcmin: number, letterArcmin: number): Bitmap {
  const key = `${n}|${pixelArcmin}|${letterArcmin}`;
  let t = targets.get(key);
  if (t === undefined) {
    t = snellenE(n, pixelArcmin, letterArcmin);
    if (targets.size > 8) targets.clear();
    targets.set(key, t);
  }
  return t;
}

interface Stage {
  analysis: ReturnType<typeof analyzeWavefront>;
  psf: Psf;
}

/** OPD map and fit at 555 nm, then the PSF (mono or polychromatic) of one configuration. */
function stage(surfaces: Surface[], view: ViewSpec, w: WaveRequest): Stage {
  const a = analyzeWavefront(surfaces, view, { gridN: w.gridN });
  const p = w.polychromatic
    ? polychromaticPsf(
        PHOTOPIC.wavelengthsNm.map((wl, i) => ({
          coeffsMicrons: wl === 555 ? a.fit.coeffsMicrons : analyzeWavefront(surfaces, view, { gridN: w.gridN, wavelengthNm: wl }).fit.coeffsMicrons,
          pupilRadiusMm: view.pupilRadiusMm,
          wavelengthNm: wl,
          weight: PHOTOPIC.weights[i] ?? 0,
        })),
        { gridN: w.psfN },
      )
    : psf({ coeffsMicrons: a.fit.coeffsMicrons, pupilRadiusMm: view.pupilRadiusMm, wavelengthNm: 555 }, { gridN: w.psfN });
  return { analysis: a, psf: p };
}

function result(st: Stage, transfer: Otf, retinal: Float32Array, w: WaveRequest, side: "left" | "right"): WaveResult {
  const { analysis: a, psf: p } = st;
  const opdGrid = new Float32Array(w.gridN * w.gridN).fill(Number.NaN);
  a.map.gridIndex.forEach((cell, i) => {
    if (a.map.valid[i]) opdGrid[cell] = a.map.opdMicrons[i] ?? Number.NaN;
  });
  return {
    refraction: toClinicalRefraction(a.refraction, side),
    coeffsMicrons: a.fit.coeffsMicrons,
    rmsMicrons: a.fit.rmsMicrons,
    hoRmsMicrons: a.fit.hoRmsMicrons,
    strehl: p.strehl,
    psf: p.intensity,
    psfN: p.n,
    pixelArcmin: p.pixelArcmin,
    fieldArcmin: p.fieldArcmin,
    aliased: p.aliased,
    mtf: mtf(p, transfer),
    retinal,
    opdGrid,
    gridN: w.gridN,
    pupilRadiusMm: a.map.pupilRadiusMm,
    validFraction: a.map.validFraction,
  };
}

/**
 * Wave optics of the eye alone and, with spectacles, of eye plus lens. The two configurations
 * share one FFT for their OTFs and one for their retinal images (paired real transforms).
 */
function waveResults(eye: Surface[], lens: Surface[], view: ViewSpec, w: WaveRequest, side: "left" | "right"): [WaveResult, WaveResult | null] {
  const u = stage(eye, view, w);
  const t = target(u.psf.n, u.psf.pixelArcmin, w.letterArcmin);
  if (lens.length === 0) {
    const k = otf(u.psf);
    return [result(u, k, retinalImage(t, u.psf, k).data, w, side), null];
  }
  const c = stage([...lens, ...eye], view, w);
  const [ku, kc] = otfPair(u.psf, c.psf);
  const [iu, ic] = retinalImagePair(t, u.psf, c.psf, ku, kc);
  return [result(u, ku, iu.data, w, side), result(c, kc, ic.data, w, side)];
}

function eyeWave(req: EyeOpticsRequest, eye: Surface[], lens: Surface[], w: WaveRequest): EyeWave {
  const view = eyeView(req.params, req.objectDistanceM, 2 * req.pupilSemiDiamMm);
  let autoRx: EyeWave["autoRx"] = null;
  if (w.autoPrescribe) {
    const design = req.spectacles ?? { ...SPECTACLE_DEFAULTS, sphereD: 0, cylinderD: 0, axisDeg: 180 };
    const r = autoPrescribe(eye, view, {
      vertexMm: design.vertexMm,
      baseCurveD: design.baseCurveD,
      index: design.index,
      centerThicknessMm: design.centerThicknessMm,
      gridN: w.gridN,
    });
    autoRx = {
      sphereD: r.prescription.sphereD,
      cylinderD: r.prescription.cylinderD,
      axisDeg: clinicalAxisDeg(r.prescription.axisDeg, req.side),
      vertexMm: design.vertexMm,
      baseCurveD: design.baseCurveD,
      index: design.index,
      centerThicknessMm: design.centerThicknessMm,
      residualRmsMicrons: r.residualRmsMicrons,
    };
  }
  const [uncorrected, corrected] = waveResults(eye, lens, view, w, req.side);
  return { uncorrected, corrected, autoRx };
}
const relaxedCache = new Map<string, number>();

/**
 * Far point of the relaxed document (clinical sign), with spectacle surfaces in front when given,
 * cached by contents: worker messages are structured clones, so object identity does not
 * survive between requests.
 */
export function relaxedFarPointD(params: EyeParameters, lens: Surface[] = []): number {
  const key = JSON.stringify([params, lens]);
  let fp = relaxedCache.get(key);
  if (fp === undefined) {
    const raw = farPointOf([...lens, ...buildSurfacesAt(params, 0)]);
    fp = Number.isFinite(raw) ? raw : 0;
    if (relaxedCache.size > 16) relaxedCache.clear();
    relaxedCache.set(key, fp);
  }
  return fp;
}

function eyeOptics(req: EyeOpticsRequest): EyeOptics {
  // The lens parameter is solved so the optics accommodate by exactly the requested
  // response; without this the modeled lag of accommodation would not reach the optics.
  const lensParameterA = lensParameterFor(req.params, req.accommodationD, farPointOf);
  const surfaces = buildSurfacesAt(req.params, lensParameterA);
  const lens = req.spectacles ? lensSurfaces(lensPrescription(req.spectacles, req.side)) : [];
  const worn = req.corrected === true && lens.length > 0;
  const active = worn ? [...lens, ...surfaces] : surfaces;
  const { refracting } = splitImageSurface(active);
  const first = refracting[0];
  if (!first) throw new Error("No refracting surfaces");
  // Object distances are from the cornea; the defocus bundle starts at the first surface (the
  // lens when worn), so move the object accordingly.
  const objectFromFirstM = Number.isFinite(req.objectDistanceM) ? req.objectDistanceM + first.vertexZMm / 1000 : req.objectDistanceM;
  const d = retinalDefocusD(active, objectFromFirstM, req.pupilSemiDiamMm);
  let vignettedRays = 0;
  const fan = fanRays({ ...req, objectDistanceM: objectFromFirstM }, first.vertexZMm).map((ray) => {
    const r = traceRay(ray, active, 1);
    if (r.vignetted) vignettedRays++;
    return [ray.origin, ...r.hits.map((h) => h.point)];
  });
  return {
    side: req.side,
    surfaces,
    lensSurfaces: worn ? lens : [],
    lensParameterA,
    paraxialPowerD: paraxialPower(surfaces).powerD,
    farPointD: worn ? relaxedFarPointD(req.params, lens) : relaxedFarPointD(req.params),
    defocusD: d.defocusD,
    bestFocusZMm: d.bestFocusZMm,
    retinaZMm: d.retinaZMm,
    rmsSpotMm: d.rmsSpotMm,
    fan,
    vignettedRays,
    wave: req.wave ? eyeWave(req, surfaces, lens, req.wave) : null,
  };
}

/** Pure request handler, shared by the worker and its tests: all optics for both eyes. */
export function handle(req: OpticsRequest): OpticsResponse {
  const t0 = performance.now();
  const eyes = req.eyes.map(eyeOptics);
  return { id: req.id, eyes, elapsedMs: performance.now() - t0 };
}
