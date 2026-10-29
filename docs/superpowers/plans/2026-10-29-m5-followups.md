# Milestone 5 follow-ups

Items deferred while implementing Milestone 5 (2026-10-29). Each line names the
milestone that should absorb it. Resolve an item in the task that touches the
same file, and delete its line here in that commit.

## Data and provenance (needs a session with document access)

The M5 session (2026-10-29, Task 5.0) searched once more for each item with web-search
excerpts. The session's network policy denies pmc.ncbi.nlm.nih.gov, doi.org, europepmc.org,
www.ebi.ac.uk, iovs.arvojournals.org, digital.csic.es, api.crossref.org, api.openalex.org,
api.semanticscholar.org, scholar.archive.org, core.ac.uk, arxiv.org, biorxiv.org, and the
repository copies the searches pointed to (zaguan.unizar.es, portalinvestigacion.um.es,
eprints.qut.edu.au, repository.uantwerpen.be, sensorprod.com, scholars.duke.edu); the excerpts
gave bibliographic records but not these numbers.

- `data/schematic-eyes/zapata-diaz-2019.json` is a stub. Transcribe Table 1 of
  Zapata-Díaz et al. 2019 (open access, doi 10.1016/j.optom.2018.01.003,
  PMC6318498), set `transcribed: true`, and switch the viewer's default preset to
  it. Blocks the release gate on `verified: true` for the default preset. (M6, or
  any session with document access)
- `data/schematic-eyes/navarro-1985.json`: confirm the Table 4 conic-constant
  coefficients (−0.34 and −0.125 per ln(1+A)) against the paper (the CSIC
  repository, digital.csic.es/handle/10261/29930, has a PDF). (M6, or any session
  with document access)
- `data/eom/geometry-default.json`: transcribe the rectus origins and the oblique
  origins and insertions from Volkmann 1869 (Eggers, Duane's Foundations vol. 1
  ch. 31, Table 2, or Helmholtz's *Physiological Optics*; a 1985 Aston thesis by
  Clement also tables them), replacing the common annulus point and the 51°
  construction. (M6, or any session with document access)
- `data/eom/geometry-default.json`: rectus pulleys are `null`; transcribe fixed
  pulley coordinates from Clark, Miller & Demer, IOVS 41:3787-3797, 2000, and
  tighten the `path.test.ts` tolerance once they land. (M6, or any session with
  document access)
- `data/eom/geometry-default.json`: superior and inferior rectus tendon lengths and the
  inferior oblique insertion width are still assumptions (the SR/IR widths were transcribed
  in M5 from a dissection-study excerpt whose authors the excerpt does not name; confirm
  them); transcribe the BCSC table. (M6, or any session with document access)
- `data/visual-axis/defaults.json`: transcribe Polans 2015's angle alpha, lens tilt,
  and decentration (doi 10.1364/OPTICA.2.000124). Tilted surfaces exist since M4
  Task 4.1, so this is transcription only. (M6, or any session with document access)
- `data/eyelid/shaw-2010.json`: the lower-lid pressure and contact band are still assumed
  equal to the upper lid's (no excerpt reports lower-lid pressure in mmHg; Shaw's 2009 QUT
  thesis found the lower lid's topographic effect larger in downgaze). (M6, or any session
  with document access)
- `data/eom/forces.json`: the oblique capacities are assumptions, and the vertical recti are
  derived from Shin et al. 2023's ratios applied to the Collins 1981 horizontal mean;
  tendon stiffness is a lower bound from a transverse modulus. (M6, or any session with
  document access)
- `data/synteyes/rozema-2016-params.json` is a stand-in (one Gaussian over M, J0, J45 with
  assumed values): transcribe the SyntEyes mixture (Rozema et al. 2016, IOVS 57:683-691, doi
  10.1167/iovs.15-18067, and its supplement) and re-run the calibration. (M6, or any session
  with document access)
- `data/acuity/watson-ahumada-2008.json` names an MTF-threshold stand-in: transcribe the Watson &
  Ahumada 2008 acuity model or its simple metric (J Vis 8(4):17, doi 10.1167/8.4.17), replace
  the stand-in and its lookup table, and regenerate the prediction grid. (M6, or any session
  with document access)

## Verification

- Spec §7 / master plan Task 4.2: reproduce a published corneal inflation curve (apex rise
  against IOP) within 15% with the calibrated stiffness. Deferred from M4 by the owner (#14);
  the M5 search (2026-10-29) found the abstracts of Elsheikh et al. 2007 (Curr Eye Res 32:11-19)
  and 2010 (J R Soc Interface) but no apex-rise numbers, so the check still cannot be written.
  The stiffness is now calibrated to the in-vivo ocular rigidity instead (M5 Task 5.4). Needs
  the owner's decision to accept again, or a session with document access. (owner, M6)

## Model

- Loads other than IOP act as a linear perturbation of the pressurized eye (M5 Deviation 11)
  because the globe, held only at the optic-nerve cap with a dead-load orbital reaction,
  softens under the full muscle load. Model the orbit as an elastic foundation (orbital fat and
  Tenon's capsule) and the muscles' own stiffness so the nonlinear solve is stable, then compare
  it with the linear perturbation. (M6)
- The induced astigmatism of the FEM is not mesh-converged (M5 Task 5.5 mesh study: ΔJ0 +0.121,
  +0.102, +0.132 D at `n_face` 12, 16, 20). Integrate the lid bands exactly (or normalize their
  resultant, as the muscle contact bands are), refine the cornea locally, and repeat the study;
  rebuild the library at the converged mesh. (M6)
- The growth law's spherical mode grows at every tabled stiffness on the Krylov-enriched basis
  (+0.84 to +1.06 per unit r·t; `data/results/README.md`, the response library): in-plane
  growth enlarges and thins the pressurized shell, which raises its stress. Add growth in
  thickness (or a volumetric or isochoric constraint) to the law, rebuild the library, and
  recalibrate. With the current law the calibration is confined to negligible growth, so the
  remodeling form of the hypothesis is untested. (M6)
- The reduced growth model's validated exposure (`VALID_RATE_TIME`, r·t = 0.01) comes from the
  coarse test mesh. Repeat the FEM comparison on the production mesh (`n_face 20`) and set the
  bound from it. The explicit FEM growth runs away at the edge of the clamped optic-nerve cap
  shortly beyond r·t = 0.01: model the lamina and nerve-head support (or let the cap grow), so
  that longer exposures can be validated. (M6)
- The recalibrated fit (Task 5.14) reproduces the shift elastically, with the unloaded baseline
  J0 at its −0.5 D bound, the stiffness slope 2.3 prior SDs above the Elsheikh et al. mean, and
  lid pressure 2.4 times the table: widen or justify the baseline bound once SyntEyes is
  transcribed, and check the age stiffening against a source with document access. Its chain
  spans only 13–17 autocorrelation times: run it longer (or with more walkers) before relying on
  the intervals. Once growth can be validated longer, start the sampler from several modes (the
  first calibration's likelihood was multimodal in the rate). (M6)

## Review round 1 (PR #16, head 2d355a1), Minor findings not fixed in the fix round

Minor 4, 5, 9, and 14 (posterior schema check) are steps of plan Task 5.14 or fixed there.

- `reanchor` keeps the grid's onsets instead of recomputing them on the re-anchored median with
  `grid.thresholds`, and `test/predictions.test.ts` asserts the kept value (unused in the UI
  today: the anchor is always the grid's baseline age). (M6)
- The timeline's onset comes from the nearest grid node and the median power vector, while the
  plotted curves are interpolated per-component medians, so the marker can sit off the displayed
  crossing; the grid's 5–95% onset range is not shown. Compute the onset in the viewer from the
  displayed median and `grid.thresholds`. (M6)
- Applying a prediction, loading a result, then clearing the result restores the predicted eyes
  with `prediction.applied` false (`store/scene.ts` `showResult`/`clearLoadedResult`): capture
  `beforePrediction` into `beforeResult`, or clear both. (M6)
- `forces/equilibrium.py`: the infeasible-equilibrium error does not name the gaze, and no test
  covers the CLI's exit 2 on an infeasible gaze (wrap the call in `fem/loads.py` with the gaze
  label). (M6)
- The prediction-grid validators (`science/eyebiomech/schema.py`,
  `web/packages/eye-model/src/schema/predictions.ts`) check only the first element at each
  depth: ragged arrays pass, and Python raises `IndexError` instead of `SchemaError` on an empty
  inner array; check every row and the `axisDeg`/`logMAR` shapes. (M6)
- `predict/acuity.py` clips |M| at 4 D while the grid's median sphere reaches −10 D, so logMAR
  saturates; extend the table or document the clip in the grid metadata. (M6)
- `Library._interp` clamps the stiffness silently to the tabled 0.5–4×, while the prior's slope
  bound allows 0.46× below 50 years, and the recalibrated posterior's 90% upper slope
  (0.057/yr) reaches that edge: warn or refuse outside the table, table 0.25×, or tighten the
  bound. (M6)
- `calib/forward.py` hard-codes the axis-class boundaries cos 2α = ±0.5 (the 30° comes from the
  data file's definition text); read them from data. The two J0-slope targets cover the same
  window with assumed SEs, which double-weights the slope; state it or merge them. (M6)

## Review round 2 (PR #16, head a894140), Minor findings not fixed in the fix round

Minor 3 and 5 are fixed in plan Task 5.15; Minor 8 (chain length) is already filed under Model;
Minor 10 is the owner decision asked in the PR body.

- The timeline's stance line (`web/apps/viewer/src/ui/Timeline.tsx`, "axis shift only") and the
  tooltip (`web/apps/viewer/src/ui/tooltips.ts`, "axis shift and J0 slope only") disagree, and
  both hard-code the current calibration's findings ("growth negligible", "the shift comes from
  the elastic loads"), which go stale on recalibration. Align them and carry the summary in the
  grid document (its `citation` or a new field). (M6)
- `Library._interp` also clamps at the top of the table: with the anchor 1.542 at 70, a slope
  above 0.0477/yr exceeds scale 4 at 90, which about 47% of the posterior draws do (ages 87–90).
  Table a scale 6, or warn (together with the low-edge item above). (M6)
- `remodel/library.py` interpolates F and γ in ln s although the Krylov patterns differ between
  stiffness levels (pattern 36's growth M −42 at 0.5, +74 at 1). Within the validated exposure
  this agrees with interpolating per-level results within about 3%; label it as an
  approximation next to "patterns and feedback of the tabled stiffness", or build the Krylov
  sequence once and reuse it across levels. (M6)
- The bounding fit (`posterior-v1-sphere-bound.json`) reports `dof` 7, counting the four
  inactive one-sided envelopes; exclude envelopes from `dof` in `calib/fit.py` or note it. (M6)
- `data/results/predictions/v1.json` provenance has `gitHash` `fc02b80…-dirty`; head regenerates
  it identically, so regenerate it from a clean tree on the next grid build. (M6)
- `test_library.py` `test_the_library_is_enriched_bounded_and_labeled` asserts only finite
  feedback eigenvalues; assert the documented structure (one eigenvalue with positive real
  part, its eigenvector's refraction mostly in M). (M6)
