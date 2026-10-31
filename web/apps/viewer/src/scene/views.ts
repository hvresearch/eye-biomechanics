import type { Side } from "../store/scene";

/** The stage's clinical camera snaps (spec §6.2). */
export type ViewName = "anterior" | "lateral" | "superior" | "sagittal";

/** Number keys that snap the camera (shortcuts.ts). */
export const VIEW_KEYS: Record<"1" | "2" | "3" | "4", ViewName> = {
  "1": "anterior",
  "2": "lateral",
  "3": "superior",
  "4": "sagittal",
};

export const VIEW_LABELS: Record<ViewName, string> = {
  anterior: "Anterior",
  lateral: "Lateral",
  superior: "Superior",
  sagittal: "Sagittal section",
};

/**
 * Camera distance from the eye's center for each view, mm (UI constants: the whole orbit
 * fits the frame at the default field of view; the section view is a close-up of the globe).
 */
export const VIEW_DISTANCE_MM: Record<ViewName, number> = {
  anterior: 150,
  lateral: 150,
  superior: 150,
  sagittal: 70,
};

/** Duration of the camera's move to a snapped view, s (a UI choice). */
export const VIEW_TRANSITION_S = 0.6;

type V3 = [number, number, number];

export interface CameraPose {
  position: V3;
  target: V3;
  up: V3;
}

/**
 * Camera pose for a clinical view of one eye, in the head frame (x to the subject's right,
 * y up, z posterior, mm), looking at that eye's center of rotation. Anterior looks along +z
 * from in front of the face; lateral and the sagittal section look along x from the eye's
 * temporal side (the sagittal cut keeps the nasal half, so its section faces that camera);
 * superior looks down from +y with the anterior side up on screen.
 */
export function cameraFor(view: ViewName, side: Side, ipdMm: number): CameraPose {
  const sx = side === "right" ? 1 : -1; // head x of this eye's temporal side
  const center: V3 = [(sx * ipdMm) / 2, 0, 0];
  const d = VIEW_DISTANCE_MM[view];
  const at = (dx: number, dy: number, dz: number): V3 => [center[0] + dx, center[1] + dy, center[2] + dz];
  switch (view) {
    case "anterior":
      return { position: at(0, 0, -d), target: center, up: [0, 1, 0] };
    case "lateral":
    case "sagittal":
      return { position: at(sx * d, 0, 0), target: center, up: [0, 1, 0] };
    case "superior":
      return { position: at(0, d, 0), target: center, up: [0, 0, -1] };
  }
}
