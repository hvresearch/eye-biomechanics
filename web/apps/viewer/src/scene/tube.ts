/**
 * Drawn radius of a muscle along its path, u in [0, 1] from origin (0) to insertion (1):
 * a fusiform belly that reaches `bellyMm` and tapers to the tendon radius over the last
 * `tendonFraction` of the path. A drawing choice, not anatomy data.
 */
export function taperedRadius(u: number, bellyMm: number, tendonMm: number, tendonFraction: number): number {
  const c = Math.min(1, Math.max(0, u));
  const tf = Math.min(0.9, Math.max(0, tendonFraction));
  const bellyEnd = 1 - tf;
  if (c >= bellyEnd) return tendonMm;
  // Belly: rises from the tendon radius at the origin to the maximum and back, as a sine lobe.
  const s = c / bellyEnd;
  return tendonMm + (bellyMm - tendonMm) * Math.sin(Math.PI * s) ** 0.6;
}
