import { CUT_LABELS, cutDepthLabel, type CutOrientation } from "../scene/cut";
import { VIEW_KEYS, VIEW_LABELS } from "../scene/views";
import { useScene, type Side } from "../store/scene";
import { STRUCTURE_KEYS, STRUCTURE_LABELS, sameTarget } from "./hoverInfo";
import { SHORTCUT_HELP } from "./shortcuts";

/** Step of the cut-depth slider, mm (a UI choice). */
const DEPTH_STEP_MM = 0.1;

/**
 * Stage controls (spec §6.2): clinical camera snaps, the cutaway plane (orientation, depth,
 * which eye), and the named structures, which show their readout on hover and pin on click
 * as their meshes do in the stage.
 */
export function StagePanel() {
  const view = useScene((s) => s.view);
  const setView = useScene((s) => s.setView);
  const cut = useScene((s) => s.cut);
  const setCut = useScene((s) => s.setCut);
  const axial = useScene((s) => s.eyes[s.cut.side].axialLengthMm);
  const pinned = useScene((s) => s.pinned);
  const setHovered = useScene((s) => s.setHovered);
  const togglePin = useScene((s) => s.togglePin);
  const half = axial / 2;

  return (
    <section className="panel" aria-label="Stage" data-testid="stage-panel">
      <h2>Stage</h2>
      <div className="button-row view-buttons" role="group" aria-label="Camera view">
        {(Object.entries(VIEW_KEYS) as [string, keyof typeof VIEW_LABELS][]).map(([key, v]) => (
          <button key={v} type="button" data-testid={`view-${v}`} aria-pressed={view === v} onClick={() => setView(v)} title={`${VIEW_LABELS[v]} (key ${key})`}>
            {VIEW_LABELS[v]}
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="cut-side">Eye in section</label>
        <select id="cut-side" data-testid="cut-side" value={cut.side} onChange={(e) => setCut({ side: e.target.value as Side })}>
          <option value="right">Right</option>
          <option value="left">Left</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="cut-orientation">Cut plane</label>
        <select
          id="cut-orientation"
          data-testid="cut-orientation"
          value={cut.orientation}
          onChange={(e) => setCut({ orientation: e.target.value as CutOrientation })}
        >
          {(Object.keys(CUT_LABELS) as CutOrientation[]).map((o) => (
            <option key={o} value={o}>
              {CUT_LABELS[o]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="cut-depth">Plane offset (mm)</label>
        <output data-testid="cut-depth" htmlFor="cut-depth">
          {cutDepthLabel(cut, axial)}
        </output>
        <input
          id="cut-depth"
          aria-label="Cut plane offset slider"
          data-testid="cut-depth-slider"
          type="range"
          min={-half}
          max={half}
          step={DEPTH_STEP_MM}
          value={cut.depthMm}
          onChange={(e) => setCut({ depthMm: Number(e.target.value) })}
        />
      </div>
      <ul className="structure-list" aria-label="Structures">
        {STRUCTURE_KEYS.map((key) => {
          const target = { kind: "structure", key, side: cut.side } as const;
          const on = pinned.some((p) => sameTarget(p, target));
          return (
            <li key={key}>
              <button
                type="button"
                data-testid={`structure-${key}`}
                aria-pressed={on}
                onMouseEnter={() => setHovered(target)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(target)}
                onBlur={() => setHovered(null)}
                onClick={() => togglePin(target)}
              >
                {STRUCTURE_LABELS[key]}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="note">
        Hover a structure (here or in the stage) for its dimensions; click to pin its readout. {SHORTCUT_HELP}
      </p>
    </section>
  );
}
