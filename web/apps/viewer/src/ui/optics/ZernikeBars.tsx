import { zernikeIndex } from "@eye/optics";
import { useState } from "react";
import { CHART } from "./colormap";

/** First index shown: defocus and astigmatism and above (piston and tilt carry no image quality). */
const FIRST_J = 3;

interface Series {
  label: string;
  color: string;
  coeffs: readonly number[];
}

/**
 * Zernike coefficients (µm) as grouped bars by OSA index j = 3…44, one bar per configuration,
 * grouped by radial order with order labels below; hover shows the values.
 */
export function ZernikeBars({ series, width, height, testId }: { series: Series[]; width: number; height: number; testId?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const count = Math.max(...series.map((s) => s.coeffs.length));
  const js = Array.from({ length: Math.max(0, count - FIRST_J) }, (_, k) => k + FIRST_J);
  const top = 8;
  const bottom = 16;
  const left = 30;
  const plotH = height - top - bottom;
  const plotW = width - left - 4;
  const limit = Math.max(1e-6, ...series.flatMap((s) => s.coeffs.slice(FIRST_J).map(Math.abs)));
  const y0 = top + plotH / 2;
  const scale = plotH / 2 / limit;
  const group = plotW / Math.max(1, js.length);
  const bar = Math.max(1, (group - 1) / series.length - (series.length > 1 ? 0.5 : 0));
  const orders = new Map<number, { from: number; to: number }>();
  js.forEach((j, k) => {
    const { n } = zernikeIndex(j);
    const o = orders.get(n);
    if (o) o.to = k;
    else orders.set(n, { from: k, to: k });
  });
  return (
    <div className="chart" data-testid={testId}>
      <svg width={width} height={height} role="img" aria-label="Zernike coefficients by OSA index">
        <line x1={left} x2={width - 4} y1={y0} y2={y0} stroke={CHART.axis} strokeWidth={1} />
        <text x={left - 4} y={top + 4} fill={CHART.muted} fontSize={9} textAnchor="end">
          {limit.toFixed(2)}
        </text>
        <text x={left - 4} y={height - bottom} fill={CHART.muted} fontSize={9} textAnchor="end">
          −{limit.toFixed(2)}
        </text>
        <text x={left - 4} y={y0 + 3} fill={CHART.muted} fontSize={9} textAnchor="end">
          µm
        </text>
        {js.map((j, k) => {
          const x = left + k * group;
          return (
            <g key={j} onMouseEnter={() => setHover(j)} onMouseLeave={() => setHover(null)}>
              <rect x={x} y={top} width={group} height={plotH} fill="transparent" />
              {series.map((s, i) => {
                const v = s.coeffs[j] ?? 0;
                const h = Math.abs(v) * scale;
                return <rect key={s.label} x={x + 0.5 + i * (bar + 0.5)} y={v >= 0 ? y0 - h : y0} width={bar} height={Math.max(h, 0.5)} rx={1} fill={s.color} opacity={hover === null || hover === j ? 1 : 0.55} />;
              })}
            </g>
          );
        })}
        {[...orders.entries()].map(([n, o]) => (
          <text key={n} x={left + ((o.from + o.to + 1) / 2) * group} y={height - 3} fill={CHART.muted} fontSize={9} textAnchor="middle">
            n={n}
          </text>
        ))}
      </svg>
      {hover !== null && (
        <div className="tooltip" role="status">
          j={hover} (n={zernikeIndex(hover).n}, m={zernikeIndex(hover).m}):{" "}
          {series.map((s) => `${s.label} ${(s.coeffs[hover] ?? 0).toFixed(3)} µm`).join(" · ")}
        </div>
      )}
    </div>
  );
}
