# Milestone 6: Polish, scenarios, performance

Date: 2026-10-30
Status: in progress (draft PR "Milestone 6: Polish, scenarios, performance")
Master plan: `docs/superpowers/plans/2026-10-26-master-plan.md` (Milestone 6 section and "Verification (end to end)")

**Goal:** The viewer becomes the reproducibility tool the spec describes: Scenario documents (scene, both EyeParameters, prescription, timeline keyframes) load, play, export as JSON plus a PNG of the stage, and round-trip; four scenarios ship under `data/scenarios/`. The stage gains clinical camera snaps, a movable cutaway plane, a hover readout with defining parameters for every named structure, pinned readouts, insertion and pulley markers, and keyboard shortcuts. A design pass puts the stage, inspector, and charts on one token system with dark and light themes and verified contrast. Performance budgets (worker round-trip under 100 ms at 64×64/256, stage at 55 fps or better while dragging the target) are measured and enforced in tests. Every follow-up filed for M6 is closed here or re-filed with the reason it could not be closed; the hypothesis stays a hypothesis (spec §1.2).

**Architecture:** No new package. `eye-model` gains `schema/scenario.ts` (types and Ajv validation of `schemas/scenario.schema.json`, which `$ref`s the EyeParameters schema). The viewer gains `src/scenario/` (pure serialize, parse, keyframe interpolation; the export helpers that touch the DOM live in `src/scenario/export.ts`), `src/scene/views.ts` (camera snaps), `src/scene/cut.ts` (cutaway plane from orientation and depth), `src/ui/hoverInfo.ts` (per-structure readout rows), `src/ui/shortcuts.ts` (key map), and `src/ui/Pins.tsx`. The worker takes over preset solving and the refraction decomposition (new request kinds in `worker/messages.ts`). Python validates scenarios (`eyebiomech/schema.py`, schema copy under `eyebiomech/schemas/`). The science follow-ups change `science/eyebiomech/{forces,fem,remodel,calib,predict}` and regenerate committed results only where a model change requires it.

**Tech Stack:** TypeScript strict, React 19, Zustand, three + react-three-fiber + drei (unchanged versions), Vitest, Playwright, ajv. Python 3.12, uv, NumPy, SciPy, scikit-fem, jsonschema, pytest, ruff.

**Spec:** `docs/superpowers/specs/2026-10-26-eye-simulation-design.md` §6 (all of the viewer: §6.2 stage, hover, pins, camera; §6.5 scenarios and export; §6.6 visual design and performance targets), §3.2 (schema versioning), §5.6 and §9 (tests), §7 and §8 (for the science follow-ups), §11 (WebGL FFT decided by measured latency), §12.

## Deviations from the master plan (decided at planning time)

1. **Literature still from excerpts.** The session's network policy denies the literature hosts again (checked 2026-10-30 with curl: pmc.ncbi.nlm.nih.gov, doi.org, europepmc.org, www.ebi.ac.uk all fail to connect). Task 6.0 makes one more attempt per data follow-up through web search excerpts; anything that cannot be transcribed from a primary source stays `verified: false` and is re-filed with the hosts tried. Consequently the release gate of master plan Verification 5 ("default-preset entries all have `verified: true`") cannot pass in this milestone: Task 6.9 adds the gate as a test with an explicit, documented allowlist of the currently unverified default-preset files (the test fails on any new unverified default and on any allowlisted file that has become verified, so the list only shrinks), and the PR body asks the owner to accept the release with that list or to transcribe the sources locally.
2. **No frontend-design skill in cloud sessions.** The master plan's Task 6.3 names the frontend-design skill; only the dataviz skill is available here. The design pass (Task 6.7) follows spec §6.6 directly and the dataviz skill for every chart, and verifies the outcome with tests (token contrast, single hot color) and Playwright screenshots in both themes attached to the PR.
3. **Frame-rate budget measured against a baseline.** CI runs headless Chromium with software WebGL, where an empty three.js canvas may itself not reach 60 fps. `e2e/perf.spec.ts` therefore measures the frame intervals of an empty `<Canvas>` page (`?perf=baseline`) and of the app while dragging the target for 5 s, and asserts the app's median frame rate is at least 55 fps **or** at least 90% of the baseline when the baseline is under 61 fps, and in both cases that no main-thread task exceeds 50 ms (the Long Tasks API granularity; the 16 ms budget is checked on the store-update path in a Vitest benchmark instead). The measured numbers go into the PR body.
4. **WebGL FFT only if the worker budget fails.** Spec §11 leaves it to measurement. Task 6.8 first stabilizes the worker benchmark (M4 follow-up: 50–140 ms per run in the cloud container) by removing the variance sources it can find (allocation in the FFT loop, cache misses across pupils); `image/fftGpu.ts` is written only if the median still exceeds 100 ms on CI, because a GPU FFT in a worker needs OffscreenCanvas and a fallback path, which is a large surface for no measured gain.
5. **Science model follow-ups are bounded.** The M5 model follow-ups (elastic orbit, mesh convergence, a growth law the FEM can integrate beyond r·t = 0.01, a longer calibration) are research tasks. Task 6.6 does them in order of how much they change the answer, each with an explicit stop rule; whichever cannot be completed within the milestone is re-filed with what was tried and measured, and the PR body states which form of the hypothesis remains untested. Committed results (library, posterior, grid) are regenerated only once, at the end of Task 6.6, from a clean tree.
6. **Scenario playback uses the transport's seconds.** Spec §6.5 scenarios "with a timeline" are keyframed over the transport's time axis (seconds). "Presbyopia 20→60" sweeps age over 12 s of playback; age is a subject parameter, so the keyframe sets `ageYears` and the eye is re-derived each frame (no growth model involved), which the scenario's description says.

## Global Constraints

- Units: millimeters, diopters, degrees in data files and UI; radians internal to math modules. Right-handed, z along the optical axis toward the retina, x temporal for the right eye, y superior. Scenario keyframe times in seconds.
- TypeScript `strict: true`, no `any` in `eye-model` or `optics`. These two packages import nothing from the DOM or React. `optics` does not import `eye-model`; `eye-model` does not import `optics` (the scenario prescription type is structural).
- Every numeric constant lives in `data/` with a citation; code never hard-codes a physiological value. UI constants (camera distances, key bindings, animation durations, colors) and numerical choices (tolerances, sample counts) are named constants with a comment saying what they are.
- All optics computation in the viewer runs in a web worker; the main thread never blocks more than 16 ms per frame. After Task 6.3 preset solving, prescription application, and the refraction decomposition run in the worker; the per-frame lens-parameter lookup that `deriveBinocular` does with `farPointOf` stays on the main thread only while the Task 6.8 benchmark keeps the store's update path under 16 ms (if it does not, it moves to the worker as well).
- `EyeParameters.schemaVersion` and `Scenario.schemaVersion` are `"1.0.0"`; any reader rejects an unknown major version with a clear error naming the version.
- Python 3.12; runtime dependencies stay NumPy, SciPy, scikit-fem, jsonschema.
- Every biomechanics result stays labeled "elastic" or "remodeled". Approximations are labeled "Approximation:" in the tooltip of the affected readout (length-proxy activation, fixed pulleys, homogeneous lens index, paraxial readouts ignoring tilt and decenter, TCA omitted if it is, keyframe age sweep without growth).
- Muscle activation remains the only hot color in the palette (spec §6.2), in both themes.
- Full gate before every commit: `(cd web && pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build && pnpm --filter @eye/viewer e2e) && (cd science && uv run ruff check . && uv run pytest -m "not slow")`. Run `uv run pytest -m slow` before committing a task that adds or changes slow tests.
- Commit messages end with `Co-Authored-By: Claude <model name> <noreply@anthropic.com>` naming the model that wrote them. One task per commit; push after every commit. Never edit `.github/` (driver hard rule 1).

## Review Focus

1. **Scenario version and reference errors.** A scenario with `schemaVersion: "2.0.0"`, with a malformed embedded EyeParameters, or naming a result id the catalog lacks is rejected with a message that names the version, the offending key path, or the id; nothing in the store changes. → Task 6.1.
2. **Round-trip fidelity.** `parseScenario(serializeScenario(state))` reproduces the scene, both eyes, the prescription, the corrected flag, and the loaded result id exactly (deep equality), and re-serializing gives byte-identical JSON. → Task 6.1.
3. **Keyframe edges.** `sceneAt` before the first keyframe returns the first, after the last returns the last, a single keyframe is constant, unsorted keyframes are rejected by the parser, and `targetDistanceM: Infinity` is written as `null` in JSON and interpolated in diopters (1/d), never producing NaN. → Task 6.1.
4. **Worker failure isolation.** A wave-optics error in one eye returns `wave: null` with a message for that eye and keeps the other eye's results; the UI shows the message in the strip. → Task 6.3.
5. **Main-thread budget.** After moving preset solving and the decomposition to the worker, a Vitest benchmark of the store's `setRefractivePreset` and `setAge` paths stays under 16 ms. → Task 6.3, Task 6.8.
6. **Theme contrast.** Every text/background token pair in both themes meets WCAG AA (4.5:1 for body text, 3:1 for large text and chart marks against the plot background), checked by a test that parses `theme.css`. → Task 6.7.

## File structure

```
schemas/scenario.schema.json                 finalized (Task 6.1)
science/eyebiomech/schemas/scenario.schema.json  byte-identical copy (packaging test)
data/scenarios/
  near-to-far-refocus.json
  presbyopia-20-to-60.json
  astigmat-corrected-vs-uncorrected.json
  fem-result-loaded.json
  README.md                                  what each scenario shows and how it was made
web/packages/eye-model/src/schema/scenario.ts  Scenario types, validateScenario
web/packages/eye-model/test/scenario-schema.test.ts
web/apps/viewer/src/scenario/
  scenario.ts                                serializeScenario, parseScenario, sceneAt (pure)
  catalog.ts                                 the four bundled scenarios (import.meta.glob)
  export.ts                                  downloadJson, stagePng (DOM)
web/apps/viewer/src/ui/Scenarios.tsx         inspector panel: load, play, import, export
web/apps/viewer/src/scene/views.ts           camera snaps
web/apps/viewer/src/scene/cut.ts             cutaway plane from orientation and depth
web/apps/viewer/src/scene/Markers.tsx        insertion and pulley markers
web/apps/viewer/src/ui/hoverInfo.ts          readout rows per structure (pure)
web/apps/viewer/src/ui/shortcuts.ts          key map (pure) and useShortcuts hook
web/apps/viewer/src/ui/Pins.tsx              pinned readouts
web/apps/viewer/e2e/scenarios.spec.ts, e2e/stage-controls.spec.ts, e2e/perf.spec.ts, e2e/themes.spec.ts
web/apps/viewer/test/scenario.test.ts, test/views.test.ts, test/cut.test.ts, test/hoverInfo.test.ts,
  test/shortcuts.test.ts, test/contrast.test.ts, test/main-thread-bench.test.ts
web/packages/eye-model/test/release-gate.test.ts (Task 6.9)
```

---

### Task 6.0: Literature transcription attempt and re-files

Absorbs the M5 "Data and provenance" follow-ups and the owner's inflation-curve item.

**Files:** `data/schematic-eyes/zapata-diaz-2019.json`, `data/schematic-eyes/navarro-1985.json`, `data/eom/geometry-default.json`, `data/eom/forces.json`, `data/visual-axis/defaults.json`, `data/eyelid/shaw-2010.json`, `data/synteyes/rozema-2016-params.json`, `data/acuity/watson-ahumada-2008.json`, `docs/literature/README.md`, a new `docs/superpowers/plans/2026-10-30-m6-followups.md`.

**Interfaces:** Consumes the existing data-file shapes (`citation`, `verified`, `verifiedDate`, `transcribed`). Produces no new interface; any value changed keeps its file's shape so the existing loaders and tests apply.

- [x] Re-check the hosts with curl (pmc.ncbi.nlm.nih.gov, doi.org, europepmc.org, digital.csic.es, iovs.arvojournals.org, opg.optica.org, jov.arvojournals.org) and record the outcome in the plan's Outcome notes.
- [x] For each item, one web search (standard, then extended if thin) for the specific numbers: Zapata-Díaz 2019 Table 1 (then set `transcribed: true` and switch `DEFAULT_PRESET` in `store/scene.ts` to it only if every surface is transcribed; write the failing preset-fixture test first); Navarro 1985 Table 4 conic coefficients (−0.34, −0.125 per ln(1+A)); Volkmann 1869 rectus and oblique origins and oblique insertions; Clark, Miller & Demer 2000 pulley coordinates (then tighten the `path.test.ts` tolerance); SR/IR tendon lengths and IO insertion width (BCSC table); Polans 2015 angle alpha, lens tilt, decentration; Shaw 2010 lower-lid pressure and band; oblique force capacities and vertical-recti ratios; the SyntEyes mixture (Rozema 2016 and supplement; then re-run the calibration in Task 6.6); Watson & Ahumada 2008 acuity metric (then replace the stand-in in Task 6.6); published corneal apex-rise against IOP points (Elsheikh 2007/2010) for the 15% inflation check.
- [x] Transcribe only what an excerpt states with its source named, `verified: false` unless the primary document was read; never fill a value by inference.
- [x] Re-file every item that could not be closed in `2026-10-30-m6-followups.md` under "Data and provenance (needs a session with document access)" with the hosts tried and the date; the inflation check stays an owner question, asked again in the PR body.
- [x] Full gate; commit `docs(data): M6 literature attempt and re-files`; push.

### Task 6.1: Scenarios and export

Absorbs M0 follow-up "scenario schema `$ref` compile test (TS Ajv2020, Python `referencing.Registry`)".

**Files:** `schemas/scenario.schema.json`, `science/eyebiomech/schemas/scenario.schema.json`, `science/eyebiomech/schema.py`, `science/tests/test_scenario_schema.py`, `web/packages/eye-model/src/schema/scenario.ts`, `web/packages/eye-model/src/index.ts`, `web/packages/eye-model/test/scenario-schema.test.ts`, `data/scenarios/*.json`, `data/scenarios/README.md`, `web/apps/viewer/src/scenario/{scenario,catalog,export}.ts`, `web/apps/viewer/src/ui/Scenarios.tsx`, `web/apps/viewer/src/ui/Inspector.tsx`, `web/apps/viewer/src/store/scene.ts`, `web/apps/viewer/test/scenario.test.ts`, `web/apps/viewer/e2e/scenarios.spec.ts`.

**Interfaces:**

Consumes: `EyeParameters`, `validateEyeParameters` (`eye-model`), `SceneState`, `PresetName`, the results catalog (`src/results/catalog.ts`, entry `id`), `ClinicalLens` (`optics`, structurally), `SceneStore`.

Produces (`eye-model/src/schema/scenario.ts`):

```ts
export interface ScenarioLens { sphereD: number; cylinderD: number; axisDeg: number; vertexMm: number; baseCurveD: number; index: number; centerThicknessMm: number }
export interface ScenarioScene {
  /** meters; null in JSON means a target at infinity */
  targetDistanceM: number | null;
  targetDirectionDeg: { x: number; y: number };
  luminanceCdM2: number; ageYears: number; ipdMm: number; preset: string;
}
export interface ScenarioKeyframe {
  timeS: number;
  scene?: Partial<Pick<ScenarioScene, "targetDistanceM" | "targetDirectionDeg" | "luminanceCdM2" | "ageYears">>;
  corrected?: boolean;
}
export interface Scenario {
  schemaVersion: string; name: string; description: string;
  scene: ScenarioScene;
  eyes: { left: EyeParameters; right: EyeParameters };
  prescription: { left: ScenarioLens; right: ScenarioLens } | null;
  corrected: boolean;
  result: { id: string } | null;
  timeline: ScenarioKeyframe[];
}
export type ScenarioValidation = { ok: true; value: Scenario } | { ok: false; kind: "version" | "schema"; errors: string[] };
export function validateScenario(doc: unknown): ScenarioValidation;
```

Produces (`viewer/src/scenario/scenario.ts`):

```ts
export class ScenarioError extends Error {}
export function serializeScenario(s: Pick<SceneStore, "scene" | "eyes" | "spectacles" | "corrected" | "loadedResult">, meta: { name: string; description: string; timeline?: ScenarioKeyframe[] }): Scenario;
export function scenarioJson(sc: Scenario): string;            // stable key order, 2-space indent, trailing newline
export function parseScenario(text: string, resultIds: readonly string[]): Scenario; // throws ScenarioError
export function sceneAt(sc: Scenario, timeS: number): { scene: ScenarioScene; corrected: boolean };
export function toSceneState(s: ScenarioScene, timeS: number): SceneState; // null distance -> Infinity
```

Store additions: `scenario: { doc: Scenario; startS: number } | null`, `loadScenario(doc: Scenario, result?: ResultEntry): Promise<void>` (applies scene, eyes, prescription, corrected, then loads the result's catalog entry if the scenario names one; refuses with `loadError` naming the id when the entry is missing), `restartScenario(): void`, `clearScenario(): void`, `scenarioInput(): ScenarioInput` (a loaded result's right eye is exported as the eye before the result, so re-importing does not stack it); `tick` applies the fields some keyframe sets (`animatedKeys`) from `sceneAt(doc, dynamics.timeS - startS)` while a scenario is loaded. Also `animatedKeys(sc)` and `scenarioDurationS(sc)` in `scenario.ts`, and `fileStem(name)` and `downloadBlob` in `export.ts`.

Produces (`viewer/src/scenario/export.ts`): `downloadText(name: string, text: string, mime: string): void`, `stagePng(canvas: HTMLCanvasElement): Promise<Blob>` (`canvas.toBlob`; the `<Canvas>` gets `gl={{ preserveDrawingBuffer: true }}` so the buffer is readable).

- [x] Write the failing tests: `scenario-schema.test.ts` compiles the scenario schema with Ajv2020 with the EyeParameters schema added by `$id` (the M0 follow-up), accepts a minimal valid document, rejects `schemaVersion: "2.0.0"` with `kind: "version"` and a message naming it, rejects an extra key and a bad embedded eye with errors naming the key path (`/eyes/left/...`); `science/tests/test_scenario_schema.py` validates every `data/scenarios/*.json` through `referencing.Registry` and rejects the same bad cases; `scenario.test.ts` covers Review Focus 2 and 3 (round trip, byte-identical re-serialization, keyframe clamping, unsorted keyframes rejected, Infinity ↔ null interpolated in diopters, unknown result id rejected with the id in the message).
- [x] Run them to see them fail.
- [x] Finalize `schemas/scenario.schema.json` (2020-12, `additionalProperties: false` at every level, `scene` and `timeline` fully specified, `prescription` nullable, `result` nullable) and copy it byte-identically into `science/eyebiomech/schemas/`; add `validate_scenario` to `schema.py` with the registry holding the EyeParameters schema.
- [x] Implement `schema/scenario.ts` and export it; implement `scenario.ts`, `catalog.ts`, `export.ts`, the store additions, and `Scenarios.tsx` (list of bundled scenarios with description, Load, Play from start, Import file, Export JSON, Export PNG; errors shown inline with `role="alert"`).
- [x] Write the four scenarios with a small script run once in Vitest (`test/scenario.test.ts` "bundled scenarios" checks each parses and plays): `near-to-far-refocus` (target 0.33 m → 6 m → 0.33 m over 6 s, emmetrope age 25), `presbyopia-20-to-60` (age 20 → 60 over 12 s at 0.4 m; description states it re-derives the eye per age without growth), `astigmat-corrected-vs-uncorrected` (astigmat preset with its auto prescription, corrected toggled every 3 s), `fem-result-loaded` (the committed elastic result's id, heat map on); `data/scenarios/README.md` describes them.
- [x] Playwright `scenarios.spec.ts`: loading each scenario changes the readout as expected (refocus: accommodation rises then falls; presbyopia: amplitude falls with age; astigmat: cylinder readout differs corrected vs uncorrected; FEM: deformation legend visible); export JSON and re-import yields the same readouts; the PNG download is a non-empty `image/png`.
- [x] Run the tests to see them pass; full gate; delete the M0 scenario-schema follow-up line; commit `feat(viewer): scenarios, import/export`; push.

### Task 6.2: Camera, cutaway plane, hover, pins, shortcuts

Absorbs M2 follow-ups (readout pinning, insertion markers; `updateWorldMatrix` before copying the cut plane) and the M4 follow-up (deformation heat map hides the cutaway).

**Files:** `src/scene/{views,cut}.ts`, `src/scene/{Stage,EyeCutaway,Globe,Muscle,DeformationMap,Markers}.tsx`, `src/ui/{hoverInfo,shortcuts}.ts`, `src/ui/{Pins,Inspector}.tsx`, `src/store/scene.ts`, `test/{views,cut,hoverInfo,shortcuts,store}.test.ts`, `e2e/stage-controls.spec.ts`.

**Interfaces:**

```ts
// views.ts
export type ViewName = "anterior" | "lateral" | "superior" | "sagittal";
export const VIEW_KEYS: Record<"1" | "2" | "3" | "4", ViewName>;
export function cameraFor(view: ViewName, side: Side): { position: [number, number, number]; target: [number, number, number]; up: [number, number, number] };
// cut.ts
export type CutOrientation = "sagittal" | "horizontal" | "frontal";
export interface CutSettings { orientation: CutOrientation; depthMm: number; side: Side }
export function cutPlane(c: CutSettings, axialLengthMm: number): Plane;   // in the eye's own frame; depth clamped to ±axialLength/2
// hoverInfo.ts
export type StructureKey = "cornea" | "aqueous" | "iris" | "lens" | "zonules" | "ciliary" | "vitreous" | "retina" | "sclera" | "opticNerve" | "orbit" | "annulus";
export type HoverTarget = { kind: "structure"; key: StructureKey; side: Side } | { kind: "muscle"; side: Side; index: number } | { kind: "marker"; side: Side; index: number; marker: "insertion" | "pulley" };
export interface HoverInfo { title: string; rows: { label: string; value: string }[]; tooltip: string }
export function hoverInfo(t: HoverTarget, eye: EyeParameters, state: EyeState): HoverInfo;
// shortcuts.ts
export type ShortcutAction = { kind: "view"; view: ViewName } | { kind: "togglePlay" } | { kind: "unpinAll" };
export function shortcutAction(e: { key: string; targetTag: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): ShortcutAction | null; // null inside inputs
```

Store: `Hover` becomes `HoverTarget`; adds `view: ViewName | null`, `setView(v)`, `cut: CutSettings`, `setCut(c: Partial<CutSettings>)`, `pinned: HoverTarget[]` (max 4, deduplicated), `setPinned(t: HoverTarget, on: boolean)`.

- [x] Write the failing tests: `views.test.ts` (each view looks at the eye center, the anterior view looks along +z of the head, lateral along x from the temporal side of `side`, superior from +y, sagittal looks perpendicular to the cut plane; `up` is unit and orthogonal to the view direction); `cut.test.ts` (normal per orientation, depth clamps, plane passes through the depth point); `hoverInfo.test.ts` (every `StructureKey` yields a title and at least two rows with units, values taken from the given EyeParameters — e.g. cornea radius and thickness, lens thicknesses at the current accommodation — and the lens tooltip carries "Approximation: homogeneous lens index", muscle rows carry length, change, activation, and the length-proxy approximation); `shortcuts.test.ts` (1–4, space, Escape; nothing inside `INPUT`/`TEXTAREA`/`SELECT` or with modifiers); store tests for `setPinned` dedupe and cap.
- [x] Run them to see them fail.
- [x] Implement; the `OrbitControls` animate to `cameraFor(view)` over a named UI duration; Inspector gets a "Stage" panel (view buttons, cut orientation select, depth slider, eye select); every cutaway mesh sets `hovered` on pointer over and toggles a pin on click; `Pins.tsx` renders pinned `HoverInfo` cards; `Markers.tsx` draws insertion (width as an arc) and pulley markers (pulleys only when the data has coordinates; otherwise the tooltip says "fixed pulleys not tabled"); `EyeCutaway` calls `group.current.updateWorldMatrix(true, false)` before copying the plane; `DeformationMap` is clipped by the same cut plane as the cutaway.
- [x] Playwright `stage-controls.spec.ts`: keys 1–4 change the camera (assert `data-view` on the stage), space toggles the transport, hovering the cornea shows its readout, clicking pins it, Escape unpins, the depth slider moves the cut (snapshot of the readout of the plane depth).
- [x] Run to see them pass; full gate; delete the absorbed follow-up lines; commit `feat(viewer): clinical camera views, cutaway control, hover readouts`; push.

### Task 6.3: Worker and optics follow-ups

Absorbs the M3 "Review round 1" items (optotypes from data; TCA; failed aiming marked invalid; per-eye wave errors; near-miosis tooltip; preset solving and decomposition to the worker; aperture-first miss classification), the M3 modeling item (PSF from the raw OPD map, if needed), and the M4 items (accommodation demand against the auto prescription; paraxial readouts ignore tilt and decenter).

**Files:** `web/packages/optics/src/trace/aim.ts`, `web/packages/optics/src/surfaces/geometry.ts`, `web/packages/optics/src/image/{targets,psf}.ts`, `web/apps/viewer/src/worker/{handle,messages,client}.ts`, `web/apps/viewer/src/store/scene.ts`, `web/apps/viewer/src/ui/{Readout,tooltips}.ts(x)`, `web/apps/viewer/src/ui/optics/OpticsStrip.tsx`, tests beside each.

**Interfaces:**

```ts
// optics
export interface AimResult { ray: Ray; converged: boolean }           // aim.ts; unconverged rays are traced but flagged invalid
export type HitClass = "hit" | "aperture" | "miss" | "tir";            // geometry.ts: aperture tested before the Newton domain
export function letterTarget(n: number, arcminPerPixel: number, optotype: { letterArcmin: number; strokes: number }): Float64Array; // targets.ts reads the stroke count from its argument
// worker/messages.ts
export type WorkerRequest = OpticsRequest | { kind: "preset"; id: number; name: string; ageYears: number; base: EyeParameters } | { kind: "decomposition"; id: number; eye: EyeParameters; reference: EyeParameters };
export interface EyeWave { /* existing fields */ } | null;            // plus `waveError: string | null` per eye in the response
```

- [x] Failing tests first, one per item: aim reports `converged: false` and the OPD sampler excludes such rays (inject a surface where aiming fails); a ray outside the aperture but inside the sag domain is classified `"aperture"`, and outside both still `"aperture"` when the aperture is the cause; `targets.ts` and `store/scene.ts` read `data/acuity/optotypes.json` (test: changing the stroke count in a copied object changes the target); a `ChiefRayError` in the right eye yields `wave: null`, `waveError` naming the error, and the left eye intact; the near-miosis tooltip shows `nearMiosisMm(vergenceMA)` and says when the 2 mm floor binds; preset solving and the decomposition return through the worker and the store applies them asynchronously (store test with the in-process handler), and `applyRefractivePreset`, `applyRefraction`, and `decomposeRefraction` are no longer called from `store/scene.ts`; the accommodation demand uses the same refraction measure as the auto prescription (test: wearing the auto lens at a distant target adds less than 0.05 D of accommodation, down from 0.2–0.36 D); the paraxial power, demand, and far-point tooltips carry "Approximation: ignores surface tilt and decenter" when the loaded eye has tilt or decenter.
- [x] TCA: reference every wavelength's OPD to the 555 nm chief-ray image point (test: at 5° angle alpha the polychromatic PSF centroid shifts by the expected order of an arcminute between wavelengths); if that breaks the existing acceptance cases, fall back to stating "TCA omitted" in the PSF tooltip and re-file.
- [x] PSF from the raw OPD: compare the order-8 fit PSF to a raw-OPD PSF for the astigmat preset at 7.5 mm pupil; implement the raw path only if Strehl differs by more than 5% (numerical tolerance), otherwise record the comparison in Outcome notes and close the item.
- [x] Run to see them pass; full gate (bench included); delete the absorbed lines; commit `fix(optics,viewer): worker and readout follow-ups`; push.

### Task 6.4: Biomechanics and timeline viewer follow-ups

Absorbs M4 items (sidecar `id` check; |ΔC| assertion; "no reference" readouts) and the M5 viewer and grid-validator items (reanchor onsets; onset from the displayed median with the 5–95% range; `beforePrediction`/`beforeResult`; label from `thresholds`; stance line and tooltip from the grid document; full-shape validation of the prediction grid in TS and Python).

**Files:** `src/results/load.ts`, `src/ui/{Biomechanics,Timeline,tooltips}.tsx/ts`, `src/data/predictions.ts`, `src/store/scene.ts`, `test/{results,worker,predictions,store}.test.ts`, `web/packages/eye-model/src/schema/predictions.ts`, `web/packages/eye-model/test/predictions-schema.test.ts`, `schemas/predictions.schema.json` (+ package copy), `science/eyebiomech/schema.py`, `science/eyebiomech/predict/grid.py`, `science/tests/test_schema.py`.

**Interfaces:**

```ts
export function onsetFromCurve(ages: readonly number[], median: readonly PowerVector[], thresholds: PredictionGrid["thresholds"]): { refractionAge: number | null; acuityAge: number | null };
export function onsetRange(grid: PredictionGrid, profile: PredictionInputs): { refraction: [number | null, number | null]; acuity: [number | null, number | null] }; // 5–95%
export function thresholdLabel(thresholds: PredictionGrid["thresholds"]): string;  // e.g. "acuity 20/40" from logMAR
```

The grid document gains `summary: { stance: string; finding: string }` (schema minor bump of predictions to 1.1.0, readers accept 1.x); the Timeline renders it instead of hard-coded text.

- [x] Failing tests first: sidecar with a different `id` is rejected with both ids in the message; the committed-result worker test asserts `|ΔC| > 1e-3`; with no sidecar the three Δ readouts all read "no reference"; `reanchor` recomputes onsets from the re-anchored median; the timeline onset equals the displayed curve's crossing and the range is drawn; apply prediction → load result → clear result restores the pre-prediction eyes with `applied` false and no stale state; the label follows a grid with `logMAR` 0.0 ("20/20"); ragged arrays and empty inner arrays fail validation in TS and raise `SchemaError` (not `IndexError`) in Python, and the `axisDeg`/`logMAR` shapes are checked.
- [x] Run to see them fail; implement; run to see them pass.
- [x] Full gate; delete the absorbed lines; commit `fix(viewer): biomechanics and timeline follow-ups`; push.

### Task 6.5: Science hardening follow-ups

Absorbs the M5 review items that need no model change: equilibrium error names the gaze and the CLI exit 2 test; the acuity clip; `Library._interp` at both table edges; axis-class boundaries from data and the double-weighted slope; `dof` excluding envelopes; the library eigen-structure test; the ln s interpolation label.

**Files:** `science/eyebiomech/forces/equilibrium.py`, `science/eyebiomech/fem/loads.py`, `science/eyebiomech/cli.py`, `science/eyebiomech/predict/acuity.py`, `science/eyebiomech/remodel/library.py`, `science/eyebiomech/calib/{forward,fit}.py`, `data/calibration/*.json` (axis-class boundaries), `science/tests/test_{equilibrium,cli,acuity,library,forward,fit}.py`.

**Interfaces:**

```python
class InfeasibleEquilibrium(ValueError): gaze_label: str          # forces/equilibrium.py
class StiffnessOutOfTable(ValueError): ...                         # remodel/library.py
def Library.response(..., stiffness_scale: float, on_edge: Literal["raise", "clamp"] = "raise") -> ...
# grid metadata: "stiffnessClampedFraction": float, "acuityClipD": float
```

- [ ] Failing tests first: an infeasible gaze raises `InfeasibleEquilibrium` whose message names the gaze, and `eyebiomech fem` exits 2 on it; `Library` raises `StiffnessOutOfTable` below 0.5× and above 4× by default and the grid writer clamps with `on_edge="clamp"` while recording the clamped fraction of draws in the grid metadata; the acuity table clip is written to the grid metadata (or the table extended to −10 D if the stand-in's source covers it); `forward.py` reads the axis-class boundaries from the data file; `fit.py` excludes one-sided envelopes from `dof`; the library test asserts one eigenvalue with positive real part whose eigenvector's refraction is mostly in M; the library's docstring and provenance label the ln s interpolation "approximation".
- [ ] State the double-weighted J0 slope in the calibration data file's notes, or merge the two targets if the M5 fit's conclusions do not change (re-run the fast lsq to check).
- [ ] Run to see them pass; full gate; delete the absorbed lines; commit `fix(science): hardening follow-ups`; push.

### Task 6.6: Science model follow-ups (bounded, Deviation 5)

Absorbs the M5 "Model" items, the growth-rate prior item, and the provenance-hash item; consumes any SyntEyes or acuity transcription from Task 6.0.

**Files:** `science/eyebiomech/fem/{loads,solve,mesh}.py`, `science/eyebiomech/remodel/{growth,library}.py`, `science/eyebiomech/calib/{mcmc,fit}.py`, `data/materials/*.json`, `data/remodeling/*.json`, `data/results/**`, `data/results/README.md`, tests beside each.

**Interfaces:** `orbit_foundation(mesh, k_mm: float) -> sparse matrix` (elastic foundation on the posterior hemisphere, stiffness from data with citation or labeled assumption); growth law option `thickness: Literal["none", "isochoric"]`; `grow(..., support: Literal["clamped", "lamina"])`. The library and grid keep their schemas.

Steps in order; each has a stop rule (if it fails, record what was measured and re-file):

- [ ] **Orbit as an elastic foundation.** Failing test: with the foundation, the direct nonlinear solve under the full muscle load agrees with the linear perturbation within 10% (M5 measured +145% J0 per unit from half to full load). Stop rule: if no foundation stiffness in the literature-plausible range achieves it, keep the linear perturbation and re-file.
- [ ] **Mesh convergence.** Integrate the lid bands exactly (or normalize their resultant), refine the cornea locally; failing test (slow): induced J0 changes by less than 5% between the two finest meshes. Stop rule: two refinements beyond `n_face 20`.
- [ ] **Growth law the FEM can integrate.** Add isochoric (or thickness) growth so the spherical mode no longer self-amplifies; failing test: on the enriched basis no stiffness level has a positive-real-part spherical eigenvalue, and the explicit FEM growth on the production mesh with lamina support stays bounded to r·t = 0.1; then set `VALID_RATE_TIME` from the production-mesh comparison. Stop rule: if the FEM still runs away, keep the 0.01 bound and re-file.
- [ ] **Recalibrate** (only if any of the above or the Task 6.0 transcriptions changed the model or data): widen the growth-rate prior if growth is validated longer, fit r = 0 as a nested model and report both, run the chain to at least 50 autocorrelation times from several starting modes, widen or justify the baseline J0 bound.
- [ ] **Regenerate** the library, posterior, and grid once, from a clean tree (provenance `gitHash` without `-dirty`), and update `data/results/README.md` and the grid `summary` (Task 6.4).
- [ ] Run `uv run pytest -m slow` and the full gate; delete the absorbed lines and re-file anything not closed; commit `feat(science): elastic orbit, converged mesh, integrable growth` (or the subset done); push.

### Task 6.7: Design pass

Absorbs the M0 item (manual chunk for `three`).

**Files:** `src/theme.css`, `src/scene/palette.ts`, `src/ui/optics/colormap.ts`, every `src/ui/**/*.tsx` that sets colors or sizes inline, `src/ui/ThemeToggle.tsx`, `vite.config.ts`, `test/contrast.test.ts`, `e2e/themes.spec.ts`.

**Interfaces:** CSS custom properties on `:root` and `:root[data-theme="light"|"dark"]` (`--bg`, `--surface`, `--text`, `--text-muted`, `--accent`, `--hot`, `--chart-1..4`, type scale `--fs-0..5`, spacing `--sp-0..6`); `palette.ts` exports `paletteFor(theme: "light" | "dark")` read by the stage; `setTheme(t)` in the store, persisted in `localStorage` with try/catch.

- [ ] Load the dataviz skill; failing tests: `contrast.test.ts` parses both themes from `theme.css` and checks Review Focus 6; a test that every palette color other than `--hot` and the activation ramp has hue outside the hot range or chroma below a named threshold.
- [ ] Apply the tokens across layout, type scale, spacing; restyle every chart (wavefront map, Zernike bars, PSF, MTF, timeline, deformation legend) per the dataviz skill with shared axis and label styles; add the theme toggle; `manualChunks` splits `three` and the r3f stack.
- [ ] Playwright `themes.spec.ts`: both themes render the stage and the strip without console errors; screenshots saved as test artifacts for the PR.
- [ ] Run to see them pass; full gate; delete the absorbed line; commit `style: design system pass`; push.

### Task 6.8: Performance budgets

Absorbs the M4 item (benchmark variance in the cloud container).

**Files:** `test/bench.test.ts`, `test/main-thread-bench.test.ts`, `e2e/perf.spec.ts`, `src/main.tsx` (`?perf=baseline` route), the optics hot paths the profile names; `web/packages/optics/src/image/fftGpu.ts` only under Deviation 4.

- [ ] Failing tests first: `main-thread-bench.test.ts` (store `setAge`, `setTargetDistance`, `setRefractivePreset` handler paths under 16 ms median of 20); `perf.spec.ts` per Deviation 3.
- [ ] Profile the worker request (`--cpu-prof` on the Vitest bench); remove allocation in the FFT and PSF loops and any per-request recomputation the profile shows; keep the bench at median of 9 with 2 warm-ups.
- [ ] If the CI median still exceeds 100 ms, implement `fftGpu.ts` with a CPU fallback and re-measure.
- [ ] Record measured numbers in the plan's Outcome notes; full gate; delete the absorbed line; commit `perf: verify and enforce budgets`; push.

### Task 6.9: Finish

- [ ] `release-gate.test.ts` per Deviation 1 (allowlist of unverified default-preset files, each with the follow-up line that owns it).
- [ ] Walk master plan "Verification (end to end)" items 1–5 and record each result in Outcome notes (acceptance numbers read from the UI via Playwright where possible).
- [ ] Move every remaining M6 follow-up into `2026-10-30-m6-followups.md`; update the plan Status line.
- [ ] Update the PR body with the summary, the verification run, the owner questions (release with unverified defaults; inflation check), and mark it ready (driver Step 2d).

## Follow-ups absorbed from earlier milestones

Deleted from their files in the commit that adds this plan; each is a step above.

- M0: scenario schema `$ref` compile test (Task 6.1); `three` manual chunk (Task 6.7).
- M2: readout pinning and insertion markers; `updateWorldMatrix` before copying the cut plane (Task 6.2).
- M3: PSF from the raw OPD map if needed; optotypes from data; TCA; failed aiming invalid; per-eye wave errors; near-miosis tooltip; preset solving and decomposition to the worker; aperture-first miss classification (Task 6.3).
- M4: accommodation demand against the auto prescription (Task 6.3); heat map hides the cutaway (Task 6.2); bench variance (Task 6.8); sidecar `id`; |ΔC| assertion; "no reference" readouts (Task 6.4); tilt/decenter tooltips (Task 6.3).
- M5 data and provenance: Zapata-Díaz Table 1 and default preset; Navarro 1985 conic coefficients; Volkmann origins; Clark 2000 pulleys; SR/IR tendon lengths and IO width; Polans 2015; Shaw lower lid; force capacities; SyntEyes mixture; Watson & Ahumada 2008 (Task 6.0, with the model consequences in Task 6.6).
- M5 verification: corneal inflation curve within 15% (owner; Task 6.0 and the PR body).
- M5 model: elastic orbit; mesh convergence; growth in thickness; production-mesh growth validation and nerve-head support; recalibration chain length, baseline bound, multi-start (Task 6.6).
- M5 review rounds 1–3: reanchor onsets; onset from displayed median and range; `beforePrediction`/`beforeResult`; grid validators' full shapes; stance line and tooltip from the grid; threshold label (Task 6.4); equilibrium gaze name and CLI exit 2; acuity clip; `Library._interp` edges (both); axis-class boundaries and double-weighted slope; ln s interpolation label; `dof` envelopes; library eigen-structure test (Task 6.5); grid regenerated from a clean tree; growth-rate prior and nested r = 0 (Task 6.6).

## Outcome notes (post-execution)

(Filled in as tasks complete.)

- **Task 6.1 (scenarios).** The schema now requires `description`, `prescription`, `corrected`, `result`, and `timeline`, and is closed at every level; it is valid JSON Schema 2020-12 in Ajv and jsonschema, with the EyeParameters `$ref` resolved by `addSchema` and by `referencing.Registry` (the M0 follow-up). Both readers also check each embedded eye's major version and keyframe order. The four scenario files are built by a Vitest test from the store (about 13 kB each, mostly the two embedded eyes); the astigmat's auto prescription is −1.75 D cylinder at 90° with +0.03 D sphere (64×64 pupil grid, 6 m target). Playback drives only the fields some keyframe sets, so the user can still move the others.
- **Task 6.2 (stage controls).** `cameraFor` takes the IPD as a third argument (each view looks at its eye's center, which depends on it). The sagittal-section view looks along x from the temporal side, perpendicular to the sagittal cut, and choosing it switches the cut to sagittal; lateral looks the same way from farther out. The cut keeps the nasal, inferior, or posterior part so the section faces the lateral, superior, and anterior cameras; the plane lives in the globe's frame (it turns with the gaze, mirrored in x for the left eye), and the cut eye is now built as a full lathe so any orientation works. `HoverTarget` gained a `heatMap` variant (the heat map's readout needs the loaded result, passed to `hoverInfo` as a context argument). The zonules are drawn as a thin band from the lens equator to the ciliary processes (`zonuleBandMm` in `data/anatomy/globe-cutaway.json`, a drawing value). Pulley markers are drawn only when the document gives coordinates; the default table has none, so only insertion arcs show, and their readout says "Fixed pulleys not tabled". The Stage panel lists every named structure as a button with the same hover and pin behavior as the meshes, which also gives keyboard users and the Playwright test a reliable target (3D picking under software WebGL is not).
- **Task 6.3 (worker and optics follow-ups).** Interfaces as built: `pupilBundle` returns `converged` (per ray) and `chiefConverged` instead of an `AimResult` per ray; `opdMap` treats unaimed rays as invalid and an unaimed chief ray as a `ChiefRayError`. `intersect` classifies a ray with no hit that crosses the vertex plane outside the aperture as an aperture clip, for every surface kind. `snellenE` takes the optotype's stroke grid as a fifth argument (default `OPTOTYPE`, read from `data/acuity/optotypes.json`), and the store's letter size comes from the same file. The worker isolates `ChiefRayError` and `InsufficientRaysError` per eye (`wave: null`, `waveError`), shown in the optics strip with `role="alert"`; other errors still fail the request. Preset solving, the predicted eye, and the decomposition are worker jobs (`{ kind: "job", job: EyesJob }` with `preset`, `predicted`, `decomposition`; `worker/jobs.ts`), applied by the store when they return, newest job wins; the store's setters for them return promises, and unit tests run the jobs in-process. **Demand changed:** the relaxed far point is now the spherical equivalent of the minimum-RMS refraction (the measure auto-prescribe zeroes) of the relaxed eye, with its lens when worn, for a distant object at the current pupil (64 → 32 grid, pupil rounded to 0.05 mm, cached), falling back to the paraxial far point when the wave analysis fails. Wearing the auto-prescription at 6 m or infinity now adds less than 0.05 D of accommodation (it added 0.24 D for the emmetrope at 2.8 mm). The consequence the reviewer should weigh: the paraxially emmetropic schematic eye reads −0.25 D at 3 mm and −0.37 D at 4 mm by this measure (the same number its Refraction readout always showed), so its demand at 6 m is 0 and at 0.33 m about 2.8–2.9 D instead of 3.0 D; the e2e near-demand checks accept 2.60–3.09. The tilt/decenter note sits on the paraxial power, accommodation (paraxial lens solve), and decomposition tooltips; demand's far point is traced exactly and includes tilt, so it does not carry the note. The near-miosis tooltip shows `nearMiosisMm(vergenceMA)` and says when the 2 mm floor binds. TCA: every wavelength's OPD is referenced to the 555 nm chief-ray image point (`referenceImagePoint`); for the Navarro eye at 5° alpha, 3 mm pupil, the 450 and 650 nm PSF centroids separate by 3.17 arcmin against 3.20 arcmin from the chief-ray image points (no acceptance case broke). Raw OPD: for the astigmat preset at 7.5 mm the order-8 fit's Strehl differs from the raw OPD's by 0.05% uncorrected and 0.02% with sphere and cylinder removed (fit residual 5e-5 µm RMS), far below 5%, so the PSF stays on the fit and the item is closed (`test/raw-opd.test.ts` keeps the check).
- **Task 6.0 (literature).** Curl to pmc.ncbi.nlm.nih.gov, doi.org, europepmc.org, www.ebi.ac.uk, digital.csic.es, iovs.arvojournals.org, opg.optica.org, jov.arvojournals.org, and zaguan.unizar.es fails to connect (2026-10-30). One web search per item returned bibliographic records and study designs but none of the needed numbers (Zapata-Díaz Table 1, Navarro 1985 conic coefficients, Volkmann origins, Clark 2000 pulleys, BCSC SR/IR tendon lengths and IO width, Polans 2015 alpha/tilt/decenter, Shaw lower lid, oblique force capacities, the SyntEyes mixture, the Watson & Ahumada metric, Elsheikh apex-rise points). Nothing was transcribed; no data file changed; every item is re-filed in `2026-10-30-m6-followups.md` with the hosts tried. The default preset stays navarro-1985 and the release gate proceeds under Deviation 1. Task 6.6 therefore has no new SyntEyes or acuity data to consume.
- **Task 6.4 (biomechanics and timeline follow-ups).** Interfaces as built: `onsetFromCurve(ages, median, logMAR, thresholds, fromAge?)` takes the plotted median as sphere and cylinder (the drawn lines, straight between the grid's ages) plus the blended median logMAR, not power vectors, and mirrors `eyebiomech.predict.onset` (inclusive cylinder, strict sphere and logMAR, interpolated between ages). `Trajectory` gains `logMAR` and `onsetRange` (the grid's 5–95% draw onsets at the nearest node, drawn as a shaded span; onset ages do not blend because a node without an onset has none to average). `reanchor` recomputes the refraction onset on the re-anchored median from the anchor age on; the grid's logMAR, acuity onset, and draw ranges belong to the unshifted refraction, so a re-anchored trajectory carries none of them and the timeline would say "not available" (the UI still anchors at the grid's baseline age). The acuity label comes from `thresholdLabel(grid.thresholds)`. The stance and the tooltip now read the grid's `summary` (predictions schema 1.1.0, optional, closed; readers accept any 1.x), which `eyebiomech grid` copies from the hand-written `data/results/calibration/summary-v1.json` (new `--summary` option). They agreed on the wording "calibrated to the axis shift (with-the-rule, against-the-rule, and oblique shares by age band) and J0 slope only", which matches the posterior's targets. The committed `predictions/v1.json` was not regenerated (Task 6.6 does that once): only `schemaVersion` became 1.1.0 and `summary` was appended, and every number is byte-identical (a JSON round-trip of the file reproduces it exactly). A test checks that the committed grid's summary equals the summary file. The sidecar `id` check runs for files and for catalog results. Loading a result over an applied prediction now restores the pre-prediction eyes in both eyes, the left one at load time too (before, it kept the mirrored predicted cornea), and clearing the result returns to them. The validators in TS and Python check the shape of every row, `axisDeg` and `logMAR` (when present) included, and name the first bad path (`/sphere/p50/1/1/1 has length 84, expected 85`); an empty inner array is a `SchemaError`. The committed result's induced cylinder passes `|ΔC| > 1e-3`.
