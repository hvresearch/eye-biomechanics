import { eyeOptics, useScene } from "../../store/scene";
import type { WaveResult } from "../../worker/messages";
import { formatSigned } from "../format";
import { opticsTooltips } from "../tooltips";
import { waveConfigs } from "./OpticsStrip";

/** Sphere / cylinder × axis, the axis omitted when the cylinder rounds to zero. */
export function refractionText(r: { sphereD: number; cylinderD: number; axisDeg: number }): string {
  const cyl = formatSigned(r.cylinderD, 2);
  return Number(cyl.replace("−", "-")) === 0 ? `${formatSigned(r.sphereD, 2)} DS` : `${formatSigned(r.sphereD, 2)} / ${cyl} × ${r.axisDeg.toFixed(0)}`;
}

/** RMS, higher-order RMS, Strehl, and refraction of the right eye, uncorrected and with spectacles. */
export function WaveFigures() {
  const wave = useScene((s) => eyeOptics(s.optics, "right")?.wave ?? null);
  const tips = opticsTooltips();
  if (!wave) return null;
  const configs = waveConfigs(wave);
  const row = (label: string, tip: string, cell: (w: WaveResult) => string, id?: string, className?: string) => (
    <tr>
      <th scope="row">
        <abbr title={tip}>{label}</abbr>
      </th>
      {configs.map((c) => (
        <td key={c.key} data-testid={id ? `${id}-${c.key}` : undefined} className={className}>
          {cell(c.wave)}
        </td>
      ))}
    </tr>
  );
  return (
    <table className="figures">
      <thead>
        <tr>
          <th />
          {configs.map((c) => (
            <th key={c.key} scope="col">
              <i style={{ background: c.color }} aria-hidden="true" />
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {row("RMS µm", tips.rms, (w) => w.rmsMicrons.toFixed(3), "rms")}
        {row("HO RMS µm", tips.rms, (w) => w.hoRmsMicrons.toFixed(3))}
        {row("Strehl", tips.strehl, (w) => w.strehl.toFixed(3), "strehl")}
        {row("Refraction", tips.refraction, (w) => refractionText(w.refraction), "refraction", "rx")}
      </tbody>
    </table>
  );
}
