import { RESULTS } from "../results/catalog";
import { EXAGGERATION_RANGE, eyeOptics, useScene } from "../store/scene";
import { heatMapRamp } from "../scene/DeformationMap";
import { inducedReadouts } from "./format";
import { heatMapTooltip, inducedTooltip } from "./tooltips";

const STOPS = 6;

/**
 * Biomechanics panel (spec §6.5, §7, §12): load a committed elastic FEM result or an
 * EyeParameters file into the right eye, read the refraction it induces against its unloaded
 * eye, and scale the displacement heat map drawn on the globe.
 */
export function Biomechanics() {
  const loaded = useScene((s) => s.loadedResult);
  const loadError = useScene((s) => s.loadError);
  const exaggeration = useScene((s) => s.exaggeration);
  const showHeatMap = useScene((s) => s.showHeatMap);
  const theme = useScene((s) => s.theme);
  const induced = useScene((s) => eyeOptics(s.optics, "right")?.induced ?? null);
  const loadResult = useScene((s) => s.loadResult);
  const loadEyeFiles = useScene((s) => s.loadEyeFiles);
  const clear = useScene((s) => s.clearLoadedResult);
  const setExaggeration = useScene((s) => s.setExaggeration);
  const setShowHeatMap = useScene((s) => s.setShowHeatMap);
  const deformation = loaded?.deformation ?? null;
  const readouts = inducedReadouts(induced, deformation !== null);
  const gradient = `linear-gradient(to right, ${Array.from({ length: STOPS }, (_, i) => heatMapRamp(i / (STOPS - 1), theme)).join(", ")})`;

  return (
    <section className="panel" data-testid="biomechanics">
      <h2>Biomechanics (elastic)</h2>
      {loadError && (
        <div className="banner" role="alert" data-testid="load-error">
          {loadError}
        </div>
      )}
      <div className="field">
        <label htmlFor="biomech-result">Result</label>
        <select
          id="biomech-result"
          data-testid="biomech-result"
          value={loaded && RESULTS.some((r) => r.id === loaded.id) ? loaded.id : ""}
          onChange={(e) => {
            const entry = RESULTS.find((r) => r.id === e.target.value);
            if (entry) void loadResult(entry);
            else clear();
          }}
        >
          <option value="">None (schematic eye)</option>
          {RESULTS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="biomech-file">Load EyeParameters</label>
        <input
          id="biomech-file"
          data-testid="biomech-file"
          type="file"
          multiple
          accept=".json,application/json"
          onChange={(e) => {
            const files = e.target.files ? [...e.target.files] : [];
            if (files.length > 0) void loadEyeFiles(files);
            e.target.value = "";
          }}
        />
      </div>
      {loaded && (
        <>
          <p className="note" data-testid="biomech-label">
            Right eye: {loaded.eye.label}
          </p>
          <div className="readout-grid">
            <div className="stat" data-testid="induced-sphere">
              <span className="k">
                <abbr title={inducedTooltip()}>ΔSphere</abbr>
              </span>
              <span className="v">{readouts.sphere}</span>
            </div>
            <div className="stat" data-testid="induced-cylinder">
              <span className="k">
                <abbr title={inducedTooltip()}>ΔCylinder × axis</abbr>
              </span>
              <span className="v">{readouts.cylinder}</span>
            </div>
            <div className="stat wide" data-testid="induced-vectors">
              <span className="k">
                <abbr title={inducedTooltip()}>ΔM, J0, J45 (D)</abbr>
              </span>
              <span className="v">{readouts.vectors}</span>
            </div>
          </div>
          {deformation ? (
            <>
              <div className="field">
                <label htmlFor="heatmap-on">
                  <abbr title={heatMapTooltip(exaggeration)}>Displacement heat map</abbr>
                </label>
                <input id="heatmap-on" data-testid="heatmap-on" type="checkbox" checked={showHeatMap} onChange={(e) => setShowHeatMap(e.target.checked)} />
                <input
                  aria-label="Exaggeration"
                  data-testid="exaggeration-slider"
                  type="range"
                  min={Math.log10(EXAGGERATION_RANGE[0])}
                  max={Math.log10(EXAGGERATION_RANGE[1])}
                  step={0.01}
                  value={Math.log10(exaggeration)}
                  onChange={(e) => setExaggeration(Math.round(10 ** Number(e.target.value)))}
                />
              </div>
              <div className="heatmap-legend" data-testid="heatmap-legend">
                <div className="bar" style={{ background: gradient }} />
                <div className="labels">
                  <span>0</span>
                  <span data-testid="legend-exaggeration">×{exaggeration}</span>
                  <span data-testid="legend-max">{deformation.maxUm.toFixed(1)} µm</span>
                </div>
              </div>
            </>
          ) : (
            <p className="note">No .deformation.json was loaded with this document, so there is no heat map and no reference eye.</p>
          )}
          <div className="button-row">
            <button type="button" onClick={clear} data-testid="biomech-clear">
              Back to the schematic eye
            </button>
          </div>
        </>
      )}
      <p className="note">
        Elastic corneoscleral FEM (<code>eyebiomech fem</code>): the change from the IOP-only eye under muscle insertions and lid pressure. It tests the hypothesis that muscle and lid loading shape the cornea; it is not an established result. Materials and loads are unverified (data/materials, data/eyelid).
      </p>
    </section>
  );
}
