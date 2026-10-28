import { MUSCLE_NAMES } from "@eye/eye-model";
import { useScene, type Side } from "../store/scene";
import { EyeCutaway } from "./EyeCutaway";
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
 * With `cut`, the eye is sliced horizontally through its optical axis (it keeps the lower
 * half) and its traced ray fan is drawn in the cut.
 */
export function Globe({ side, cut }: { side: Side; cut: boolean }) {
  const ipd = useScene((s) => s.scene.ipdMm);
  const gaze = useScene((s) => s.binocular[side].gaze);
  const axial = useScene((s) => s.eyes[side].axialLengthMm);
  const retinaR = useScene((s) => Math.abs(s.eyes[side].retina.radiusMm));
  const x = side === "right" ? ipd / 2 : -ipd / 2;
  const q: [number, number, number, number] = side === "right" ? [gaze[0], gaze[1], gaze[2], gaze[3]] : [gaze[0], -gaze[1], -gaze[2], gaze[3]];
  return (
    <group position={[x, 0, 0]}>
      <Orbit side={side} />
      {MUSCLE_NAMES.map((name, i) => (
        <Muscle key={name} side={side} index={i} />
      ))}
      <group quaternion={q}>
        {/* The cutaway and fan are built in the optical frame's sagittal plane; turning them a
            quarter turn about the optical axis makes the cut horizontal (an axial section) and
            lays the fan in it, both visible from above. The optics are rotationally symmetric. */}
        <group position={[0, 0, -(axial - retinaR)]} rotation={[0, 0, Math.PI / 2]}>
          <EyeCutaway side={side} cut={cut} />
          {cut && <RayFan side={side} />}
        </group>
      </group>
    </group>
  );
}
