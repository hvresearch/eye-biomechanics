import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { surfacesFromSequential } from "../../src/surfaces/sequential";
import type { SequentialSurface, Surface } from "../../src/surfaces/types";

interface Table {
  relaxed: SequentialSurface[];
  retina: { radiusMm: number; conic: number };
  axialLengthMm: number;
  accommodation: { coefficients: Record<string, number> };
}

/** The Navarro 1985 table read straight from data/ (optics cannot import eye-model). */
export function navarroTable(): Table {
  return JSON.parse(
    readFileSync(resolve(import.meta.dirname, "../../../../../data/schematic-eyes/navarro-1985.json"), "utf8"),
  ) as Table;
}

/**
 * Relaxed (A = 0) or accommodated Navarro eye as optics surfaces, retina last. The
 * accommodated form applies Table 4 (L = ln(1 + A)) with the file's coefficients,
 * keeping the retina at the table's axial length (the vitreous absorbs the change), as
 * eye-model's buildSurfaces does.
 */
export function navarroSurfaces(accommodationD = 0): Surface[] {
  const t = navarroTable();
  const seq = t.relaxed.map((s) => ({ ...s, mediumAfter: { ...s.mediumAfter } }));
  if (accommodationD > 0) {
    const c = t.accommodation.coefficients;
    const A = accommodationD;
    const L = Math.log1p(A);
    const cp = seq[1];
    const la = seq[2];
    const lp = seq[3];
    if (!cp || !la || !lp) throw new Error("unexpected table");
    cp.thicknessToNextMm += (c.chamberDepthPerLn ?? 0) * L;
    la.radiusMm += (c.anteriorRadiusPerLn ?? 0) * L;
    la.conic = (la.conic ?? 0) + (c.anteriorConicPerLn ?? 0) * L;
    la.thicknessToNextMm += (c.thicknessPerLn ?? 0) * L;
    la.mediumAfter.index555 += (c.indexCoeff ?? 0) * (10 * A + A * A);
    lp.radiusMm += (c.posteriorRadiusPerLn ?? 0) * L;
    lp.conic = (lp.conic ?? 0) + (c.posteriorConicPerLn ?? 0) * L;
  }
  const last = seq[seq.length - 1];
  if (!last) throw new Error("empty table");
  last.thicknessToNextMm = t.axialLengthMm - seq.slice(0, -1).reduce((z, q) => z + q.thicknessToNextMm, 0);
  seq.push({
    name: "retina",
    radiusMm: t.retina.radiusMm,
    conic: t.retina.conic,
    thicknessToNextMm: 0,
    mediumAfter: { ...last.mediumAfter },
    apertureSemiDiamMm: 12,
  });
  return surfacesFromSequential(seq);
}
