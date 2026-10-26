export type { Vec3 } from "./math/vec3";
export { add, cross, distance, dot, norm, normalize, scale, sub } from "./math/vec3";
export type { Medium, SequentialSurface, Surface } from "./surfaces/types";
export { intersect, normalAt, sag } from "./surfaces/conic";
export { surfacesFromSequential } from "./surfaces/sequential";
