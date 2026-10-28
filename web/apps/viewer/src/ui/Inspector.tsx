import { AMPLITUDE_TABLE, PRESET_NAMES, presetTable, type PresetName } from "@eye/eye-model";
import { MAX_DIRECTION_DEG, useScene } from "../store/scene";
import { MuscleTable } from "./MuscleTable";
import { NumberField } from "./NumberField";

const MIN_M = 0.1;
const MAX_M = 6;
/** IPD field bounds (UI bounds spanning children to large adults). */
const IPD_RANGE_MM = [45, 80] as const;
const toSlider = (m: number) => Math.log10(Math.min(MAX_M, Math.max(MIN_M, m)));
const fromSlider = (v: number) => 10 ** v;
const formatDistance = (m: number) => String(Number(m.toFixed(2)));
const formatInt = (x: number) => String(x);
const formatDeg = (x: number) => String(Number(x.toFixed(1)));

export function Inspector() {
  const scene = useScene((s) => s.scene);
  const paramError = useScene((s) => s.paramError);
  const workerError = useScene((s) => s.workerError);
  const setTargetDistance = useScene((s) => s.setTargetDistance);
  const setTargetDirection = useScene((s) => s.setTargetDirection);
  const setAge = useScene((s) => s.setAge);
  const setIpd = useScene((s) => s.setIpd);
  const setPreset = useScene((s) => s.setPreset);
  const { minAgeYears, maxAgeYears } = AMPLITUDE_TABLE.domain;
  const dir = scene.targetDirectionDeg;

  return (
    <aside className="inspector">
      {paramError && (
        <div className="banner" role="alert" data-testid="error">
          {paramError}
        </div>
      )}
      {workerError && (
        <div className="banner" role="alert" data-testid="worker-error">
          Optics worker: {workerError}
        </div>
      )}

      <section className="panel">
        <h2>Scene</h2>
        <div className="field">
          <label htmlFor="target-distance">Target distance (m)</label>
          <NumberField
            id="target-distance"
            testId="target-distance"
            min={MIN_M}
            max={MAX_M}
            step={0.01}
            value={scene.targetDistanceM}
            format={formatDistance}
            onCommit={setTargetDistance}
          />
          <input
            aria-label="Target distance slider"
            data-testid="target-distance-slider"
            type="range"
            min={toSlider(MIN_M)}
            max={toSlider(MAX_M)}
            step={0.001}
            value={toSlider(scene.targetDistanceM)}
            onChange={(e) => setTargetDistance(Number(fromSlider(Number(e.target.value)).toFixed(3)))}
          />
        </div>
        <div className="field">
          <label htmlFor="target-azimuth">Azimuth (°, right +)</label>
          <NumberField
            id="target-azimuth"
            testId="target-azimuth"
            min={-MAX_DIRECTION_DEG}
            max={MAX_DIRECTION_DEG}
            step={1}
            value={dir.x}
            format={formatDeg}
            onCommit={(x) => setTargetDirection({ x, y: dir.y })}
          />
          <input
            aria-label="Target azimuth slider"
            data-testid="target-azimuth-slider"
            type="range"
            min={-MAX_DIRECTION_DEG}
            max={MAX_DIRECTION_DEG}
            step={0.5}
            value={dir.x}
            onChange={(e) => setTargetDirection({ x: Number(e.target.value), y: dir.y })}
          />
        </div>
        <div className="field">
          <label htmlFor="target-elevation">Elevation (°, up +)</label>
          <NumberField
            id="target-elevation"
            testId="target-elevation"
            min={-MAX_DIRECTION_DEG}
            max={MAX_DIRECTION_DEG}
            step={1}
            value={dir.y}
            format={formatDeg}
            onCommit={(y) => setTargetDirection({ x: dir.x, y })}
          />
          <input
            aria-label="Target elevation slider"
            data-testid="target-elevation-slider"
            type="range"
            min={-MAX_DIRECTION_DEG}
            max={MAX_DIRECTION_DEG}
            step={0.5}
            value={dir.y}
            onChange={(e) => setTargetDirection({ x: dir.x, y: Number(e.target.value) })}
          />
        </div>
        <p className="note">
          Distance from the midpoint between the eyes; 6 m is 0.17 D of demand. Drag the target in the stage, or set it here.
        </p>
      </section>

      <section className="panel">
        <h2>Subject</h2>
        <div className="field">
          <label htmlFor="age">Age (years)</label>
          <NumberField
            id="age"
            testId="age"
            min={minAgeYears}
            max={maxAgeYears}
            step={1}
            value={scene.ageYears}
            format={formatInt}
            onCommit={setAge}
          />
          <input
            aria-label="Age slider"
            data-testid="age-slider"
            type="range"
            min={minAgeYears}
            max={maxAgeYears}
            step={1}
            value={scene.ageYears}
            onChange={(e) => setAge(Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="ipd">Interpupillary distance (mm)</label>
          <NumberField
            id="ipd"
            testId="ipd"
            min={IPD_RANGE_MM[0]}
            max={IPD_RANGE_MM[1]}
            step={0.5}
            value={scene.ipdMm}
            format={formatDeg}
            onCommit={setIpd}
          />
        </div>
        <div className="field">
          <label htmlFor="preset">Schematic eye</label>
          <select id="preset" data-testid="preset" value={scene.preset} onChange={(e) => setPreset(e.target.value as PresetName)}>
            {PRESET_NAMES.map((name) => {
              const t = presetTable(name);
              return (
                <option key={name} value={name}>
                  {t.label}
                  {t.transcribed ? "" : " (not transcribed)"}
                </option>
              );
            })}
          </select>
        </div>
        <p className="note">
          Navarro 1985 is the regression fixture (verified paraxial power 60.42 D). The Zapata-Díaz 2019 default awaits transcription.
        </p>
      </section>

      <MuscleTable />
    </aside>
  );
}
