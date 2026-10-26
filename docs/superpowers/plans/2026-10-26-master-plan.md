# Eye Biomechanics Simulation: Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `hvresearch/eye-biomechanics`: a browser research tool that visualizes both eyes with their extraocular and intraocular muscles, simulates accommodation and spectacle correction with full wave optics, and hosts a Python biomechanics-plus-calibration pipeline that predicts astigmatism onset from muscle, tendon, and eyelid loading of the globe.

**Architecture:** A pnpm monorepo of three TypeScript units (`eye-model`, `optics`, `viewer`) that run entirely in the browser, and a Python package `eyebiomech` that runs offline. The only thing crossing the boundary is a versioned JSON document, `EyeParameters`, validated by one JSON Schema on both sides. Milestone 1 is a vertical slice through every layer; later milestones deepen each layer in place.

**Tech Stack:** pnpm (via corepack), Vite, React 19, TypeScript strict, Zustand, react-three-fiber + drei, custom SVG charts, Vitest, Playwright, ajv. Python 3.12 via uv, NumPy, SciPy, scikit-fem, jsonschema, ruff, pytest, Optiland (test oracle only). GitHub Actions for CI and GitHub Pages deploy.

**Spec:** `docs/superpowers/specs/2026-10-26-eye-simulation-design.md` (amended in Task 0.1 with the decisions from the grilling session and the updated literature below).

## Context

The project directory is empty except for the committed spec. The author (a Vanderbilt researcher) wants a tool for their own research, with fidelity and visual polish both non-negotiable. The scientific question is whether age-related changes in extraocular muscle, tendon, and eyelid loading deform the corneoscleral envelope enough to cause astigmatism and the need for glasses. The tool must let that hypothesis be tested against population data rather than assumed. Development will happen in Claude Code cloud sessions against the GitHub repo, so every milestone must leave CI green and the Pages deploy working.

### Decisions settled in brainstorming and grilling (not in the committed spec yet; Task 0.1 writes them in)

- Repo name `hvresearch/eye-biomechanics`, public, MIT. Main protected by required CI, no required reviewers.
- First milestone is a vertical slice (one eye cutaway, target slider, accommodation, traced rays, defocus readout), then muscles, then wavefront optics and spectacles, then biomechanics, then remodeling and calibration, then polish.
- Visual axis offset (angle alpha) and pupil decentration are modeled. Left and right eyes have independent parameters with a mirror shortcut.
- Refractive-error presets expose axial, corneal, and lenticular mechanisms with a decomposition readout.
- Age range 6 to 90 with tabled growth curves; no emmetropization feedback.
- Dynamics: saccade main sequence, slower vergence, accommodation latency and time constant. Age slider sets the subject; a transport animates seconds.
- Muscle activation by length proxy in v1; static equilibrium in v2.
- Tendons: series-elastic stiffness and slack length, plus insertion position and width.
- Biomechanics: 3D solid hyperelastic elements in scikit-fem (no shell elements exist there). Elastic solver first; remodeling as stress-driven growth toward a homeostatic target, a separate labeled layer. Eyelid pressure is a third load.
- Load history from a daily near-work duty cycle converted to forces by the eye model.
- Calibration target: with-the-rule to against-the-rule axis shift with age; prevalence and mean refraction trajectories secondary.
- Subject inputs: age, baseline refraction, near-work hours, optional topography. Onset reported by both a refraction threshold and an MTF-based acuity threshold (default 20/40).
- Predictions precomputed over a subject grid as JSON; viewer interpolates. No server.
- Deformation shown as a displacement heat map plus an exaggeration slider. Small results committed under `data/results/` with provenance.
- Optics oracle: Optiland for rotationally symmetric cases; a small Python reference tracer for toric and Zernike cases (Optiland lacks those surface types).

### Updated literature (replaces 1985-era choices; the user asked for current research)

| Quantity | Source to transcribe | Role |
|---|---|---|
| Default eye model (age + accommodation) | Zapata-Díaz, Radhakrishnan, Charman, López-Gil, *J Optom* 12(1):3-13, 2019, doi 10.1016/j.optom.2018.01.003 (open access) | default preset |
| Aging eye with GRIN lens | Navarro, *J Vis* 14(13):21, 2014 "Adaptive model of the aging emmetropic eye and its changes with accommodation" | alternative preset (homogeneous-equivalent index) |
| Wide-field, tilted/decentered lens | Polans, Jaeken, McNabb, Artal, Izatt, *Optica* 2(2):124-134, 2015 | angle alpha and lens tilt defaults |
| Population biometry variability | Rozema, Rodriguez, Navarro, Tassignon, *IOVS* 57:683-691, 2016 (SyntEyes) | synthetic subjects for the prediction grid |
| Accommodative amplitude vs age | Anderson, Hentz, Glasser, Stuebing, Manny, *IOVS* 49:2919, 2008 (sigmoid fit) | replaces Hofstetter |
| Pupil diameter | Watson & Yellott, *J Vis* 12(10):12, 2012 | unchanged |
| Near pupil response | Feil, Moser, Abegg, *Graefe's Arch* 2017: convergence is the main trigger | miosis coupled to vergence, not accommodation |
| Acuity from wavefront | Watson & Ahumada, *J Vis* 8(4):17, 2008 | onset acuity threshold |
| Review of eye models | Atchison & Thibos, *Clin Exp Optom* 99(2):99-106, 2016 | literature notes |
| Rectus insertions | BCSC spiral of Tillaux (5.5, 6.5, 6.9, 7.7 mm); cadaveric means are ~0.5 mm smaller | tabled with both values |
| Regression fixture only | Navarro, Santamaría, Bescós, *JOSA A* 2:1273, 1985 | paraxial-power test fixture |
| Corneal/scleral material | Elsheikh et al. 2007 (age stiffness); Pandolfi & Holzapfel 2008; Whitford et al. 2015 | FEM constitutive defaults |
| Remodeling framework | Rodriguez, Hoger, McCulloch 1994; Grytz & Meschke 2010; Grytz & Siegwart 2015 | growth law |
| Eyelid pressure on cornea | Shaw, Collins, Davis, Carney 2008-2010 | lid load defaults |
| Oculomotor dynamics | Bahill, Clark, Stark 1975 (main sequence); Rashbass & Westheimer 1961 (vergence); Kasthurirangan & Glasser 2005 (accommodation dynamics) | animation constants |

Every transcribed number lands in a `data/**/*.json` file with a `citation` field and a `verified: true|false` flag; a test fails if any default-preset value has `verified: false` at release.

## Global Constraints

- Units: millimeters, diopters, degrees in data files and UI; radians internal to math modules. Right-handed, z along the optical axis toward the retina, x temporal for the right eye, y superior.
- TypeScript `strict: true`, no `any` in `eye-model` or `optics`. These two packages import nothing from the DOM or React.
- `optics` does not import `eye-model`. The viewer composes them.
- Every numeric constant lives in `data/` with a citation; code never hard-codes a physiological value.
- All optics computation runs in a web worker; the main thread never blocks more than 16 ms per frame.
- `EyeParameters.schemaVersion` is `"1.0.0"`; any reader rejects an unknown major version with a clear error.
- Python 3.12 pinned in `science/.python-version`; deps pip-installable with no compiled extensions beyond NumPy/SciPy wheels.
- No commit to `main` without green CI. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Approximations (length-proxy activation, fixed pulleys, homogeneous lens index) are labeled "approximation" in the UI tooltip of the affected readout.

## Review Focus

Failure modes the spec implies but no acceptance test covers; each line's test is added to the owning task.

1. **Target at infinity or zero distance.** `targetDistanceM = Infinity` must yield 0 D demand; `0` must be rejected or clamped to 0.05 m, never produce NaN. → Task 1.5.
2. **Age outside 6 to 90.** Amplitude, pupil, and growth tables must clamp, never extrapolate to negative amplitude or NaN. → Task 1.3, Task 3.6.
3. **Rays that miss an aperture or undergo total internal reflection.** Such rays are flagged `vignetted`, excluded from the OPD map and Zernike fit; the fit refuses to run below 60% valid rays. → Task 1.7, Task 3.2.
4. **Schema version mismatch in a Python-generated file.** Loading `schemaVersion: "2.0.0"` in the viewer shows an error banner naming the version, not a silently wrong eye. → Task 0.4, Task 1.9.
5. **FEM result with out-of-range displacement.** A Zernike height map whose RMS exceeds 500 µm is rejected by the exporter as unphysical, preventing a divergent solve from reaching the viewer. → Task 4.6.

---

# Milestone 0: Repository bootstrap

Deliverable: the repo exists under hvresearch, CI runs both test suites, Pages deploys an empty viewer, and the schema validates fixtures on both sides.

### Task 0.1: Amend the spec with settled decisions and updated literature

**Files:**
- Modify: `docs/superpowers/specs/2026-10-26-eye-simulation-design.md`
- Create: `docs/literature/README.md` (one entry per source in the table above: citation, DOI, what is taken from it)

- [ ] **Step 1:** In the spec, replace section 4.1 with the Zapata-Díaz 2019 default and Navarro 2014 / Polans 2015 alternatives; replace Hofstetter in 4.2 with Anderson 2008; in 4.3 couple miosis to vergence (Feil 2017); add angle alpha and pupil decentration to 4.1; add SyntEyes to section 8; add eyelid pressure, tendon parameters, solid elements, and the remodeling layer to section 7; add the "Decisions settled" list above as section 12.
- [ ] **Step 2:** Write `docs/literature/README.md` from the literature table.
- [ ] **Step 3:** Commit: `docs: amend spec with grilling decisions and current literature`.

### Task 0.2: pnpm workspace with three empty packages

**Files:**
- Create: `web/package.json`, `web/pnpm-workspace.yaml`, `web/tsconfig.base.json`, `web/vitest.workspace.ts`
- Create: `web/packages/eye-model/{package.json,tsconfig.json,src/index.ts,test/smoke.test.ts}`
- Create: `web/packages/optics/{package.json,tsconfig.json,src/index.ts,test/smoke.test.ts}`
- Create: `web/apps/viewer/{package.json,tsconfig.json,vite.config.ts,index.html,src/main.tsx,src/App.tsx}`
- Create: `.nvmrc` (`22`), `web/.npmrc` (`engine-strict=true`)

**Interfaces:**
- Produces: package names `@eye/eye-model`, `@eye/optics`, `@eye/viewer`; script `pnpm -r test` runs Vitest in every package; `pnpm --filter @eye/viewer build` emits `web/apps/viewer/dist`.

- [ ] **Step 1:** `corepack enable && corepack prepare pnpm@latest --activate`; verify `pnpm --version`.
- [ ] **Step 2:** Write the workspace files. `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `resolveJsonModule`, `module: ESNext`, `target: ES2022`.
- [ ] **Step 3:** Write a smoke test in each package asserting `1 + 1 === 2`. Run `pnpm -r test`. Expected: 2 passing suites.
- [ ] **Step 4:** Scaffold the viewer with Vite React TS template content; `pnpm --filter @eye/viewer build` succeeds and `dist/index.html` exists.
- [ ] **Step 5:** Commit: `chore: pnpm workspace with eye-model, optics, viewer`.

### Task 0.3: Python package scaffold

**Files:**
- Create: `science/pyproject.toml` (project `eyebiomech`, deps numpy, scipy, scikit-fem, jsonschema; dev: pytest, ruff, optiland), `science/.python-version` (`3.12`), `science/eyebiomech/__init__.py`, `science/tests/test_smoke.py`

- [ ] **Step 1:** `cd science && uv init --package` then edit `pyproject.toml` to the dependency list above.
- [ ] **Step 2:** Write `test_smoke.py` importing `eyebiomech` and asserting `__version__ == "0.1.0"`.
- [ ] **Step 3:** `uv run pytest -q`. Expected: 1 passed.
- [ ] **Step 4:** `uv run ruff check .` passes. Commit: `chore: eyebiomech python package scaffold`.

### Task 0.4: EyeParameters JSON Schema and dual-side validation

**Files:**
- Create: `schemas/eye-parameters.schema.json`, `schemas/scenario.schema.json`
- Create: `data/fixtures/emmetrope-right.eye.json` (hand-written minimal valid document, Navarro 1985 numbers, `provenance.source = "fixture"`)
- Create: `web/packages/eye-model/src/schema/validate.ts`, `web/packages/eye-model/test/schema.test.ts`
- Create: `science/eyebiomech/schema.py`, `science/tests/test_schema.py`

**Interfaces:**
- Produces (TS): `validateEyeParameters(doc: unknown): { ok: true; value: EyeParameters } | { ok: false; errors: string[] }` and type `EyeParameters` in `web/packages/eye-model/src/schema/types.ts` (hand-written to mirror the schema; test asserts the fixture type-checks and validates).
- Produces (Py): `eyebiomech.schema.validate_eye_parameters(doc: dict) -> None` raising `SchemaError(list[str])`.

Schema (fields exactly as the spec section 3.2, plus): `visualAxis { alphaDeg, kappaDeg }`, `pupilDecenterMm { x, y }`, `extraocularMuscles[6] { name, originMm[3], pulleyMm[3] | null, insertionDistFromLimbusMm, insertionWidthMm, tendon { stiffnessNPerMm, slackLengthMm } }`, `eyelid { upperPressureKPa, lowerPressureKPa, apertureMm } | null`, `provenance { source, citation, generatedBy, gitHash, date, verified }`.

- [ ] **Step 1:** Write failing TS test: fixture validates `ok: true`; a copy with `schemaVersion: "2.0.0"` returns `ok: false` with an error containing `"2.0.0"`; a copy missing `surfaces` fails.
- [ ] **Step 2:** Run `pnpm --filter @eye/eye-model test`. Expected: FAIL, module not found.
- [ ] **Step 3:** Write the schema (draft 2020-12), the TS types, and `validate.ts` using ajv with the major-version check done before schema validation.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Write the Python test mirroring the three TS cases; run `uv run pytest`. Expected: FAIL. Implement `schema.py` with `jsonschema.Draft202012Validator`. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(schema): EyeParameters v1.0.0 schema with TS and Python validators`.

### Task 0.5: CI, Pages deploy, CLAUDE.md, README, LICENSE

**Files:**
- Create: `.github/workflows/ci.yml` (jobs: `web` runs `pnpm install --frozen-lockfile`, `pnpm -r lint`, `pnpm -r test`, `pnpm --filter @eye/viewer build`, Playwright smoke; `python` runs `uv sync`, `uv run ruff check`, `uv run pytest`)
- Create: `.github/workflows/pages.yml` (on push to main: build viewer with `--base=/eye-biomechanics/`, deploy with `actions/deploy-pages`)
- Create: `CLAUDE.md` (install, build, test commands for both sides; the Global Constraints list; "run `pnpm -r test && (cd science && uv run pytest)` before every commit")
- Create: `README.md`, `LICENSE` (MIT, copyright Henry Volkmann 2026)

- [ ] **Step 1:** Write the four files. The viewer's `vite.config.ts` reads `base` from `process.env.VITE_BASE ?? "/"`.
- [ ] **Step 2:** Run the CI commands locally in order; all succeed.
- [ ] **Step 3:** Commit: `chore: CI, Pages deploy, CLAUDE.md, README, MIT license`.

### Task 0.6: Create the GitHub repository and protect main

Prerequisite: the user runs `gh auth login` for the hvresearch account (the CLI is currently hvolkmann1). Verify with `gh auth status` showing `hvresearch` active.

- [ ] **Step 1:** `gh repo create hvresearch/eye-biomechanics --public --source=. --remote=origin --description "Interactive eye, muscle, and wave-optics simulation with corneoscleral biomechanics for predicting astigmatism onset" --push`.
- [ ] **Step 2:** Enable Pages with `gh api -X POST repos/hvresearch/eye-biomechanics/pages -f build_type=workflow`.
- [ ] **Step 3:** Protect main: `gh api -X PUT repos/hvresearch/eye-biomechanics/branches/main/protection` with `required_status_checks.contexts = ["web","python"]`, `enforce_admins=false`, `required_pull_request_reviews=null`.
- [ ] **Step 4:** Verify: CI green on the first push, Pages URL `https://hvresearch.github.io/eye-biomechanics/` serves the viewer shell.

---

# Milestone 1: Vertical slice

Deliverable: one right eye in sagittal cutaway regenerating from EyeParameters; a target-distance slider; accommodation controller driving lens shape; a traced ray fan to the retina; a live defocus readout in diopters. Deployed to Pages.

## File structure

```
data/schematic-eyes/zapata-diaz-2019.json      transcribed model (Task 1.1)
data/schematic-eyes/navarro-1985.json           regression fixture (Task 1.1)
data/accommodation/anderson-2008-amplitude.json (Task 1.3)
data/accommodation/lag-default.json             (Task 1.5, flagged assumption)
web/packages/optics/src/
  math/vec3.ts                 Vec3 type + ops
  surfaces/types.ts            Surface, Medium
  surfaces/conic.ts            sag, normal, intersect for conic
  trace/ray.ts                 Ray, TraceHit, TraceResult
  trace/refract.ts             vector Snell
  trace/sequential.ts          traceRay(ray, surfaces)
  trace/bundle.ts              collimated/point bundles across a pupil
  paraxial/abcd.ts             paraxial power, focal length, far point
  metrics/defocus.ts           retinal defocus in diopters
web/packages/eye-model/src/
  schema/{types,validate}.ts   from Task 0.4
  presets/load.ts              load a schematic-eye JSON to EyeParameters
  accommodation/amplitude.ts   Anderson 2008
  accommodation/lens.ts        lens geometry at (A, age) for the active model
  accommodation/controller.ts  demand → response with lag and amplitude clip
  build/surfaces.ts            EyeParameters + EyeState → optics Surface[]
  state/types.ts               SceneState, EyeState
  state/derive.ts              deriveEyeState(scene, params) (slice: accommodation only)
web/apps/viewer/src/
  store/scene.ts               Zustand SceneState + loaded EyeParameters
  worker/optics.worker.ts      receives Surface[] + bundle spec, returns trace + defocus
  worker/client.ts             typed request/response wrapper
  scene/Stage.tsx              Canvas, lights, camera
  scene/EyeCutaway.tsx         lathe meshes from Surface[] (cornea, lens, retina, sclera)
  scene/RayFan.tsx             line segments from TraceResult
  ui/Inspector.tsx             target distance, age slider, model select
  ui/Readout.tsx               accommodation demand/response, defocus
  theme.css                    tokens for the design system
```

### Task 1.1: Transcribe the schematic eye tables

**Files:**
- Create: `data/schematic-eyes/zapata-diaz-2019.json`, `data/schematic-eyes/navarro-1985.json`, `data/schematic-eyes/README.md`
- Create: `web/packages/eye-model/src/presets/load.ts`, `web/packages/eye-model/test/presets.test.ts`

**Interfaces:**
- Produces: `loadPreset(name: "zapata-diaz-2019" | "navarro-1985"): EyeParameters` returning a validated document for the relaxed eye at the model's reference age (Zapata-Díaz: the paper's reference age; Navarro: adult). `SchematicEyeTable` JSON shape: `{ citation, doi, verified, referenceAgeYears, relaxed: Surface[], accommodation: { form: "zapata2019" | "navarro1985", coefficients: Record<string, number> }, aging?: { form, coefficients } }`.

- [ ] **Step 1:** Fetch the open-access Zapata-Díaz 2019 paper (doi 10.1016/j.optom.2018.01.003) and transcribe its surface table and its accommodation and age equations into the JSON, each coefficient with the equation it belongs to. Set `verified: false` until Step 5. Transcribe Navarro 1985 from the paper (digital.csic.es copy) likewise.
- [ ] **Step 2:** Write failing test: `loadPreset("navarro-1985")` validates and has 4 refracting surfaces plus a retina; `loadPreset("zapata-diaz-2019")` validates.
- [ ] **Step 3:** Implement `load.ts` by mapping the table to `EyeParameters` and running `validateEyeParameters`.
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** After Task 1.6, the paraxial power test confirms both tables; set `verified: true` with the date in each JSON.
- [ ] **Step 6:** Commit: `feat(eye-model): schematic eye tables and preset loader`.

### Task 1.2: Vector math and conic surfaces

**Files:**
- Create: `web/packages/optics/src/math/vec3.ts`, `src/surfaces/types.ts`, `src/surfaces/conic.ts`, `test/conic.test.ts`

**Interfaces:**
- Produces: `type Vec3 = readonly [number, number, number]`; `add, sub, scale, dot, cross, norm, normalize`. `interface Surface { name; kind: "conic"; radiusMm; conic; apertureSemiDiamMm; vertexZMm; tilt; decenter; mediumAfter: Medium }`, `interface Medium { name; index555 }`. `sag(s: Surface, x, y): number`, `normalAt(s, x, y): Vec3`, `intersect(s, origin: Vec3, dir: Vec3): { point: Vec3; t: number } | null` (null when the ray misses the aperture or there is no forward root).

- [ ] **Step 1:** Failing tests: sag of a sphere R=10 at r=1 equals `10 - sqrt(100-1)`; sag of a paraboloid (conic −1) at r=2, R=8 equals `4/16 = 0.25`; normal at vertex is `[0,0,-1]`; an axial ray hits a surface at `vertexZMm` with `t` equal to the distance; a ray outside the aperture returns null.
- [ ] **Step 2:** Run; FAIL. Implement with the closed-form conic intersection (quadratic in t) and the standard conic sag formula.
- [ ] **Step 3:** Run; PASS. Commit: `feat(optics): vec3 and conic surface geometry`.

### Task 1.3: Accommodative amplitude from age

**Files:**
- Create: `data/accommodation/anderson-2008-amplitude.json`, `web/packages/eye-model/src/accommodation/amplitude.ts`, `test/amplitude.test.ts`

**Interfaces:**
- Produces: `amplitudeForAge(ageYears: number): number` in diopters, sigmoid from Anderson 2008, clamped so ages below 6 use the age-6 value and ages above 90 return 0.

- [ ] **Step 1:** Transcribe the sigmoid fit parameters from Anderson et al. 2008 into the JSON with citation.
- [ ] **Step 2:** Failing tests: monotone non-increasing on a grid from 6 to 90; `amplitudeForAge(3) === amplitudeForAge(6)`; `amplitudeForAge(95) === 0`; the age-20 and age-50 values match the paper's reported means within 0.5 D (fill in from the paper).
- [ ] **Step 3:** Implement; PASS. Commit: `feat(eye-model): accommodative amplitude vs age (Anderson 2008)`.

### Task 1.4: Lens geometry as a function of accommodation and age

**Files:**
- Create: `web/packages/eye-model/src/accommodation/lens.ts`, `test/lens.test.ts`

**Interfaces:**
- Produces: `lensGeometry(table: SchematicEyeTable, accommodationD: number, ageYears: number): { anteriorRadiusMm, posteriorRadiusMm, thicknessMm, anteriorConic, posteriorConic, index555, anteriorChamberDepthMm }`, dispatching on `table.accommodation.form`.

- [ ] **Step 1:** Failing tests: at A=0 the Navarro output equals the relaxed table; Navarro anterior radius at A=4 equals `10.2 - 1.75*ln(5)` (verify the coefficient against the paper during Task 1.1 and adjust the test to the paper); anterior radius decreases monotonically with A for both forms; thickness increases with A.
- [ ] **Step 2:** Implement both forms. PASS. Commit: `feat(eye-model): accommodation-dependent lens geometry`.

### Task 1.5: Accommodation controller

**Files:**
- Create: `data/accommodation/lag-default.json` (`{ form: "piecewise-linear", slope: 0.15, onsetD: 1.0, citation: "assumption pending transcription of adult stimulus-response data", verified: false }`), `web/packages/eye-model/src/accommodation/controller.ts`, `test/controller.test.ts`

**Interfaces:**
- Produces: `demandFromDistance(targetDistanceM: number, farPointD: number): number` (`Infinity` → `max(0, -farPointD)`; distances below 0.05 m clamp to 0.05); `accommodationResponse(demandD: number, amplitudeD: number, lag: LagModel): number` = `clamp(demandD - lag(demandD), 0, amplitudeD)`.

- [ ] **Step 1:** Failing tests: `demandFromDistance(Infinity, 0) === 0`; `demandFromDistance(0.5, 0) === 2`; `demandFromDistance(0, 0)` equals the 0.05 m value with no NaN; response never exceeds amplitude; response at 3 D demand with default lag is `3 - 0.15*(3-1) = 2.7`; response is 0 for a 3 D myope (farPoint −3) viewing at 0.333 m.
- [ ] **Step 2:** Implement. PASS. Commit: `feat(eye-model): accommodation demand and response controller`.

### Task 1.6: Paraxial power and the optics acceptance fixture

**Files:**
- Create: `web/packages/optics/src/paraxial/abcd.ts`, `test/paraxial.test.ts`

**Interfaces:**
- Produces: `paraxialPower(surfaces: Surface[], indexBefore = 1.0): { powerD: number; backFocalLengthMm: number; farPointD: number }` by ABCD matrix multiplication of refraction and transfer matrices.

- [ ] **Step 1:** Failing test: for the Navarro 1985 relaxed table (loaded via the fixture JSON directly, since `optics` cannot import `eye-model`), `powerD` is within 0.1 D of 60.4 and the image of infinity lands within 0.05 mm of the retina vertex. Second test: a single thin lens surface pair gives `1000*(n-1)*(1/R1 - 1/R2)` D.
- [ ] **Step 2:** Implement. PASS. Return to Task 1.1 Step 5 and mark the tables verified. Commit: `feat(optics): paraxial ABCD power with Navarro fixture`.

### Task 1.7: Sequential exact ray trace

**Files:**
- Create: `web/packages/optics/src/trace/ray.ts`, `src/trace/refract.ts`, `src/trace/sequential.ts`, `src/trace/bundle.ts`, `test/trace.test.ts`

**Interfaces:**
- Produces: `interface Ray { origin: Vec3; dir: Vec3; wavelengthNm: number }`; `refract(dir, normal, n1, n2): Vec3 | null` (null on total internal reflection); `traceRay(ray, surfaces, indexBefore): TraceResult` where `TraceResult = { hits: TraceHit[]; opticalPathMm: number; vignetted: boolean; vignettedAt?: string }`; `collimatedBundle(dirAngleDeg: {x,y}, pupilSemiDiamMm, gridN, entranceZMm): Ray[]`; `pointSourceBundle(point: Vec3, pupilSemiDiamMm, gridN, entranceZMm): Ray[]`.

- [ ] **Step 1:** Failing tests: refraction at normal incidence is unchanged; Snell at 30° from n=1 to 1.5 gives `asin(sin30/1.5)`; TIR from 1.5 to 1 at 60° returns null; an axial ray through the Navarro eye hits the retina at `x=y=0` within 1e-9; a marginal ray at 1.5 mm height hits the retina within 0.05 mm of the axis (spherical aberration bound); a ray at 10 mm height is `vignetted: true` with `vignettedAt: "cornea.anterior"`; `opticalPathMm` of the axial ray equals `Σ thickness_i * n_i`.
- [ ] **Step 2:** Implement. Intersection uses `intersect` from Task 1.2; path length accumulates `n * |segment|`.
- [ ] **Step 3:** PASS. Commit: `feat(optics): exact sequential ray tracing with vignetting`.

### Task 1.8: Retinal defocus metric

**Files:**
- Create: `web/packages/optics/src/metrics/defocus.ts`, `test/defocus.test.ts`

**Interfaces:**
- Produces: `retinalDefocusD(surfaces: Surface[], objectDistanceM: number, pupilSemiDiamMm: number): number`: trace a point-source bundle, find the z of minimum RMS spot radius along the axis near the retina, convert the axial gap to diopters with the vitreous index (`ΔD ≈ n_vit * Δz / f'²`, f' the paraxial back focal length), sign positive when the focus is behind the retina.

- [ ] **Step 1:** Failing tests: relaxed Navarro at infinity gives |defocus| < 0.1 D; at 0.5 m object with 0 accommodation gives ≈ +2 D within 0.15 D; after increasing lens power (via a Navarro accommodated table for A=2 built in the test) the 0.5 m defocus is < 0.2 D.
- [ ] **Step 2:** Implement with a golden-section search over z in ±2 mm of the retina. PASS. Commit: `feat(optics): retinal defocus metric`.

### Task 1.9: Build optics surfaces from EyeParameters and EyeState

**Files:**
- Create: `web/packages/eye-model/src/state/types.ts`, `src/state/derive.ts`, `src/build/surfaces.ts`, `test/derive.test.ts`, `test/build.test.ts`

**Interfaces:**
- Produces: `SceneState { targetDistanceM; targetDirectionDeg: {x,y}; luminanceCdM2; ageYears; ipdMm; timeS }`; `EyeState { accommodationD; demandD; amplitudeD; pupilMm; gaze: [x,y,z,w]; ciliaryActivation; eomActivation: number[]; eomLengthMm: number[] }`; `deriveEyeState(scene: SceneState, params: EyeParameters, side: "left"|"right"): EyeState` (slice: fills accommodation fields, pupil fixed 4 mm, identity gaze, empty muscle arrays); `buildSurfaces(params: EyeParameters, state: EyeState): Surface[]` (from `optics`' Surface type imported as a type dependency only).

- [ ] **Step 1:** Failing tests: for the fixture at age 30 and 0.5 m, `demandD === 2`, `accommodationD` within [1.5, 2]; `buildSurfaces` returns surfaces whose lens anterior radius equals `lensGeometry(...)` for that accommodation; a document with `schemaVersion "2.0.0"` makes `deriveEyeState` throw `SchemaVersionError`.
- [ ] **Step 2:** Implement. PASS. Commit: `feat(eye-model): scene→eye state derivation and surface builder`.

### Task 1.10: Optics web worker and typed client

**Files:**
- Create: `web/apps/viewer/src/worker/optics.worker.ts`, `src/worker/client.ts`, `src/worker/messages.ts`, `test/worker.test.ts` (runs the pure handler without a real Worker)

**Interfaces:**
- Produces: `OpticsRequest = { id; surfaces: Surface[]; objectDistanceM; pupilSemiDiamMm; fanRays: number }`; `OpticsResponse = { id; defocusD; fan: Array<Vec3[]> }` (polyline per ray for drawing); `handle(req): OpticsResponse` exported for tests; `OpticsClient.request(req): Promise<OpticsResponse>` dropping stale responses by id.

- [ ] **Step 1:** Failing test: `handle` on the fixture returns 11 polylines for `fanRays: 11`, each with one vertex per surface plus the retina.
- [ ] **Step 2:** Implement; PASS. Commit: `feat(viewer): optics web worker`.

### Task 1.11: Store, cutaway stage, ray fan, inspector, readout

**Files:**
- Create: `web/apps/viewer/src/store/scene.ts`, `src/scene/Stage.tsx`, `src/scene/EyeCutaway.tsx`, `src/scene/RayFan.tsx`, `src/ui/Inspector.tsx`, `src/ui/Readout.tsx`, `src/theme.css`; modify `src/App.tsx`
- Test: `web/apps/viewer/e2e/slice.spec.ts` (Playwright)

**Interfaces:**
- Consumes: `deriveEyeState`, `buildSurfaces`, `loadPreset`, `OpticsClient`.
- Produces: Zustand store `useScene()` with `scene: SceneState`, `params: EyeParameters`, `eye: EyeState`, `optics: OpticsResponse | null`, actions `setTargetDistance`, `setAge`, `setPreset`. `EyeCutaway` builds `LatheGeometry` per surface revolved from the sag profile, clipped by a sagittal clipping plane (Three.js `clippingPlanes`), with distinct materials for cornea, aqueous, lens, vitreous, retina, sclera.

- [ ] **Step 1:** Write the Playwright test: page loads; `[data-testid=defocus]` shows a number; dragging `[data-testid=target-distance]` from 6 m to 0.33 m changes the accommodation readout and the defocus readout stays below 0.6 D at age 30; setting age to 60 at 0.33 m gives defocus above 1.5 D (presbyopia).
- [ ] **Step 2:** Implement the store with a debounced worker request on any change.
- [ ] **Step 3:** Implement `Stage`, `EyeCutaway`, `RayFan` (rays as `Line` from drei with a thin width), `Inspector`, `Readout`. Apply the frontend-design skill for `theme.css` tokens (type scale, clinical palette, one hot color reserved for muscle activation in Milestone 2) and the layout: stage full-window, inspector docked right.
- [ ] **Step 4:** `pnpm --filter @eye/viewer e2e`. Expected: PASS. Manual check: 60 fps in the Chrome performance panel while dragging the slider.
- [ ] **Step 5:** Commit: `feat(viewer): vertical slice — cutaway eye, target slider, accommodation, ray fan, defocus`. Open a PR, CI green, merge, confirm the Pages URL shows the slice.

---

# Milestone 2: Extraocular muscles, gaze, and dynamics

Deliverable: two eyes tracking a draggable target with vergence, six muscles per eye drawn as tapered tubes colored by activation, a muscle table, and animated saccades, vergence, and accommodation.

## File structure

```
data/eom/geometry-default.json          origins, pulleys, insertions (BCSC + cadaveric), tendon defaults
data/eom/dynamics.json                  main sequence, vergence, accommodation time constants
web/packages/eye-model/src/
  gaze/listing.ts        gazeQuaternion(dirDeg) obeying Listing's law
  gaze/vergence.ts       per-eye target directions from a binocular target and IPD
  gaze/dynamics.ts       saccade/vergence/accommodation time evolution
  eom/geometry.ts        typed load of the EOM table
  eom/path.ts            muscle path origin→pulley→wrap→insertion, length
  eom/activation.ts      length-proxy activation with reciprocal innervation
  state/derive.ts        (modify) fill gaze and muscle fields
web/apps/viewer/src/
  scene/Globe.tsx        one globe + optic nerve + insertions, oriented by gaze
  scene/Muscle.tsx       TubeGeometry along the path, color by activation
  scene/Orbit.tsx        annulus of Zinn, orbit outline
  scene/Target.tsx       draggable target (drei TransformControls)
  ui/MuscleTable.tsx
  ui/Transport.tsx       play/pause/scrub seconds
```

### Task 2.1: EOM geometry table

- [ ] Create `data/eom/geometry-default.json` with, per muscle: origin (annulus of Zinn coordinates from the Orbit model literature; inferior oblique at the anterior orbital floor; superior oblique functional origin at the trochlea), pulley position or null for obliques without one in v1, insertion distance from limbus (BCSC 5.5/6.5/6.9/7.7 mm; cadaveric means stored as `alt`), insertion width, tendon stiffness and slack length placeholders flagged `verified: false`. Globe radius 12 mm, limbus at the 11.5 mm corneal diameter.
- [ ] Test `eom/geometry.ts`: six muscles, names exactly `["lateralRectus","medialRectus","superiorRectus","inferiorRectus","superiorOblique","inferiorOblique"]`, every insertion lies on the globe sphere within 1e-6 after conversion to Cartesian.
- [ ] Commit: `feat(eye-model): extraocular muscle geometry table`.

### Task 2.2: Listing's law gaze and binocular vergence

**Interfaces:** `gazeQuaternion(dir: {xDeg, yDeg}): Quat` (rotation axis in Listing's plane, so torsion about the line of sight is zero in primary-position coordinates); `eyeDirections(target: Vec3, ipdMm: number): { left: {xDeg,yDeg}, right: {xDeg,yDeg}, vergenceDeg: number }`.

- [ ] Tests: primary gaze is identity; a 20° rightward gaze has zero torsion component when decomposed (Fick angles); target at 0.333 m straight ahead with IPD 63 gives vergence `2*atan(31.5/333.33)` degrees; target at infinity gives 0° vergence.
- [ ] Implement; commit: `feat(eye-model): Listing's law gaze and vergence geometry`.

### Task 2.3: Muscle path and length

**Interfaces:** `musclePath(m: MuscleGeometry, gaze: Quat, globeCenter: Vec3, globeRadiusMm: number): { points: Vec3[]; lengthMm: number; pullDir: Vec3 }`. Path: origin → pulley (if any) → tangent point on the sphere → great-circle arc on the sphere → insertion rotated by gaze.

- [ ] Tests: in primary position the medial rectus path length is within 10% of the published ~40 mm total muscle+tendon length (cite); rotating the eye 20° toward a muscle's action shortens it and lengthens its antagonist; path points all lie on or outside the sphere.
- [ ] Implement; commit: `feat(eye-model): muscle path over the globe`.

### Task 2.4: Length-proxy activation

**Interfaces:** `activations(lengths: number[], restLengths: number[]): number[]` in [0,1]: `clamp(k * (rest - length)/rest, 0, 1)` with `k` from the data file, antagonist pairs floored at 0 (reciprocal innervation). Labeled "approximation" in the data file and the UI tooltip.

- [ ] Tests: primary gaze gives all equal baseline; 20° adduction raises medial rectus above lateral rectus; values stay in [0,1].
- [ ] Commit: `feat(eye-model): length-proxy muscle activation`.

### Task 2.5: Oculomotor and accommodative dynamics

**Interfaces:** `stepDynamics(prev: DynamicState, targets: { gazeL, gazeR, accommodationD }, dtS: number, consts: DynamicsTable): DynamicState`. Saccade: duration `2.2*amplitudeDeg + 21` ms with a minimum-jerk profile (Bahill 1975); vergence: first-order, time constant from `dynamics.json` (default 0.4 s, latency 0.16 s, Rashbass & Westheimer 1961); accommodation: latency 0.35 s, time constant 0.25 s (Kasthurirangan & Glasser 2005). All constants in `data/eom/dynamics.json` with citations.

- [ ] Tests: a 10° step completes within 45 ms ± 5; vergence reaches 95% of a step within 3 time constants after latency; accommodation does not move before latency; `dt = 0` is a no-op.
- [ ] Commit: `feat(eye-model): saccade, vergence, and accommodation dynamics`.

### Task 2.6: Derive gaze and muscles into EyeState; viewer scene

- [ ] Modify `derive.ts` to fill `gaze`, `eomLengthMm`, `eomActivation` for both sides; tests updated.
- [ ] Implement `Globe`, `Muscle`, `Orbit`, `Target`, `MuscleTable`, `Transport`. Muscle color maps activation 0→1 through the single hot color token. Hover a muscle: name, length, activation, "approximation" note.
- [ ] Playwright: dragging the target 20° right increases the right eye's lateral rectus activation and the left eye's medial rectus activation in the table; vergence readout increases when the target moves closer.
- [ ] Commit, PR, merge: `feat: binocular globes with extraocular muscles, gaze tracking, dynamics`.

---

# Milestone 3: Wave optics, pupil, visual axis, spectacles

Deliverable: wavefront map, Zernike bar chart, PSF, MTF, Strehl, retinal image, corrected/uncorrected toggle, auto-prescribe, refractive presets with decomposition, pupil model, angle alpha.

## File structure

```
data/pupil/watson-yellott-2012.json
data/pupil/near-response-feil-2017.json
data/visual-axis/polans-2015.json
data/presets/refractive-errors.json
web/packages/optics/src/
  surfaces/toric.ts            biconic with axis
  surfaces/zernikeSag.ts       conic base + Zernike height perturbation; Newton intersect
  wavefront/opd.ts             OPD map vs reference sphere at exit pupil
  wavefront/zernike.ts         OSA single-index polynomials, least-squares fit
  wavefront/refraction.ts      C(2,·) → sphere/cyl/axis and (M,J0,J45)
  image/fft.ts                 radix-2 complex 2D FFT
  image/psf.ts                 pupil function → PSF, Strehl
  image/mtf.ts
  image/retinal.ts             convolve target with PSF
  image/targets.ts             Snellen E, Sloan letters, gratings as bitmaps
  lenses/prescription.ts       Prescription → two surfaces at vertex distance
  lenses/autoprescribe.ts      Nelder–Mead over (S, C, axis)
  color/dispersion.ts          Cauchy per medium; polychromatic weights
web/packages/eye-model/src/
  pupil/watsonYellott.ts, pupil/nearResponse.ts
  presets/refractiveErrors.ts  apply preset → modified EyeParameters + decomposition
science/eyebiomech/oracle/     reference tracer and Optiland cross-check (tests only)
web/apps/viewer/src/ui/optics/ WavefrontMap, ZernikeBars, PsfView, MtfChart, RetinalImage, Spectacles panel
```

### Task 3.1: Toric and Zernike surfaces

**Interfaces:** `Surface.kind` extended to `"toric" | "zernike"`; toric fields `rxMm, ryMm, axisDeg, conicX, conicY`; zernike fields `base: conic fields` + `normRadiusMm`, `coeffsMicrons: number[]`. `intersect` for both uses Newton iteration on `z - sag(x,y) = 0` along the ray, seeded by the conic root, tolerance 1e-9 mm, max 20 iterations.

- [ ] Tests: toric with `rx = ry` equals the conic sag everywhere; toric sag along the axis meridian uses `rx`; a Zernike surface with all zeros equals its base; adding `C(2,0)` of 1 µm at `normRadius` 3 mm changes sag at r=3 mm by `sqrt(3)*(2*1-1)` µm; Newton converges for a 30° oblique ray.
- [ ] Commit: `feat(optics): toric and Zernike-perturbed surfaces`.

### Task 3.2: OPD map and Zernike fit

**Interfaces:** `opdMap(surfaces, bundle: Ray[], chiefRay: Ray): OpdMap { n; xs; ys; opdWaves: Float64Array; valid: Uint8Array; pupilRadiusMm }`; `fitZernike(map: OpdMap, maxRadialOrder = 8): { coeffsMicrons: number[]; rmsMicrons: number; hoRmsMicrons: number }` (throws `InsufficientRaysError` below 60% valid).

- [ ] Tests: a diffraction-limited test system (single ideal thin lens via a paraboloid mirror-equivalent or a stigmatic conic) gives RMS < 1e-4 µm; shifting the reference sphere by Δz yields a pure `C(2,0)` with all other coefficients < 1e-6; Zernike polynomials are orthonormal on the unit disk when numerically integrated (order ≤ 4, tolerance 1e-3); a map with 50% valid rays throws.
- [ ] Commit: `feat(optics): OPD map and Zernike fit`.

### Task 3.3: Sphero-cylindrical refraction from Zernikes

**Interfaces:** `refractionFromZernike(coeffsMicrons, pupilRadiusMm): { sphereD; cylinderD; axisDeg; M; J0; J45 }` using the Thibos et al. 1997 conversions, minus-cylinder convention. `powerVectors(S, C, axis)` and inverse.

- [ ] Tests: round-trip `(S,C,axis)` → `(M,J0,J45)` → `(S,C,axis)` for 50 random prescriptions within 1e-9 D and 1e-6°; a toric cornea with 1.5 D of cylinder at 180° in the Navarro eye yields `cylinderD ≈ -1.5 ± 0.1` and `axisDeg ≈ 180 ± 2`.
- [ ] Commit: `feat(optics): refraction and power vectors from wavefront`.

### Task 3.4: FFT, PSF, MTF, retinal image

**Interfaces:** `fft2(re: Float64Array, im: Float64Array, n: number): void` in place; `psf(map: OpdMap, wavelengthNm, gridN = 256): { intensity: Float32Array; n; strehl; pixelArcmin }`; `mtf(psf): { freqCpd: Float32Array; radial: Float32Array }`; `retinalImage(target: Bitmap, psf): Bitmap`; `polychromaticPsf(surfaces, bundle, wavelengthsNm = [450,500,555,600,650], weightsV)`.

- [ ] Tests: `fft2` of a delta is flat; FFT round-trip error < 1e-10; the diffraction-limited PSF first zero lies at `1.22 λ/D` radians within 5%; Strehl of a zero-aberration pupil is 1 ± 1e-3; 0.5 D defocus at 4 mm pupil, 555 nm gives Strehl below 0.2; MTF at 0 cpd is 1.
- [ ] Commit: `feat(optics): FFT, PSF, MTF, retinal image simulation`.

### Task 3.5: Spectacle lens surfaces and auto-prescribe

**Interfaces:** `Prescription { sphereD; cylinderD; axisDeg; vertexMm = 12; baseCurveD = 6; index = 1.5; centerThicknessMm = 2 }`; `lensSurfaces(p: Prescription): Surface[]` (front spherical at `baseCurveD`, back toric chosen so back-vertex power equals `(S, C, axis)`); `autoPrescribe(eyeSurfaces, objectDistanceM, pupilSemiDiamMm, opts): Prescription` minimizing RMS wavefront (or maximizing Strehl) by Nelder–Mead seeded from the paraxial far point.

- [ ] Tests: `lensSurfaces` back-vertex power equals the prescription within 0.01 D via `paraxialPower`; a Navarro eye lengthened to a −3 D far point is corrected to |residual| < 0.05 D by `autoPrescribe`; a 1.5 D toric cornea yields a prescription with |C| within 0.1 D of 1.5 and axis within 3°; vertex-distance change from 12 to 14 mm changes effective power in the correct direction.
- [ ] Commit: `feat(optics): spectacle lenses and auto-prescribe`.

### Task 3.6: Pupil model and near response

**Interfaces:** `pupilDiameterMm(luminanceCdM2, fieldDeg2, ageYears, eyes: 1|2): number` (Watson & Yellott 2012 unified formula, transcribed); `nearMiosisMm(vergenceDeg): number` (Feil 2017 parameters; result subtracted, floored at 2 mm total).

- [ ] Tests: the W&Y formula reproduces three tabulated points from the paper within 0.1 mm; diameter decreases with age at fixed luminance; `pupil` at age 200 equals age 90 (clamp); zero vergence gives zero miosis.
- [ ] Commit: `feat(eye-model): pupil diameter and near response`.

### Task 3.7: Visual axis and refractive presets with decomposition

**Interfaces:** `applyVisualAxis(params)`: chief-ray target is the fovea at angle alpha (Polans 2015 default) with pupil decentration; `applyRefractivePreset(params, preset: "emmetrope"|"myope-3-axial"|"myope-3-corneal"|"hyperope+2"|"astigmat-1.5-atr-corneal"|"astigmat-1.5-lenticular"|"presbyope-55"): EyeParameters`; `decomposeRefraction(params): { totalD; cornealD; lenticularD; axialD; cylinderCornealD; cylinderLenticularD }` by paraxial contributions.

- [ ] Tests: each preset's traced refraction (Task 3.3) matches its nominal value within 0.15 D / 3°; decomposition components sum to total within 0.05 D; mirror right→left flips `alphaDeg` sign and `axisDeg` to `180 - axis`.
- [ ] Commit: `feat(eye-model): visual axis and refractive-error presets with decomposition`.

### Task 3.8: Python oracle cross-check

**Files:** `science/eyebiomech/oracle/reference_tracer.py`, `science/tests/test_oracle.py`, `web/packages/optics/test/oracle.test.ts`, `data/oracle/cases.json`, `data/oracle/expected.json`

- [ ] Write `cases.json`: 20 random conic systems, 10 toric, 10 Zernike. Python: trace conic cases in Optiland and all cases in a ~150-line NumPy reference tracer (same algorithm, independently written); assert Optiland and the reference agree within 1e-6 mm on conic cases; write retinal hit points to `expected.json`.
- [ ] TS test: `traceRay` agrees with `expected.json` within 1e-6 mm for all 40 cases.
- [ ] Commit: `test(optics): cross-check against Optiland and a Python reference tracer`.

### Task 3.9: Optics strip and spectacles panel in the viewer

- [ ] Worker extended to return `OpdMap`, Zernike coefficients, PSF, MTF, retinal image, refraction, for uncorrected and corrected eyes. Budget: < 100 ms at 64×64 pupil grid, 256 PSF grid; measured in a Vitest benchmark.
- [ ] Components per the dataviz skill: wavefront heat map (diverging palette centered at 0), Zernike bars (OSA index labels), PSF (log/linear toggle), MTF curve with diffraction limit overlay, retinal image of a Snellen E sized for 20/20 at the target distance, side-by-side corrected/uncorrected.
- [ ] Spectacles panel: S, C, axis, vertex, base curve, index inputs; "Auto-prescribe" button; "Corrected" toggle. Subject panel: preset select, age, IPD, decomposition readout. Pupil readout.
- [ ] Playwright: selecting `astigmat-1.5-atr-corneal` shows cylinder ≈ −1.5 in the readout; auto-prescribe reduces displayed RMS by > 80%.
- [ ] Commit, PR, merge: `feat: wave optics strip, pupil, visual axis, spectacles`.

---

# Milestone 4: Corneoscleral biomechanics (elastic)

Deliverable: `uv run eyebiomech fem --eye data/fixtures/emmetrope-right.eye.json --gaze 0,0 --iop 15 --out data/results/...eye.json` produces a deformed-cornea EyeParameters file; the viewer loads it and shows induced refraction and a displacement heat map.

## File structure

```
data/materials/cornea-sclera.json        stiffness, thickness by region, age functions (Elsheikh 2007, Whitford 2015)
data/eyelid/shaw-2010.json               lid pressure band defaults
science/eyebiomech/fem/
  mesh.py          structured hex mesh of the corneoscleral shell (mapped cube → shell sector), 3 layers through thickness
  material.py      neo-Hookean then HGO fiber-reinforced; age scaling
  loads.py         IOP follower pressure, insertion tractions, ciliary spur ring load, lid pressure band
  solve.py         scikit-fem Newton solve, displacement field
  surfaces.py      sample deformed anterior/posterior cornea, fit Zernike height maps
  export.py        write EyeParameters with provenance; reject RMS > 500 µm
  cli.py           `eyebiomech fem ...`
science/eyebiomech/forces/
  from_viewer.py   read muscle force table exported by `pnpm --filter @eye/eye-model export-forces`
web/packages/eye-model/scripts/export-forces.ts   CLI: gaze grid → insertion force vectors JSON
web/apps/viewer/src/scene/DeformationMap.tsx      displacement heat map + exaggeration slider
```

### Task 4.1: Shell mesh

**Interfaces:** `make_shell_mesh(params: EyeParameters, layers=3, n_theta=48, n_phi=24) -> skfem.MeshHex2` covering cornea and sclera as one closed shell with region tags `cornea`, `limbus`, `sclera`, thickness per region from the materials table.

- [ ] Tests: mesh is watertight (no boundary facets except none for a closed shell); volume within 2% of the analytic shell volume; every node radius lies between inner and outer surfaces.
- [ ] Commit: `feat(fem): corneoscleral hex shell mesh`.

### Task 4.2: Hyperelastic material and analytic verification

**Interfaces:** `NeoHookean(mu, kappa)`, `HGO(mu, k1, k2, fiber_dirs)`; `solve(mesh, material, loads, tol=1e-8) -> Displacement`.

- [ ] Test: a thick-walled neo-Hookean sphere under internal pressure matches the small-strain Lamé radial displacement within 2% at 1 kPa; a published corneal inflation curve (apex rise vs IOP, Elsheikh 2007) is reproduced within 15% with the tabled stiffness.
- [ ] Commit: `feat(fem): hyperelastic materials and Newton solver with analytic checks`.

### Task 4.3: Muscle force export from the TypeScript eye model

**Interfaces:** `pnpm --filter @eye/eye-model export-forces --grid 5 --out data/results/forces/default.json` writes, per gaze on a 5×5 grid, each muscle's insertion centroid, pull direction, and force in newtons from `activation × maxForceN` (max force from the EOM table, cited; approximation flagged). Python reads it with `load_force_table(path)`.

- [ ] Tests: TS CLI writes 25 entries × 6 muscles; Python loader returns arrays of shape (25, 6, 3).
- [ ] Commit: `feat: muscle insertion force export and import`.

### Task 4.4: Loads: IOP, insertions, ciliary ring, eyelid band

**Interfaces:** `Loads.iop(pressure_mmHg)`, `.insertion(muscle, force_N, footprint_width_mm, tendon)`, `.ciliary(tension_N_per_mm, accommodation_D)`, `.eyelid(upper_kPa, lower_kPa, aperture_mm)`; tendon series-elastic stiffness and slack reduce transmitted force; insertion position/width from the EOM table.

- [ ] Tests: total applied insertion force equals the input within 1e-6 N; lid band integrates to the expected total force; a symmetric load set produces a displacement field symmetric to 1e-6.
- [ ] Commit: `feat(fem): IOP, insertion, ciliary, and eyelid loads`.

### Task 4.5: Deformed-surface sampling and Zernike fit

**Interfaces:** `fit_surface_zernike(points_xyz, norm_radius_mm, max_order=8) -> coeffs_um` after subtracting the best-fit conic; `deformed_corneal_surfaces(mesh, u) -> (anterior_coeffs, posterior_coeffs, conic_fit)`.

- [ ] Tests: fitting a pure sphere returns all coefficients < 1e-3 µm; fitting a synthetic 1 µm `C(2,2)` perturbation recovers it within 1%.
- [ ] Commit: `feat(fem): deformed surface Zernike fitting`.

### Task 4.6: Exporter, CLI, and viewer loading with deformation map

- [ ] `export.py`: writes EyeParameters with `surfaces[cornea.*].zernikeHeight` set, `provenance { source: "eyebiomech fem", gitHash, command, date }`; raises `UnphysicalResultError` if any map RMS > 500 µm. Test both paths.
- [ ] CLI `eyebiomech fem` end-to-end on the fixture; commit the result under `data/results/fem/emmetrope-right-primary-15mmHg.eye.json`.
- [ ] Viewer: "Load EyeParameters" file input and a results dropdown listing `data/results/**`; `DeformationMap` colors the cornea by displacement magnitude with an exaggeration slider (1× to 200×); optics strip shows induced refraction versus the unloaded eye.
- [ ] Playwright: loading the committed result shows a nonzero cylinder readout and the heat map legend.
- [ ] Commit, PR, merge: `feat: elastic corneoscleral biomechanics with viewer integration`.

---

# Milestone 5: Remodeling, calibration, and prediction

Deliverable: `eyebiomech predict --profile age=12,nearHours=4,sphere=0,cyl=0 --out ...` writes a trajectory with uncertainty and onset ages; the viewer shows a scrubbable age timeline with bands and both onset markers.

## File structure

```
data/population/README.md                     sources, licenses, download script
data/population/axis-shift-by-age.json        WTR→ATR prevalence by decade (transcribed, cited)
data/population/refraction-by-age.json        mean S and C by age (NHANES-derived or published tables)
data/synteyes/rozema-2016-params.json         Gaussian-mixture parameters for synthetic subjects
science/eyebiomech/remodel/growth.py          stress-driven growth of reference configuration
science/eyebiomech/remodel/history.py         duty cycle → time-averaged loads
science/eyebiomech/calib/data.py              loaders
science/eyebiomech/calib/fit.py               least squares then emcee
science/eyebiomech/predict/grid.py            subject grid → trajectories JSON
science/eyebiomech/predict/onset.py           refraction and acuity thresholds (Watson & Ahumada 2008 metric)
science/eyebiomech/synth/synteyes.py          SyntEyes sampler
web/apps/viewer/src/ui/Timeline.tsx           age scrub, bands, onset markers
web/apps/viewer/src/data/predictions.ts       load + interpolate grid JSON
```

### Task 5.1: Load history from a daily duty cycle

**Interfaces:** `history_loads(profile: SubjectProfile, force_table) -> TimeAveragedLoads`: `nearHours/16` fraction at a near gaze set (convergence for 0.33 m, accommodation from the controller re-implemented minimally in Python or read from an exported table), remainder at distance; averages insertion and ciliary loads.

- [ ] Tests: 0 near hours equals the distance-only loads; 16 hours equals near-only; linear in between.
- [ ] Commit: `feat(remodel): load history from near-work duty cycle`.

### Task 5.2: Stress-driven growth law

**Interfaces:** `grow(reference_mesh, stress_field, homeostatic_stress, rate_per_year, dt_years) -> reference_mesh'` (volumetric growth tensor proportional to deviation from homeostatic stress, Rodriguez 1994 form, fiber-aligned per Grytz 2010).

- [ ] Tests: stress equal to homeostatic gives no growth; uniform over-stress on a sphere shell grows it isotropically; non-axisymmetric over-stress produces a `C(2,2)` term in the anterior corneal fit with the sign predicted by the load direction.
- [ ] Commit: `feat(remodel): stress-driven growth toward homeostatic target`.

### Task 5.3: Population data and SyntEyes sampler

- [ ] Transcribe axis-shift-by-age and refraction-by-age tables with citations and licenses; write `download_nhanes.py` for raw data (gitignored under `data/large/`).
- [ ] `synteyes.sample(n, age, seed) -> list[EyeParameters]` from the Rozema 2016 mixture parameters; test: sample means match tabled means within 2 SE for n=2000.
- [ ] Commit: `feat(calib): population tables and SyntEyes sampler`.

### Task 5.4: Calibration

**Interfaces:** `fit(params0, data, method="lsq"|"mcmc") -> Posterior` over `{homeostatic_stress, rate_per_year, lid_pressure_scale, eom_tone_scale, stiffness_age_slope}`; forward model = growth over age for a SyntEyes cohort → traced cylinder and axis (via the Python reference tracer) → axis-class prevalence by decade.

- [ ] Tests: on synthetic data generated by the forward model with known parameters, `lsq` recovers them within 10%; `mcmc` posterior contains the truth within the 90% interval. (Slow tests marked `@pytest.mark.slow`, run in CI nightly, not on every push.)
- [ ] Commit: `feat(calib): forward model and parameter fitting`.

### Task 5.5: Prediction grid and onset

**Interfaces:** `predict_grid(posterior, ages=range(6,91), near_hours=[0,2,4,6,8], baseline_sph=[-3..+2 step 1], baseline_cyl=[0,0.5,1.0]) -> predictions.json` with per-cell median and 5/95% of S and C and axis; `onset_ages(trajectory) -> { refraction: age | null, acuity: age | null }` using cylinder ≥ 0.75 D or |sphere| > 0.5 D, and Watson & Ahumada 2008 acuity worse than logMAR 0.3 computed from the optics engine's MTF (Python reference implementation of the metric).

- [ ] Tests: a trajectory crossing 0.75 D at age 40 returns `refraction: 40`; a flat zero trajectory returns nulls; grid JSON validates against `schemas/predictions.schema.json`.
- [ ] Commit the first grid under `data/results/predictions/v1.json`. Commit: `feat(predict): subject grid and onset estimation`.

### Task 5.6: Timeline in the viewer

- [ ] `predictions.ts` loads the grid and interpolates trilinearly; `Timeline.tsx` draws S and C medians with 5–95% bands, both onset markers, and an age cursor bound to the subject age slider. Scrubbing updates the eye (lens aging, pupil) and the optics strip via the preset mechanism plus the predicted corneal cylinder.
- [ ] Playwright: scrubbing from 10 to 60 changes the displayed cylinder; onset marker appears when present.
- [ ] Commit, PR, merge: `feat: remodeling, calibration, and prediction timeline`.

---

# Milestone 6: Polish, scenarios, and performance

Deliverable: scenarios with timelines and export, clinical camera snaps, keyboard shortcuts, hover readouts on every structure, a design pass, and verified performance budgets.

### Task 6.1: Scenarios and export
- [ ] `schemas/scenario.schema.json` finalized: scene, left/right EyeParameters, prescription, timeline keyframes. Scenario files under `data/scenarios/`: `near-to-far-refocus`, `presbyopia-20-to-60`, `astigmat-corrected-vs-uncorrected`, `fem-result-loaded`.
- [ ] Export button writes Scenario JSON plus a PNG of the stage (`canvas.toBlob`). Import round-trips. Tests on the pure serialize/deserialize.
- [ ] Commit: `feat(viewer): scenarios, import/export`.

### Task 6.2: Camera, cutaway plane, hover, shortcuts
- [ ] Snap views: anterior, lateral, superior, sagittal section (keys 1–4); play/pause (space); cutaway plane orientation and depth controls; hover readout for every named mesh with its defining parameters; click pins.
- [ ] Commit: `feat(viewer): clinical camera views, cutaway control, hover readouts`.

### Task 6.3: Design pass
- [ ] Apply the frontend-design skill across layout, type scale, spacing, and the dataviz skill across all charts; dark and light themes via tokens; verify contrast; muscle activation remains the only hot color.
- [ ] Commit: `style: design system pass`.

### Task 6.4: Performance budgets
- [ ] Vitest benchmarks: worker optics round-trip < 100 ms at 64×64/256; Playwright trace shows ≥ 55 fps while dragging the target for 5 s. If the budget fails, implement the WebGL FFT (`image/fftGpu.ts`) and re-measure.
- [ ] Commit, PR, merge: `perf: verify and enforce budgets`.

---

## Verification (end to end)

1. `pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build && pnpm --filter @eye/viewer e2e` passes locally and in CI.
2. `cd science && uv run ruff check . && uv run pytest` passes; nightly CI also runs `-m slow`.
3. Pages URL shows the current main; the four scenarios play.
4. Acceptance numbers to eyeball in the UI: relaxed emmetrope at infinity shows |defocus| < 0.1 D and Strehl > 0.8 at 3 mm pupil; age 60 at 0.33 m shows accommodation clipped to amplitude with defocus > 1.5 D; the astigmat preset shows cylinder −1.5 ± 0.1 at axis 180 ± 2; auto-prescribe brings residual RMS below 0.05 µm; loading the committed FEM result shows a nonzero cylinder and a displacement map; the timeline shows onset markers for a high near-work profile earlier than for zero near-work.
5. `data/**/*.json` default-preset entries all have `verified: true` (enforced by a test in `eye-model`).

## Execution notes

- One PR per task or small group of tasks; merge only on green CI.
- Each milestone after M1 gets an expanded plan file at `docs/superpowers/plans/2026-MM-DD-mN-<name>.md` written from this master plan immediately before that milestone starts, so step-level detail reflects the code that exists by then.
- Before Task 0.6 the user must run `gh auth login` for hvresearch.
