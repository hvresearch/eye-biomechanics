import { eyeOptics, useScene } from "../store/scene";
import { readoutTooltips } from "./tooltips";

function Stat({
  k,
  v,
  u,
  big,
  pending,
  title,
  testId,
}: {
  k: string;
  v: string;
  u?: string;
  big?: boolean;
  pending?: boolean;
  title?: string;
  testId?: string;
}) {
  return (
    <div className={`stat${pending ? " pending" : ""}`}>
      <span className="k">{title ? <abbr title={title}>{k}</abbr> : k}</span>
      <span>
        <span className={`v${big ? " big" : ""}`} data-testid={testId}>
          {v}
        </span>
        {u && <span className="u">{u}</span>}
      </span>
    </div>
  );
}

const signed = (x: number, digits: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(digits)}`;

export function Readout() {
  const eye = useScene((s) => s.binocular.right);
  const optics = useScene((s) => eyeOptics(s.optics, "right"));
  const elapsedMs = useScene((s) => s.optics?.elapsedMs ?? 0);
  const pending = useScene((s) => s.pending);
  const powerD = optics?.paraxialPowerD ?? Number.NaN;
  const focusOffsetMm = optics ? optics.bestFocusZMm - optics.retinaZMm : Number.NaN;
  const tips = readoutTooltips(eye.pupilMm);

  return (
    <section className="readout" aria-label="Readout">
      <div className="readout-grid">
        <Stat
          k="Retinal defocus"
          v={optics ? signed(optics.defocusD, 2) : "…"}
          u="D"
          big
          pending={pending}
          testId="defocus"
          title={tips.defocus}
        />
        <Stat
          k="Best focus"
          v={optics ? signed(focusOffsetMm, 3) : "…"}
          u="mm from retina"
          pending={pending}
          testId="focus-offset"
          title={tips.bestFocus}
        />
        <Stat
          k="Accommodation"
          v={eye.accommodationD.toFixed(2)}
          u="D"
          testId="accommodation"
          title={tips.accommodation}
        />
        <Stat k="Demand" v={eye.demandD.toFixed(2)} u="D" testId="demand" />
        <Stat
          k="Amplitude"
          v={eye.amplitudeD.toFixed(2)}
          u="D"
          testId="amplitude"
          title={tips.amplitude}
        />
        <Stat
          k="Ciliary activation"
          v={eye.ciliaryActivation.toFixed(2)}
          testId="ciliary"
          title={tips.ciliaryActivation}
        />
        <Stat
          k="Paraxial power"
          v={optics ? powerD.toFixed(2) : "…"}
          u="D"
          pending={pending}
          testId="power"
          title={tips.paraxialPower}
        />
        <Stat
          k="Pupil"
          v={eye.pupilMm.toFixed(1)}
          u="mm"
          testId="pupil"
          title={tips.pupil}
        />
      </div>
      {optics && (
        <p className="note">
          Worker: {elapsedMs.toFixed(1)} ms for both eyes, {optics.fan.length} rays drawn
          {optics.vignettedRays > 0 ? `, ${optics.vignettedRays} vignetted` : ""}.
        </p>
      )}
    </section>
  );
}
