import { DEFAULT_LENS, eyeOptics, mirrorLens, useScene } from "../store/scene";
import type { ClinicalLens } from "../worker/messages";
import { formatSigned } from "./format";
import { NumberField } from "./NumberField";
import { spectaclesTooltip } from "./tooltips";

/** Field bounds (UI bounds covering ordinary spectacle prescriptions and designs). */
const BOUNDS = {
  sphereD: [-20, 20, 0.25],
  cylinderD: [-8, 0, 0.25],
  axisDeg: [1, 180, 1],
  vertexMm: [8, 20, 0.5],
  baseCurveD: [0, 12, 0.25],
  index: [1.45, 1.9, 0.01],
} as const;
const fmt2 = (v: number) => String(Number(v.toFixed(2)));
const fmt0 = (v: number) => String(Math.round(v));

function lensText(l: { sphereD: number; cylinderD: number; axisDeg: number }): string {
  return `${formatSigned(l.sphereD, 2)} / ${formatSigned(l.cylinderD, 2)} × ${Math.round(l.axisDeg)}`;
}

/** The Spectacles panel (spec §6.3): prescription and design, worn toggle, auto-prescribe. */
export function Spectacles() {
  const spectacles = useScene((s) => s.spectacles);
  const corrected = useScene((s) => s.corrected);
  const autoPending = useScene((s) => s.autoPending);
  const autoRx = useScene((s) => eyeOptics(s.optics, "right")?.wave?.autoRx ?? null);
  const setSpectacles = useScene((s) => s.setSpectacles);
  const setCorrected = useScene((s) => s.setCorrected);
  const requestAuto = useScene((s) => s.requestAutoPrescribe);
  const useAuto = useScene((s) => s.useAutoRx);
  const lens = spectacles?.right ?? null;
  const edit = (key: keyof ClinicalLens) => (v: number) => {
    if (lens) setSpectacles({ ...lens, [key]: v });
  };
  const field = (key: keyof typeof BOUNDS, label: string, format: (v: number) => string) => {
    const [min, max, step] = BOUNDS[key];
    return (
      <div className="field" key={key}>
        <label htmlFor={`rx-${key}`}>{label}</label>
        <NumberField id={`rx-${key}`} testId={`rx-${key}`} min={min} max={max} step={step} value={lens?.[key] ?? 0} format={format} onCommit={edit(key)} />
      </div>
    );
  };

  return (
    <section className="panel">
      <h2>
        <abbr title={spectaclesTooltip()}>Spectacles</abbr>
      </h2>
      <div className="field">
        <label htmlFor="spectacles-on">Spectacle lenses</label>
        <input
          id="spectacles-on"
          data-testid="spectacles-on"
          type="checkbox"
          checked={lens !== null}
          onChange={(e) => setSpectacles(e.target.checked ? (lens ?? DEFAULT_LENS) : null)}
        />
      </div>
      {lens && (
        <>
          {field("sphereD", "Sphere (D)", fmt2)}
          {field("cylinderD", "Cylinder (D, minus)", fmt2)}
          {field("axisDeg", "Axis (°, TABO)", fmt0)}
          {field("vertexMm", "Vertex distance (mm)", fmt2)}
          {field("baseCurveD", "Base curve (D)", fmt2)}
          {field("index", "Lens index", fmt2)}
          <div className="field">
            <label htmlFor="corrected">Worn (corrected)</label>
            <input id="corrected" data-testid="corrected" type="checkbox" checked={corrected} onChange={(e) => setCorrected(e.target.checked)} />
          </div>
        </>
      )}
      <div className="button-row">
        <button type="button" onClick={requestAuto} disabled={autoPending} data-testid="auto-prescribe">
          {autoPending ? "Prescribing…" : "Auto-prescribe"}
        </button>
        {autoRx && (
          <>
            <span className="auto-rx" data-testid="auto-rx">
              Auto {lensText(autoRx)} · residual {autoRx.residualRmsMicrons.toFixed(3)} µm
            </span>
            <button type="button" onClick={useAuto} data-testid="use-auto-rx">
              Use
            </button>
          </>
        )}
      </div>
      {lens && <p className="note">Right eye shown; the left eye wears the mirror image ({lensText(mirrorLens(lens))}).</p>}
    </section>
  );
}
