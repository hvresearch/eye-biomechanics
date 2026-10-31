/** A number with an explicit sign and a true minus; values that round to zero carry no sign. */
export function formatSigned(x: number, digits: number): string {
  const s = Math.abs(x).toFixed(digits);
  if (Number(s) === 0) return s;
  return `${x > 0 ? "+" : "−"}${s}`;
}

/** A change from a reference, two decimals (mm for muscle lengths). */
export function formatDelta(x: number): string {
  return formatSigned(x, 2);
}

/**
 * The three induced-refraction readouts of a loaded result: the change when the worker has
 * computed it, "…" while it is pending, and "no reference" when the document came without a
 * sidecar (there is no unloaded eye to compare with).
 */
export function inducedReadouts(
  induced: { delta: { M: number; J0: number; J45: number; sphereD: number; cylinderD: number; axisDeg: number } } | null,
  hasReference: boolean,
): { sphere: string; cylinder: string; vectors: string } {
  if (!induced) {
    const v = hasReference ? "…" : "no reference";
    return { sphere: v, cylinder: v, vectors: v };
  }
  const d = induced.delta;
  return {
    sphere: formatSigned(d.sphereD, 3),
    cylinder: `${formatSigned(d.cylinderD, 3)} × ${Math.round(d.axisDeg)}`,
    vectors: `${formatSigned(d.M, 3)} ${formatSigned(d.J0, 3)} ${formatSigned(d.J45, 3)}`,
  };
}
