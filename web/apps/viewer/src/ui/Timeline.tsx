import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { at, onsetCriteria, thresholdLabel, type Trajectory } from "../data/predictions";
import { useScene } from "../store/scene";
import { formatSigned } from "./format";
import { NumberField } from "./NumberField";
import { appliedPredictionTooltip, timelineTooltip } from "./tooltips";

/** Chart geometry (SVG user units). */
const W = 300;
const H = 170;
const PAD = { left: 30, right: 8, top: 16, bottom: 20 };
const AGE_TICKS = [10, 20, 30, 40, 50, 60, 70, 80, 90];
const formatD = (x: number) => String(Number(x.toFixed(2)));
const formatH = (x: number) => String(Number(x.toFixed(1)));
const formatAge = (a: number) => `${a.toFixed(1)} y`;
/** Stance shown for a grid without a summary (schema 1.0.0). */
const NO_SUMMARY = "Remodeled model: a hypothesis test, not a clinical prediction.";

interface OnsetMark {
  key: "refraction" | "acuity";
  label: string;
  age: number | null;
  /** 5–95% over the draws; a null upper end means later than the chart's last age. */
  range: [number | null, number | null] | null;
  /** False when the trajectory cannot say (acuity after re-anchoring). */
  known: boolean;
}

/** "at 71.3 y (5–95%: 66.2–81.2 y)", "none by 90", or "not available". */
function onsetPhrase(m: OnsetMark, lastAge: number): string {
  if (!m.known) return "not available";
  if (m.age === null) return `none by ${lastAge}`;
  const [lo, hi] = m.range ?? [null, null];
  const range = lo === null ? "" : ` (5–95%: ${lo.toFixed(1)}–${hi === null ? `after ${lastAge}` : formatAge(hi)})`;
  return `at ${formatAge(m.age)}${range}`;
}

/** Refraction range of the chart: the bands, padded, at least ±1 D, in whole diopters. */
function yRange(t: Trajectory): [number, number] {
  const all = [...t.sphere.p05, ...t.sphere.p95, ...t.cylinder.p05, ...t.cylinder.p95, 0];
  return [Math.min(-1, Math.floor(Math.min(...all))), Math.max(1, Math.ceil(Math.max(...all)))];
}

function bandPath(ages: number[], lo: number[], hi: number[], x: (a: number) => number, y: (d: number) => number): string {
  const top = ages.map((a, i) => `${x(a).toFixed(1)},${y(hi[i]!).toFixed(1)}`);
  const bottom = ages.map((a, i) => `${x(a).toFixed(1)},${y(lo[i]!).toFixed(1)}`).reverse();
  return `M${top.join("L")}L${bottom.join("L")}Z`;
}

function linePath(ages: number[], v: number[], x: (a: number) => number, y: (d: number) => number): string {
  return `M${ages.map((a, i) => `${x(a).toFixed(1)},${y(v[i]!).toFixed(1)}`).join("L")}`;
}

/**
 * Prediction timeline (spec §8, §12; M5 Task 5.12): the predicted sphere and cylinder of a
 * subject from age 6 to 90 with 5–95% bands, the onset ages, and the scene's age as the cursor.
 */
export function Timeline() {
  const prediction = useScene((s) => s.prediction);
  const ageYears = useScene((s) => s.scene.ageYears);
  const setAge = useScene((s) => s.setAge);
  const loadPredictions = useScene((s) => s.loadPredictions);
  const setProfile = useScene((s) => s.setPredictionProfile);
  const setApplied = useScene((s) => s.setPredictionApplied);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    void loadPredictions();
  }, [loadPredictions]);

  const { grid, profile, trajectory: t, applied, error } = prediction;
  const ages = t?.ages ?? [6, 90];
  const a0 = ages[0]!;
  const a1 = ages[ages.length - 1]!;
  const [d0, d1] = t ? yRange(t) : [-1, 1];
  const x = (a: number) => PAD.left + ((a - a0) / (a1 - a0)) * (W - PAD.left - PAD.right);
  const y = (d: number) => PAD.top + ((d1 - d) / (d1 - d0)) * (H - PAD.top - PAD.bottom);
  const cursorAge = Math.min(a1, Math.max(a0, ageYears));
  const now = t ? at(t, ageYears) : null;
  const criteria = onsetCriteria(grid?.thresholds);
  const summary = grid?.summary;
  const onsetText = criteria.length > 0 ? ` Onsets: ${[criteria.slice(0, -1).join(", "), criteria[criteria.length - 1]].filter(Boolean).join(", or ")}.` : "";

  const ageAt = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    const u = ((clientX - box.left) / box.width) * W;
    const a = a0 + ((u - PAD.left) / (W - PAD.left - PAD.right)) * (a1 - a0);
    return Math.round(Math.min(a1, Math.max(a0, a)));
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (e.type === "pointerdown") {
      dragging.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } else if (!dragging.current) return;
    const a = ageAt(e.clientX);
    if (a !== null && a !== ageYears) setAge(a);
  };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (step === 0) return;
    e.preventDefault();
    setAge(Math.min(a1, Math.max(a0, Math.round(ageYears) + step * (e.shiftKey ? 10 : 1))));
  };

  const yTicks: number[] = [];
  const stepD = d1 - d0 > 6 ? 2 : 1;
  for (let d = Math.ceil(d0 / stepD) * stepD; d <= d1; d += stepD) yTicks.push(d);
  const onsets: OnsetMark[] = t
    ? [
        { key: "refraction", label: "refraction", age: t.onset.refraction, range: t.onsetRange?.refraction ?? null, known: true },
        { key: "acuity", label: thresholdLabel(grid?.thresholds), age: t.onset.acuity, range: t.onsetRange?.acuity ?? null, known: t.logMAR !== null },
      ]
    : [];

  return (
    <section className="panel timeline" data-testid="timeline">
      <h2>
        <abbr title={timelineTooltip(summary)}>Prediction timeline (remodeled)</abbr>
      </h2>
      {error && (
        <p className="note warn" data-testid="timeline-error">
          {error}
        </p>
      )}
      <div className="field">
        <label htmlFor="near-hours">Near work (h/day)</label>
        <NumberField
          id="near-hours"
          testId="near-hours"
          min={0}
          max={grid ? grid.axes.nearHours[grid.axes.nearHours.length - 1]! : 8}
          step={0.5}
          value={profile.nearHours}
          format={formatH}
          onCommit={(nearHours) => setProfile({ nearHours })}
        />
      </div>
      <div className="field">
        <label htmlFor="baseline-sphere">Sphere at age {grid?.baselineAgeYears ?? 6} (D)</label>
        <NumberField
          id="baseline-sphere"
          testId="baseline-sphere"
          min={grid ? grid.axes.baselineSphereD[0]! : -3}
          max={grid ? grid.axes.baselineSphereD[grid.axes.baselineSphereD.length - 1]! : 2}
          step={0.25}
          value={profile.baselineSphereD}
          format={formatD}
          onCommit={(baselineSphereD) => setProfile({ baselineSphereD })}
        />
      </div>
      <div className="field">
        <label htmlFor="baseline-cylinder">Cylinder at age {grid?.baselineAgeYears ?? 6} (D, × 180)</label>
        <NumberField
          id="baseline-cylinder"
          testId="baseline-cylinder"
          min={grid ? Math.min(...grid.axes.baselineCylinderD) : -1}
          max={0}
          step={0.25}
          value={-Math.abs(profile.baselineCylinderD)}
          format={formatD}
          onCommit={(c) => setProfile({ baselineCylinderD: -Math.abs(c) })}
        />
      </div>
      {t ? (
        <>
          <svg
            ref={svgRef}
            className="timeline-chart"
            data-testid="timeline-chart"
            viewBox={`0 0 ${W} ${H}`}
            role="slider"
            aria-label="Age cursor"
            aria-valuemin={a0}
            aria-valuemax={a1}
            aria-valuenow={Math.round(cursorAge)}
            tabIndex={0}
            onPointerDown={onPointer}
            onPointerMove={onPointer}
            onPointerUp={() => (dragging.current = false)}
            onPointerCancel={() => (dragging.current = false)}
            onKeyDown={onKey}
          >
            {yTicks.map((d) => (
              <g key={`y${d}`}>
                <line className={d === 0 ? "axis zero" : "grid"} x1={PAD.left} x2={W - PAD.right} y1={y(d)} y2={y(d)} />
                <text className="tick" x={PAD.left - 4} y={y(d) + 3} textAnchor="end">
                  {d > 0 ? `+${d}` : d < 0 ? `−${-d}` : "0"}
                </text>
              </g>
            ))}
            {AGE_TICKS.filter((a) => a >= a0 && a <= a1).map((a) => (
              <text key={`x${a}`} className="tick" x={x(a)} y={H - 6} textAnchor="middle">
                {a}
              </text>
            ))}
            <path className="band sphere" d={bandPath(t.ages, t.sphere.p05, t.sphere.p95, x, y)} />
            <path className="band cylinder" d={bandPath(t.ages, t.cylinder.p95, t.cylinder.p05, x, y)} />
            {onsets.map(({ key, range }) => {
              const lo = range?.[0] ?? null;
              if (lo === null) return null;
              const hi = Math.min(a1, range?.[1] ?? a1);
              return <rect key={`range-${key}`} className="onset-range" data-testid={`range-${key}`} x={x(lo)} width={Math.max(0, x(hi) - x(lo))} y={PAD.top} height={H - PAD.top - PAD.bottom} />;
            })}
            <path className="median sphere" data-testid="sphere-median" d={linePath(t.ages, t.sphere.p50, x, y)} />
            <path className="median cylinder" data-testid="cylinder-median" d={linePath(t.ages, t.cylinder.p50, x, y)} />
            {onsets.map(({ key, label, age }, i) =>
              age === null ? null : (
                <g key={key} className="onset" data-testid={`onset-${key}`}>
                  <line x1={x(age)} x2={x(age)} y1={PAD.top} y2={H - PAD.bottom} />
                  <text
                    x={x(age) + (x(age) > W / 2 ? -3 : 3)}
                    y={H - PAD.bottom - 4 - i * 10}
                    textAnchor={x(age) > W / 2 ? "end" : "start"}
                  >
                    {label}
                  </text>
                </g>
              ),
            )}
            <line className="cursor" data-testid="age-cursor" x1={x(cursorAge)} x2={x(cursorAge)} y1={PAD.top - 6} y2={H - PAD.bottom} />
            <text className="legend sphere" x={W - PAD.right - 44} y={PAD.top - 5} textAnchor="end">
              sphere
            </text>
            <text className="legend cylinder" x={W - PAD.right} y={PAD.top - 5} textAnchor="end">
              cylinder
            </text>
          </svg>
          <div className="readout-grid">
            <div className="stat wide" data-testid="timeline-rx">
              <span className="k">
                <abbr title={timelineTooltip(summary)}>Predicted at {Math.round(ageYears)} y (median)</abbr>
              </span>
              <span className="v">{now ? `${formatSigned(now.sphereD, 2)} ${formatSigned(now.cylinderD, 2)} × ${Math.round(now.axisDeg)}` : "…"}</span>
            </div>
          </div>
          <p className="note" data-testid="timeline-onset">
            {onsets.every((m) => m.age === null && m.known)
              ? `no onset by ${a1}`
              : `Onset (median): ${onsets.map((m) => `${m.label} ${onsetPhrase(m, a1)}`).join("; ")}`}
          </p>
          {t.clamped.length > 0 && (
            <p className="note warn" data-testid="timeline-clamped">
              Outside the grid, clamped to its edge: {t.clamped.join(", ")}.
            </p>
          )}
          <div className="field">
            <label htmlFor="apply-prediction">
              <abbr title={appliedPredictionTooltip()}>Apply to eye</abbr>
            </label>
            <input id="apply-prediction" data-testid="apply-prediction" type="checkbox" checked={applied} onChange={(e) => setApplied(e.target.checked)} />
          </div>
        </>
      ) : (
        !error && <p className="note">Loading the prediction grid…</p>
      )}
      <p className="note" data-testid="timeline-stance">
        {summary ? `${summary.stance} ${summary.finding}` : NO_SUMMARY}
        {onsetText} Drag the chart or use the arrow keys to set the age.
      </p>
    </section>
  );
}
