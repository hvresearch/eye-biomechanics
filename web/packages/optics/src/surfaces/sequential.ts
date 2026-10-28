import type { SequentialSurface, Surface } from "./types";

/** Place one thickness-ordered surface at absolute vertex z, applying the schema defaults. */
export function placeSurface(s: SequentialSurface, vertexZMm: number): Surface {
  const common = {
    name: s.name,
    apertureSemiDiamMm: s.apertureSemiDiamMm,
    vertexZMm,
    tilt: s.tilt ? { ...s.tilt } : { xDeg: 0, yDeg: 0 },
    decenter: s.decenter ? { ...s.decenter } : { xMm: 0, yMm: 0 },
    mediumAfter: { ...s.mediumAfter },
    ...(s.image ? { image: true } : {}),
  };
  switch (s.kind) {
    case "toric":
      return { ...common, kind: "toric", rxMm: s.rxMm, ryMm: s.ryMm, axisDeg: s.axisDeg, conicX: s.conicX ?? 0, conicY: s.conicY ?? 0 };
    case "zernike":
      return {
        ...common,
        kind: "zernike",
        radiusMm: s.radiusMm,
        conic: s.conic ?? 0,
        normRadiusMm: s.normRadiusMm,
        coeffsMicrons: [...s.coeffsMicrons],
      };
    default:
      return { ...common, kind: "conic", radiusMm: s.radiusMm, conic: s.conic ?? 0 };
  }
}

/**
 * Convert a thickness-ordered surface list (the EyeParameters convention) to absolute
 * vertex positions. Optional conic, tilt, and decenter default to zero as the schema
 * specifies. The first vertex sits at `startZMm`.
 */
export function surfacesFromSequential(seq: readonly SequentialSurface[], startZMm = 0): Surface[] {
  const out: Surface[] = [];
  let z = startZMm;
  for (const s of seq) {
    out.push(placeSurface(s, z));
    z += s.thicknessToNextMm;
  }
  return out;
}
