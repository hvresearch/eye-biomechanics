import { useScene } from "../store/scene";
import { paletteFor, type StagePalette } from "./palette";

/** The stage palette of the current theme. */
export function usePalette(): StagePalette {
  return paletteFor(useScene((s) => s.theme));
}
