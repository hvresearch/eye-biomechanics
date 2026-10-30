import { AMPLITUDE_TABLE, PRESET_NAMES, REFRACTIVE_PRESETS, presetTable, type PresetName } from "@eye/eye-model";
import { MAX_DIRECTION_DEG, useScene } from "../store/scene";
import { Biomechanics } from "./Biomechanics";
import { Decomposition } from "./Decomposition";
import { MuscleTable } from "./MuscleTable";
import { NumberField } from "./NumberField";
import { Scenarios } from "./Scenarios";
import { Spectacles } from "./Spectacles";
import { StagePanel } from "./StagePanel";
import { Timeline } from "./Timeline";

const MIN_M = 0.1;
const MAX_M = 6;
/** IPD field bounds (UI bounds spanning children to large adults). */
const IPD_RANGE_MM = [45, 80] as const;
/** Luminance field bounds, cd/m² (UI bounds from dim interiors to bright daylight). */
const LUMINANCE_RANGE = [0.01, 10000] as const;
const toLogSlider = (v: number) => Math.log10(Math.min(LUMINANCE_RANGE[1], Math.max(LUMINANCE_RANGE[0], v)));
const formatLuminance = (v: number) => String(Number(v.toPrecision(3)));
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
  const setLuminance = useScene((s) => s.setLuminance);
  const refractivePreset = useScene((s) => s.refractivePreset);
  const setRefractivePreset = useScene((s) => s.setRefractivePreset);
  const mirrorRightToLeft = useScene((s) => s.mirrorRightToLeft);
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

      <Scenarios />

      <StagePanel />

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
        <div className="field">
          <label htmlFor="luminance">Field luminance (cd/m²)</label>
          <NumberField
            id="luminance"
            testId="luminance"
            min={LUMINANCE_RANGE[0]}
            max={LUMINANCE_RANGE[1]}
            step={1}
            value={scene.luminanceCdM2}
            format={formatLuminance}
            onCommit={setLuminance}
          />
          <input
            aria-label="Luminance slider"
            data-testid="luminance-slider"
            type="range"
            min={toLogSlider(LUMINANCE_RANGE[0])}
            max={toLogSlider(LUMINANCE_RANGE[1])}
            step={0.01}
            value={toLogSlider(scene.luminanceCdM2)}
            onChange={(e) => setLuminance(Number((10 ** Number(e.target.value)).toPrecision(3)))}
          />
        </div>
        <p className="note">
          Distance from the midpoint between the eyes; 6 m is 0.17 D of demand. Drag the target in the stage, or set it here. Luminance sets the pupil (Watson & Yellott 2012).
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
        <div className="field">
          <label htmlFor="refractive-preset">Refractive error</label>
          <select
            id="refractive-preset"
            data-testid="refractive-preset"
            value={refractivePreset}
            onChange={(e) => setRefractivePreset(e.target.value)}
          >
            {REFRACTIVE_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="button-row">
          <button type="button" onClick={mirrorRightToLeft} data-testid="mirror">
            Mirror right → left
          </button>
        </div>
        <Decomposition />
        <p className="note">
          Navarro 1985 is the regression fixture (verified paraxial power 60.42 D). The Zapata-Díaz 2019 default awaits transcription. Presets change the right eye; the left eye is its mirror image.
        </p>
      </section>

      <Spectacles />

      <Biomechanics />

      <Timeline />

      <MuscleTable />
    </aside>
  );
}
