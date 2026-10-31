import { eyeOptics, useScene } from "../store/scene";
import { formatSigned } from "./format";
import { WaveFigures, refractionText } from "./optics/WaveFigures";
import { vergenceDemandMA } from "@eye/eye-model";
import { gazeTooltip, hasTiltOrDecenter, opticsTooltips, pupilDetail, readoutTooltips, vergenceTooltip } from "./tooltips";

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

export function Readout() {
  const eye = useScene((s) => s.binocular.right);
  const optics = useScene((s) => eyeOptics(s.optics, "right"));
  const elapsedMs = useScene((s) => s.optics?.elapsedMs ?? 0);
  const pending = useScene((s) => s.pending);
  const vergenceDeg = useScene((s) => s.binocular.vergenceDeg);
  const pupilModel = useScene((s) => s.eyes.right.pupil.model);
  const unverified = useScene((s) => s.eyes.right.lensAccommodationModel?.unverified);
  const tilted = useScene((s) => hasTiltOrDecenter(s.eyes.right));
  const ipdMm = useScene((s) => s.scene.ipdMm);
  const powerD = optics?.paraxialPowerD ?? Number.NaN;
  const focusOffsetMm = optics ? optics.bestFocusZMm - optics.retinaZMm : Number.NaN;
  const corrected = useScene((s) => s.corrected);
  const wave = optics?.wave ?? null;
  const active = wave ? (corrected && wave.corrected ? wave.corrected : wave.uncorrected) : null;
  const otips = opticsTooltips();
  const tips = readoutTooltips(eye.pupilMm, pupilModel, Array.isArray(unverified) ? unverified.map(String) : [], tilted);

  return (
    <section className="readout" aria-label="Readout">
      <h2>Right eye</h2>
      <div className="readout-grid">
        <Stat
          k="Retinal defocus"
          v={optics ? formatSigned(optics.defocusD, 2) : "…"}
          u="D"
          big
          pending={pending}
          testId="defocus"
          title={tips.defocus}
        />
        <Stat
          k="Best focus"
          v={optics ? formatSigned(focusOffsetMm, 3) : "…"}
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
        <Stat k="Demand" v={eye.demandD.toFixed(2)} u="D" testId="demand" title={tips.demand} />
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
        <Stat k="Vergence" v={vergenceDeg.toFixed(2)} u="°" testId="vergence" title={vergenceTooltip()} />
        <Stat k="Gaze" v={`${formatSigned(eye.gazeDeg.xDeg, 1)}, ${formatSigned(eye.gazeDeg.yDeg, 1)}`} u="° (temporal, up)" testId="gaze" title={gazeTooltip()} />
        <Stat
          k="Pupil"
          v={eye.pupilMm.toFixed(1)}
          u="mm"
          testId="pupil"
          title={`${tips.pupil} ${pupilDetail(eye.pupilBaseMm, eye.pupilMm, vergenceDemandMA(vergenceDeg, ipdMm))}`}
        />
        <Stat
          k={corrected && wave?.corrected ? "Refraction (worn)" : "Refraction"}
          v={active ? refractionText(active.refraction) : "…"}
          u={active && !refractionText(active.refraction).endsWith("DS") ? "D" : ""}
          pending={pending}
          testId="refraction"
          title={active ? `${otips.refraction} M ${active.refraction.M.toFixed(2)}, J0 ${active.refraction.J0.toFixed(2)}, J45 ${active.refraction.J45.toFixed(2)} D.` : otips.refraction}
        />

      </div>
      <WaveFigures />
      {optics && (
        <p className="note">
          Worker: {elapsedMs.toFixed(1)} ms for both eyes, {optics.fan.length} rays drawn
          {optics.vignettedRays > 0 ? `, ${optics.vignettedRays} vignetted` : ""}.
        </p>
      )}
    </section>
  );
}
