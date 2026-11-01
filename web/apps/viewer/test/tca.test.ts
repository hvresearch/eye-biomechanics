import { PHOTOPIC, buildSurfacesAt, eyeView, loadPreset } from "@eye/eye-model";
import { analyzeWavefront, paraxialPower, psf, type Psf } from "@eye/optics";
import { describe, expect, it } from "vitest";

/** Intensity-weighted centroid of a PSF, arcmin from the grid center (x right, y up). */
function centroid(p: Psf): [number, number] {
  let sx = 0;
  let sy = 0;
  let s = 0;
  for (let i = 0; i < p.n; i++) {
    for (let j = 0; j < p.n; j++) {
      const v = p.intensity[i * p.n + j]!;
      sx += v * (j - p.n / 2);
      sy += v * (p.n / 2 - i);
      s += v;
    }
  }
  return [(sx / s) * p.pixelArcmin, (sy / s) * p.pixelArcmin];
}

describe("transverse chromatic aberration (TCA)", () => {
  it("keeps the lateral color of the off-axis fovea: PSF centroids shift by about an arcminute across the spectrum", () => {
    const eye = loadPreset("navarro-1985"); // fixation along the visual axis, 5° from the optical axis
    const surfaces = buildSurfacesAt(eye, 0);
    const view = eyeView(eye, Number.POSITIVE_INFINITY, 3);
    const ref = analyzeWavefront(surfaces, view, { gridN: 32 });
    const short = Math.min(...PHOTOPIC.wavelengthsNm);
    const long = Math.max(...PHOTOPIC.wavelengthsNm);
    const opts = { gridN: 128, pixelArcmin: 0.25 };
    const at = (wavelengthNm: number, referenced: boolean) => {
      const a = analyzeWavefront(surfaces, view, { gridN: 32, wavelengthNm, ...(referenced ? { referenceImagePoint: ref.map.imagePoint } : {}) });
      return { a, c: centroid(psf({ coeffsMicrons: a.fit.coeffsMicrons, pupilRadiusMm: 1.5, wavelengthNm }, opts)) };
    };
    const s = at(short, true);
    const l = at(long, true);
    const shiftArcmin = Math.hypot(s.c[0] - l.c[0], s.c[1] - l.c[1]);
    // Expected: the separation of the two chief-ray image points on the retina, seen through the
    // eye's front focal length (object-space angle = retinal height × power).
    const own = (x: ReturnType<typeof at>) => x.a.map.imagePoint;
    const dMm = Math.hypot(own(at(short, false))[0] - own(at(long, false))[0], own(at(short, false))[1] - own(at(long, false))[1]);
    const expectedArcmin = ((dMm * paraxialPower(surfaces).powerD) / 1000) * ((180 / Math.PI) * 60);
    expect(expectedArcmin).toBeGreaterThan(0.2);
    process.stdout.write(`TCA ${short}–${long} nm: expected ${expectedArcmin.toFixed(2)} arcmin, PSF centroids ${shiftArcmin.toFixed(2)} arcmin\n`);
    expect(expectedArcmin).toBeLessThan(5);
    expect(shiftArcmin).toBeGreaterThan(0.7 * expectedArcmin);
    expect(shiftArcmin).toBeLessThan(1.3 * expectedArcmin);
    // Each wavelength referenced to its own image point loses the shift (the M3 behavior).
    const so = at(short, false);
    const lo = at(long, false);
    expect(Math.hypot(so.c[0] - lo.c[0], so.c[1] - lo.c[1])).toBeLessThan(0.2 * shiftArcmin);
  });
});
