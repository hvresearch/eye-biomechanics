# Milestone 1: Vertical slice

Date: 2026-10-26
Status: complete 2026-10-26 (PR "Milestone 1: Vertical slice")
Master plan: `docs/superpowers/plans/2026-10-26-master-plan.md` (Milestone 1 section)

**Goal:** One right eye in sagittal cutaway regenerating from `EyeParameters`; a target-distance slider; an accommodation controller driving lens shape; a traced ray fan to the retina; a live defocus readout in diopters. Every layer of the architecture is exercised end to end.

**Architecture:** `optics` (pure TS) gains vector math, conic surfaces, exact sequential ray tracing, paraxial ABCD power, and a retinal defocus metric. `eye-model` (pure TS) gains schematic-eye tables, a preset loader, Anderson 2008 amplitude, accommodation-dependent lens geometry, a demand/response controller, scene→eye state derivation, and a builder that turns `EyeParameters + EyeState` into `optics` surfaces. The viewer composes both in a web worker and renders the cutaway, ray fan, inspector, and readout. Python is untouched except that its gate must stay green.

**Tech Stack:** TypeScript strict, Vitest, Vite 8, React 19, Zustand, three + react-three-fiber + drei, Playwright. Python 3.12 with uv (gate only).

**Spec:** `docs/superpowers/specs/2026-10-26-eye-simulation-design.md` §4.1–4.2, §4.5, §5.1–5.2, §5.6, §6.1–6.3, §9.

## Deviations from the master plan (decided at planning time)

1. **Zapata-Díaz 2019 is a stub, not a transcription.** The cloud session's network policy denies every literature host (ScienceDirect, PMC, DOI, Europe PMC, journal mirrors); only search-engine excerpts are reachable, and they never exposed the paper's parameter table. Transcribing from memory is forbidden by CLAUDE.md. `data/schematic-eyes/zapata-diaz-2019.json` therefore carries `transcribed: false`, `verified: false`, and no numbers; `loadPreset("zapata-diaz-2019")` throws `PresetNotTranscribedError` with a message that says so. The viewer's only Milestone 1 preset is the Navarro 1985 regression fixture, labeled as such in the inspector. Transcribing Zapata-Díaz 2019 is a follow-up for a session with document access (or a local session) and is recorded in `docs/superpowers/plans/2026-10-26-m0-followups.md`.
2. **Navarro 1985 fixture index corrected.** Search excerpts of the paper's Table 1 and the standard secondary sources give the corneal index as 1.376 (the fixture had 1.367). With 1.376 the paraxial power is 60.416 D and the back focal distance 16.404 mm against the 16.40 mm vitreous, which matches the published 60.42 D. That resolves the spec §5.6 discrepancy; the test tolerance becomes 0.05 D.
3. **Navarro accommodation conic equations.** The radius, thickness, aqueous depth, and index equations of Navarro's Table 4 were confirmed by excerpt. The conic-constant equations were not, so they carry `verified: false` individually inside the table and the lens-geometry test checks only the verified ones against hand values.
4. **Anderson 2008 check points.** The paper's per-age group means were not retrievable; the amplitude test checks the transcribed sigmoid at ages 20 and 50 against hand-evaluated values of the same equation and checks the shape claims the abstract makes (stable below 20, steep decline 20–50, near zero beyond 50).
5. **Interfaces simplified where the master plan was loose.** `lensGeometry` reads the relaxed values and the accommodation model from an `EyeParameters` document instead of a separate table type. `SceneState` gains `preset`. Exact signatures are given per task below.

## Outcome notes (post-execution)

- The retinal defocus readout is the best-RMS focus through the 4 mm pupil, so it carries the Navarro eye's spherical aberration (about −0.34 D at distance) on top of the paraxial defocus. The tooltip says so.
- Navarro's Table 4 accommodation parameter A is not the paraxial far-point shift (A = 2 D gives −2.18 D with the retina held at the axial length). The first implementation passed the controller's response straight in as A and also let the retina move back with the lens (vitreous held fixed, an uncited choice), which together made A = 2 D give −2.33 D and cancelled the modeled lag. After review, `buildSurfaces` keeps the retina at `axialLengthMm`, and `deriveEyeState` solves for the lens parameter (`EyeState.lensParameterA`, via an injected paraxial far-point function) so the optics accommodate by exactly the response. A 30-year-old at 0.33 m now shows the 0.30 D lag through a small pupil (about +0.14 D through 4 mm, where spherical aberration offsets part of it).
- `data/anatomy/globe-cutaway.json` (unverified, drawing only) holds the scleral, retinal, iris, and ciliary dimensions used by the cutaway. The globe is drawn as the sphere of the retina radius, which widens the anterior segment relative to a real eye.
- Playwright is pinned to the version the cloud image ships (1.63.0) so the e2e suite runs in cloud sessions without a browser download.

## Global Constraints

- Units: millimeters, diopters, degrees in data files and UI; radians internal to math modules. Right-handed, z along the optical axis toward the retina, x temporal for the right eye, y superior.
- TypeScript `strict: true`, no `any` in `eye-model` or `optics`. These two packages import nothing from the DOM or React. `optics` does not import `eye-model`; `eye-model` imports `optics` as a type-only dependency.
- Every numeric constant lives in `data/` with a citation; code never hard-codes a physiological value. A test fails if the default UI preset has `verified: false` at release (Milestone 6 gate; not enforced yet).
- All optics computation runs in a web worker; the main thread never blocks more than 16 ms per frame.
- `EyeParameters.schemaVersion` is `"1.0.0"`; readers reject an unknown major version with a clear error.
- Approximations are labeled "approximation" in the UI tooltip of the affected readout.
- Full gate before every commit: `(cd web && pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build) && (cd science && uv run ruff check . && uv run pytest)`.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

Failure modes from the master plan that this milestone owns, each tied to the task that tests it:

1. Target at infinity or zero distance: `Infinity` → 0 D demand; `0` clamps to 0.05 m, never NaN. → Task 1.5.
2. Age outside 6 to 90: amplitude clamps to the age-6 value below 6 and to 0 above 90; never negative or NaN. → Task 1.3.
3. Rays that miss an aperture or undergo total internal reflection are flagged `vignetted` with the surface name and excluded from the defocus spot. → Task 1.7, 1.8.
4. Schema version mismatch: `deriveEyeState` on a `"2.0.0"` document throws `SchemaVersionError`; the viewer shows the message in a banner. → Task 1.9, 1.11.
5. Surface defaults: `conic`, `tilt`, `decenter` absent in a document must be treated as zero by the builder. → Task 1.9.
6. Hand-written `types.ts` drifting from the schema: a test checks every schema property appears in the fixture-typed object and vice versa. → Task 1.9.

## File structure

```
data/schematic-eyes/navarro-1985.json           transcribed regression fixture (Task 1.1)
data/schematic-eyes/zapata-diaz-2019.json       stub, transcribed:false (Task 1.1)
data/schematic-eyes/README.md                   table format and provenance rules
data/accommodation/anderson-2008-amplitude.json (Task 1.3)
data/accommodation/lag-default.json             assumption, verified:false (Task 1.5)
web/packages/optics/src/
  math/vec3.ts                 Vec3 + ops
  surfaces/types.ts            Surface, Medium
  surfaces/conic.ts            sag, normalAt, intersect
  surfaces/sequential.ts       surfacesFromSequential(thickness list) → Surface[] with vertexZMm
  paraxial/abcd.ts             paraxialPower
  trace/ray.ts                 Ray, TraceHit, TraceResult
  trace/refract.ts             vector Snell
  trace/sequential.ts          traceRay
  trace/bundle.ts              collimatedBundle, pointSourceBundle
  metrics/defocus.ts           retinalDefocusD
web/packages/eye-model/src/
  presets/load.ts              loadPreset, PresetNotTranscribedError
  accommodation/amplitude.ts   amplitudeForAge
  accommodation/lens.ts        lensGeometry
  accommodation/controller.ts  demandFromDistance, accommodationResponse, defaultLag
  state/types.ts               SceneState, EyeState
  state/derive.ts              deriveEyeState, SchemaVersionError
  build/surfaces.ts            buildSurfaces
web/apps/viewer/src/
  worker/messages.ts, optics.worker.ts, client.ts
  store/scene.ts
  scene/Stage.tsx, EyeCutaway.tsx, RayFan.tsx
  ui/Inspector.tsx, Readout.tsx
  theme.css
web/apps/viewer/e2e/slice.spec.ts, playwright.config.ts
```

---

### Task 1.1: Transcribe the schematic eye tables and the preset loader

**Files:**
- Create: `data/schematic-eyes/navarro-1985.json`, `data/schematic-eyes/zapata-diaz-2019.json`, `data/schematic-eyes/README.md`
- Modify: `data/fixtures/emmetrope-right.eye.json` (cornea index 1.376, provenance note), spec §5.6, `docs/literature/README.md` (DOIs), `docs/superpowers/plans/2026-10-26-m0-followups.md`
- Create: `web/packages/eye-model/src/presets/load.ts`, `web/packages/eye-model/test/presets.test.ts`

**Interfaces:**
- Consumes: `validateEyeParameters`.
- Produces:
  ```ts
  type PresetName = "navarro-1985" | "zapata-diaz-2019";
  interface SchematicEyeTable {
    citation: string; doi: string; verified: boolean; verifiedDate?: string;
    transcribed: boolean; wavelengthNm: number; referenceAgeYears: number;
    relaxed: Surface[]; retina: { radiusMm: number; conic: number }; axialLengthMm: number;
    pupil: { model: string; params: Record<string, unknown> };
    accommodation: { form: "navarro1985"; coefficients: Record<string, number>; unverified?: string[] };
  }
  function loadPreset(name: PresetName): EyeParameters;   // throws PresetNotTranscribedError
  class PresetNotTranscribedError extends Error
  const PRESET_NAMES: readonly PresetName[]
  ```
  `lensAccommodationModel` on the returned document is `{ form, coefficients }`.

- [x] Step 1: Write the Navarro table from the confirmed Table 1 and Table 4 excerpts (indices at 589.3 nm). Write the Zapata-Díaz stub. Fix the fixture index.
- [x] Step 2: Failing test: `loadPreset("navarro-1985")` validates, has 4 refracting surfaces, cornea index 1.376; `loadPreset("zapata-diaz-2019")` throws `PresetNotTranscribedError` naming the preset.
- [x] Step 3: Implement `load.ts`; run; PASS.
- [x] Step 4: Spec §5.6 reconciled; literature DOIs filled where confirmed; follow-up lines resolved or moved.
- [x] Step 5: After Task 1.6 passes, set `verified: true` and `verifiedDate` on the Navarro table.
- [x] Step 6: Full gate; commit `feat(eye-model): schematic eye tables and preset loader`.

### Task 1.2: Vector math and conic surfaces

**Files:** create `web/packages/optics/src/math/vec3.ts`, `src/surfaces/types.ts`, `src/surfaces/conic.ts`, `src/surfaces/sequential.ts`, `test/conic.test.ts`; modify `src/index.ts`.

**Interfaces:**
- Produces:
  ```ts
  type Vec3 = readonly [number, number, number];
  add, sub, scale, dot, cross, norm, normalize, distance
  interface Medium { name: string; index555: number }
  interface Surface { name: string; kind: "conic"; radiusMm: number; conic: number;
    apertureSemiDiamMm: number; vertexZMm: number;
    tilt: { xDeg: number; yDeg: number }; decenter: { xMm: number; yMm: number };
    mediumAfter: Medium }
  sag(s: Surface, x: number, y: number): number          // relative to vertex, infinite radius → 0
  normalAt(s, x, y): Vec3                                // unit, pointing toward −z at the vertex
  intersect(s, origin: Vec3, dir: Vec3): { point: Vec3; t: number } | null
  surfacesFromSequential(seq: SequentialSurface[], startZMm = 0): Surface[]
  ```
  Tilt and decenter are carried but, in this milestone, only decenter is applied (tilt must be zero; the function throws otherwise so the limitation is loud).

- [x] Step 1: Failing tests per the master plan (sphere sag, paraboloid sag, vertex normal, axial hit `t`, aperture miss → null, flat surface, decenter shift).
- [x] Step 2: Implement with the closed-form conic quadratic in `t`, choosing the smallest positive root inside the aperture.
- [x] Step 3: PASS; commit `feat(optics): vec3 and conic surface geometry`.

### Task 1.3: Accommodative amplitude from age

**Files:** create `data/accommodation/anderson-2008-amplitude.json`, `web/packages/eye-model/src/accommodation/amplitude.ts`, `test/amplitude.test.ts`.

**Interfaces:** `amplitudeForAge(ageYears: number): number` (D); `AMPLITUDE_TABLE` typed export of the JSON.
Equation (Anderson et al. 2008 abstract): `A = 7.083 / (1 + exp(0.2031·(age − 36.2) − 0.6109))`, clamped: age < 6 uses 6; age > 90 returns 0.

- [x] Step 1: Transcribe JSON with citation, equation string, and coefficients.
- [x] Step 2: Failing tests: monotone non-increasing 6→90; `amplitudeForAge(3) === amplitudeForAge(6)`; `amplitudeForAge(95) === 0`; NaN input throws; age 20 ≈ 6.94 and age 50 ≈ 0.71 (hand evaluation) within 0.05 D.
- [x] Step 3: Implement; PASS; commit `feat(eye-model): accommodative amplitude vs age (Anderson 2008)`.

### Task 1.4: Lens geometry as a function of accommodation

**Files:** create `web/packages/eye-model/src/accommodation/lens.ts`, `test/lens.test.ts`.

**Interfaces:**
```ts
interface LensGeometry { anteriorRadiusMm; posteriorRadiusMm; thicknessMm; anteriorConic; posteriorConic; index555; anteriorChamberDepthMm }
lensGeometry(params: EyeParameters, accommodationD: number): LensGeometry
```
Dispatches on `params.lensAccommodationModel.form`; absent model → relaxed geometry at any A (documented, used for raw fixtures). Navarro form: `R_a = R_a0 − 1.75 ln(1+A)`, `R_p = R_p0 + 0.2294 ln(1+A)`, `t = t0 + 0.1 ln(1+A)`, `ACD = ACD0 − 0.05 ln(1+A)`, `n = n0 + 9e-5 (10A + A²)`, `Q_a = Q_a0 − 0.34 ln(1+A)`, `Q_p = Q_p0 − 0.125 ln(1+A)`, every coefficient read from the document's coefficients.

- [x] Step 1: Failing tests: A=0 equals the relaxed table; anterior radius at A=4 equals `10.2 − 1.75·ln 5`; monotone radius decrease and thickness increase; negative A throws.
- [x] Step 2: Implement; PASS; commit `feat(eye-model): accommodation-dependent lens geometry`.

### Task 1.5: Accommodation controller

**Files:** create `data/accommodation/lag-default.json`, `web/packages/eye-model/src/accommodation/controller.ts`, `test/controller.test.ts`.

**Interfaces:**
```ts
MIN_TARGET_DISTANCE_M = 0.05 (from the lag file's `minTargetDistanceM`)
demandFromDistance(targetDistanceM: number, farPointD: number): number
type LagModel = (demandD: number) => number
defaultLag: LagModel   // piecewise-linear: 0 below onsetD, slope·(demand − onsetD) above
accommodationResponse(demandD: number, amplitudeD: number, lag: LagModel = defaultLag): number
```

- [x] Step 1: Failing tests from the master plan plus `demandFromDistance(-1, 0)` throws.
- [x] Step 2: Implement; PASS; commit `feat(eye-model): accommodation demand and response controller`.

### Task 1.6: Paraxial power and the optics acceptance fixture

**Files:** create `web/packages/optics/src/paraxial/abcd.ts`, `test/paraxial.test.ts`, `test/helpers/navarro.ts` (reads `data/schematic-eyes/navarro-1985.json` directly).

**Interfaces:** `paraxialPower(surfaces: Surface[], indexBefore = 1): { powerD; backFocalLengthMm; farPointD; imageZMm }` — `imageZMm` is the absolute z where a collimated paraxial ray crosses the axis; `farPointD` is the object vergence (D) that images onto the retina surface when a surface named `retina` is present, else `NaN`.

- [x] Step 1: Failing tests: Navarro power within 0.05 D of 60.416 and image within 0.05 mm of the retina vertex; thin-lens check; `farPointD` within 0.05 D of 0 for the fixture.
- [x] Step 2: Implement; PASS. Mark the Navarro table verified (Task 1.1 Step 5). Commit `feat(optics): paraxial ABCD power with Navarro fixture`.

### Task 1.7: Sequential exact ray trace

**Files:** create `web/packages/optics/src/trace/ray.ts`, `src/trace/refract.ts`, `src/trace/sequential.ts`, `src/trace/bundle.ts`, `test/trace.test.ts`.

**Interfaces:** as in the master plan. `traceRay` stops at the first vignetting surface and records `vignettedAt`; a surface whose `mediumAfter.index555` equals the incoming index (the retina) is hit without refraction.

- [x] Step 1: Failing tests per the master plan.
- [x] Step 2: Implement; PASS; commit `feat(optics): exact sequential ray tracing with vignetting`.

### Task 1.8: Retinal defocus metric

**Files:** create `web/packages/optics/src/metrics/defocus.ts`, `test/defocus.test.ts`.

**Interfaces:** `retinalDefocusD(surfaces: Surface[], objectDistanceM: number, pupilSemiDiamMm: number, opts?: { gridN?: number }): { defocusD; bestFocusZMm; retinaZMm; rmsSpotMm }` (best focus in closed form, no search window; defocus as an exact object-vergence difference, review fix); throws `InsufficientRaysError` below 60% unvignetted rays.

- [x] Step 1: Failing tests per the master plan; the A=2 case builds the accommodated Navarro surfaces by applying the Table 4 equations inside the test.
- [x] Step 2: Closed-form best-RMS focus (the minimum of the RMS spot radius along z, no search); PASS; commit `feat(optics): retinal defocus metric`.

### Task 1.9: Build optics surfaces from EyeParameters and EyeState

**Files:** create `web/packages/eye-model/src/state/types.ts`, `src/state/derive.ts`, `src/build/surfaces.ts`, `test/derive.test.ts`, `test/build.test.ts`, `test/types-drift.test.ts`; modify `web/packages/eye-model/package.json` (add `@eye/optics` dependency), `src/index.ts`.

**Interfaces:**
```ts
interface SceneState { targetDistanceM; targetDirectionDeg: {x,y}; luminanceCdM2; ageYears; ipdMm; timeS; preset: PresetName }
interface EyeState { accommodationD; demandD; amplitudeD; pupilMm; gaze: [x,y,z,w]; ciliaryActivation; lensParameterA; eomActivation: number[]; eomLengthMm: number[] }
deriveEyeState(scene: SceneState, params: EyeParameters, side: "left"|"right", farPointD = 0, farPointOf?: (s: Surface[]) => number): EyeState   // throws SchemaVersionError; farPointOf solves lensParameterA (review fix)
buildSurfaces(params: EyeParameters, state: EyeState): Surface[]   // last surface named "retina", at axialLengthMm; lens from state.lensParameterA
```
Pupil fixed at the document's `pupil.params.diameterMm` (fixed model) else 4 mm from `data/accommodation/lag-default.json`? No: pupil default lives in the preset table; `deriveEyeState` reads `params.pupil` and throws for unknown models.

- [x] Step 1: Failing tests per the master plan plus defaults (missing conic/tilt/decenter → 0) and the type-drift guard.
- [x] Step 2: Implement; PASS; commit `feat(eye-model): scene→eye state derivation and surface builder`.

### Task 1.10: Optics web worker and typed client

**Files:** create `web/apps/viewer/src/worker/messages.ts`, `optics.worker.ts`, `client.ts`, `test/worker.test.ts`; modify `web/apps/viewer/tsconfig.json` (split node types out of `src/`), `package.json`.

**Interfaces:** `OpticsRequest { id; surfaces; objectDistanceM; pupilSemiDiamMm; fanRays }`, `OpticsResponse { id; defocusD; bestFocusZMm; fan: Vec3[][] }`, `handle(req): OpticsResponse`, `OpticsClient.request(req): Promise<OpticsResponse>` resolving only the latest id.

- [x] Step 1: Failing test: 11 polylines, each with one vertex per surface plus the start point.
- [x] Step 2: Implement; PASS; commit `feat(viewer): optics web worker`.

### Task 1.11: Store, cutaway stage, ray fan, inspector, readout, e2e

**Files:** create `web/apps/viewer/src/store/scene.ts`, `src/scene/Stage.tsx`, `src/scene/EyeCutaway.tsx`, `src/scene/RayFan.tsx`, `src/ui/Inspector.tsx`, `src/ui/Readout.tsx`, `src/theme.css`, `e2e/slice.spec.ts`, `playwright.config.ts`; modify `src/App.tsx`, `src/main.tsx`, `vite.config.ts` (`server.fs.allow` for `data/` and `schemas/`), `package.json` (`e2e` script).

- [x] Step 1: Write the Playwright spec per the master plan (data-testids `defocus`, `accommodation`, `target-distance`, `age`).
- [x] Step 2: Store with debounced worker requests; derived state recomputed synchronously on the main thread (cheap).
- [x] Step 3: Stage, cutaway (lathe meshes clipped by a sagittal plane), ray fan, inspector, readout, theme tokens.
- [x] Step 4: `pnpm --filter @eye/viewer e2e` passes locally; build passes.
- [x] Step 5: Commit `feat(viewer): vertical slice — cutaway eye, target slider, accommodation, ray fan, defocus`; open the PR.
