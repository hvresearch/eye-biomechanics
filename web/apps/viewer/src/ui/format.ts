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
