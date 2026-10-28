import type { Vec3 } from "../math/vec3";

export interface Ray {
  origin: Vec3;
  /** Unit direction. */
  dir: Vec3;
  wavelengthNm: number;
}

export interface TraceHit {
  surface: string;
  point: Vec3;
  /** Unit direction after the surface. */
  dirAfter: Vec3;
  /** Index after the surface. */
  indexAfter: number;
}

export type VignetteReason = "aperture" | "tir" | "miss";

export interface TraceResult {
  hits: TraceHit[];
  /** Σ n·|segment| over the traced segments, mm. */
  opticalPathMm: number;
  vignetted: boolean;
  vignettedAt?: string;
  reason?: VignetteReason;
}
