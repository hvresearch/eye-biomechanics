import type { PsfScale } from "../../store/scene";
import type { WaveResult } from "../../worker/messages";
import { sequentialColor } from "./colormap";
import { ImageCanvas } from "./ImageCanvas";

/** Angular window shown for the PSF and the retinal image, arcmin (a drawing choice). */
export const IMAGE_WINDOW_ARCMIN = 20;
/** Decades shown on the log PSF scale (a drawing choice). */
const LOG_DECADES = 4;

/** The PSF in the central window, normalized to its own peak, on a linear or log scale. */
export function PsfView({ wave, scale, size, testId }: { wave: WaveResult; scale: PsfScale; size: number; testId?: string }) {
  const peak = wave.strehl > 0 ? wave.strehl : 1;
  const pixel = (i: number) => {
    const v = wave.psf[i]! / peak;
    const t = scale === "log" ? 1 + Math.log10(Math.max(v, 10 ** -LOG_DECADES)) / LOG_DECADES : v;
    return sequentialColor(t);
  };
  return (
    <ImageCanvas
      n={wave.psfN}
      crop={IMAGE_WINDOW_ARCMIN / wave.pixelArcmin}
      pixel={pixel}
      size={size}
      label={`Point spread function, ${IMAGE_WINDOW_ARCMIN} arcmin window, ${scale} scale`}
      testId={testId}
      version={[wave.psf, scale]}
    />
  );
}

/** The retinal image of the Snellen E in the same window, in gray levels. */
export function RetinalImage({ wave, size, testId }: { wave: WaveResult; size: number; testId?: string }) {
  const pixel = (i: number): [number, number, number] => {
    const g = 255 * Math.min(1, Math.max(0, wave.retinal[i]!));
    return [g, g, g];
  };
  return (
    <ImageCanvas
      n={wave.psfN}
      crop={IMAGE_WINDOW_ARCMIN / wave.pixelArcmin}
      pixel={pixel}
      size={size}
      label={`Retinal image of a Snellen E, ${IMAGE_WINDOW_ARCMIN} arcmin window`}
      testId={testId}
      version={wave.retinal}
    />
  );
}
