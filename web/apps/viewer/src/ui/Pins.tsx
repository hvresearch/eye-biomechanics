import { useScene } from "../store/scene";
import { hoverInfo, targetId, type HoverInfo, type HoverTarget } from "./hoverInfo";

/** The live readout of a stage target, from the current eyes and shown state. */
export function useHoverInfo(t: HoverTarget | null): HoverInfo | null {
  // Nothing is subscribed while nothing is hovered, so the idle hover card does not re-render
  // on every gaze change (Task 6.8).
  const side = t?.side;
  const eye = useScene((s) => (side ? s.eyes[side] : null));
  const shown = useScene((s) => (side ? s.binocular[side] : null));
  const deformation = useScene((s) => (side ? (s.loadedResult?.deformation ?? null) : null));
  const exaggeration = useScene((s) => s.exaggeration);
  if (!t || !eye || !shown) return null;
  try {
    return hoverInfo(t, eye, shown, { heatMap: deformation ? { maxUm: deformation.maxUm, exaggeration } : null });
  } catch {
    // A document without the structure's surfaces (or a muscle table) has no readout for it.
    return null;
  }
}

export function InfoCard({ info, testId, onClose }: { info: HoverInfo; testId: string; onClose?: () => void }) {
  return (
    <div className="info-card" data-testid={testId} title={info.tooltip}>
      <div className="info-card-head">
        <strong>{info.title}</strong>
        {onClose && (
          <button type="button" className="unpin" aria-label={`Unpin ${info.title}`} onClick={onClose}>
            ×
          </button>
        )}
      </div>
      <dl>
        {info.rows.map((r) => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
      <small>{info.tooltip}</small>
    </div>
  );
}

function Pin({ target }: { target: HoverTarget }) {
  const info = useHoverInfo(target);
  const setPinned = useScene((s) => s.setPinned);
  if (!info) return null;
  return <InfoCard info={info} testId={`pin-${targetId(target)}`} onClose={() => setPinned(target, false)} />;
}

/** Readouts pinned by clicking a structure, muscle, or marker; they stay live while the eye changes. */
export function Pins() {
  const pinned = useScene((s) => s.pinned);
  if (pinned.length === 0) return null;
  return (
    <div className="pins" data-testid="pins" aria-label="Pinned readouts">
      {pinned.map((t) => (
        <Pin key={targetId(t)} target={t} />
      ))}
    </div>
  );
}
