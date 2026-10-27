import { MUSCLE_NAMES } from "@eye/eye-model";
import { activationColor } from "../scene/palette";
import { useScene, type Side } from "../store/scene";
import { formatDelta } from "./format";
import { muscleLabel, muscleTooltip } from "./tooltips";

function EyeBlock({ side }: { side: Side }) {
  const eye = useScene((s) => s.binocular[side]);
  const hovered = useScene((s) => s.hovered);
  const setHovered = useScene((s) => s.setHovered);
  return (
    <tbody>
      <tr className="eye-row">
        <th colSpan={4} scope="rowgroup">
          {side === "right" ? "Right eye" : "Left eye"}
        </th>
      </tr>
      {MUSCLE_NAMES.map((name, i) => {
        const len = eye.eomLengthMm[i] ?? Number.NaN;
        const rest = eye.eomRestLengthMm[i] ?? Number.NaN;
        const a = eye.eomActivation[i] ?? 0;
        const id = `muscle-${side}-${name}`;
        const isHovered = hovered?.kind === "muscle" && hovered.side === side && hovered.index === i;
        return (
          <tr
            key={name}
            className={isHovered ? "hovered" : undefined}
            onMouseEnter={() => setHovered({ kind: "muscle", side, index: i })}
            onMouseLeave={() => setHovered(null)}
          >
            <th scope="row">{muscleLabel(name)}</th>
            <td data-testid={`${id}-length`}>{len.toFixed(1)}</td>
            <td data-testid={`${id}-delta`}>{formatDelta(len - rest)}</td>
            <td className="activation">
              <span className="bar" aria-hidden="true">
                <span style={{ width: `${(a * 100).toFixed(1)}%`, background: activationColor(a) }} />
              </span>
              <span data-testid={`${id}-activation`}>{a.toFixed(2)}</span>
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}

/** Six muscles per eye: path length, change from primary position, and length-proxy activation. */
export function MuscleTable() {
  return (
    <section className="panel" aria-label="Muscles">
      <h2>Muscles</h2>
      <table className="muscles">
        <thead>
          <tr>
            <th scope="col">Muscle</th>
            <th scope="col">
              <abbr title="Path length from origin over the globe to the insertion, mm">Length</abbr>
            </th>
            <th scope="col">
              <abbr title="Change from the primary-position length, mm">Δ</abbr>
            </th>
            <th scope="col">
              <abbr title={muscleTooltip()}>Activation</abbr>
            </th>
          </tr>
        </thead>
        <EyeBlock side="right" />
        <EyeBlock side="left" />
      </table>
      <p className="note">{muscleTooltip()}</p>
    </section>
  );
}
