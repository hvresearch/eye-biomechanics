import table from "../../../../../data/pupil/near-response.json";

export const NEAR_RESPONSE = table;

/**
 * Vergence demand in meter angles for a vergence angle (degrees) between lines of sight from
 * eyes `ipdMm` apart: 2·tan(v/2)/IPD (1/d for a target at d meters on the midline).
 */
export function vergenceDemandMA(vergenceDeg: number, ipdMm: number): number {
  if (!(ipdMm > 0)) throw new RangeError(`ipdMm must be > 0, got ${ipdMm}`);
  if (!(vergenceDeg > 0)) return 0;
  return (2 * Math.tan((vergenceDeg * Math.PI) / 360)) / (ipdMm / 1000);
}

/** Near-triad miosis (mm) for a vergence demand in meter angles (linear, approximation); 0 when not converging. */
export function nearMiosisMm(vergenceMA: number): number {
  if (Number.isNaN(vergenceMA)) throw new RangeError("vergenceMA is NaN");
  return Math.max(0, vergenceMA) * table.miosisMmPerMA;
}
