import { AMPLITUDE_TABLE, LAG_TABLE, NEAR_RESPONSE, nearMiosisMm, type EyeParameters } from "@eye/eye-model";
import { OPTOTYPE } from "@eye/optics";

export interface ReadoutTooltips {
  defocus: string;
  bestFocus: string;
  accommodation: string;
  demand: string;
  amplitude: string;
  ciliaryActivation: string;
  paraxialPower: string;
  pupil: string;
}

/** Whether any surface of the document is tilted or decentered (the paraxial readouts ignore both). */
export function hasTiltOrDecenter(params: Pick<EyeParameters, "surfaces">): boolean {
  return params.surfaces.some((s) => (s.tilt !== undefined && (s.tilt.xDeg !== 0 || s.tilt.yDeg !== 0)) || (s.decenter !== undefined && (s.decenter.xMm !== 0 || s.decenter.yMm !== 0)));
}

/** Appended to the paraxial readouts' tooltips when the loaded eye has tilted or decentered surfaces. */
export const TILT_NOTE = " Approximation: ignores surface tilt and decenter (the paraxial ABCD trace is on axis).";

/**
 * The pupil readout's detail: the light-adapted pupil, the near miosis the vergence asks for
 * (`nearMiosisMm`), and whether the floor holds the pupil above base − miosis.
 */
export function pupilDetail(pupilBaseMm: number, pupilMm: number, vergenceMA: number): string {
  const miosis = nearMiosisMm(vergenceMA);
  const floor = NEAR_RESPONSE.floorMm;
  const binds = pupilBaseMm - miosis < floor;
  return (
    `Light-adapted ${pupilBaseMm.toFixed(2)} mm, near miosis ${miosis.toFixed(2)} mm at ${Math.max(0, vergenceMA).toFixed(2)} MA` +
    (binds ? `; the ${floor} mm floor binds, so the pupil stays at ${pupilMm.toFixed(2)} mm.` : ".")
  );
}

/**
 * Hover text for the readout. Every readout that rests on a modeling approximation
 * starts with "Approximation:" and names it (CLAUDE.md conventions). `tiltOrDecenter` adds the
 * note that the paraxial readouts (power, and accommodation through the paraxial lens solve)
 * ignore them; demand's far point is traced exactly and includes them.
 */
export function readoutTooltips(pupilMm: number, pupilModel: string, unverifiedLensCoefficients: readonly string[] = [], tiltOrDecenter = false): ReadoutTooltips {
  const pupil = `${pupilMm.toFixed(1)} mm pupil`;
  const tilt = tiltOrDecenter ? TILT_NOTE : "";
  const unverified =
    unverifiedLensCoefficients.length > 0
      ? ` Lens-model coefficients still unverified against the paper: ${unverifiedLensCoefficients.join(", ")}.`
      : "";
  return {
    defocus: `Approximation: position of minimum RMS spot found by exact ray tracing through a ${pupil}, expressed as the exact object-vergence difference to the retina; includes spherical aberration. Positive: focus behind the retina (hyperopic). Homogeneous lens index.${unverified}`,
    bestFocus: `Approximation: axial distance of the minimum RMS spot from the retina, found by exact ray tracing through a ${pupil}; includes spherical aberration. Positive: behind the retina. Homogeneous lens index.`,
    accommodation: `Approximation: response = demand − lag, clipped to amplitude; the Navarro lens parameter is solved so the paraxial far point moves by exactly this response. Lag model: ${LAG_TABLE.citation}${tilt}`,
    demand: "Approximation: 1 / (this eye's distance to the target) plus the relaxed far point (clinical sign: a myope's is negative). The far point is the spherical equivalent of the minimum-RMS refraction, the measure auto-prescribe zeroes, of the relaxed eye (with its spectacles when worn) for a distant object at the current pupil on the visual axis at 555 nm, by exact ray tracing of the schematic eye with a homogeneous lens index; spherical aberration makes it differ from the paraxial far point (about −0.25 D for the emmetropic schematic eye at a 3 mm pupil).",
    amplitude: `Anderson et al. 2008 sigmoid of objective amplitude versus age. ${AMPLITUDE_TABLE.domain.note ?? ""}`.trim(),
    ciliaryActivation: "Approximation: response divided by amplitude.",
    paraxialPower: `Approximation: paraxial (ABCD) power of the accommodated schematic eye with a homogeneous lens index (Navarro 1985); the real lens has a gradient index.${tilt}`,
    pupil:
      pupilModel === "watsonYellott2012"
        ? "Approximation: Watson & Yellott 2012 unified formula at the scene's luminance and the subject's age (clamped to 20–83 y), minus a near miosis proportional to vergence demand (Feil 2017 coupling; magnitude from Gislén 2008), floored at 2 mm. Coefficients partly from a secondary implementation (luxpy), unverified against the paper."
        : `Approximation: pupil from the document's "${pupilModel}" pupil model.`,
  };
}

const MUSCLE_LABELS: Record<string, string> = {
  lateralRectus: "Lateral rectus",
  medialRectus: "Medial rectus",
  superiorRectus: "Superior rectus",
  inferiorRectus: "Inferior rectus",
  superiorOblique: "Superior oblique",
  inferiorOblique: "Inferior oblique",
};

export function muscleLabel(name: string): string {
  return MUSCLE_LABELS[name] ?? name;
}

/** Hover and header text for every muscle readout (CLAUDE.md: approximations are labeled). */
export function muscleTooltip(): string {
  return "Approximation: length-proxy activation (shortening from primary position against the antagonist's), no pulleys, center of rotation at the globe center; geometry partly unverified (data/eom).";
}

export function gazeTooltip(): string {
  return "Approximation: line of sight of this eye from its center of rotation, taken as the globe center; Listing's law sets the torsion.";
}

export function vergenceTooltip(): string {
  return "Approximation: angle between the two lines of sight, each from its eye's center of rotation (taken as the globe center) to the target; Listing's law sets the torsion.";
}

export interface OpticsTooltips {
  wavefront: string;
  zernike: string;
  psf: string;
  mtf: string;
  retinal: string;
  figures: string;
  refraction: string;
  rms: string;
  strehl: string;
}

const PUPIL_PLANE =
  "the pupil is a disk in a plane 1 mm in front of the cornea (not the iris), and the fixation target lies along the visual axis at angle alpha (unverified default)";

/** Hover text for the optics strip and the wave readouts (CLAUDE.md: approximations are labeled). */
export function opticsTooltips(): OpticsTooltips {
  return {
    wavefront: `Approximation: optical path difference of 64 × 64 exactly traced rays against a reference sphere centered on the chief ray's retinal point (positive: phase advanced); ${PUPIL_PLANE}. Homogeneous lens index.`,
    zernike: `Approximation: least-squares fit of the wavefront to OSA/ANSI Zernike polynomials up to radial order 8 (j = 3…44 shown, µm); ${PUPIL_PLANE}. Homogeneous lens index.`,
    psf: "Approximation: |FFT|² of the pupil function built from the order-8 Zernike fit on a 256 grid (Nyquist sampling), 555 nm unless polychromatic (five wavelengths weighted by V(λ), Escudero-Sanz 1999 dispersion, unverified; each wavelength's wavefront is referenced to the 555 nm image point, so transverse chromatic aberration of the off-axis fovea is included, about 3 arcmin from 450 to 650 nm with the centered pupil); normalized to its own peak for display. Homogeneous lens index.",
    mtf: "Approximation: radially averaged modulus of the OTF of that PSF, with the diffraction limit of the same pupil (dashed). Homogeneous lens index.",
    retinal: `Approximation: a 20/20 Snellen E (${OPTOTYPE.letterArcminAt20_20} arcmin, ${OPTOTYPE.letterHeightStrokes} strokes, ISO 8596 geometry from data/acuity/optotypes.json) convolved with the PSF, in the eye's angular field, as perceived (not inverted). Homogeneous lens index.`,
    figures: `Approximation: RMS excludes piston and tilt; HO RMS is radial order 3 and above; Strehl is the PSF peak over the diffraction-limited peak; refraction is Thibos 1997 minimum-RMS sphere/cylinder × axis (TABO) at the pupil plane. ${PUPIL_PLANE}.`,
    refraction: `Approximation: Thibos 1997 minimum-RMS sphero-cylinder from the second-order Zernike terms (minus cylinder, TABO axis), at the pupil plane, so spherical aberration biases the sphere; ${PUPIL_PLANE}. Homogeneous lens index.`,
    rms: `Approximation: RMS wavefront error excluding piston and tilt, from the order-8 fit; ${PUPIL_PLANE}.`,
    strehl: "Approximation: peak of the PSF of the order-8 fitted wavefront divided by the diffraction-limited peak. Homogeneous lens index.",
  };
}

/** Hover text for the spectacles readouts. */
export function spectaclesTooltip(): string {
  return "Approximation: two exact surfaces at the vertex distance (spherical front of the base curve, toric back for the cylinder), thick-lens back-vertex powers, non-dispersive lens material; rays are aimed through the lens so they fill the same pupil disk. Auto-prescribe minimizes the RMS wavefront error by Nelder–Mead over the lens power vector.";
}

/** Hover text for the decomposition readout (paraxial far points; `tiltOrDecenter` adds that they ignore tilt and decenter). */
export function decompositionTooltip(tiltOrDecenter = false): string {
  return `Approximation: paraxial spherical equivalents; each part is the change from the schematic eye when only its cornea, its lens, or its axial length is taken from this eye; the residual is the interaction the split does not capture.${tiltOrDecenter ? TILT_NOTE : ""}`;
}

/** Hover text for the induced refraction of a loaded biomechanics result. */
export function inducedTooltip(): string {
  return "Approximation: elastic FEM result (no remodeling). The change is the loaded eye minus the IOP-only eye; since Milestone 5 the stress-free geometry is found by an inverse solve so the IOP-only eye is the document's (earlier files took the document as stress-free). Muscle forces come from the length-proxy activation, brought into static equilibrium with a linear passive orbital moment (the equilibrium changes the lateral and medial rectus forces by about half even in primary gaze, and the induced astigmatism depends strongly on it), with the orbit taking their net pull; lid bands at the lid margins, fixed in the orbit; fixed optic-nerve cap; the lens follows the scleral spur, the cornea is measured relative to the spur ring's lateral shift and tilt, and the retina follows the edge of the optic-nerve support. Both eyes are refracted relaxed, on the visual axis, at 555 nm, by the paraxial method (spherical aberration does not bias the difference). Tests the hypothesis that muscle and lid loading shape the cornea; not an established result.";
}

/** Hover text for the displacement heat map. */
export function heatMapTooltip(exaggeration: number): string {
  return `Approximation: displacement magnitude of the globe's outer surface, loaded minus IOP-only, drawn ×${exaggeration} for visibility (elastic). Displacements are relative to the lens: the scleral-spur ring's rigid motion (its lateral shift and tilt, the globe's pivot about the fixed optic-nerve cap) is removed, as for the corneal maps; files written before Milestone 5 show the raw field, pivot included. The orbital reaction that holds the globe is assumed. Without a .deformation.json file a loaded document shows its refraction but no map.`;
}

/** Hover text for the prediction timeline. */
export function timelineTooltip(): string {
  return "Approximation: model responses of the reference eye (Navarro 1985 schematic eye) for every subject; linear superposition about the pressurized eye; remodeled (growth of the corneoscleral shell under muscle, lid, and ciliary loads, calibrated to the population's astigmatism axis shift and J0 slope only; growth is held to the exposure the reduced growth model is validated for, where the calibration pushes the growth rate to its prior's floor, so the fitted shift comes from the elastic loads and the age stiffening, only in part and not as a confirmation, see data/results/README.md); bands are parameter uncertainty only (5–95% over posterior draws), not subject variability; acuity is a stand-in MTF-threshold metric. A hypothesis test, not a clinical prediction.";
}

/** Hover text for applying the predicted refraction to the eye. */
export function appliedPredictionTooltip(): string {
  return "Approximation: the predicted change is applied to the eye as a corneal change (the anterior cornea of the schematic eye is reshaped to carry the predicted sphere and cylinder at the current age), although the model remodels the whole corneoscleral shell; the left eye is the mirror image.";
}
