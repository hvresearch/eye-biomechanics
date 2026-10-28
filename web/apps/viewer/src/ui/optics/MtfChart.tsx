import { useState } from "react";
import { CHART } from "./colormap";

/** Frequency range shown, cycles per degree (a drawing choice; 60 cpd is about the foveal limit). */
const MAX_CPD = 60;

interface Curve {
  label: string;
  color: string;
  freqCpd: Float32Array;
  radial: Float32Array;
}

function path(freq: Float32Array, values: Float32Array, x: (f: number) => number, y: (v: number) => number): string {
  let d = "";
  for (let i = 0; i < freq.length; i++) {
    const f = freq[i]!;
    if (f > MAX_CPD) break;
    d += `${i === 0 ? "M" : "L"}${x(f).toFixed(1)},${y(values[i]!).toFixed(1)}`;
  }
  return d;
}

function at(freq: Float32Array, values: Float32Array, f: number): number {
  let i = 0;
  while (i < freq.length - 1 && freq[i + 1]! < f) i++;
  const f0 = freq[i]!;
  const f1 = freq[i + 1] ?? f0;
  const t = f1 > f0 ? (f - f0) / (f1 - f0) : 0;
  return values[i]! + t * ((values[i + 1] ?? values[i]!) - values[i]!);
}

/** Radial MTF curves with the diffraction limit (dashed), 0–60 cpd, and a crosshair tooltip. */
export function MtfChart({
  curves,
  diffraction,
  width,
  height,
  testId,
}: {
  curves: Curve[];
  diffraction: { freqCpd: Float32Array; radial: Float32Array };
  width: number;
  height: number;
  testId?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const left = 26;
  const right = 6;
  const top = 6;
  const bottom = 16;
  const x = (f: number) => left + (f / MAX_CPD) * (width - left - right);
  const y = (v: number) => top + (1 - v) * (height - top - bottom);
  return (
    <div className="chart" data-testid={testId}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Modulation transfer function"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const f = ((e.clientX - rect.left - left) / (width - left - right)) * MAX_CPD;
          setHover(f >= 0 && f <= MAX_CPD ? f : null);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={left} x2={width - right} y1={y(v)} y2={y(v)} stroke={CHART.grid} strokeWidth={1} />
            <text x={left - 4} y={y(v) + 3} fill={CHART.muted} fontSize={9} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {[0, 20, 40, 60].map((f) => (
          <text key={f} x={x(f)} y={height - 3} fill={CHART.muted} fontSize={9} textAnchor="middle">
            {f}
          </text>
        ))}
        <path d={path(diffraction.freqCpd, diffraction.radial, x, y)} fill="none" stroke={CHART.diffraction} strokeWidth={1.5} strokeDasharray="4 3" />
        {curves.map((c) => (
          <path key={c.label} d={path(c.freqCpd, c.radial, x, y)} fill="none" stroke={c.color} strokeWidth={2} strokeLinejoin="round" />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={top} y2={height - bottom} stroke={CHART.axis} strokeWidth={1} />}
        <text x={width - right} y={top + 8} fill={CHART.muted} fontSize={9} textAnchor="end">
          cpd
        </text>
      </svg>
      {hover !== null && (
        <div className="tooltip" role="status">
          {hover.toFixed(0)} cpd: {curves.map((c) => `${c.label} ${at(c.freqCpd, c.radial, hover).toFixed(2)}`).join(" · ")} · diffraction limit{" "}
          {at(diffraction.freqCpd, diffraction.radial, hover).toFixed(2)}
        </div>
      )}
    </div>
  );
}
