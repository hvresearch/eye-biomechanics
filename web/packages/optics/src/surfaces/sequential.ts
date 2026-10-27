import type { SequentialSurface, Surface } from "./types";

/**
 * Convert a thickness-ordered surface list (the EyeParameters convention) to absolute
 * vertex positions. Optional conic, tilt, and decenter default to zero as the schema
 * specifies. The first vertex sits at `startZMm`.
 */
export function surfacesFromSequential(seq: readonly SequentialSurface[], startZMm = 0): Surface[] {
  const out: Surface[] = [];
  let z = startZMm;
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
