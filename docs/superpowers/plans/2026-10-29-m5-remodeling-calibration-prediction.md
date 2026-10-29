# Milestone 5: Remodeling, calibration, prediction

Date: 2026-10-29
Status: in progress (draft PR "Milestone 5: Remodeling, calibration, prediction")
Master plan: `docs/superpowers/plans/2026-10-26-master-plan.md` (Milestone 5 section)

**Goal:** `uv run eyebiomech predict --profile age=12,nearHours=4,sphere=0,cyl=0 --out <path>` writes a predicted trajectory of sphere, cylinder, and axis with 5–95% uncertainty bands and the two onset ages (refraction threshold and Watson & Ahumada acuity threshold) for a subject profile, from a model in which intraocular pressure, the six extraocular muscles at a daily near-work duty cycle, the ciliary ring, and the eyelids load the corneoscleral shell, the shell responds elastically and remodels by stress-driven growth toward a homeostatic target, and the free parameters are calibrated against the with-the-rule to against-the-rule shift of astigmatism with age (mean refraction by age secondary). A precomputed prediction grid is committed, and the viewer shows it as a scrubbable age timeline with bands and both onset markers that drives the eye and optics strip. The Milestone 4 follow-ups assigned to M5 are closed or re-filed with a reason. The hypothesis stays a hypothesis (spec §1.2): the calibration reports how well the mechanism can account for the data, including when it cannot.

**Architecture:** `science/eyebiomech/` grows four subpackages. `forces/equilibrium.py` replaces M4's torque balancing with a static equilibrium against a passive orbital torque, so eccentric gazes (near work) are supported. `fem/` gains an inverse solve for the stress-free geometry (`inverse.py`), a calibrated stiffness scale (`rigidity.py`), gaze-following lid and orbital loads, and growth-aware materials. `remodel/` holds the duty cycle (`history.py`), the growth law on the full FEM (`growth.py`), and a reduced-order response library (`library.py`) built from the FEM by linearization about the pressurized eye; `optics/paraxial.py` turns surface and axial changes into refraction. `synth/synteyes.py` samples synthetic subjects, `calib/` holds the population data loaders, the forward model, least-squares fitting, and an affine-invariant ensemble sampler, and `predict/` the acuity metric, onset detection, and the grid writer. One command-line program (`eyebiomech/cli.py`) carries the subcommands `fem`, `library`, `calibrate`, `predict`, and `grid`. The viewer adds `src/data/predictions.ts` (load and interpolate the grid) and `src/ui/Timeline.tsx`. The only new documents crossing into the viewer are the prediction grid (`schemas/predictions.schema.json`, new, 1.0.0) and the existing EyeParameters and deformation sidecar.

**Tech Stack:** Python 3.12, uv, NumPy, SciPy (`optimize.least_squares`, sparse LU), scikit-fem 12, jsonschema, pytest, ruff. TypeScript strict, Vitest, React 19, Zustand, three + react-three-fiber (unchanged), custom SVG chart, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-26-eye-simulation-design.md` §1.2 (scientific stance), §4.2 (accommodation controller, amplitude), §4.3 (pupil), §4.4 (passive orbit and v2 static equilibrium), §7 (remodeling layer, load history, labels "elastic"/"remodeled", inflation verification), §8 (all), §9, §12 (predictions precomputed as JSON, viewer interpolates, no server).

## Deviations from the master plan (decided at planning time)

1. **Literature from search excerpts.** The session's network policy again denies the literature and data hosts (checked 2026-10-29 with curl and WebFetch: pmc.ncbi.nlm.nih.gov, doi.org, europepmc.org, www.ebi.ac.uk, iovs.arvojournals.org, digital.csic.es, wwwn.cdc.gov, api.crossref.org, api.openalex.org, api.semanticscholar.org, scholar.archive.org, core.ac.uk, arxiv.org, biorxiv.org). As in M4, every population table, growth-law constant, passive orbital stiffness, duty-cycle constant, SyntEyes parameter, and acuity-metric constant is transcribed from search-engine excerpts with its source named and `verified: false`, or labeled `"assumption"` with the reasoning. `download_nhanes.py` is written and unit-tested on a small synthetic file, but not run (cdc.gov is unreachable); its output directory `data/large/` is gitignored.
2. **Reduced-order forward model (response library).** One production FEM solve takes minutes (M4: about 4.5 min for the loaded state), and the calibration evaluates the forward model for a cohort over 85 years of age thousands of times, so it cannot call the FEM. The FEM instead builds a response library once (`eyebiomech library`, committed under `data/results/response/`): the pressurized eye's tangent stiffness is factorized, and each load group (muscles at the distance gaze, muscles at the near gaze, eyelids at each gaze, the ciliary ring per diopter, and the homeostatic-offset mode of the growth law) gives a linear displacement, its induced refraction, its stress deviation, the refraction of a unit growth of that stress pattern, and the Galerkin-projected stress feedback of growth. Responses are tabled at several stiffness scales and interpolated in log scale. The forward model superposes them with time-varying intensities. Approximations, labeled in the code, the provenance, and the viewer tooltip: linear superposition about the pressurized state; growth dynamics reduced to the span of the load-group stress patterns; responses of the reference eye for every subject (subjects differ in baseline refraction, near work, and age only). A test compares the library against direct nonlinear FEM solves (elastic, and three growth steps) on a coarse mesh.
3. **Growth is a field, not a moved mesh.** The master plan's `grow(reference_mesh, ...) -> reference_mesh'` is replaced by the multiplicative decomposition of Rodriguez, Hoger & McCulloch 1994: `F = Fe·Fg` with a growth tensor `Fg = I + εg` per quadrature point on the fixed reference mesh, the energy `Jg·W(Fe)`, and `grow(...) -> GrowthState`. A moved mesh would discard the incompatible part of growth (the residual stress through which growth feeds back on stress). The growth law: `dεg/dt = r · Pt (σ − h·σIOP) Pt / s_IOP`, the tangent-plane projection `Pt` of the Cauchy stress deviation from the homeostatic target `h·σIOP` (the IOP-only stress of the subject's eye at the reference age times the homeostatic ratio `h`), normalized by the local IOP membrane stress `s_IOP = tr(Pt σIOP Pt)/2`; `r` is per year. With `h = 1` the pressurized eye is homeostatic by construction and only the muscle, lid, and ciliary deviations drive growth. In-plane tensorial growth, with the tissue's in-plane fiber dispersion (M4 Deviation 11), stands in for the fiber-aligned growth of Grytz & Meschke 2010 (approximation). Fiber directions do not reorient with growth (approximation, small strains).
4. **No `emcee`.** Spec §3.3 limits `eyebiomech` to NumPy, SciPy, scikit-fem, and the schema. `calib/mcmc.py` implements the affine-invariant ensemble sampler with the stretch move (Goodman & Weare 2010, the algorithm `emcee` implements) in NumPy, tested on a correlated Gaussian target.
5. **Static equilibrium with a passive orbital torque, Python only.** M4's torque balancing switched off the agonist at eccentric gazes because nothing resists the eye's rotation but the muscles. The orbit's passive tissues pull the eye back toward primary position (Robinson 1975), and the agonist must exceed its antagonist by that torque. `forces/equilibrium.py` solves, per gaze, the non-negative forces closest to the length-proxy forces (the same weighted norm as M4's balancing) whose moment about the globe center cancels the passive orbital moment `−K·θ` (θ the gaze rotation vector, `K` from `data/eom/passive-orbit.json`), keeping the total tension. The orbital reaction then carries the passive moment and the net force, as a distributed traction on the posterior hemisphere of the orbit frame. This is spec §4.4's v2 equilibrium in its simplest form (least change from the proxy rather than least total activation, because least total activation zeroes primary-position tone); the viewer keeps the v1 length proxy.
6. **Subjects share the reference eye's responses.** The library is built on one eye (the document of the regenerated committed result, which carries a lens accommodation model; Task 5.5). SyntEyes subjects supply baseline refraction and astigmatism distributions for the calibration cohort; their individual geometry is not re-solved (approximation, labeled).
7. **Prediction grid anchored at the baseline age.** The grid's baseline sphere and cylinder are the refraction at the grid's first age (6 years; cylinder with the rule, axis 180, since young astigmatism is mostly with the rule; both stated in the grid's metadata), and each cell is the trajectory from that baseline. `eyebiomech predict` anchors a profile at its own age exactly. The viewer interpolates the grid as the master plan says and re-anchors at the subject age by subtracting the predicted change up to that age (approximation for percentile bands, stated in the tooltip).
8. **Calibration identifiability test on a richer synthetic design.** The real population targets (axis-class prevalence by decade, mean refraction by age) are not stratified by near work, so muscle tone and lid pressure enter them almost only through their sum. The synthetic recovery test (master plan Task 5.4) therefore generates data with near-work strata as well; the real calibration reports posterior widths and correlations, and an unidentified parameter is reported as such rather than fixed silently.
9. **Slow tests and the nightly job.** The master plan runs `@pytest.mark.slow` tests nightly in CI. No nightly workflow exists, and the cloud token cannot edit `.github/` (driver hard rule 1). Task 5.10 opens a `needs-local: nightly slow-test workflow` issue with the exact workflow; until it lands, the slow tests are run locally before the commits that add them and recorded in the PR body.
10. **Stiffness calibration target.** Tissue stiffness is calibrated against the in-vivo ocular rigidity of Pallikaris et al. 2005 (the only in-vivo whole-globe stiffness reference the M4 search found; M4 Deviation 1 outcome) by one scale on every stiffness, and its age slope is a calibration parameter of the population fit. The master plan's 15% corneal inflation-curve check (deferred from M4 by the owner, #14) is repeated against whatever published apex-rise points a search finds; if none can be transcribed, it is re-filed with the hosts tried, and the owner is asked again in the PR body.
11. **Loads other than IOP act as a linear perturbation of the pressurized eye (decided in implementation, Task 5.4).** With the calibrated, softer tissue the nonlinear solve of the near gaze stalled in the CLI test, and building the library (Task 5.8, ahead of its commit) showed that the direct nonlinear solve departs from linear superposition under the full muscle load: for the distance-gaze muscles of the navarro-1985 preset (uncalibrated stiffness), the largest displacement is 16.5 µm at a quarter of the load, 36 µm at half, and 138 µm at full load (150 µm at `n_face` 10, so not a coarse-mesh artifact), and the induced M and J0 per unit load grow by 60% and 145% from half to full load, while the lids and the ciliary ring stay linear within 1%. The globe, held only at the optic-nerve cap with a dead-load orbital reaction, softens under the muscles' squeeze (a buckling-like pivot that the real orbit, which is elastic and whose muscles stiffen with stretch, resists). The physically meaningful elastic response of the micrometer-scale corneal changes is the linear one, so the CLI (`--perturbation linear`, the default; `nonlinear` keeps M4's solve) and the library both apply the non-IOP loads as `K⁻¹ f` about the pressurized state, `K` the tangent with the follower-pressure term. M4's committed result (nonlinear) was in this softened regime, which inflated its ΔM; the regenerated result replaces it. Modeling the orbit as an elastic foundation and the muscles' stiffness, so the nonlinear solve is stable, is a follow-up.

## Global Constraints

- Units: millimeters, diopters, degrees in data files and UI; radians internal to math modules; the FEM works in mm, N, MPa; time in years for remodeling. Right-handed; the FEM frame is the EOM frame (M4 Deviation 8); the orbit frame is the FEM frame at primary gaze.
- TypeScript `strict: true`, no `any` in `eye-model` or `optics`. These two packages import nothing from the DOM or React. `optics` does not import `eye-model`.
- Every numeric constant lives in `data/` with a citation; code never hard-codes a physiological value. Numerical choices (mesh resolution, tolerances, time steps, sample sizes, seeds) are named constants with a comment saying they are numerical.
- All optics computation in the viewer runs in a web worker; the main thread never blocks more than 16 ms per frame (grid interpolation is a few hundred multiply-adds per frame and stays on the main thread; anything heavier goes to the worker).
- `EyeParameters.schemaVersion` stays `"1.0.0"`; Python validates every document it reads and writes, including the prediction grid against `schemas/predictions.schema.json` (TS validates it in a test and on load).
- Python 3.12; runtime dependencies stay NumPy, SciPy, scikit-fem, jsonschema (Deviation 4).
- Every biomechanics result is labeled "elastic" or "remodeled" (provenance, grid metadata, viewer readout). The viewer and docs keep the §1.2 stance.
- Approximations (length-proxy forces, passive orbit as a linear torque, stress-free geometry from the inverse solve, linear superposition about the pressurized eye, reduced growth dynamics, reference-eye responses for all subjects, re-anchoring of percentile bands, prediction applied to the eye as a corneal change) are labeled "Approximation:" in the tooltip of the affected readout.
- Full gate before every commit: `(cd web && pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build && pnpm --filter @eye/viewer e2e) && (cd science && uv run ruff check . && uv run pytest -m "not slow")`. Run `uv run pytest -m slow` before committing a task that adds or changes slow tests. CI-visible Python tests stay under about 3 minutes in total.
- Commit messages end with `Co-Authored-By: Claude <model name> <noreply@anthropic.com>` naming the model that wrote them. One task per commit; push after every commit.

## Review Focus

1. **Equilibrium infeasibility.** A gaze for which no non-negative force set balances the passive torque raises `ValueError` naming the gaze; the CLI exits 2. → Task 5.2.
2. **Linearization validity.** The library's superposed elastic refraction agrees with a direct nonlinear solve of the combined loads within 10%, and three reduced growth steps with the direct FEM growth within 20%. → Task 5.8.
3. **Growth stability.** An explicit growth step whose `r·dt·λmax(K)` exceeds 0.5 is refused (FEM) or sub-stepped (reduced model); no trajectory can oscillate or diverge from step size. → Tasks 5.7, 5.8.
4. **Elastic versus remodeled labels.** Every exported document, library entry, posterior, and grid says which; the viewer's timeline tooltip says "remodeled". → Tasks 5.8, 5.11, 5.12.
5. **Identifiability.** Synthetic data from known parameters are recovered within 10% (lsq) and inside the 90% interval (MCMC, slow); the real posterior reports widths and the correlation matrix. → Task 5.10.
6. **Grid edges.** Ages outside 6–90 clamp; near hours and baselines outside the grid clamp to its edge with a visible note; onset is `null` when never crossed and the first age when already above threshold at baseline. → Tasks 5.11, 5.12.
7. **Cross-language agreement.** Python's paraxial refraction of a surface change agrees with the TypeScript worker's induced refraction of the committed FEM result (a committed fixture written by a TS test), within 0.01 D. → Task 5.8.

## File structure

```
data/eom/passive-orbit.json                    passive orbital rotational stiffness (Task 5.2)
data/results/forces/duty-cycle.json            force table at the duty-cycle gazes (Task 5.2)
data/materials/cornea-sclera.json              (modify) calibration scale (Task 5.4)
data/calibration/duty-cycle.json               waking hours, near distance, reading declination (Task 5.6)
data/remodeling/growth.json                    growth-law form, default rate and homeostatic ratio, citations (Task 5.7)
data/remodeling/README.md
data/population/README.md                      sources, licenses, download script
data/population/axis-shift-by-age.json         WTR/ATR/oblique prevalence by decade (Task 5.9)
data/population/refraction-by-age.json         mean sphere and cylinder by age (Task 5.9)
data/synteyes/rozema-2016-params.json          mixture parameters for synthetic subjects (Task 5.9)
data/synteyes/README.md
data/calibration/priors.json                   parameter bounds and priors (Task 5.10)
data/acuity/watson-ahumada-2008.json           acuity metric constants (Task 5.11)
data/results/response/library-v1.json          reduced-order response library (Task 5.8)
data/results/calibration/posterior-v1.json     fitted parameters and posterior draws (Task 5.10)
data/results/predictions/v1.json               prediction grid (Task 5.11)
data/results/fem/*.eye.json, *.deformation.json  regenerated elastic result (Task 5.5)
data/oracle/induced-refraction.json            TS-traced induced refraction of the committed result (Task 5.8)
schemas/predictions.schema.json                grid schema (Task 5.11)
science/eyebiomech/cli.py                      one entry point, subcommands fem/library/calibrate/predict/grid
science/eyebiomech/forces/equilibrium.py       static equilibrium with passive orbital torque (Task 5.2)
science/eyebiomech/fem/inverse.py              stress-free geometry by fixed-point inverse solve (Task 5.3)
science/eyebiomech/fem/rigidity.py             ocular rigidity and stiffness calibration (Task 5.4)
science/eyebiomech/fem/scleral.py              scleral height maps (Task 5.5)
science/eyebiomech/optics/paraxial.py          refraction change from surface and axial changes (Task 5.8)
science/eyebiomech/remodel/history.py          duty cycle → time-averaged load intensities (Task 5.6)
science/eyebiomech/remodel/growth.py           growth tensors, grown materials, grow() (Task 5.7)
science/eyebiomech/remodel/library.py          response library build and reduced model (Task 5.8)
science/eyebiomech/synth/synteyes.py           SyntEyes sampler (Task 5.9)
science/eyebiomech/calib/data.py               population loaders, download_nhanes (Task 5.9)
science/eyebiomech/calib/forward.py            cohort forward model (Task 5.10)
science/eyebiomech/calib/fit.py                least squares and posterior (Task 5.10)
science/eyebiomech/calib/mcmc.py               ensemble sampler (Task 5.10)
science/eyebiomech/predict/acuity.py           Watson & Ahumada 2008 metric (Task 5.11)
science/eyebiomech/predict/onset.py            onset ages (Task 5.11)
science/eyebiomech/predict/grid.py             subject grid → predictions JSON (Task 5.11)
web/packages/eye-model/scripts/export-forces.ts  (modify) --gazes option (Task 5.2)
web/apps/viewer/src/data/predictions.ts        load + interpolate the grid (Task 5.12)
web/apps/viewer/src/ui/Timeline.tsx            age scrub, bands, onset markers (Task 5.12)
web/apps/viewer/e2e/timeline.spec.ts
```

---

### Task 5.0: Literature search and transcription re-files

Absorbs the M4 follow-ups that need document access: Zapata-Díaz 2019 Table 1, Navarro 1985 Table 4 conic coefficients, Volkmann 1869 origins, Clark, Miller & Demer 2000 pulleys, the SR/IR and oblique insertion widths and tendon lengths, Polans 2015 angle alpha and lens tilt, the lower-lid pressure and lid margin positions, and the vertical rectus and oblique force capacities.

**Files:**
- Modify (only where an excerpt gives a value): `data/schematic-eyes/zapata-diaz-2019.json`, `data/schematic-eyes/navarro-1985.json`, `data/eom/geometry-default.json`, `data/visual-axis/defaults.json`, `data/eyelid/shaw-2010.json`, `data/eom/forces.json`, their READMEs
- Modify: `docs/literature/README.md` (DOIs for Rozema 2016 and the remodeling sources where an excerpt gives them; the M0 follow-up line is narrowed accordingly)
- Create: `docs/superpowers/plans/2026-10-29-m5-followups.md`

**Interfaces:** none (data and docs).

- [x] **Step 1:** Search once per item with WebSearch (excerpts). Transcribe any value an excerpt states, with the source named and `verified: false`; never fill a value from memory.
- [x] **Step 2:** Re-file what remains in `2026-10-29-m5-followups.md` under "Data and provenance (needs a session with document access)" with the date and the hosts tried, naming M6 or "any session with document access". The Zapata-Díaz item stays blocking for the release gate on `verified: true` for the default preset.
- [x] **Step 3:** Full gate (the transcription tests in `presets.test.ts`, `geometry.test.ts`, and `test_fem_data.py` still pass with any changed values). Commit: `chore: M5 literature search and transcription re-files`.

### Task 5.1: FEM and CLI hardening follow-ups

Absorbs the M4 follow-ups on `cli.py` (document muscles ignored, missing files, `--iop` default, git hash of a dirty tree), the non-convergence exit test, `DATA_DIR` in the wheel, the `tangent_tensor` finite-difference test, `validate_deformation` length checks, tilt terms in `check_physical`, the `referencing` dependency, the posterior map's normalization radius, the dead-load cache, the `relative_to_lens` non-rigid tests, and the spec §7 "axisymmetric first" deviation line (owner, M5).

**Files:**
- Create: `science/eyebiomech/cli.py` (the parser and `main`; `fem/cli.py` keeps `run_fem` and re-exports `main` for compatibility)
- Modify: `science/eyebiomech/fem/cli.py`, `science/eyebiomech/fem/data.py`, `science/eyebiomech/fem/loads.py`, `science/eyebiomech/fem/solve.py` (`Context.load_cache`), `science/eyebiomech/fem/export.py`, `science/eyebiomech/schema.py`, `science/pyproject.toml` (entry point `eyebiomech.cli:main`; `referencing` declared; wheel `force-include` of the data tables), `science/eyebiomech/forces/from_viewer.py` (`document_muscles`, `check_document_muscles`), `data/materials/cornea-sclera.json` (`intraocularPressure` default with citation), `docs/superpowers/plans/2026-10-28-m4-corneoscleral-biomechanics.md` (one deviation line), tests `test_fem_export.py`, `test_fem_material.py`, `test_schema.py`, `test_packaging.py`, `test_fem_loads.py`

**Interfaces:**
- `fem/data.py`: `data_root() -> Path` resolves, in order, an override (`data_root_override(path)`, the CLI's `--data-root`), the `EYEBIOMECH_DATA` environment variable, the repository's `data/` when running from a checkout, and the copy the wheel ships as `eyebiomech/data/`. Decided in implementation: the wheel gets the tables through hatch's `force-include` of the needed `data/` subdirectories (no copies in the repository to keep identical; `data/large/` is never included); later tasks add their directories to the list. `DATA_DIR` stays as the import-time root.
- `cli.py`: `main(argv=None) -> int`; subcommand `fem` as in M4 plus: `--iop` defaults to the cited value in `data/` (the help text names it); a missing `--eye`/`--forces` file, malformed JSON, or a malformed force table exits 2 with a message naming the file; a document whose `extraocularMuscles` differs from `data/eom/geometry-default.json` (names, insertion distances or widths, tendon values) is rejected with exit 2 ("the force table is generated from the default muscle geometry; regenerate it from this document first"); `_git_hash()` returns `<hash>-dirty` for a dirty tree (the schemas' `gitHash` is a free string, so no schema change is needed).
- `schema.py`: `validate_deformation` also checks `len(vertices) == len(displacementMm) == len(region)` and every triangle index `< len(vertices)`.
- `export.py`: `check_physical` excludes piston and tilt (j = 0, 1, 2) from the RMS. Posterior map (decided in implementation): the optics package evaluates the polynomials beyond ρ = 1 unclamped, and at 3.5 mm the committed posterior map's higher-order terms reached 0.8 µm at 4 mm; clamping the aperture would vignette large pupils, so the posterior fit widens to 4.0 mm (the anterior's), covering rays of pupils up to about 7.5 mm, and the comment states the extrapolation beyond.
- `loads.py`/`solve.py`: the dead-load cache lives on the `Context` (`ctx.load_cache`, keyed by the `Loads` instance's version counter), not on `id(ctx)`.

- [x] **Step 1:** Failing tests:
  - `test_fem_material.py`: for an HGO material with κ = 0.1 and shares (0.5, 1.0), `einsum("ijkl...,kl...->ij...", tangent_tensor(F), dF)` equals `tangent(F, dF)` and the central difference of `first_pk` (1e-6 relative) at random `F` near `I` with fibers in tension.
  - `test_schema.py`: `validate_deformation` rejects a sidecar whose `displacementMm` is one shorter than `vertices`, and one with a triangle index equal to `len(vertices)`.
  - `test_fem_export.py`: `cli.main` on a solve forced not to converge (monkeypatched `solve` raising `NewtonDidNotConverge`) returns 2 and writes no files; a missing `--eye` file, a malformed force table, and a document with a changed lateral rectus insertion return 2 with a message naming the problem; `_git_hash()` in a dirty temporary repository ends in `-dirty`; `check_physical` passes a map whose only large terms are Z(1,±1) at 600 µm; `relative_to_lens` on a known non-rigid field (a radial bulge of the cornea plus a c(2,2) height change) superposed on a pivot returns the field alone (1e-9 mm), and a pure torsion about z passes through unchanged.
  - `test_fem_loads.py`: two contexts built in sequence never share a cached dead load (the second context's vector matches a fresh assembly after the first is deleted and garbage-collected).
  - `test_packaging.py`: `data_root()` follows the override and `EYEBIOMECH_DATA`; slow: the wheel contains `eyebiomech/data/` with the tables, and the wheel installed in an isolated environment and run from a temporary directory reads them from site-packages.
- [x] **Step 2:** Run `cd science && uv run pytest tests/test_fem_material.py tests/test_schema.py tests/test_fem_export.py tests/test_fem_loads.py`; FAIL.
- [x] **Step 3:** Implement. Add to the M4 plan's deviations: "18. Spec §7 'start axisymmetric for verification' is met by the 3D Lamé sphere test (Task 4.4) instead of a separate axisymmetric model (recorded in M5)."
- [x] **Step 4:** Run (including `-m slow` for the wheel test); PASS. Full gate. Commit: `fix(fem): CLI, schema, export, and cache hardening (M4 follow-ups)`.

### Task 5.2: Passive orbital torque, static equilibrium, gaze-following lids and orbit

Absorbs the M4 follow-ups "the length-proxy muscle forces are not torque-balanced ... model passive orbital torques or the v2 static equilibrium, rerun the committed result, and re-enable eccentric gazes in the CLI" (blocking for the duty cycle), "rotate the lid bands and the orbital support by the inverse gaze", and "add a drift test for `data/results/forces/default.json`".

**Files:**
- Create: `data/eom/passive-orbit.json`, `science/eyebiomech/forces/equilibrium.py`, `science/tests/test_equilibrium.py`, `data/results/forces/duty-cycle.json`
- Modify: `science/eyebiomech/fem/loads.py` (`from_force_table` uses the equilibrium; lid bands and the orbital reaction in the orbit frame), `science/eyebiomech/fem/cli.py` (eccentric gazes accepted), `science/eyebiomech/forces/from_viewer.py` (gaze quaternion per entry, list-of-gazes tables), `web/packages/eye-model/scripts/export-forces.ts` (`--gazes "h,v;h,v"`), `web/packages/eye-model/test/export-forces.test.ts` (drift tests), `data/eom/README.md`, `data/results/README.md`, tests `test_fem_loads.py`, `test_fem_export.py`, `test_forces.py`

**Data:** `passive-orbit.json`: `{ name, form: "linear", stiffnessNmmPerDeg: { horizontal, vertical, torsional }, citation, verified: false }` from an excerpt of the passive orbital restoring force (Robinson 1975; Collins et al. 1975 or Quaia & Optican 2003 for the passive horizontal stiffness), or an assumption with an order-of-magnitude argument.

**Interfaces:**
- `equilibrium.py`: `passive_moment(gaze_quat: ArrayLike, table: dict) -> NDArray (3,)` (N·mm, in the globe frame: `−K` applied to the gaze rotation vector, `K` diagonal in the orbit's horizontal/vertical/torsional axes, rotated into the globe frame); `equilibrium_forces(proxy_forces: NDArray (6,), insertions: NDArray (6, 3), directions: NDArray (6, 3), external_moment: NDArray (3,), capacities=None, keep_total=False) -> NDArray (6,)` (the M4 QP generalized to `Σ fᵢ (cᵢ × dᵢ) = −external_moment`, `0 ≤ f ≤ capacity`, same weights and exact enumeration of the active bounds; raises `ValueError` when infeasible); `capacities_n()` from `data/eom/forces.json`. Decided in implementation: the total tension is **not** kept (`keep_total=False`): the proxy's agonist moment is about twice the passive moment, and keeping the total pushed the excess into the other muscles and switched the medial rectus off in adduction; least change alone keeps every loaded muscle at every lattice gaze. M4's `_torque_balanced` is the `external_moment = 0, keep_total=True` case, kept for `passive=False`.
- `Loads.from_force_table(table, gaze_index, eom, passive=None)`: forces from `equilibrium_forces` with the passive moment (`passive` defaults to `data/eom/passive-orbit.json`; `passive=False` gives M4's zero-moment balance for the regression comparison); records `tableForceN`, `forceN`, and `passiveMomentNmm`; a balanced set that unloads a muscle the table loads is no longer an error but recorded (`unloaded: [...]`) and printed by the CLI.
- `Loads.eyelid(...)` places the bands at the lid margins of `data/eyelid/shaw-2010.json` (`upperMarginMm`, `lowerMarginMm`, MRD1 and MRD2 transcribed in Task 5.0) instead of symmetrically at `±aperture/2` (the M4 follow-up "the bands are placed symmetrically about the corneal center"); a document's `eyelid.apertureMm` shifts both margins symmetrically from those defaults.
- `Loads.gaze(quat)`: sets the gaze for the orbit-frame loads; the lid bands are evaluated at `R(gaze)⁻¹`-rotated band coordinates (bands fixed in the orbit, the globe turning under them) and the orbital reaction acts on the outer surface where the orbit-frame `z > 0`. `from_force_table` sets it from the table's quaternion.
- Orbital reaction: unchanged form (`a + ω × x`), now canceling the muscles', lids', and ciliary ring's force and moment (so it carries the passive moment).
- `export-forces.ts`: `--gazes "h,v;h,v"` writes those gazes instead of the lattice; `buildForceTable({ gazes })`. `data/results/forces/duty-cycle.json` holds primary gaze and the near gaze of `data/calibration/duty-cycle.json` (written here with the duty-cycle data file, Task 5.6 reads it).

- [x] **Step 1:** Search excerpts for the passive orbital rotational stiffness; write `passive-orbit.json` and `data/calibration/duty-cycle.json` (near distance, reading declination, waking hours; Task 5.6 adds loaders and tests).
- [x] **Step 2:** Failing tests:
  - `test_equilibrium.py`: with zero external moment and `keep_total`, `equilibrium_forces` equals M4's balanced forces on the default table's primary gaze; the returned forces satisfy the moment equation to 1e-9 N·mm within the capacities, and the KKT conditions of the bounded program hold at every lattice gaze; at every gaze of the default 5 × 5 table within ±15° (and at the duty-cycle near gaze) the agonist stays loaded (no muscle the table loads is unloaded); an infeasible external moment (larger than every muscle can supply) raises `ValueError` naming it; `passive_moment` of primary gaze is zero and of a 10° abduction points to adduction with magnitude `10 · K_h`.
  - `test_fem_loads.py`: with a gaze of 20° up, the lid band pressure integrates to the same total as in primary gaze (the band moved, its area on the sphere did not change) within 2% on `make_sphere_shell`, and its centroid lies at the orbit-frame band rotated by the inverse gaze; the orbital reaction cancels the dead loads' net force and moment (1e-9 relative) including the passive moment.
  - `test_fem_export.py`: `cli.main` with `--gaze 15,0` on the coarse fixture writes a result (exit 0) whose sidecar's insertions record a nonzero `passiveMomentNmm`.
  - `export-forces.test.ts`: `buildForceTable({ grid: 5, rangeDeg: 30 })` equals the committed `data/results/forces/default.json` except provenance (1e-12), and `buildForceTable({ gazes: [...] })` equals `data/results/forces/duty-cycle.json` (drift tests, as the oracle has).
- [x] **Step 3:** Run; FAIL. Implement; generate `duty-cycle.json`. Run; PASS. Record in `data/results/README.md` the primary and near-gaze balanced forces, the passive moments, and any unloaded muscle.
- [x] **Step 4:** Full gate. Commit: `feat(fem): static equilibrium with passive orbital torque; gaze-following lids and orbit; eccentric gazes`.

### Task 5.3: Stress-free geometry by inverse solve

Absorbs the M4 follow-up "the document geometry is treated as stress-free ... add an inverse (fixed-point) solve for the unloaded geometry".

**Files:**
- Create: `science/eyebiomech/fem/inverse.py`, `science/tests/test_fem_inverse.py`
- Modify: `science/eyebiomech/fem/mesh.py` (`ShellMesh.with_reference(X)`: the same connectivity and tags at new node positions), `science/eyebiomech/fem/cli.py` (`--reference measured|unloaded`, default `unloaded`), `science/eyebiomech/fem/export.py` (citation text)

**Interfaces:**
- `inverse.py`: `@dataclass InverseResult { shell: ShellMesh /* stress-free */; offset: NDArray /* unloaded − measured nodes */; solution: Solution | None /* IOP state on the unloaded shell */; iterations: int; residual_mm: float; history: list[float] }` (decided in implementation: the offset and IOP solution let the CLI express every state as displacements of the measured mesh, so the exporter is unchanged; `ShellMesh.support_doflocs` keeps the supports at the measured nodes); `unloaded_shell(shell: ShellMesh, materials, iop_mmhg: float, *, optic_nerve_radius_mm, tol_mm: float = 1e-5, max_iter: int = 20, steps: int = 2) -> InverseResult`: the fixed-point iteration `X ← X − (x(X) − X_measured)` (Sellier 2011; the pressurized shape of the returned reference equals the measured geometry within `tol_mm` at every node), with step halving if an iteration increases the residual; raises `NewtonDidNotConverge` (or `ValueError` for non-contraction) with the history.
- The CLI solves the IOP-only reference state on the unloaded shell, so the reference state reproduces the document's geometry; the exported corneal maps remain changes relative to that state.

- [x] **Step 1:** Failing tests: for `make_sphere_shell(10, 11)` under 1 kPa, the unloaded shell's radii are smaller than the measured by the Lamé displacement within 2% and pressurizing it returns the measured radii within `tol_mm`; on the coarse fixture eye (`n_face = 4`, `layers = 1`) the iteration converges in ≤ 8 iterations with the residual history decreasing; with `iop = 0` it returns the input unchanged in zero iterations.
- [x] **Step 2:** Run; FAIL. Implement. Run; PASS.
- [x] **Step 3:** Full gate. Commit: `feat(fem): stress-free reference geometry by fixed-point inverse solve`.

### Task 5.4: Stiffness calibration against in-vivo ocular rigidity

Absorbs the M4 follow-ups "calibrate tissue stiffness" and "reproduce a published corneal inflation curve within 15% with the calibrated stiffness" (Deviation 10).

**Files:**
- Create: `science/eyebiomech/fem/rigidity.py`, `science/tests/test_fem_rigidity.py`
- Modify: `data/materials/cornea-sclera.json` (`calibration: { stiffnessScale, target, method, date, meshNFace, citation }`; `inflationReference` updated if an excerpt gives curve points), `science/eyebiomech/fem/material.py` (`region_materials` applies `stiffnessScale`), `science/tests/test_fem_solve.py` (the rigidity test moves to `test_fem_rigidity.py` and tightens), `data/materials/README.md`

**Interfaces:**
- `rigidity.py`: `ocular_rigidity(params, materials, *, n_face, layers, scale=None, age_years=None, p1_mmhg=None, p2_mmhg=None, reference_iop_mmhg=None, reference="unloaded") -> float` (decided in implementation: the age is the calibration's, 70 years, assumed for Pallikaris's cataract cohort; `reference="measured"` skips the inverse solve for fast tests) (Friedenwald `ln(P2/P1)/ΔV`, ΔV in µL from the inner-surface volume change of the unloaded-geometry model); `calibrate_stiffness(params, materials, target_per_ul, *, n_face, layers, tol=0.02) -> float` (the scale on every μ and k₁ that matches the target, by secant iteration on `ln K` against `ln scale`).
- With an inflation curve available: `apex_rise_curve(params, materials, iop_mmhg: list[float], ...) -> list[float]` and a slow test against the stored points within 15%; otherwise the item is re-filed (Deviation 10).

- [x] **Step 1:** Search excerpts for published human corneal or whole-globe inflation curves with numbers (Elsheikh et al. 2007 and 2010; Bryant & McDonnell 1996; Woo et al. 1972). Record what is found in `inflationReference`.
- [x] **Step 2:** Failing tests: `ocular_rigidity` scales as expected with stiffness (doubling the scale lowers ΔV, raising K, monotone); `calibrate_stiffness` on the coarse mesh reaches the target within 2%; slow: at the production mesh with the committed `stiffnessScale`, the coefficient is within 5% of 0.0126 /µL; the inflation-curve test if data were found.
- [x] **Step 3:** Run; FAIL. Implement; run the calibration at the production mesh (`n_face = 16`, `layers = 1`) and store the scale with the date and mesh. Run; PASS (including `-m slow`).
- [x] **Step 4:** Full gate. Commit: `feat(fem): calibrate tissue stiffness to in-vivo ocular rigidity`.

### Task 5.5: Exports and the regenerated committed result

Absorbs the M4 follow-ups on the retina shift measured at the clamp, the heat map's raw displacement, the scleral Zernike fit (spec §7, M4 Deviation 17), the committed result built from a fixture without a lens accommodation model, and the mesh refinement check at 20 and two layers.

**Files:**
- Create: `science/eyebiomech/fem/scleral.py`, `science/tests/test_fem_scleral.py`
- Modify: `science/eyebiomech/fem/export.py` (retina shift; sidecar displacement relative to the spur ring with the raw field kept as `rawDisplacementMm`; `scleralMaps`), `schemas/deformation.schema.json` and its package copy (optional `rawDisplacementMm`, `scleralMaps`; still 1.0.0, additive), `web/packages/eye-model/src/schema/deformation.ts`, `web/apps/viewer/src/results/load.ts` (accept the new optional fields), `web/apps/viewer/src/ui/tooltips.ts` (heat-map tooltip: relative to the lens), `data/results/fem/*` (regenerated), `data/results/README.md`

**Interfaces:**
- Retina: `axial_shifts` measures the retina at the inner-surface ring at the edge of the optic-nerve support (the nearest free nodes, mean axial displacement) and reports both it and the clamp node; the README states the choice ("relative to the optic-nerve support, which the orbit holds").
- `scleral.py`: `scleral_maps(shell, U_ref, U_load, rings_deg=(…)) -> dict` fits the outer scleral surface's radial height change relative to the spur ring, in Zernike polynomials on a stereographic projection about the posterior pole out to the equator (order 6), written to the sidecar as `scleralMaps: { projection, normRadiusMm, coeffsMicrons, rmsResidualUm }`.
- Committed result: the input becomes the preset document with a lens accommodation model (`navarro-1985` preset exported through the TS preset loader, or the fixture plus the preset's `lensAccommodationModel`; decided in implementation by which one validates and traces in the viewer), solved with the unloaded reference (Task 5.3), the calibrated stiffness (Task 5.4), and the equilibrium forces (Task 5.2); the old file is replaced (same names, so the viewer's catalog and e2e test keep working).

- [x] **Step 1:** Failing tests: `scleral_maps` of a synthetic radial bulge `δr = a·Z(2,2)` on a sphere shell recovers `a` within 2%; `build_deformation` writes `displacementMm` relative to the spur ring (its rigid fit on the ring is zero) and `rawDisplacementMm` equal to the old field; `axial_shifts` reports a retina shift that is not the clamp node's (non-zero for a pure axial squeeze of a coarse shell); the viewer's `results.test.ts` loads the regenerated sidecar.
- [x] **Step 2:** Run; FAIL. Implement. Run; PASS.
- [x] **Step 3:** Mesh study: run the CLI at `n_face` 12, 16, 20 with one layer and 16 with two layers; record ΔM, ΔJ0, ΔJ45, c(2,2), and the run times in `data/results/README.md`, and choose the library's mesh (Task 5.8) as the coarsest whose ΔJ0 is within 5% of `n_face 20`.
- [x] **Step 4:** Regenerate the committed result; record its induced refraction (the e2e test reads a nonzero cylinder).
- [x] **Step 5:** Full gate including e2e. Commit: `feat(fem): retina at the support edge, lens-relative heat map, scleral maps; regenerated result`.

### Task 5.6: Load history from a daily duty cycle

Master plan Task 5.1.

**Files:**
- Create: `science/eyebiomech/remodel/__init__.py`, `science/eyebiomech/remodel/history.py`, `science/eyebiomech/accommodation.py` (Anderson 2008 amplitude and the lag model, read from `data/accommodation/*.json`, mirroring `web/packages/eye-model/src/accommodation/{amplitude,controller}.ts`), `science/tests/test_history.py`, `science/tests/test_accommodation.py`
- Modify: `data/calibration/duty-cycle.json` (from Task 5.2), `docs/literature/README.md`

**Interfaces:**
- `accommodation.py`: `amplitude_for_age(age) -> float`; `demand_from_distance(m, far_point_d=0) -> float`; `response(demand_d, amplitude_d) -> float` (same equations and clamps as the TS controller; a test compares 20 ages and demands with values the TS test suite writes to `data/oracle/accommodation-values.json`).
- `history.py`: `@dataclass(frozen=True) SubjectProfile { age_years: float; near_hours: float; sphere_d: float = 0; cylinder_d: float = 0; axis_deg: float = 180 }`; `@dataclass(frozen=True) LoadIntensities { distance_fraction; near_fraction; muscles_distance; muscles_near; lids_distance; lids_near; ciliary_d }` (dimensionless multipliers on the library's load groups, and the time-averaged ciliary diopters); `history_loads(profile, age_years, duty: dict | None = None, eom_tone_scale=1.0, lid_pressure_scale=1.0) -> LoadIntensities`: near fraction `nearHours / wakingHours` (clamped to [0, 1]), distance the rest; ciliary diopters `near_fraction × response(demand(nearDistance), amplitude(age))`; muscles and lids scaled by the calibration scales. `time_averaged_force_sets(profile, age, force_table) -> list[(weight, gaze_index)]` for direct FEM use.

- [x] **Step 1:** Failing tests: 0 near hours equals the distance-only intensities; `nearHours = wakingHours` equals near-only; intensities are linear in near hours between; the ciliary load at age 60 is below that at age 20 (presbyopia) and never exceeds `near_fraction × demand`; the Python accommodation functions match the TS values (1e-12).
- [x] **Step 2:** Run; FAIL. Implement; PASS.
- [x] **Step 3:** Full gate. Commit: `feat(remodel): load history from a near-work duty cycle`.

### Task 5.7: Stress-driven growth law

Master plan Task 5.2 (Deviation 3).

**Files:**
- Create: `data/remodeling/growth.json`, `data/remodeling/README.md`, `science/eyebiomech/remodel/growth.py`, `science/tests/test_growth.py`
- Modify: `science/eyebiomech/fem/solve.py` (`internal` and `solve` accept an optional growth field), `docs/literature/README.md`

**Data:** `growth.json`: `{ form: "rodriguez1994-inplane", equation, ratePerYear: { default, bounds, citation }, homeostaticRatio: { default, bounds, citation }, maxStepFraction: 0.5 (numerical), citation, verified: false }` (rates from excerpts of Grytz & Siegwart 2015 or the scleral growth literature, else assumption with the reasoning).

**Interfaces:**
- `growth.py`: `@dataclass GrowthState { eps: NDArray (3, 3, nel, nq) /* εg */; age_years: float }` with `zero(ctx)`, `fg()` (`I + εg`); `GrownMaterial(base, fg)` with `first_pk(F, x)` = `Jg · P_base(F Fg⁻¹) Fg⁻ᵀ` and `tangent_tensor` (chain rule), selectable per element chunk; `homeostatic_stress(solution, materials) -> NDArray` (Cauchy stress at the quadrature points); `growth_rate(sigma, sigma_iop, normals, rate_per_year, ratio) -> NDArray` (Deviation 3's law); `grow(shell, materials, loads, state, sigma_iop, *, rate_per_year, ratio, dt_years, context, optic_nerve_radius_mm) -> tuple[GrowthState, Solution]` (solve at the current growth under the loads, explicit Euler update; refuses a step with `r·dt·λ > maxStepFraction`, λ the local feedback estimate).
- `solve(..., growth: GrowthState | None = None)`; with `None` the results are bit-identical to M4's.

- [x] **Step 1:** Failing tests:
  - stress equal to homeostatic (`h = 1`, IOP-only loads) gives zero growth rate everywhere (1e-12 relative);
  - uniform over-stress on `make_sphere_shell(10, 11)` (`h = 0.8`, IOP only) grows it isotropically: the outer radius after one step changes uniformly (spread < 1% of the mean change) and outward;
  - a non-axisymmetric over-stress (IOP plus an upper and lower lid band, `h = 1`) on the coarse fixture produces a c(2,2) change of the anterior corneal fit after one growth step whose sign matches the elastic c(2,2) change under the same loads (growth continues the elastic deformation; stated as the predicted sign);
  - `GrownMaterial` with `Fg = I` equals the base material (1e-14); its `first_pk` equals the numerical derivative of `Jg·W(F Fg⁻¹)` and its tangent the derivative of `first_pk` (1e-6 relative) for a random small `εg`;
  - a step too large raises `ValueError` naming the limit.
- [x] **Step 2:** Run; FAIL. Implement; PASS.
- [x] **Step 3:** Full gate. Commit: `feat(remodel): stress-driven growth toward a homeostatic target`.

### Task 5.8: Response library (reduced-order model)

Deviation 2. Also writes the paraxial refraction used by the forward model and its cross-language check.

**Files:**
- Create: `science/eyebiomech/optics/__init__.py`, `science/eyebiomech/optics/paraxial.py`, `science/eyebiomech/remodel/library.py`, `science/tests/test_paraxial.py`, `science/tests/test_library.py`, `data/oracle/induced-refraction.json` (written and checked by `web/apps/viewer/test/induced-refraction.test.ts`), `data/results/response/library-v1.json`
- Modify: `science/eyebiomech/cli.py` (`library` subcommand), `data/results/README.md`

**Interfaces:**
- `paraxial.py`: `induced_refraction(reference_doc: dict, loaded_doc: dict, pupil_radius_mm: float) -> dict` (`{ M, J0, J45 }` change, D) from the second-order Zernike content of each corneal surface's height change within the pupil (least-squares quadratic fit of the map over the pupil disk), the surface index steps, and the axial shifts through the reduced eye's paraxial ABCD chain (vertex distances honored); `refraction_from_vector(M, J0, J45) -> (sphere, cylinder, axis)` (minus cylinder, TABO).
- `library.py`: `build_library(doc, *, n_face, layers, stiffness_scales, gazes, materials, eom, duty, passive, growth) -> dict` and `@dataclass Library` with `elastic(s) -> NDArray (groups, 3)`, `growth_refraction(s) -> NDArray (groups, 3)`, `feedback(s) -> NDArray (groups, groups)` interpolated in `ln s`, and `simulate(intensities: Callable[[age], NDArray (groups,)], ages, *, rate_per_year, ratio, stiffness: Callable[[age], float]) -> NDArray (ages, 2, 3)` returning the elastic and remodeled (M, J0, J45) changes (remodeled = elastic + growth), integrated with sub-stepping (Review Focus 3). Groups: `muscles@distance`, `muscles@near`, `lids@distance`, `lids@near`, `ciliary per D`, `homeostatic offset`. JSON layout: `{ schema: "eye-response/1", elastic: true, remodeled: true, provenance, mesh, stiffnessScales, groups, elasticMJ0J45, growthMJ0J45, feedback, pupilRadiusMm, citation }`.
- `eyebiomech library --eye PATH --out PATH [--n-face N] [--layers N] [--scales a,b,...]`.

**As implemented:** `induced_refraction(reference, loaded)` takes no pupil: it refracts each document paraxially from the vertex curvature of every surface (Zernike second-order terms included) through an ABCD chain with the retina at `axialLengthMm`, as the viewer does, and agrees with the worker's 4 mm pupil method within 0.01 D. `simulate` integrates the linear growth dynamics exactly over each step by an eigendecomposition of the feedback matrix (all eigenvalues negative), so no sub-stepping is needed. Refractions are evaluated on displacements scaled to 1 µm at their largest (`REFRACTION_PROBE_MM`) because the exporter's surface fits need small motion. The coarse-mesh tests use `n_face = 6` (4 cannot sample the inner cap). The superposition and growth checks run at half the near-gaze load: there the direct nonlinear solve agrees with the summed library within about 1% (M and J0), while at the full load it has left the linear regime (J0 falls to about a third of the linear value on this mesh), the support artifact of Deviation 11. The production library is committed separately from the code (its build at `n_face 20` takes hours; Task 5.5 mesh study).

- [x] **Step 1:** Failing tests:
  - `test_paraxial.py`: the committed FEM result's induced refraction from `induced_refraction` agrees with `data/oracle/induced-refraction.json` (the TS worker's value) within 0.01 D in M, J0, J45; a pure c(2,0) height change gives the analytic power change `Δn · 4√3 c / r²`; zero change gives zero.
  - `test_library.py` (coarse mesh, `n_face = 4`, `layers = 1`, two stiffness scales): the sum of the elastic group responses at unit intensities agrees with a direct nonlinear solve of the combined loads within 10% in J0 and M (Review Focus 2); three reduced growth steps agree with three `grow` steps of the FEM within 20% in J0; doubling the stiffness scale reduces the elastic response (monotone) and the interpolation at a tabled scale returns the tabled value; `simulate` with zero intensities and `ratio = 1` returns zeros; the JSON round-trips and says `elastic` and `remodeled`.
- [x] **Step 2:** Run; FAIL. Implement. Run; PASS.
- [x] **Step 3:** Build the committed library at the mesh chosen in Task 5.5 with scales {0.5, 1, 2, 4} × the calibrated scale; record time and responses in `data/results/README.md`.
- [x] **Step 4:** Full gate. Commit: `feat(remodel): response library from the FEM with a reduced growth model`.

### Task 5.9: Population data and SyntEyes sampler

Master plan Task 5.3 (Deviation 1).

**Files:**
- Create: `data/population/README.md`, `data/population/axis-shift-by-age.json`, `data/population/refraction-by-age.json`, `data/synteyes/rozema-2016-params.json`, `data/synteyes/README.md`, `science/eyebiomech/calib/__init__.py`, `science/eyebiomech/calib/data.py`, `science/eyebiomech/calib/download_nhanes.py`, `science/eyebiomech/synth/__init__.py`, `science/eyebiomech/synth/synteyes.py`, `science/tests/test_population.py`, `science/tests/test_synteyes.py`
- Modify: `.gitignore` (`data/large/`), `docs/literature/README.md`

**Data:** `axis-shift-by-age.json`: `{ source, citation, license, definition: { cylinderThresholdD, wtrAxes, atrAxes, measure: "refractive"|"corneal" }, decades: [{ ageFrom, ageTo, n, wtr, atr, oblique }], verified: false }` (one or more sources, each its own entry). `refraction-by-age.json`: `{ ..., ages: [{ ageFrom, ageTo, n, meanSphericalEquivalentD, sdD, meanCylinderD? }] }`. `rozema-2016-params.json`: `{ citation, form: "gaussian-mixture", variables: ["M", "J0", "J45", ...], components: [{ weight, mean, cov }], referenceAgeYears, verified: false }`; where an excerpt gives only means and SDs, one component with a diagonal covariance, labeled "assumption: independence".

**Interfaces:**
- `calib/data.py`: `load_axis_shift() -> list[AxisShiftSource]`, `load_refraction_by_age() -> list[RefractionSource]` (validated shapes, proportions sum to 1 within rounding); `download_nhanes.py`: `main(out_dir)` downloads the NHANES 1999–2008 VIX files into `data/large/nhanes/` and `summarize(path) -> dict` (tested on a 20-row synthetic file).
- `synteyes.py`: `sample(n: int, age: float, seed: int) -> list[dict]` (EyeParameters-like dicts with `refraction: {M, J0, J45}` and the biometric variables; the full EyeParameters document only when the table has the surface variables) and `sample_vectors(n, age, seed) -> NDArray (n, 3)` (M, J0, J45) for the forward model.

- [x] **Step 1:** Search excerpts for: WTR/ATR/oblique prevalence by age group (candidates: Hoffmann & Hütz 2010; Attebo, Ivers & Mitchell 1999 Blue Mountains; Hashemi et al. 2014 Tehran; Leung, Lam & Yap 2012), mean spherical equivalent by age (candidates: Vitale et al. 2008 NHANES; Wang, Klein et al. 1994 Beaver Dam; Attebo 1999), and the SyntEyes parameters (Rozema et al. 2016 and its supplement). Transcribe with sources, licenses, and `verified: false`.
- [x] **Step 2:** Failing tests: both population tables load, each decade's proportions sum to 1 within 0.02, ages are increasing and within 6–90 or flagged; `sample_vectors(2000, 30, seed)` means match the tabled means within 2 standard errors and its covariance the tabled covariance within 10%; the sampler is reproducible for a seed; `summarize` on the synthetic NHANES file returns the expected counts.
- [x] **Step 3:** Run; FAIL. Implement; PASS.
- [x] **Step 4:** Full gate. Commit: `feat(calib): population tables and SyntEyes sampler`.

### Task 5.10: Forward model and calibration

Master plan Task 5.4 (Deviations 4, 8, 9).

**Files:**
- Create: `data/calibration/priors.json`, `science/eyebiomech/calib/forward.py`, `science/eyebiomech/calib/fit.py`, `science/eyebiomech/calib/mcmc.py`, `science/tests/test_forward.py`, `science/tests/test_fit.py`, `science/tests/test_mcmc.py`, `data/results/calibration/posterior-v1.json`
- Modify: `science/eyebiomech/cli.py` (`calibrate` subcommand), `data/results/README.md`

**Interfaces:**
- Parameters (`PARAM_NAMES`): `homeostatic_ratio` (h), `rate_per_year` (r), `lid_pressure_scale`, `eom_tone_scale`, `stiffness_age_slope` (per year, replacing the materials table's `ratePerYear` in the forward model). `priors.json`: bounds and a log-normal or uniform prior per parameter with its justification.
- `forward.py`: `@dataclass Cohort { vectors0: NDArray (n, 3) /* baseline M, J0, J45 at the baseline age */; near_hours: NDArray (n,) }` from `make_cohort(n, seed, near_hours_distribution)`; `trajectories(params: dict, library, cohort, ages) -> NDArray (n, ages, 3)`; `axis_classes(vectors, threshold_d, definition) -> NDArray (…, 3)` (soft class membership with a numerical smoothing width so the fit is differentiable; hard counts for reporting); `predict_targets(params, library, cohort, data) -> dict` (per data entry: modeled proportions by decade, mean SE by age band).
- `fit.py`: `residuals(theta, ...) -> NDArray` (proportions weighted by binomial standard errors; mean SE by its SE; prior penalty); `fit(params0, data, method="lsq"|"mcmc", *, library, cohort, seed, n_walkers, n_steps) -> Posterior { names, best, samples: NDArray (draws, p) | None, cov, corr, cost, dof, method, converged }`.
- `mcmc.py`: `ensemble_sample(log_prob, p0: NDArray (walkers, p), n_steps, *, a=2.0, seed) -> NDArray (steps, walkers, p)` (Goodman & Weare stretch move, red/black halves).
- `eyebiomech calibrate --out PATH [--method lsq|mcmc] [--walkers N] [--steps N] [--seed N]` writes `{ schema: "eye-posterior/1", remodeled: true, names, best, samples, corr, fit: { cost, dof, perTarget }, data: [sources], library: path, provenance }`.

**As implemented:** the homeostatic ratio is fixed at `h = 1` (the pressurized eye of the reference age is homeostatic by construction; the homeostatic offset drives axisymmetric growth, which changes only the spherical equivalent, so the astigmatism targets cannot identify it; `priors.json` records this), and two nuisance parameters of the baseline cohort are fitted with the four mechanical ones: `baseline_j0_mean` and `baseline_j_sd` (the SyntEyes table is a stand-in; Task 5.9), so `PARAM_NAMES` has six entries and `priors.json` six priors. The cohort is `Cohort { m, z, near_fraction, baseline_age }` with common random numbers, and a subject's change is Δ_distance + f·(Δ_near − Δ_distance), two library simulations per parameter set (`state_trajectories`). The targets are the axis-class proportions by age band and the mean J0 slope; mean spherical equivalent is not fitted (adult changes are lenticular, which the model lacks). The stretch move accepts about 0.7 of proposals on the 2-D test target, so `test_mcmc` bounds the acceptance by [0.2, 0.8]. The calibration fixture is `science/tests/fixtures/library-coarse.json` (a coarse library, document geometry as stress-free; not a result). The posterior is committed separately, after the production library.

- [x] **Step 1:** Failing tests:
  - `test_forward.py`: zero loads and `h = 1` leave every trajectory at its baseline; raising `lid_pressure_scale` raises J0 (lids give with-the-rule astigmatism in M4; if the regenerated library says otherwise the test follows the library's sign and the README says so); `axis_classes` of a pure J0 = +0.5 D vector is WTR and −0.5 D is ATR; soft and hard classes agree within 0.01 for a smoothing width of 0.
  - `test_mcmc.py`: on a correlated 2-D Gaussian the sampler's mean and covariance after burn-in match within 10% and the acceptance fraction lies in [0.2, 0.6].
  - `test_fit.py`: on synthetic data generated by the forward model with known parameters (near-work strata, Deviation 8; a committed small library fixture so the test needs no FEM), `lsq` recovers each parameter within 10%; slow: `mcmc` contains the truth in the 90% interval for every parameter.
- [x] **Step 2:** Run; FAIL. Implement; PASS (including `-m slow`).
- [x] **Step 3:** Calibrate against the transcribed data (`lsq`, then `mcmc` with the walkers and steps recorded); commit `posterior-v1.json`; record in `data/results/README.md` the best fit, the posterior widths, the correlations, the per-target fit, and a plain statement of whether the mechanism reproduces the WTR → ATR shift and by how much.
- [x] **Step 4:** Open the `needs-local: nightly slow-test workflow` issue (#17) (Deviation 9) with the exact YAML (a `schedule` job running `uv run pytest -m slow` in `science/`).
- [x] **Step 5:** Full gate. Commit: `feat(calib): forward model, least-squares and ensemble calibration`.

### Task 5.11: Acuity metric, onset, prediction grid, `eyebiomech predict`

Master plan Task 5.5 and the milestone deliverable.

**Files:**
- Create: `data/acuity/watson-ahumada-2008.json`, `science/eyebiomech/predict/__init__.py`, `science/eyebiomech/predict/acuity.py`, `science/eyebiomech/predict/onset.py`, `science/eyebiomech/predict/grid.py`, `schemas/predictions.schema.json`, `science/eyebiomech/schemas/predictions.schema.json`, `science/tests/test_acuity.py`, `science/tests/test_onset.py`, `science/tests/test_grid.py`, `web/packages/eye-model/test/predictions-schema.test.ts`, `data/results/predictions/v1.json`
- Modify: `science/eyebiomech/cli.py` (`predict`, `grid`), `science/eyebiomech/schema.py` (`validate_predictions`), `data/results/README.md`

**Interfaces:**
- `acuity.py`: `logmar_from_refraction(sphere_d, cylinder_d, pupil_mm, *, wavelength_nm=555) -> float` (a sphero-cylindrical pupil function on an N × N grid, PSF and MTF by NumPy FFT, then the Watson & Ahumada 2008 metric with constants from the data file; if the paper's model cannot be transcribed, the data file names the stand-in and the code labels it "approximation"); the pupil diameter from the Watson & Yellott formula at the scene's default luminance and the subject's age (Python port of `pupil/watsonYellott.ts`, checked against values the TS tests write).
- `onset.py`: `onset_ages(ages, sphere, cylinder, logmar, *, cyl_threshold=0.75, sphere_threshold=0.5, logmar_threshold=0.3) -> { refraction: float | None, acuity: float | None }` (first age at which the threshold is crossed, linear interpolation between grid ages; the first age when already crossed; thresholds from `data/acuity/watson-ahumada-2008.json` or a thresholds block in `data/calibration/priors.json` with citations).
- `grid.py`: `predict_profile(profile, posterior, library, *, ages, draws) -> dict` (median and 5/95% of sphere, cylinder, axis by age; onset ages from the median trajectory and their 5–95% range across draws); `predict_grid(posterior, library, *, ages=range(6, 91), near_hours=(0, 2, 4, 6, 8), baseline_sph=(-3, -2, -1, 0, 1, 2), baseline_cyl=(0, 0.5, 1.0)) -> dict` (Deviation 7).
- `predictions.schema.json` (`schemaVersion: "1.0.0"`): `{ schemaVersion, id, provenance, remodeled: true, baselineAgeYears, baselineAxisDeg, axes: { ages, nearHours, baselineSphereD, baselineCylinderD }, thresholds, sphere: { p05, p50, p95 }, cylinder: {...}, axisDeg: { p50 }, onset: { refraction: { p50, p05, p95 }, acuity: {...} } }` with arrays in C order over (nearHours, baselineSphere, baselineCylinder, ages) and onset arrays over the first three.
- `eyebiomech predict --profile age=12,nearHours=4,sphere=0,cyl=0 [--axis 180] [--posterior PATH] [--library PATH] --out PATH` and `eyebiomech grid --out PATH`.

**As implemented:** the acuity metric is the stand-in named in `data/acuity/watson-ahumada-2008.json` (Watson & Ahumada 2008 could not be transcribed): the letter whose critical frequency is where the radially averaged MTF of the sphero-cylindrical pupil first falls below a contrast of 0.1, floored at logMAR −0.1. The prediction grid evaluates it through a lookup table (`data/acuity/standin-table.json`, residual spherical blur × astigmatic blur × pupil, interpolated trilinearly within 0.02 logMAR near the 0.3 threshold), at the Watson & Yellott pupil for the age (`acuity_pupil_mm`; Python port checked against `data/oracle/pupil-values.json`), with myopic blur counted fully and hyperopic blur only beyond the accommodative amplitude for the age. Uncertainty bands are over posterior draws only. The TypeScript schema check of the committed grid (`predictions-schema.test.ts`) landed with the grid. `eyebiomech predict` searches onsets from the profile's age on (the grid from its baseline age).

- [x] **Step 1:** Search excerpts for the Watson & Ahumada 2008 acuity model and its constants; write the data file.
- [x] **Step 2:** Failing tests: `onset_ages` returns 40 for a cylinder trajectory crossing 0.75 D at 40 and `None` for a flat zero trajectory, the first age for one already above, and interpolates between grid ages; `logmar_from_refraction(0, 0, 3)` is below 0 (better than 20/20 with no blur) and logMAR rises monotonically with defocus at 3 mm, passing 0.3 between the values the data file's source states (or the stand-in's documented calibration point); the grid JSON validates against the schema in Python and in TypeScript (`predictions-schema.test.ts` with Ajv2020 on the committed file); the CLI writes a profile file whose median at the profile age equals the profile's refraction (1e-9).
- [x] **Step 3:** Run; FAIL. Implement; PASS. Generate and commit `data/results/predictions/v1.json` (size recorded; values rounded to 0.001 D).
- [x] **Step 4:** Full gate. Commit: `feat(predict): acuity metric, onset estimation, prediction grid and CLI`.

### Task 5.12: Timeline in the viewer

Master plan Task 5.6.

**Files:**
- Create: `web/apps/viewer/src/data/predictions.ts`, `web/apps/viewer/src/ui/Timeline.tsx`, `web/apps/viewer/test/predictions.test.ts`, `web/apps/viewer/e2e/timeline.spec.ts`
- Modify: `web/apps/viewer/src/store/scene.ts` (prediction profile, applied-prediction toggle), `src/ui/Inspector.tsx`, `src/ui/tooltips.ts`, `src/App.tsx` or the optics strip layout (the timeline docks under the inspector or as a strip; decided in implementation), `web/apps/viewer/test/store.test.ts`, `web/apps/viewer/test/tooltips.test.ts`

**Interfaces:**
- `predictions.ts`: `interface PredictionGrid` (parsed and validated against `schemas/predictions.schema.json`); `loadPredictionGrid(): Promise<PredictionGrid>` (lazy `import.meta.glob` so the main bundle does not carry it); `interpolate(grid, { nearHours, baselineSphereD, baselineCylinderD }) -> Trajectory { ages; sphere: {p05,p50,p95}; cylinder: {...}; axisDeg; onset; clamped: string[] }` (trilinear over the three subject axes at every age, inputs clamped to the grid with the clamped axis names returned); `reanchor(traj, ageYears, baseline)` (Deviation 7); `at(traj, ageYears) -> { sphereD; cylinderD; axisDeg }` (linear in age, clamped to 6–90).
- Store: `prediction: { profile: { nearHours; baselineSphereD; baselineCylinderD }; trajectory: Trajectory | null; applied: boolean; error: string | null }`; actions `setPredictionProfile(p)`, `setPredictionApplied(on)`; when applied, the right eye's document becomes the schematic eye with the predicted sphere and cylinder at the current age applied as a corneal refraction change (`applyRefraction`, mechanism `corneal`; approximation, tooltip), the left its mirror; the age slider is the timeline's cursor.
- `Timeline.tsx`: an SVG chart (the theme's tokens; muscles keep the only hot hue): sphere and cylinder medians with 5–95% bands against age 6–90, the two onset markers (labeled "refraction" and "acuity 20/40"), the age cursor (drag or click to set the subject age; keyboard arrows), near-hours and baseline inputs, the "apply to eye" toggle, the current S/C × axis readout, and the stance line ("remodeled model, calibrated to population data: a hypothesis test, not a clinical prediction").
- Tooltips: timeline ("Approximation: model responses of the reference eye for every subject; linear superposition about the pressurized eye; bands are parameter uncertainty only; remodeled"), applied prediction ("Approximation: the predicted change is applied to the eye as a corneal change").

**As implemented:** the timeline is a panel of the inspector, after Biomechanics. The store's `prediction` also holds the loaded `grid`, with `loadPredictions()` (lazy, once) and `setPredictionGrid(grid)` beside the two planned actions; applying the prediction remembers the eyes shown before and restores them when cleared, and choosing a schematic or refractive preset or loading a result clears it. The profile's baseline is the refraction at the grid's baseline age (6), so the viewer interpolates without re-anchoring (`reanchor` and `trajectoryFor` support a later anchor age). Every subject of the committed grid crosses a threshold (the calibration's spherical drift), so the e2e test of the "no onset by 90" path serves a copy of the committed grid with one node's onsets removed, in place of the grid's chunk.

- [x] **Step 1:** Failing tests:
  - `predictions.test.ts`: the committed grid validates; `interpolate` at a grid node returns the node's values exactly and between nodes the linear blend; inputs outside the grid clamp and report the axis; `at` clamps ages; `reanchor` at the baseline age is the identity.
  - `store.test.ts`: setting the profile computes a trajectory; applying the prediction changes the right eye's corneal surface and clearing it restores the preset; changing age while applied updates the eye.
  - `tooltips.test.ts`: the timeline tooltip starts with "Approximation:" and says "remodeled".
- [x] **Step 2:** Run `cd web && pnpm --filter @eye/viewer test`; FAIL. Implement.
- [x] **Step 3:** Playwright `timeline.spec.ts`: open the timeline, set near hours to the grid's largest value; moving the age cursor from 10 to 60 changes the displayed cylinder; an onset marker is visible for a profile whose trajectory crosses a threshold (chosen from the committed grid in the test setup) and absent (with "no onset by 90" text) for one that does not.
- [x] **Step 4:** Run; PASS. Full gate including e2e (worker benchmark under budget). Commit: `feat(viewer): prediction timeline with bands and onset markers`.

### Task 5.13: Finish

- [ ] Update this plan's status and add Outcome notes (the calibrated stiffness, the equilibrium forces, the library's validation numbers, the posterior and its fit, what stays unverified, and the answer the calibration gives to the hypothesis so far); write the remaining deferred items to `2026-10-29-m5-followups.md`.
- [ ] Update `data/results/README.md`, `docs/literature/README.md`, and the root `README.md` (the `predict` command).
- [ ] Full gate including `-m slow` and e2e. Commit: `docs: M5 outcome notes and follow-ups`.
- [ ] Update the PR body with a summary and the verification run, then mark the PR ready.

## Follow-ups absorbed from earlier milestones

All items of `2026-10-28-m4-followups.md` that name M5 are absorbed here and removed from that file in the plan's commit.

| Source | Item | Owner |
|---|---|---|
| M4 data | Zapata-Díaz 2019 Table 1 (default preset; release gate) | Task 5.0 (search; re-file if unreachable) |
| M4 data | Navarro 1985 Table 4 conic coefficients | Task 5.0 |
| M4 data | Volkmann 1869 origins | Task 5.0 |
| M4 data | Clark, Miller & Demer 2000 pulleys, then tighten `path.test.ts` | Task 5.0 |
| M4 data | SR/IR widths and tendon lengths, IO width (BCSC) | Task 5.0 |
| M4 data | Polans 2015 angle alpha, lens tilt, decentration | Task 5.0 |
| M4 modeling | Calibrate tissue stiffness | Task 5.4 |
| M4 modeling | Torque balance: passive orbital torques / static equilibrium; re-enable eccentric gazes (blocking for the duty cycle) | Task 5.2 |
| M4 modeling | Inverse solve for the unloaded geometry | Task 5.3 |
| M4 modeling | Lower-lid pressure and lid margin positions | Task 5.0 |
| M4 modeling | Vertical rectus and oblique capacities; tendon stiffness lower bound | Task 5.0 |
| M4 modeling | Committed result has no lens accommodation model | Task 5.5 |
| M4 modeling | Mesh refinement 20 and two layers for the grid's tolerance | Task 5.5 |
| M4 review edd021b | Retina shift at the clamp | Task 5.5 |
| M4 review edd021b | Heat map shows the raw displacement | Task 5.5 |
| M4 review edd021b | CLI ignores the document's `extraocularMuscles` | Task 5.1 |
| M4 review edd021b | Lid bands and orbital support not counter-rotated (blocking for the duty cycle) | Task 5.2 |
| M4 review edd021b | Non-converged solve exits 2 (test) | Task 5.1 |
| M4 review edd021b | Missing file or malformed table ends in a traceback | Task 5.1 |
| M4 review edd021b | `DATA_DIR` in the wheel | Task 5.1 |
| M4 review edd021b | Drift test for the committed force table | Task 5.2 |
| M4 review edd021b | Inflation curve within 15% with calibrated stiffness (owner deferral, #14) | Task 5.4 (Deviation 10) |
| M4 review 8ac4f73 | `tangent_tensor` finite-difference test | Task 5.1 |
| M4 review 8ac4f73 | `--iop` default is a physiological value in code | Task 5.1 |
| M4 review 8ac4f73 | `gitHash: ""` for a dirty tree | Task 5.1 |
| M4 review 8ac4f73 | `validate_deformation` length and index checks | Task 5.1 |
| M4 review 8ac4f73 | `check_physical` counts tilt terms | Task 5.1 |
| M4 review 8ac4f73 | Spec §7 "start axisymmetric" deviation line (owner) | Task 5.1 |
| M4 review b6f5a0d | `referencing` imported but undeclared | Task 5.1 |
| M4 review b6f5a0d | Posterior map normalized to 3.5 mm, aperture 6 mm | Task 5.1 |
| M4 review b6f5a0d | Dead-load cache keyed by `id(ctx)` | Task 5.1 |
| M4 review 34e8f59 | `relative_to_lens` non-rigid and torsion tests | Task 5.1 |
| M4 review 34e8f59 | Scleral Zernike height maps (spec §7, M4 Deviation 17) | Task 5.5 |
| M0 | DOIs "to be added" for Rozema 2016 and the remodeling sources | Task 5.0 |
