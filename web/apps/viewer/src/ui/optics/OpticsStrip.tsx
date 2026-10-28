import { eyeOptics, useScene } from "../../store/scene";
import type { WaveResult } from "../../worker/messages";
import { opticsTooltips } from "../tooltips";
import { CHART } from "./colormap";
import { MtfChart } from "./MtfChart";
import { IMAGE_WINDOW_ARCMIN, PsfView, RetinalImage } from "./PsfView";
import { DivergingScale, WavefrontMap, wavefrontLimit } from "./WavefrontMap";
import { ZernikeBars } from "./ZernikeBars";

/** Drawing sizes of the strip's figures, px. */
const IMAGE_PX = 88;
const CHART_H = 112;

export interface Config {
  key: "uncorrected" | "corrected";
  label: string;
  color: string;
  wave: WaveResult;
}

function Panel({ title, tip, children, wide }: { title: string; tip: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <figure className={`optics-panel${wide ? " wide" : ""}`}>
      <figcaption>
        <abbr title={tip}>{title}</abbr>
      </figcaption>
      {children}
    </figure>
  );
}

function Pair({ configs, render }: { configs: Config[]; render: (c: Config) => React.ReactNode }) {
  return (
    <div className="pair">
      {configs.map((c) => (
        <div key={c.key} className="pair-item">
          {render(c)}
          {configs.length > 1 && (
            <span className="pair-label">
              <i style={{ background: c.color }} aria-hidden="true" />
              {c.label}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** The configurations a wave response holds: the eye alone, and with spectacles when present. */
export function waveConfigs(wave: { uncorrected: WaveResult; corrected: WaveResult | null }): Config[] {
  const configs: Config[] = [{ key: "uncorrected", label: "Uncorrected", color: CHART.uncorrected, wave: wave.uncorrected }];
  if (wave.corrected) configs.push({ key: "corrected", label: "Spectacles", color: CHART.corrected, wave: wave.corrected });
  return configs;
}

/**
 * The right eye's wave optics (spec §6.4): wavefront map, Zernike bars, PSF, MTF, and retinal
 * image, uncorrected and (with spectacles) corrected side by side.
 */
export function OpticsStrip() {
  const wave = useScene((s) => eyeOptics(s.optics, "right")?.wave ?? null);
  const psfScale = useScene((s) => s.psfScale);
  const setPsfScale = useScene((s) => s.setPsfScale);
  const polychromatic = useScene((s) => s.polychromatic);
  const setPolychromatic = useScene((s) => s.setPolychromatic);
  const pending = useScene((s) => s.pending);
  const tips = opticsTooltips();

  if (!wave) {
    return (
      <section className="optics-strip" aria-label="Optics" data-testid="optics-strip">
        <p className="note">Computing wave optics…</p>
      </section>
    );
  }
  const configs = waveConfigs(wave);
  const limit = wavefrontLimit(configs.map((c) => c.wave));
  const aliased = configs.some((c) => c.wave.aliased);

  return (
    <section className={`optics-strip${pending ? " pending" : ""}`} aria-label="Optics" data-testid="optics-strip">
      <header>
        <h2>Right eye · wave optics at the fovea</h2>
        {aliased && <span className="note warn">The defocus blur exceeds the PSF grid; the PSF and image wrap around.</span>}
        <div className="legend" aria-label="Legend">
          {configs.map((c) => (
            <span key={c.key}>
              <i style={{ background: c.color }} aria-hidden="true" />
              {c.label}
            </span>
          ))}
          <span>
            <i className="dashed" aria-hidden="true" />
            Diffraction limit
          </span>
        </div>
        <div className="toggles">
          <label>
            <input type="checkbox" checked={psfScale === "log"} onChange={(e) => setPsfScale(e.target.checked ? "log" : "linear")} data-testid="psf-log" />
            Log PSF
          </label>
          <label>
            <input type="checkbox" checked={polychromatic} onChange={(e) => setPolychromatic(e.target.checked)} data-testid="polychromatic" />
            Polychromatic
          </label>
        </div>
      </header>
      <div className="optics-panels">
        <Panel title="Wavefront error" tip={tips.wavefront}>
          <Pair configs={configs} render={(c) => <WavefrontMap wave={c.wave} limit={limit} size={IMAGE_PX} testId={`wavefront-map-${c.key}`} />} />
          <DivergingScale limit={limit} width={configs.length * IMAGE_PX + (configs.length - 1) * 8} />
        </Panel>
        <Panel title="Zernike coefficients" tip={tips.zernike} wide>
          <ZernikeBars
            series={configs.map((c) => ({ label: c.label, color: c.color, coeffs: c.wave.coeffsMicrons }))}
            width={300}
            height={CHART_H}
            testId="zernike-bars"
          />
        </Panel>
        <Panel title={`PSF · ${IMAGE_WINDOW_ARCMIN}′`} tip={tips.psf}>
          <Pair configs={configs} render={(c) => <PsfView wave={c.wave} scale={psfScale} size={IMAGE_PX} testId={`psf-${c.key}`} />} />
        </Panel>
        <Panel title="MTF" tip={tips.mtf} wide>
          <MtfChart
            curves={configs.map((c) => ({ label: c.label, color: c.color, freqCpd: c.wave.mtf.freqCpd, radial: c.wave.mtf.radial }))}
            diffraction={{ freqCpd: wave.uncorrected.mtf.freqCpd, radial: wave.uncorrected.mtf.diffraction }}
            width={240}
            height={CHART_H}
            testId="mtf-chart"
          />
        </Panel>
        <Panel title="Retinal image · 20/20 E" tip={tips.retinal}>
          <Pair configs={configs} render={(c) => <RetinalImage wave={c.wave} size={IMAGE_PX} testId={`retinal-${c.key}`} />} />
        </Panel>
      </div>
    </section>
  );
}
