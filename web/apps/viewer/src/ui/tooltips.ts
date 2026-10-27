import { LAG_TABLE } from "@eye/eye-model";

export interface ReadoutTooltips {
  defocus: string;
  bestFocus: string;
  accommodation: string;
  amplitude: string;
  ciliaryActivation: string;
  paraxialPower: string;
  pupil: string;
}

/**
 * Hover text for the readout. Every readout that rests on a modeling approximation
 * starts with "Approximation:" and names it (CLAUDE.md conventions).
 */
export function readoutTooltips(pupilMm: number): ReadoutTooltips {
  const pupil = `${pupilMm.toFixed(1)} mm pupil`;
  return {
    defocus: `Approximation: position of minimum RMS spot found by exact ray tracing through a ${pupil}, expressed as the exact object-vergence difference to the retina; includes spherical aberration. Positive: focus behind the retina (hyperopic). Homogeneous lens index.`,
    bestFocus: `Approximation: axial distance of the minimum RMS spot from the retina, found by exact ray tracing through a ${pupil}; includes spherical aberration. Positive: behind the retina. Homogeneous lens index.`,
    accommodation: `Approximation: response = demand − lag, clipped to amplitude; the Navarro lens parameter is solved so the paraxial far point moves by exactly this response. Lag model: ${LAG_TABLE.citation}`,
    amplitude: "Anderson et al. 2008 sigmoid of objective amplitude versus age.",
    ciliaryActivation: "Approximation: response divided by amplitude.",
    paraxialPower:
      "Approximation: paraxial (ABCD) power of the accommodated schematic eye with a homogeneous lens index (Navarro 1985); the real lens has a gradient index.",
    pupil: "Approximation: fixed pupil diameter from the schematic eye; the luminance-dependent pupil (Watson & Yellott 2012) arrives in Milestone 3.",
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
