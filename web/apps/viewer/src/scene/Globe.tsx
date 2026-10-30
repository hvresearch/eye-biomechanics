import { useFrame } from "@react-three/fiber";
import { MUSCLE_NAMES } from "@eye/eye-model";
import { useMemo, useRef } from "react";
import { Plane, type Group } from "three";
import { useScene, type Side } from "../store/scene";
import { cutPlane } from "./cut";
import { DeformationMap } from "./DeformationMap";
import { EyeCutaway } from "./EyeCutaway";
import { Markers } from "./Markers";
import { Muscle } from "./Muscle";
import { Orbit } from "./Orbit";
import { RayFan } from "./RayFan";

/**
 * One eye in the head frame (x to the subject's right, y up, z posterior, mm). The group
 * sits at the eye's center of rotation. Eye-model geometry is in the eye's local frame
 * (x temporal), so the left eye's orbit and muscle points are mirrored in x explicitly (a
 * negative group scale would break the screen-space lines) and its gaze quaternion is
 * mirrored to (x, −y, −z, w). Orbit and muscles are fixed in the orbit (their paths already
 * carry the gaze); the globe rotates by the Listing's-law quaternion. The
 * optical model has its corneal vertex at z = 0, so it is shifted to put the globe center at
 * the center of rotation (an approximation: the real center of rotation is not the globe
 * center).
 *
 * The eye named by the store's cut settings is sliced by a plane fixed in the globe (it turns
 * with the gaze); the right eye's traced ray fan is drawn in that eye's sagittal or horizontal
 * section.
 */
export function Globe({ side }: { side: Side }) {
  const ipd = useScene((s) => s.scene.ipdMm);
  const gaze = useScene((s) => s.binocular[side].gaze);
  const axial = useScene((s) => s.eyes[side].axialLengthMm);
  const retinaR = useScene((s) => Math.abs(s.eyes[side].retina.radiusMm));
  const cut = useScene((s) => (s.cut.side === side ? s.cut : null));
  const x = side === "right" ? ipd / 2 : -ipd / 2;
  const q: [number, number, number, number] = side === "right" ? [gaze[0], gaze[1], gaze[2], gaze[3]] : [gaze[0], -gaze[1], -gaze[2], gaze[3]];

  // The cut in the globe group's frame: the eye's own frame, with x mirrored for the left eye.
  const orientation = cut?.orientation;
  const depthMm = cut?.depthMm;
  const local = useMemo(() => {
    if (!orientation || depthMm === undefined) return null;
    const p = cutPlane({ orientation, depthMm, side }, axial);
    if (side === "left") p.normal.x = -p.normal.x;
    return p;
  }, [orientation, depthMm, side, axial]);
  // One world-space plane per cut eye, shared by every clipped material and updated in place.
  const clip = useMemo(() => (local ? new Plane() : null), [local !== null]);
  const globe = useRef<Group>(null);
  useFrame(() => {
    if (!clip || !local || !globe.current) return;
    // The world matrix is otherwise a frame behind after a gaze change.
    globe.current.updateWorldMatrix(true, false);
    clip.copy(local).applyMatrix4(globe.current.matrixWorld);
  });

  // The cutaway and fan are built in the optical frame's sagittal plane (the drawing is
  // rotationally symmetric); a quarter turn about the optical axis lays the fan in the
  // horizontal section instead. A frontal cut shows no fan plane, so it keeps the horizontal.
  const turn = orientation === "sagittal" ? 0 : Math.PI / 2;
  return (
    <group position={[x, 0, 0]}>
      <Orbit side={side} />
      {MUSCLE_NAMES.map((name, i) => (
        <Muscle key={name} side={side} index={i} />
      ))}
      <Markers side={side} />
      <group quaternion={q} ref={globe}>
        <group position={[0, 0, -(axial - retinaR)]} rotation={[0, 0, turn]}>
          <EyeCutaway side={side} clip={clip} />
          {clip && side === "right" && <RayFan side={side} />}
        </group>
        {/* A loaded biomechanics result's heat map (right eye only), in the eye's own frame, cut with the eye. */}
        {side === "right" && <DeformationMap apexOffsetMm={-(axial - retinaR)} clip={clip} />}
      </group>
    </group>
  );
}
