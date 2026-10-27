import { buildSurfaces, deriveEyeState, type EyeParameters, type EyeState, type SceneState } from "@eye/eye-model";
import { paraxialPower, type Surface } from "@eye/optics";

export interface Derived {
  eye: EyeState;
  surfaces: Surface[];
  paraxialPowerD: number;
  /** Far point of the relaxed eye in clinical sign (D); 0 for an emmetrope. */
  farPointD: number;
}

/**
 * Synchronous, pure derivation for the right eye. The far point of the relaxed
 * document decides demand: a preset is emmetropic by construction, but a loaded
 * biomechanics result may not be (spec §4.2).
 */
export function derive(scene: SceneState, params: EyeParameters): Derived {
  const relaxed = deriveEyeState({ ...scene, targetDistanceM: Number.POSITIVE_INFINITY }, params, "right");
  const relaxedSurfaces = buildSurfaces(params, { ...relaxed, accommodationD: 0, lensParameterA: 0 });
  const par = paraxialPower(relaxedSurfaces);
  const farPointD = Number.isFinite(par.farPointD) ? par.farPointD : 0;
  // The lens parameter is solved so the optics accommodate by exactly the controller's
  // response; without this the modeled lag of accommodation would not reach the optics.
  const eye = deriveEyeState(scene, params, "right", farPointD, (s) => paraxialPower(s).farPointD);
  const surfaces = buildSurfaces(params, eye);
  return { eye, surfaces, paraxialPowerD: paraxialPower(surfaces).powerD, farPointD };
}
