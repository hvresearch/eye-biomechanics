import type { SequentialSurface, Surface } from "@eye/optics";
import { SURFACE_NAMES, lensGeometry } from "../accommodation/lens";
import type { EyeParameters, Surface as SchemaSurface } from "../schema/types";
import type { EyeState } from "./../state/types";

export const RETINA_SURFACE_NAME = "retina";

function toSequential(s: SchemaSurface): SequentialSurface {
  if (s.type !== "conic" || s.radiusMm === undefined) {
    throw new Error(`Surface "${s.name}" is ${s.type}; Milestone 1 builds conic surfaces only`);
  }
  return {
    name: s.name,
    radiusMm: s.radiusMm,
    conic: s.conic ?? 0,
    tilt: s.tilt ?? { xDeg: 0, yDeg: 0 },
    decenter: s.decenter ?? { xMm: 0, yMm: 0 },
    thicknessToNextMm: s.thicknessToNextMm,
    mediumAfter: { name: s.mediumAfter.name, index555: s.mediumAfter.index555 },
    apertureSemiDiamMm: s.apertureSemiDiamMm,
  };
}

/**
 * Absolute vertex positions from thicknesses, first vertex at z = 0. Done here rather than
 * with `surfacesFromSequential` so that eye-model depends on optics for types only.
 */
function place(seq: readonly SequentialSurface[]): Surface[] {
  const out: Surface[] = [];
  let z = 0;
  for (const s of seq) {
    out.push({
      name: s.name,
      kind: "conic",
      radiusMm: s.radiusMm,
      conic: s.conic ?? 0,
      apertureSemiDiamMm: s.apertureSemiDiamMm,
      vertexZMm: z,
      tilt: s.tilt ? { ...s.tilt } : { xDeg: 0, yDeg: 0 },
      decenter: s.decenter ? { ...s.decenter } : { xMm: 0, yMm: 0 },
      mediumAfter: { ...s.mediumAfter },
    });
    z += s.thicknessToNextMm;
  }
  return out;
}

/**
 * Optics surfaces for an eye in a given state: the document's surfaces with the lens
 * and anterior chamber replaced by the accommodation-dependent geometry, followed by
 * the retina as a non-refracting image surface. The anterior corneal vertex is z = 0.
 * Schema defaults (conic, tilt, decenter absent → zero) are applied here.
 *
 * The vitreous thickness is kept at the document's value, so during accommodation the
 * retina moves by the change in lens thickness plus chamber depth (Navarro 1985 keeps the
 * vitreous fixed; `axialLengthMm` in the document describes the relaxed eye).
 */
export function buildSurfaces(params: EyeParameters, state: EyeState): Surface[] {
  const lens = lensGeometry(params, state.accommodationD);
  const seq: SequentialSurface[] = params.surfaces.map((s) => {
    const q = toSequential(s);
    switch (s.name) {
      case SURFACE_NAMES.corneaPosterior:
        return { ...q, thicknessToNextMm: lens.anteriorChamberDepthMm };
      case SURFACE_NAMES.lensAnterior:
        return {
          ...q,
          radiusMm: lens.anteriorRadiusMm,
          conic: lens.anteriorConic,
          thicknessToNextMm: lens.thicknessMm,
          mediumAfter: { ...q.mediumAfter, index555: lens.index555 },
        };
      case SURFACE_NAMES.lensPosterior:
        return { ...q, radiusMm: lens.posteriorRadiusMm, conic: lens.posteriorConic };
      default:
        return q;
    }
  });
  const last = seq[seq.length - 1];
  if (!last) throw new Error("EyeParameters has no surfaces");
  seq.push({
    name: RETINA_SURFACE_NAME,
    radiusMm: params.retina.radiusMm,
    conic: params.retina.conic,
    thicknessToNextMm: 0,
    mediumAfter: { ...last.mediumAfter },
    apertureSemiDiamMm: Math.abs(params.retina.radiusMm),
  });
  return place(seq);
}
