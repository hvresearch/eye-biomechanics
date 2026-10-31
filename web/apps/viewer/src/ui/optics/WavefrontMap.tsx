import { useScene } from "../../store/scene";
import type { WaveResult } from "../../worker/messages";
import { css, divergingColor, symmetricLimit } from "./colormap";
import { ImageCanvas } from "./ImageCanvas";

/** The OPD over the pupil as a diverging heat map centered at 0 µm, +y up, with its scale. */
export function WavefrontMap({ wave, limit, size, testId }: { wave: WaveResult; limit: number; size: number; testId?: string }) {
  const theme = useScene((s) => s.theme);
  const n = wave.gridN;
  const pixel = (i: number) => {
    // Grid row 0 is −y; draw +y at the top.
    const r = Math.floor(i / n);
    const v = wave.opdGrid[(n - 1 - r) * n + (i % n)]!;
    return Number.isNaN(v) ? null : divergingColor(v / limit, theme);
  };
  return (
    <ImageCanvas
      n={n}
      crop={n}
      pixel={pixel}
      size={size}
      label={`Wavefront error map, ±${limit.toFixed(2)} µm`}
      testId={testId}
      version={[wave.opdGrid, theme]}
    />
  );
}

/** Shared symmetric limit for the maps of several configurations (one color scale for comparison). */
export function wavefrontLimit(waves: readonly WaveResult[]): number {
  return Math.max(...waves.map((w) => symmetricLimit(w.opdGrid)));
}

/** A small horizontal diverging scale bar labeled in µm. */
export function DivergingScale({ limit, width }: { limit: number; width: number }) {
  const theme = useScene((s) => s.theme);
  const stops = [-1, -0.5, 0, 0.5, 1];
  return (
    <svg width={width} height={22} className="scale chart-svg" aria-label={`Scale −${limit.toFixed(2)} to +${limit.toFixed(2)} µm`}>
      <defs>
        <linearGradient id="opd-scale" x1="0" x2="1">
          {stops.map((t) => (
            <stop key={t} offset={(t + 1) / 2} stopColor={css(divergingColor(t, theme))} />
          ))}
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={6} rx={3} fill="url(#opd-scale)" />
      <text className="tick" x={0} y={18}>
        −{limit.toFixed(2)}
      </text>
      <text className="tick" x={width / 2} y={18} textAnchor="middle">
        0 µm
      </text>
      <text className="tick" x={width} y={18} textAnchor="end">
        +{limit.toFixed(2)}
      </text>
    </svg>
  );
}
