import type { SequentialSurface, Surface } from "@eye/optics";
import { SURFACE_NAMES, lensGeometry, lensParameterForAccommodation, relaxedLensGeometry } from "../accommodation/lens";
import type { EyeParameters, Surface as SchemaSurface } from "../schema/types";
import type { EyeState } from "./../state/types";

export const RETINA_SURFACE_NAME = "retina";

function required(s: SchemaSurface, key: "radiusMm" | "rxMm" | "ryMm" | "axisDeg"): number {
  const v = s[key];
  if (v === undefined) throw new Error(`Surface "${s.name}" (${s.type}) has no ${key}`);
  return v;
}

function toSequential(s: SchemaSurface): SequentialSurface {
  const common = {
    name: s.name,
    tilt: s.tilt ?? { xDeg: 0, yDeg: 0 },
    decenter: s.decenter ?? { xMm: 0, yMm: 0 },
    thicknessToNextMm: s.thicknessToNextMm,
    mediumAfter: { name: s.mediumAfter.name, index555: s.mediumAfter.index555 },
    apertureSemiDiamMm: s.apertureSemiDiamMm,
  };
  switch (s.type) {
    case "conic":
      return { ...common, kind: "conic", radiusMm: required(s, "radiusMm"), conic: s.conic ?? 0 };
    case "toric":
      return {
        ...common,
        kind: "toric",
        rxMm: required(s, "rxMm"),
        ryMm: required(s, "ryMm"),
        axisDeg: required(s, "axisDeg"),
        conicX: s.conicX ?? 0,
        conicY: s.conicY ?? 0,
      };
    case "zernike": {
      const z = s.zernikeHeight;
      if (z === undefined) throw new Error(`Surface "${s.name}" is zernike but has no zernikeHeight`);
      return {
        ...common,
        kind: "zernike",
        radiusMm: required(s, "radiusMm"),
        conic: s.conic ?? 0,
        normRadiusMm: z.normRadiusMm,
        coeffsMicrons: [...z.coeffsMicrons],
      };
    }
  }
}

/**
 * Absolute vertex positions from thicknesses, first vertex at z = 0. Done here rather than
 * with optics' `surfacesFromSequential` so that eye-model depends on optics for types only.
 */
function place(seq: readonly SequentialSurface[]): Surface[] {
  const out: Surface[] = [];
  let z = 0;
  for (const s of seq) {
    const common = {
      name: s.name,
      apertureSemiDiamMm: s.apertureSemiDiamMm,
      vertexZMm: z,
      tilt: s.tilt ? { ...s.tilt } : { xDeg: 0, yDeg: 0 },
      decenter: s.decenter ? { ...s.decenter } : { xMm: 0, yMm: 0 },
      mediumAfter: { ...s.mediumAfter },
      ...(s.image ? { image: true } : {}),
    };
    if (s.kind === "toric") {
      out.push({ ...common, kind: "toric", rxMm: s.rxMm, ryMm: s.ryMm, axisDeg: s.axisDeg, conicX: s.conicX ?? 0, conicY: s.conicY ?? 0 });
    } else if (s.kind === "zernike") {
      out.push({ ...common, kind: "zernike", radiusMm: s.radiusMm, conic: s.conic ?? 0, normRadiusMm: s.normRadiusMm, coeffsMicrons: [...s.coeffsMicrons] });
    } else {
      out.push({ ...common, kind: "conic", radiusMm: s.radiusMm, conic: s.conic ?? 0 });
    }
    z += s.thicknessToNextMm;
  }
  return out;
}

/** Add `dR` to a surface's radius (both sections of a toric) and `dK` to its conic, with a new index after it. */
function reshape(q: SequentialSurface, dR: number, dK: number, thicknessToNextMm: number, index555?: number): SequentialSurface {
  const mediumAfter = index555 === undefined ? q.mediumAfter : { ...q.mediumAfter, index555 };
  if (q.kind === "toric") {
    return { ...q, rxMm: q.rxMm + dR, ryMm: q.ryMm + dR, conicX: (q.conicX ?? 0) + dK, conicY: (q.conicY ?? 0) + dK, thicknessToNextMm, mediumAfter };
  }
  return { ...q, radiusMm: q.radiusMm + dR, conic: (q.conic ?? 0) + dK, thicknessToNextMm, mediumAfter };
}

/**
 * Optics surfaces for an eye in a given state: the document's surfaces with the lens
 * and anterior chamber replaced by the accommodation-dependent geometry, followed by
 * the retina as the image surface (`image: true`). The anterior corneal vertex is z = 0.
 * Schema defaults (conic, tilt, decenter absent → zero) are applied here; toric and
 * Zernike surfaces are passed through.
 *
 * The lens follows `state.lensParameterA` (the model parameter, see `EyeState`). The retina
 * stays at `axialLengthMm`: accommodation reshapes the lens inside a globe of fixed length,
 * so the vitreous takes up the change in chamber depth and lens thickness.
 */
export function buildSurfaces(params: EyeParameters, state: EyeState): Surface[] {
  return buildSurfacesAt(params, state.lensParameterA);
}

/**
 * `buildSurfaces` for a lens parameter alone (A = 0 is the relaxed eye). The accommodation
 * model's changes are applied as differences from the relaxed geometry, so a toric lens
 * surface keeps its toricity while both sections steepen.
 */
export function buildSurfacesAt(params: EyeParameters, lensParameterA: number): Surface[] {
  const relaxed = relaxedLensGeometry(params);
  const lens = lensGeometry(params, lensParameterA);
  const seq: SequentialSurface[] = params.surfaces.map((s) => {
    const q = toSequential(s);
    switch (s.name) {
      case SURFACE_NAMES.corneaPosterior:
        return { ...q, thicknessToNextMm: lens.anteriorChamberDepthMm };
      case SURFACE_NAMES.lensAnterior:
        return reshape(
          q,
          lens.anteriorRadiusMm - relaxed.anteriorRadiusMm,
          lens.anteriorConic - relaxed.anteriorConic,
          lens.thicknessMm,
          lens.index555,
        );
      case SURFACE_NAMES.lensPosterior:
        return reshape(
          q,
          lens.posteriorRadiusMm - relaxed.posteriorRadiusMm,
          lens.posteriorConic - relaxed.posteriorConic,
          q.thicknessToNextMm,
        );
      default:
        return q;
    }
  });
  const last = seq[seq.length - 1];
  if (!last) throw new Error("EyeParameters has no surfaces");
  const beforeLast = seq.slice(0, -1).reduce((z, q) => z + q.thicknessToNextMm, 0);
  const vitreousMm = params.axialLengthMm - beforeLast;
  if (!(vitreousMm > 0)) {
    throw new Error(`axialLengthMm ${params.axialLengthMm} leaves no room behind the last surface (${beforeLast} mm)`);
  }
  seq[seq.length - 1] = { ...last, thicknessToNextMm: vitreousMm };
  seq.push({
    name: RETINA_SURFACE_NAME,
    kind: "conic",
    radiusMm: params.retina.radiusMm,
    conic: params.retina.conic,
    thicknessToNextMm: 0,
    mediumAfter: { ...last.mediumAfter },
    apertureSemiDiamMm: Math.abs(params.retina.radiusMm),
    image: true,
  });
  return place(seq);
}

/**
 * `lensParameterForAccommodation` bound to this document: the far point of the eye built
 * at each trial parameter is computed by the injected paraxial function.
 */
export function lensParameterFor(
  params: EyeParameters,
  accommodationD: number,
  farPointOf: (surfaces: Surface[]) => number,
): number {
  return lensParameterForAccommodation(accommodationD, (A) => farPointOf(buildSurfacesAt(params, A)));
}
