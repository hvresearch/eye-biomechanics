import {
  EOM_TABLE,
  GLOBE_RADIUS_MM,
  MUSCLE_NAMES,
  SURFACE_NAMES,
  findSurface,
  lensGeometry,
  musclesFromDocument,
  type EyeParameters,
  type EyeState,
  type Surface,
} from "@eye/eye-model";
import drawing from "../../../../../data/anatomy/orbit-drawing.json";
import anatomy from "../../../../../data/anatomy/globe-cutaway.json";
import type { Side } from "../store/scene";
import { formatDelta } from "./format";
import { heatMapTooltip, muscleLabel, muscleTooltip } from "./tooltips";

export type StructureKey =
  | "cornea"
  | "aqueous"
  | "iris"
  | "lens"
  | "zonules"
  | "ciliary"
  | "vitreous"
  | "retina"
  | "sclera"
  | "opticNerve"
  | "orbit"
  | "annulus";

export const STRUCTURE_KEYS: readonly StructureKey[] = [
  "cornea",
  "aqueous",
  "iris",
  "lens",
  "zonules",
  "ciliary",
  "vitreous",
  "retina",
  "sclera",
  "opticNerve",
  "orbit",
  "annulus",
];

export const STRUCTURE_LABELS: Record<StructureKey, string> = {
  cornea: "Cornea",
  aqueous: "Anterior chamber (aqueous humour)",
  iris: "Iris",
  lens: "Crystalline lens",
  zonules: "Zonules",
  ciliary: "Ciliary body and muscle",
  vitreous: "Vitreous",
  retina: "Retina",
  sclera: "Sclera",
  opticNerve: "Optic nerve",
  orbit: "Bony orbit",
  annulus: "Annulus of Zinn",
};

export type HoverTarget =
  | { kind: "structure"; key: StructureKey; side: Side }
  | { kind: "muscle"; side: Side; index: number }
  | { kind: "marker"; side: Side; index: number; marker: "insertion" | "pulley" }
  | { kind: "heatMap"; side: Side };

/** What the heat-map readout needs beyond the eye: the loaded result's largest displacement and the drawing scale. */
export interface HoverContext {
  heatMap?: { maxUm: number; exaggeration: number } | null;
}

export interface HoverInfo {
  title: string;
  rows: { label: string; value: string }[];
  tooltip: string;
}

export function sameTarget(a: HoverTarget, b: HoverTarget): boolean {
  if (a.kind !== b.kind || a.side !== b.side) return false;
  if (a.kind === "structure" && b.kind === "structure") return a.key === b.key;
  if (a.kind === "muscle" && b.kind === "muscle") return a.index === b.index;
  if (a.kind === "marker" && b.kind === "marker") return a.index === b.index && a.marker === b.marker;
  return a.kind === "heatMap";
}

export function targetId(t: HoverTarget): string {
  if (t.kind === "structure") return `${t.side}-${t.key}`;
  if (t.kind === "muscle") return `${t.side}-${MUSCLE_NAMES[t.index] ?? t.index}`;
  if (t.kind === "heatMap") return `${t.side}-heat-map`;
  return `${t.side}-${MUSCLE_NAMES[t.index] ?? t.index}-${t.marker}`;
}

const mm = (x: number, digits = 2) => `${x.toFixed(digits)} mm`;
const dpt = (x: number) => `${x.toFixed(2)} D`;
const idx = (n: number) => n.toFixed(4);

/** A surface's radius: one value for a conic, both principal sections for a toric. */
function radiusText(s: Surface): string {
  if (s.type === "toric") return `${mm(s.rxMm ?? Number.NaN)} / ${mm(s.ryMm ?? Number.NaN)} at ${s.axisDeg ?? 0}°`;
  return mm(s.radiusMm ?? Number.NaN);
}

function conicText(s: Surface): string {
  if (s.type === "toric") return `${(s.conicX ?? 0).toFixed(2)} / ${(s.conicY ?? 0).toFixed(2)}`;
  return (s.conic ?? 0).toFixed(2);
}

const DRAWING_NOTE = "Drawn for reference only (data/anatomy); it does not enter any computed quantity.";
const EYE_SIDE: Record<Side, string> = { right: "right eye", left: "left eye" };

/** Center thickness from the cornea to the lens at the current accommodation, and the vitreous behind it. */
function axialSegments(eye: EyeParameters, state: EyeState) {
  const ca = findSurface(eye, SURFACE_NAMES.corneaAnterior);
  const lens = lensGeometry(eye, state.lensParameterA);
  const vitreousMm = eye.axialLengthMm - ca.thicknessToNextMm - lens.anteriorChamberDepthMm - lens.thicknessMm;
  return { ca, lens, vitreousMm };
}

function structureInfo(key: StructureKey, eye: EyeParameters, state: EyeState): Omit<HoverInfo, "title"> {
  const { ca, lens, vitreousMm } = axialSegments(eye, state);
  const cp = findSurface(eye, SURFACE_NAMES.corneaPosterior);
  const lp = findSurface(eye, SURFACE_NAMES.lensPosterior);
  switch (key) {
    case "cornea":
      return {
        rows: [
          { label: "Anterior radius", value: radiusText(ca) },
          { label: "Anterior conic", value: conicText(ca) },
          { label: "Posterior radius", value: radiusText(cp) },
          { label: "Central thickness", value: mm(ca.thicknessToNextMm, 3) },
          { label: "Index (555 nm)", value: idx(ca.mediumAfter.index555) },
        ],
        tooltip: `From the EyeParameters document "${eye.label}". The drawn profile is the meridian at 0°; a toric surface is drawn rotationally symmetric.`,
      };
    case "aqueous":
      return {
        rows: [
          { label: "Anterior chamber depth", value: mm(lens.anteriorChamberDepthMm) },
          { label: "Index (555 nm)", value: idx(cp.mediumAfter.index555) },
          { label: "Accommodation", value: dpt(state.accommodationD) },
        ],
        tooltip: "Depth from the posterior cornea to the anterior lens at the current accommodation (the lens model moves the anterior lens forward as it accommodates).",
      };
    case "iris":
      return {
        rows: [
          { label: "Pupil diameter", value: mm(state.pupilMm) },
          { label: "Light-adapted pupil", value: mm(state.pupilBaseMm) },
          { label: "Drawn thickness", value: mm(anatomy.irisThicknessMm, 1) },
        ],
        tooltip: `Approximation: pupil from the document's "${eye.pupil.model}" model at the scene's luminance and age, minus the near miosis; the iris itself is drawn (data/anatomy).`,
      };
    case "lens":
      return {
        rows: [
          { label: "Anterior radius", value: mm(lens.anteriorRadiusMm) },
          { label: "Posterior radius", value: mm(lens.posteriorRadiusMm) },
          { label: "Thickness", value: mm(lens.thicknessMm, 3) },
          { label: "Index (555 nm)", value: idx(lens.index555) },
          { label: "Accommodation", value: dpt(state.accommodationD) },
        ],
        tooltip:
          "Approximation: homogeneous lens index (the real lens has a gradient index). Radii, thickness, and index at the current accommodation from the document's lens accommodation model (Navarro 1985 Table 4 form).",
      };
    case "zonules":
      return {
        rows: [
          { label: "Accommodation", value: dpt(state.accommodationD) },
          { label: "Ciliary activation", value: state.ciliaryActivation.toFixed(2) },
          { label: "Lens equatorial gap (drawn)", value: mm(anatomy.zonuleGapMm, 1) },
        ],
        tooltip:
          "Approximation: zonular tension is not modeled; the lens shape follows the accommodation response directly (Helmholtz: the ciliary muscle contracts, the zonules slacken, the lens rounds up). The band is drawn (data/anatomy).",
      };
    case "ciliary":
      return {
        rows: [
          { label: "Activation", value: state.ciliaryActivation.toFixed(2) },
          { label: "Demand", value: dpt(state.demandD) },
          { label: "Response", value: dpt(state.accommodationD) },
          { label: "Amplitude", value: dpt(state.amplitudeD) },
        ],
        tooltip: "Approximation: activation is the accommodation response divided by the amplitude for the subject's age; the body's shape is drawn (data/anatomy).",
      };
    case "vitreous":
      return {
        rows: [
          { label: "Depth on axis", value: mm(vitreousMm) },
          { label: "Axial length", value: mm(eye.axialLengthMm) },
          { label: "Index (555 nm)", value: idx(lp.mediumAfter.index555) },
        ],
        tooltip: "From the posterior lens to the retina along the optical axis; it absorbs the forward motion of the lens as the eye accommodates.",
      };
    case "retina":
      return {
        rows: [
          { label: "Radius of curvature", value: mm(Math.abs(eye.retina.radiusMm)) },
          { label: "Conic", value: eye.retina.conic.toFixed(2) },
          { label: "Axial length", value: mm(eye.axialLengthMm) },
        ],
        tooltip: "The image surface of the EyeParameters document; its thickness is drawn (data/anatomy).",
      };
    case "sclera":
      return {
        rows: [
          { label: "Globe radius (muscle model)", value: mm(GLOBE_RADIUS_MM, 1) },
          { label: "Drawn radius (retina)", value: mm(Math.abs(eye.retina.radiusMm)) },
          { label: "Drawn thickness", value: mm(anatomy.scleraThicknessMm, 1) },
        ],
        tooltip: `Approximation: the globe is drawn as the sphere of the retina radius; the muscle paths wrap a ${GLOBE_RADIUS_MM} mm sphere (data/eom). Scleral thickness is drawn (data/anatomy).`,
      };
    case "opticNerve":
      return {
        rows: [
          { label: "Drawn radius", value: mm(drawing.opticNerve.radiusMm, 1) },
          { label: "Exit, nasal of the posterior pole", value: mm(drawing.opticNerve.exitOffsetNasalMm, 1) },
        ],
        tooltip: DRAWING_NOTE,
      };
    case "orbit":
      return {
        rows: [
          { label: "Rim width", value: mm(2 * drawing.orbit.rimHalfWidthMm, 0) },
          { label: "Rim height", value: mm(2 * drawing.orbit.rimHalfHeightMm, 0) },
          { label: "Depth, rim to apex", value: mm(drawing.orbit.apexZMm - drawing.orbit.rimZMm, 0) },
        ],
        tooltip: DRAWING_NOTE,
      };
    case "annulus": {
      const lr = EOM_TABLE.muscles.find((m) => m.name === "lateralRectus")?.originMm ?? [Number.NaN, Number.NaN, Number.NaN];
      return {
        rows: [
          { label: "Behind the globe center", value: mm(lr[2] ?? Number.NaN, 1) },
          { label: "Common rectus origin (x, y)", value: `${(lr[0] ?? Number.NaN).toFixed(1)}, ${(lr[1] ?? Number.NaN).toFixed(1)} mm` },
          { label: "Drawn radius", value: mm(drawing.annulus.radiusMm, 1) },
        ],
        tooltip: "Approximation: the four recti share one origin point (data/eom, v1 geometry; Volkmann's separate origins are not transcribed). The ring is drawn.",
      };
    }
  }
}

/**
 * The stage's hover readout for a structure, a muscle, or a muscle marker: the name, the
 * current dimensions with units, and the defining parameters, taken from the eye's
 * EyeParameters document and its derived state. Approximations are named in the tooltip.
 */
export function hoverInfo(t: HoverTarget, eye: EyeParameters, state: EyeState, ctx: HoverContext = {}): HoverInfo {
  if (t.kind === "heatMap") {
    const h = ctx.heatMap;
    return {
      title: `Displacement heat map (${EYE_SIDE[t.side]}, elastic)`,
      rows: h
        ? [
            { label: "Largest displacement", value: `${h.maxUm.toFixed(1)} µm` },
            { label: "Drawn at", value: `×${h.exaggeration}` },
          ]
        : [{ label: "Result", value: "none loaded" }],
      tooltip: heatMapTooltip(h?.exaggeration ?? 1),
    };
  }
  if (t.kind === "structure") {
    return { title: `${STRUCTURE_LABELS[t.key]} (${EYE_SIDE[t.side]})`, ...structureInfo(t.key, eye, state) };
  }
  const name = MUSCLE_NAMES[t.index];
  if (name === undefined) throw new RangeError(`No muscle at index ${t.index}`);
  const m = musclesFromDocument(eye)[t.index];
  const doc = eye.extraocularMuscles?.find((d) => d.name === name);
  const label = `${muscleLabel(name)} (${EYE_SIDE[t.side]})`;
  if (t.kind === "muscle") {
    const len = state.eomLengthMm[t.index] ?? Number.NaN;
    const rest = state.eomRestLengthMm[t.index] ?? Number.NaN;
    return {
      title: label,
      rows: [
        { label: "Length", value: mm(len, 1) },
        { label: "Change from primary", value: `${formatDelta(len - rest)} mm` },
        { label: "Activation", value: (state.eomActivation[t.index] ?? 0).toFixed(2) },
        { label: "Tendon slack length", value: mm(m?.tendon.slackLengthMm ?? Number.NaN, 1) },
      ],
      tooltip: muscleTooltip(),
    };
  }
  if (t.marker === "insertion") {
    return {
      title: `${label}: insertion`,
      rows: [
        { label: "From the limbus", value: doc ? mm(doc.insertionDistFromLimbusMm, 1) : "default table" },
        { label: "Width", value: mm(m?.insertionWidthMm ?? Number.NaN, 1) },
      ],
      tooltip: `Insertion center and width on the globe (data/eom), drawn as an arc across the muscle; it rotates with the globe.${m?.pulleyMm ? "" : " Fixed pulleys not tabled: the path runs from the origin straight to the globe."}`,
    };
  }
  const p = m?.pulleyMm;
  return {
    title: `${label}: pulley`,
    rows: p
      ? [
          { label: "Position (x, y, z)", value: `${p[0].toFixed(1)}, ${p[1].toFixed(1)}, ${p[2].toFixed(1)} mm` },
          { label: "From the globe center", value: mm(Math.hypot(p[0], p[1], p[2]), 1) },
        ]
      : [
          { label: "Position", value: "not tabled" },
          { label: "Path", value: "origin to globe" },
        ],
    tooltip: "Approximation: fixed pulleys (no pulley motion with gaze); coordinates from the document, eye-local frame (x temporal, y superior, z posterior).",
  };
}
