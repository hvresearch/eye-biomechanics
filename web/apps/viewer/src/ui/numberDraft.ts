/** Parses a number box draft; empty or partial text ("", "-", ".") is no value, never zero. */
function parse(text: string): number | null {
  if (text.trim() === "") return null;
  const v = Number(text);
  return Number.isFinite(v) ? v : null;
}

/**
 * Value to commit while the user is still typing: only a finite number already inside
 * [min, max]. Partly typed values such as "4" on the way to "45" commit nothing.
 */
export function liveValue(text: string, min: number, max: number): number | null {
  const v = parse(text);
  return v !== null && v >= min && v <= max ? v : null;
}

/** Value to commit when editing ends (blur or Enter): any finite number, clamped to [min, max]. */
export function finalValue(text: string, min: number, max: number): number | null {
  const v = parse(text);
  return v === null ? null : Math.min(max, Math.max(min, v));
}
