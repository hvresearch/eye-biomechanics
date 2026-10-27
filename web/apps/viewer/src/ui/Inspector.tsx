import { PRESET_NAMES, presetTable, type PresetName } from "@eye/eye-model";
import { useScene } from "../store/scene";
import { NumberField } from "./NumberField";

const MIN_M = 0.1;
const MAX_M = 6;
const toSlider = (m: number) => Math.log10(Math.min(MAX_M, Math.max(MIN_M, m)));
const fromSlider = (v: number) => 10 ** v;
const formatDistance = (m: number) => String(Number(m.toFixed(2)));
const formatAge = (years: number) => String(years);

export function Inspector() {
  const scene = useScene((s) => s.scene);
  const error = useScene((s) => s.error);
  const setTargetDistance = useScene((s) => s.setTargetDistance);
  const setAge = useScene((s) => s.setAge);
  const setPreset = useScene((s) => s.setPreset);

  return (
    <aside className="inspector">
      {error && (
        <div className="banner" role="alert" data-testid="error">
          {error}
        </div>
      )}

      <section className="panel">
        <h2>Scene</h2>
        <div className="field">
          <label htmlFor="target-distance">Target distance</label>
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
        <p className="note">Meters along the line of sight. 6 m is optical infinity for this readout.</p>
      </section>

      <section className="panel">
        <h2>Subject</h2>
        <div className="field">
          <label htmlFor="age">Age</label>
          <NumberField
            id="age"
            testId="age"
            min={6}
            max={90}
            step={1}
            value={scene.ageYears}
            format={formatAge}
            onCommit={setAge}
          />
          <input
            aria-label="Age slider"
            data-testid="age-slider"
            type="range"
            min={6}
            max={90}
            step={1}
            value={scene.ageYears}
            onChange={(e) => setAge(Number(e.target.value))}
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
    </aside>
  );
}
