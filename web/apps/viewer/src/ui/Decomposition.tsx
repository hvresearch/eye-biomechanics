import { useScene } from "../store/scene";
import { formatSigned } from "./format";
import { decompositionTooltip } from "./tooltips";

/** Corneal, lenticular, and axial parts of the right eye's refraction (spec §4.1). */
export function Decomposition() {
  const d = useScene((s) => s.decomposition);
  if (!d) return null;
  const rows: Array<[string, number, string]> = [
    ["Corneal", d.cornealD, "decomp-corneal"],
    ["Lenticular", d.lenticularD, "decomp-lenticular"],
    ["Axial", d.axialD, "decomp-axial"],
    ["Residual", d.residualD, "decomp-residual"],
  ];
  return (
    <div className="decomposition">
      <h3>
        <abbr title={decompositionTooltip()}>Refraction by mechanism</abbr>
      </h3>
      <table>
        <tbody>
          <tr>
            <th scope="row">Total (vs schematic eye)</th>
            <td data-testid="decomp-total">{formatSigned(d.totalD - d.baseD, 2)} D</td>
            <td>{formatSigned(d.cylinderTotalD, 2)} cyl</td>
          </tr>
          {rows.map(([k, v, id]) => (
            <tr key={k}>
              <th scope="row">{k}</th>
              <td data-testid={id}>{formatSigned(v, 2)} D</td>
              <td>{k === "Corneal" ? `${formatSigned(d.cylinderCornealD, 2)} cyl` : k === "Lenticular" ? `${formatSigned(d.cylinderLenticularD, 2)} cyl` : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
