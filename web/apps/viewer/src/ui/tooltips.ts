import { AMPLITUDE_TABLE, LAG_TABLE } from "@eye/eye-model";

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

/**
 * Hover text for the readout. Every readout that rests on a modeling approximation
 * starts with "Approximation:" and names it (CLAUDE.md conventions).
 */
export function readoutTooltips(pupilMm: number, pupilModel: string, unverifiedLensCoefficients: readonly string[] = []): ReadoutTooltips {
  const pupil = `${pupilMm.toFixed(1)} mm pupil`;
  const unverified =
    unverifiedLensCoefficients.length > 0
      ? ` Lens-model coefficients still unverified against the paper: ${unverifiedLensCoefficients.join(", ")}.`
      : "";
  return {
    defocus: `Approximation: position of minimum RMS spot found by exact ray tracing through a ${pupil}, expressed as the exact object-vergence difference to the retina; includes spherical aberration. Positive: focus behind the retina (hyperopic). Homogeneous lens index.${unverified}`,
    bestFocus: `Approximation: axial distance of the minimum RMS spot from the retina, found by exact ray tracing through a ${pupil}; includes spherical aberration. Positive: behind the retina. Homogeneous lens index.`,
    accommodation: `Approximation: response = demand − lag, clipped to amplitude; the Navarro lens parameter is solved so the paraxial far point moves by exactly this response. Lag model: ${LAG_TABLE.citation}`,
    demand: "Approximation: 1 / (this eye's distance to the target) minus the relaxed far point (the spherical equivalent: mean of two perpendicular meridians), which comes from the paraxial (ABCD) trace of the schematic eye with a homogeneous lens index.",
    amplitude: `Anderson et al. 2008 sigmoid of objective amplitude versus age. ${AMPLITUDE_TABLE.domain.note ?? ""}`.trim(),
    ciliaryActivation: "Approximation: response divided by amplitude.",
    paraxialPower:
      "Approximation: paraxial (ABCD) power of the accommodated schematic eye with a homogeneous lens index (Navarro 1985); the real lens has a gradient index.",
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
    psf: "Approximation: |FFT|² of the pupil function built from the order-8 Zernike fit on a 256 grid (Nyquist sampling), 555 nm unless polychromatic (five wavelengths weighted by V(λ), Escudero-Sanz 1999 dispersion, unverified); normalized to its own peak for display. Homogeneous lens index.",
    mtf: "Approximation: radially averaged modulus of the OTF of that PSF, with the diffraction limit of the same pupil (dashed). Homogeneous lens index.",
    retinal: "Approximation: a 20/20 Snellen E (5 arcmin, ISO 8596 geometry) convolved with the PSF, in the eye's angular field, as perceived (not inverted). Homogeneous lens index.",
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

/** Hover text for the decomposition readout. */
export function decompositionTooltip(): string {
  return "Approximation: paraxial spherical equivalents; each part is the change from the schematic eye when only its cornea, its lens, or its axial length is taken from this eye; the residual is the interaction the split does not capture.";
}

/** Hover text for the induced refraction of a loaded biomechanics result. */
export function inducedTooltip(): string {
  return "Approximation: elastic FEM result (no remodeling). The change is the loaded eye minus the IOP-only eye, the document's geometry being taken as stress-free; muscle forces come from the length-proxy activation, torque-balanced, with the orbit taking their net pull; the lens follows the scleral spur and the retina the posterior pole. Both eyes are refracted relaxed, on the visual axis, at 555 nm, by the paraxial method (spherical aberration does not bias the difference). Tests the hypothesis that muscle and lid loading shape the cornea; not an established result.";
}

/** Hover text for the displacement heat map. */
export function heatMapTooltip(exaggeration: number): string {
  return `Displacement magnitude of the globe's outer surface, loaded minus IOP-only, drawn ×${exaggeration} for visibility (elastic). Without a .deformation.json file a loaded document shows its refraction but no map.`;
}
