# Milestone 2: Extraocular muscles, gaze, dynamics

Date: 2026-10-27
Status: in progress (draft PR "Milestone 2: Extraocular muscles, gaze, dynamics")
Master plan: `docs/superpowers/plans/2026-10-26-master-plan.md` (Milestone 2 section)

**Goal:** Two eyes track a target with vergence. Six extraocular muscles per eye are drawn as tapered tubes colored by activation. A muscle table lists length, change from primary position, and activation. Saccades, vergence, and accommodation animate under a transport control. The Milestone 1 follow-ups assigned to M2 are closed.

**Architecture:** `eye-model` (pure TS) gains an EOM geometry table and loader, Listing's-law gaze quaternions, binocular vergence geometry, muscle paths over a spherical globe, a length-proxy activation, and a dynamics stepper. `deriveBinocular(scene, {left, right})` fills gaze and muscle fields in each `EyeState`. Every optics computation moves into the worker: the main thread sends each eye's document and dynamic accommodation, and the worker solves the lens parameter, builds surfaces, computes paraxial power and defocus, and traces the fan. The viewer draws two globes in an orbital frame with muscles, a draggable target, the right eye in cutaway with its ray fan, a muscle table, and a transport. Python is untouched except that its gate stays green.

**Tech Stack:** TypeScript strict, Vitest, Vite 8, React 19, Zustand, three + react-three-fiber + drei, Playwright 1.63.0. Python 3.12 with uv (gate only).

**Spec:** `docs/superpowers/specs/2026-10-26-eye-simulation-design.md` §3.2 (extraocularMuscles), §4.2 (time constant), §4.4, §4.5, §6.2, §6.3 (Scene, Subject, Muscles), §9.

## Deviations from the master plan (decided at planning time)

1. **EOM coordinates are partly transcribed, partly labeled assumptions.** The session's network policy again denies every literature host (PMC, IOVS/ARVO, ScienceDirect, arXiv, entokey, oculist.net, publisher mirrors); only search-engine excerpts are reachable. CLAUDE.md forbids transcribing from memory. What excerpts confirmed:
   - Rectus insertion distances from the limbus, BCSC spiral of Tillaux: medial 5.5, inferior 6.5, lateral 6.9, superior 7.7 mm (several excerpts agree). Cadaveric distances (Fuchs 1884) are shorter, but no excerpt gave the numbers, so `alt` stays `null` with a note.
   - Medial rectus: muscle length 40.8 mm, tendon 3.7 mm, insertion width 10.3 mm, arc of contact about 7 mm (StatPearls, "Anatomy, Head and Neck: Eye Medial Rectus Muscles"). Lateral rectus: muscle 40.6 mm, tendon 7–8 mm, width 9.2 mm, arc of contact 10–12 mm (Entokey, "Surgical anatomy for strabismus surgery").
   - A common rectus origin at the annulus of Zinn 15 mm nasal and 32 mm posterior to the right globe center, as used by Trujillo Suárez, *Scientia et Technica* 23(4):606–612, 2018 (doi 10.22517/23447214.18331), with a 12 mm globe radius. Volkmann's medial rectus row (Eggers, Duane's Foundations vol. 1 ch. 31, Table 2: origin −17, −31.29, +0.6; insertion −9.65, +7.55, 0 in x lateral, y anterior, z superior) is stored as `alt` for the medial rectus only.
   - The superior oblique tendon leaves the trochlea at about 51° to the visual axis (Filip, Stanev & Moustakas, arXiv 1807.07332, 2018, describing the trochlear reflection).

   Everything else is an assumption with `verified: false` and a note saying what replaces it: oblique insertions, the trochlea and inferior-oblique origin, the remaining insertion widths, all tendon stiffness values, and rectus pulleys. Pulleys are `null` in v1, so the path is the classical shortest path from origin over the sphere to insertion. The spec allows this ("simplified to fixed pulleys in v1"; null is the degenerate case). Coordinates from Clark, Miller & Demer 2000 replace the nulls when they can be transcribed. Follow-up lines are added for M3 or for any session with document access. The release gate on `verified: true` (M6) stays the backstop.
2. **Dynamics constants are partly confirmed.** The linear main sequence `D = 21 + 2.2·A` ms is confirmed by excerpt but attributed to Carpenter 1988, not Bahill 1975 (Devillez et al. 2020 quote it). The data file cites Carpenter and notes the master plan's attribution. The vergence latency of 160 ms is confirmed only as attributed to Westheimer & Mitchell 1956 by a review. The vergence time constant (0.4 s) and the accommodation latency (0.35 s) and time constant (0.25 s) are the master plan's values. They stay `verified: false` because the Kasthurirangan & Glasser 2006 tables and Rashbass & Westheimer 1961 were unreachable. The excerpts did confirm the citations (Vision Res 46:1507–1519, doi 10.1016/j.visres.2005.11.012; J Physiol 159:339–360, doi 10.1113/jphysiol.1961.sp006812) and the qualitative findings: accommodation latency does not change with age while its time constant increases.
3. **Optics derivation moves into the worker** (M1 follow-up). The main thread runs only eye-model code: gaze, muscles, dynamics, and the accommodation controller, with `lensParameterA` left equal to the response. The worker solves the lens parameter, builds surfaces, and returns them with the paraxial power, far point, defocus, and fan. The cutaway is drawn from the surfaces the worker returns.
4. **Playwright drives the target through inspector fields.** Dragging a 3D gizmo under software WebGL in CI is fragile. The e2e test sets the target azimuth and distance fields; dragging the target in the stage is checked manually and covered by a unit test of the drag-to-direction mapping.
5. **Per-eye demand.** Each eye's demand uses its own distance to the target (from its center of rotation), not the cyclopean distance. At 0.33 m straight ahead with a 63 mm IPD the difference is 0.017 D.
6. **No saccade latency.** The master plan lists none. Saccades start when the target changes; a dragged target retargets the saccade in flight from the current position.

## Global Constraints

- Units: millimeters, diopters, degrees in data files and UI; radians internal to math modules. Right-handed, z along the optical axis toward the retina, x temporal for the right eye, y superior. The head frame has x to the subject's right, y superior, z posterior, with the origin midway between the two centers of rotation. Each eye's local frame is the head frame translated to its center, with x mirrored for the left eye so that x is temporal in both.
- TypeScript `strict: true`, no `any` in `eye-model` or `optics`. These two packages import nothing from the DOM or React. `optics` does not import `eye-model`; `eye-model` imports `optics` as a type-only dependency.
- Every numeric constant lives in `data/` with a citation; code never hard-codes a physiological value. Drawing-only values (tube radii, colors) live in `data/anatomy/*.json` or are named drawing constants with a comment saying so.
- All optics computation runs in a web worker; the main thread never blocks more than 16 ms per frame.
- `EyeParameters.schemaVersion` is `"1.0.0"`; readers reject an unknown major version with a clear error. No schema change in this milestone.
- Approximations (length-proxy activation, fixed or absent pulleys, homogeneous lens index, center of rotation at the globe center) are labeled "Approximation:" in the UI tooltip of the affected readout.
- Full gate before every commit: `(cd web && pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build) && (cd science && uv run ruff check . && uv run pytest)`, plus `(cd web && pnpm --filter @eye/viewer e2e)` because `web/apps/viewer/e2e/` exists.
- Commit messages end with `Co-Authored-By: Claude <model name> <noreply@anthropic.com>` naming the model that wrote them. One task per commit; push after every commit.

## Review Focus

Failure modes this milestone owns, each tied to the task that tests it:

1. **Target at infinity or behind the eyes.** `eyeDirections` with an infinite distance gives parallel lines of sight and 0° vergence, never NaN; a target closer than `MIN_TARGET_DISTANCE_M` is clamped once in the store, and the clamped value is what the worker traces. → Task 2.2, Task 2.7.
2. **Gaze quaternion normalization and Listing's law.** Every quaternion has unit norm within 1e-12, and its rotation axis has zero component along the primary line of sight, oblique gaze included. → Task 2.2.
3. **Muscle path when the insertion faces the origin.** When the straight segment from origin to insertion does not cut the globe, the path has no wrap arc and its length is the straight distance; the path never enters the sphere. → Task 2.3.
4. **Activation range and reciprocity.** Activations stay in [0, 1] for gaze up to ±50°, and an agonist above baseline implies its antagonist at or below baseline. → Task 2.4.
5. **Dynamics with `dt = 0`, negative `dt`, or a target change during a saccade.** `dt = 0` is a no-op; negative `dt` throws; retargeting mid-saccade starts from the current position without a jump. → Task 2.5.
6. **Left/right mirroring.** A target on the midline gives mirror-symmetric gaze and identical muscle activations for the two eyes. → Task 2.6.
7. **Stale or failed worker responses.** A parameter error and a worker error live in separate fields, so a worker success never clears a parameter error. → Task 2.7.

## File structure

```
data/eom/geometry-default.json          EOM table (Task 2.1)
data/eom/activation.json                length-proxy constants, approximation (Task 2.4)
data/eom/dynamics.json                  main sequence, vergence, accommodation dynamics (Task 2.5)
data/scene/defaults.json                default scene (IPD, age, luminance, target) (Task 2.6)
data/anatomy/orbit-drawing.json         drawing-only orbit, nerve, tube sizes (Task 2.8)
web/packages/eye-model/src/
  math/quat.ts           Quat type and ops (rotate, multiply, fromAxisAngle, normalize)
  eom/geometry.ts        typed EOM table, insertion points, muscle list from a document
  eom/path.ts            musclePath
  eom/activation.ts      activations (length proxy)
  gaze/listing.ts        gazeQuaternion, gazeDirection, directionFromQuaternion
  gaze/vergence.ts       eyeDirections, targetPoint
  gaze/dynamics.ts       DynamicState, initialDynamics, stepDynamics
  scene/defaults.ts      SCENE_DEFAULTS from data/scene/defaults.json
  state/types.ts         (modify) EyeState muscle fields, BinocularState
  state/derive.ts        (modify) deriveEyeState fills gaze and muscles; deriveBinocular
web/packages/optics/src/metrics/defocus.ts   (modify) export DEFAULT_LAUNCH_OFFSET_MM
web/apps/viewer/src/
  worker/messages.ts, handle.ts             (modify) per-eye optics derivation in the worker
  store/scene.ts                            (rewrite) binocular store, throttle, error fields, dynamics loop
  store/derive.ts                           (delete; logic moves to worker/handle.ts and eye-model)
  scene/Stage.tsx                           (rewrite) binocular orbital stage
  scene/Globe.tsx                           one globe oriented by gaze; right eye cut away
  scene/Muscle.tsx                          tapered tube along a path, colored by activation
  scene/Orbit.tsx                           orbit outline, annulus of Zinn, optic nerves
  scene/Target.tsx                          draggable target
  scene/dragTarget.ts                       pointer ray → target direction and distance (pure)
  ui/MuscleTable.tsx
  ui/Transport.tsx
  ui/Inspector.tsx, Readout.tsx, tooltips.ts (modify)
web/apps/viewer/e2e/slice.spec.ts           (modify) slider drive
web/apps/viewer/e2e/binocular.spec.ts       target direction → activations, vergence
```

---

### Task 2.0: Provenance and documentation follow-ups

Closes the M1 follow-ups that touch only data and docs, so later tasks start from correct provenance.

**Files:**
- Modify: `data/accommodation/anderson-2008-amplitude.json`, `data/accommodation/lag-default.json`, `data/anatomy/globe-cutaway.json`, `data/schematic-eyes/README.md`, `data/schematic-eyes/navarro-1985.json`, `docs/superpowers/plans/2026-10-26-m1-vertical-slice.md`
- Modify: `web/packages/eye-model/test/amplitude.test.ts` (only if it asserts `verified`)

**Interfaces:**
- Consumes: none. Produces: none (data text and flags only).

- [x] **Step 1:** Write a failing test in `web/packages/eye-model/test/provenance.test.ts`: `AMPLITUDE_TABLE.verified === false` with a `verificationNote` that says the group means were not compared; `LAG_TABLE.note` does not contain "0.72"; the Navarro `accommodation.description` does not contain "axial length grows".
- [x] **Step 2:** Run `cd web && pnpm --filter @eye/eye-model test`; expect FAIL.
- [x] **Step 3:** Edit the data:
  - Anderson: `verified: false`, `verifiedDate: null`, and a note: "verified means compared with the paper's group means, which this session could not reach".
  - Lag: remove the unsourced Zapata-Díaz slope quote and keep the replace-when-transcribed note without a number.
  - Globe cutaway: make `oraSerrataZMm` 10.0 and note that the ora serrata is referenced from the limbus (about 6–8 mm behind it, and the limbus plane is about 2 mm behind the corneal vertex), so the earlier 8.0 was about 2 mm too far forward. This is still drawing only and unverified.
  - Schematic-eye README: Navarro status "transcribed; paraxial power verified (Task 1.6)".
  - Navarro accommodation description: "the retina stays at axialLengthMm and the vitreous absorbs the lens change".
  - M1 plan, Task 1.8 Step 2: replace "golden-section search over z" with "closed-form best-RMS focus".
- [x] **Step 4:** Run the eye-model tests; PASS. Run the full gate.
- [x] **Step 5:** Commit: `chore(data): provenance follow-ups from the M1 review`.

### Task 2.1: EOM geometry table

**Files:**
- Create: `data/eom/geometry-default.json`, `data/eom/README.md`, `web/packages/eye-model/src/math/vec.ts` (eye-model imports `@eye/optics` for types only, so it gets its own small vector helpers), `web/packages/eye-model/src/eom/geometry.ts`, `web/packages/eye-model/test/eom-geometry.test.ts`
- Modify: `web/packages/eye-model/src/index.ts`

**Data shape** (`data/eom/geometry-default.json`, right eye, globe-centered frame: x temporal, y superior, z posterior, mm):

```
{
  name, citation, verified: false, frame: "right eye, globe center origin, x temporal, y superior, z posterior (toward retina), mm",
  globe: { radiusMm: 12, limbusRadiusMm: 5.75, citation, verified },
  muscles: [ {
    name, antagonist,
    originMm: [x,y,z], originCitation, originVerified,
    pulleyMm: null, pulleyNote,
    insertion: { meridianDeg, arcFromLimbusMm, alt: number|null, widthMm, citation, verified },
    tendon: { stiffnessNPerMm, slackLengthMm, citation, verified },
    muscleLengthMm: number|null, arcOfContactMm: [min,max]|null, lengthCitation
  } x6 ],
  alt: { volkmannMedialRectus: { originMm, insertionMm, frame, citation } }
}
```

Meridian angle: 0° temporal (+x), 90° superior (+y), measured in the frontal plane as seen from the front of the right eye. Insertion position: polar angle from the anterior pole `θ = asin(limbusRadius / R) + arcFromLimbus / R`. Then `p = R·(sinθ·cos φ, sinθ·sin φ, −cos θ)`.

Values (all transcriptions per Deviation 1):
- Globe radius 12 mm (Trujillo Suárez 2018; master plan); limbus radius 5.75 mm (11.5 mm corneal diameter; assumption from the master plan, unverified).
- Recti: meridians lateral 0°, superior 90°, medial 180°, inferior 270° (assumption: insertion centered on the named meridian). Arcs from the limbus are 6.9, 7.7, 5.5, and 6.5 mm (BCSC; verified by excerpt). Origins all at the common annulus point `[−15, 0, 32]` (Trujillo Suárez 2018, converted to this frame).
- Medial rectus: width 10.3, muscle 40.8, tendon slack 3.7, arc of contact [6, 7] (StatPearls). Lateral rectus: width 9.2, muscle 40.6, tendon slack 7.5 (midpoint of 7–8), arc of contact [10, 12] (Entokey). Superior and inferior rectus widths and tendon lengths are assumptions (10 mm, 6 mm).
- Superior oblique: insertion meridian 60° (superotemporal), arc from limbus 16 mm (behind the equator; assumption). The functional origin is the trochlea, placed by construction: the point 18 mm from the insertion tangent point along the direction whose horizontal projection makes 51° with the anterior line of sight, rising 20° above horizontal (assumption anchored to the 51° of Filip 2018). Width 10.8 (assumption).
- Inferior oblique: insertion meridian 330° (inferotemporal), arc from limbus 17 mm (assumption). Origin on the anterior orbital floor, placed by the mirror construction with the same 51° and 20° below horizontal at 18 mm (assumption). Width 9.4 (assumption).
- Tendon stiffness for all six: 0.0 placeholder with `verified: false` and the note "unused until the M4 force export; transcribe from Miller & Robinson's Orbit or Quaia et al.".

The construction for the trochlea and the IO origin runs once in a test helper that prints the coordinates; the JSON stores the numbers it prints, and the test asserts that stored and constructed values agree within 1e-6.

**Interfaces:**
- Produces:
  - `type Vec3 = readonly [number, number, number]` with `add, sub, scale, dot, cross, norm, normalize` in `math/vec.ts` (eye-model already depends on optics only as types).
  - `MUSCLE_NAMES = ["lateralRectus","medialRectus","superiorRectus","inferiorRectus","superiorOblique","inferiorOblique"] as const`; `type MuscleName`.
  - `interface EomMuscle { name: MuscleName; antagonist: MuscleName; originMm: Vec3; pulleyMm: Vec3 | null; insertionMm: Vec3; insertionWidthMm: number; tendon: { stiffnessNPerMm: number; slackLengthMm: number } }` (globe-centered right-eye frame).
  - `EOM_TABLE` (typed JSON); `GLOBE_RADIUS_MM`.
  - `insertionPoint(meridianDeg: number, arcFromLimbusMm: number, globeRadiusMm = GLOBE_RADIUS_MM, limbusRadiusMm = EOM_TABLE.globe.limbusRadiusMm): Vec3`.
  - `defaultMuscles(): EomMuscle[]` in `MUSCLE_NAMES` order.
  - `musclesFromDocument(params: EyeParameters): EomMuscle[]`: uses `params.extraocularMuscles` when present (origin, pulley, and the insertion arc from `insertionDistFromLimbusMm` on the table's meridian for that name), otherwise `defaultMuscles()`. Throws when a document muscle name is unknown.
  - `toDocumentMuscles(muscles = defaultMuscles()): MuscleGeometry[]` for attaching to presets (schema shape).

- [ ] **Step 1:** Failing tests in `eom-geometry.test.ts`:
  - six muscles with names exactly `MUSCLE_NAMES`;
  - every insertion lies on the sphere of radius 12 within 1e-6;
  - the medial rectus insertion's polar angle equals `asin(5.75/12) + 5.5/12` rad;
  - the antagonist pairs are symmetric (LR↔MR, SR↔IR, SO↔IO);
  - the superior-oblique pull direction at the insertion makes 51° ± 0.5° with the anterior axis in horizontal projection;
  - the stored trochlea and IO origin equal the construction within 1e-6;
  - `toDocumentMuscles()` passes `validateEyeParameters` when attached to the Navarro preset;
  - `musclesFromDocument` on a document without muscles equals `defaultMuscles()`.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Write the JSON, `vec.ts`, `geometry.ts`, and `data/eom/README.md` with the format and the status table.
- [ ] **Step 4:** Run; PASS. Full gate. Add follow-up lines for the unverified EOM values (oblique insertions, trochlea and IO origin, SR/IR widths, tendon stiffness, rectus pulleys) to `docs/superpowers/plans/2026-10-27-m2-followups.md` (create), naming "M3 or any session with document access". Commit: `feat(eye-model): extraocular muscle geometry table`.

### Task 2.2: Listing's law gaze and binocular vergence

**Files:**
- Create: `web/packages/eye-model/src/math/quat.ts`, `src/gaze/listing.ts`, `src/gaze/vergence.ts`, `test/listing.test.ts`, `test/vergence.test.ts`

**Interfaces:**
- Produces:
  - `type Quat = readonly [number, number, number, number]` ([x, y, z, w]), `quatFromAxisAngle(axis: Vec3, angleRad): Quat`, `quatMultiply(a, b): Quat`, `quatRotate(q, v: Vec3): Vec3`, `quatNormalize(q): Quat`, `QUAT_IDENTITY`.
  - `interface GazeDeg { xDeg: number; yDeg: number }`. This is Fick-style azimuth and elevation of the line of sight in the eye's local frame: `xDeg` positive temporal, `yDeg` positive up.
  - `gazeDirection(g: GazeDeg): Vec3` = `(sin x cos y, sin y, −cos x cos y)`.
  - `gazeQuaternion(g: GazeDeg): Quat`, the rotation taking `(0,0,−1)` to `gazeDirection(g)` about an axis in the plane z = 0 (Listing's plane, primary position along −z).
  - `gazeFromDirection(d: Vec3): GazeDeg`, the inverse of `gazeDirection`.
  - `targetPoint(distanceM: number, directionDeg: {x, y}): Vec3 | null` in the head frame, mm (null for an infinite distance).
  - `eyeDirections(target: { distanceM: number; directionDeg: {x, y} }, ipdMm: number): { left: GazeDeg; right: GazeDeg; vergenceDeg: number; distanceMm: { left: number; right: number } }`. Each eye's center is at `x = ±ipd/2`, right eye at `+ipd/2`. Directions are converted to each eye's local frame with x mirrored for the left eye. For an infinite distance both eyes take `directionDeg` (mirrored for the left), vergence is 0, and distances are `Infinity`.

- [ ] **Step 1:** Failing tests:
  - primary gaze is the identity quaternion;
  - for gazes on a 10° grid within ±40°, `quatRotate(gazeQuaternion(g), [0,0,−1])` equals `gazeDirection(g)` within 1e-12, the quaternion's z component is 0 within 1e-12 (Listing), and its norm is 1;
  - `gazeFromDirection(gazeDirection(g))` round-trips;
  - a 20° temporal gaze has Fick torsion 0;
  - a target at 0.33333 m straight ahead with IPD 63 gives vergence `2·atan(31.5/333.33)` within 1e-9;
  - an infinite target gives vergence 0 and equal (mirrored) directions;
  - a target 20° to the subject's right gives the right eye a temporal (positive) azimuth and the left eye a nasal (negative) azimuth;
  - a midline target gives `left.xDeg === right.xDeg`.
- [ ] **Step 2:** Run; FAIL. Implement. Run; PASS. Full gate.
- [ ] **Step 3:** Commit: `feat(eye-model): Listing's law gaze and vergence geometry`.

### Task 2.3: Muscle path and length

**Files:**
- Create: `web/packages/eye-model/src/eom/path.ts`, `test/path.test.ts`

**Interfaces:**
- Produces: `interface MusclePath { points: Vec3[]; lengthMm: number; pullDir: Vec3; arcMm: number; tangentPoint: Vec3 }` and `musclePath(m: EomMuscle, gaze: Quat, globeRadiusMm = GLOBE_RADIUS_MM, arcSamples = 16): MusclePath`.
  - The frame is globe-centered with the center of rotation at the globe center (approximation).
  - The insertion is rotated by `gaze`, the origin and pulley are fixed in the orbit, and the path's free end is the pulley when one is present, else the origin.
  - Wrap rule: the path runs from the free end to the tangent point on the sphere in the plane through the globe center, the free end, and the rotated insertion. From there it follows the great-circle arc to the insertion. If the straight segment from the free end to the insertion does not pass inside the sphere, there is no arc.
  - `lengthMm` = (origin→pulley) + straight segment + arc length.
  - `pullDir` is the unit vector from the tangent point toward the free end, or from the insertion when there is no arc.

- [ ] **Step 1:** Failing tests:
  - in primary position the medial-rectus path length is within 15% of 44.5 mm (muscle 40.8 + tendon 3.7, StatPearls). The model gives about 39.5 mm, 11% short; the test comment says why (common annulus origin, no pulley) and points to the follow-up;
  - the medial-rectus arc of contact is within the published 6–7 mm ± 1;
  - rotating the eye 20° toward each rectus's action (LR temporal, MR nasal, SR up, IR down) shortens it and lengthens its antagonist;
  - every path point has `|p| ≥ R − 1e-9`;
  - with the insertion rotated to face the origin (no wrap), the length equals the straight distance;
  - the length is continuous across the wrap/no-wrap boundary within 1e-6.
- [ ] **Step 2:** Run; FAIL. Implement. Run; PASS. Full gate.
- [ ] **Step 3:** Commit: `feat(eye-model): muscle path over the globe`.

### Task 2.4: Length-proxy activation

**Files:**
- Create: `data/eom/activation.json`, `web/packages/eye-model/src/eom/activation.ts`, `test/activation.test.ts`

Data: `{ form: "length-proxy", equation: "a = clamp(baseline + gain * (restLength - length) / restLength, 0, 1)", baseline: 0.2, gain: 4.0, citation: "approximation (spec §4.4 v1): a monotone function of shortening from primary position with reciprocal innervation; baseline and gain chosen so a 50° rectus duction stays below saturation, not transcribed", verified: false }`.

**Interfaces:**
- Produces: `ACTIVATION_TABLE`; `activations(lengthsMm: readonly number[], restLengthsMm: readonly number[], table = ACTIVATION_TABLE): number[]`. Reciprocal innervation follows from the formula: the lengthening antagonist falls below baseline and is floored at 0.

- [ ] **Step 1:** Failing tests:
  - primary gaze (lengths equal rest) gives every muscle `baseline`;
  - 20° adduction of the right eye raises the medial rectus above the lateral rectus;
  - for every gaze on a 10° grid within ±50°, all values are in [0, 1];
  - whenever a rectus is above baseline its antagonist is at or below baseline;
  - mismatched array lengths throw.
- [ ] **Step 2:** Run; FAIL. Implement. Run; PASS. Full gate.
- [ ] **Step 3:** Commit: `feat(eye-model): length-proxy muscle activation`.

### Task 2.5: Oculomotor and accommodative dynamics

**Files:**
- Create: `data/eom/dynamics.json`, `web/packages/eye-model/src/gaze/dynamics.ts`, `test/dynamics.test.ts`
- Modify: `docs/superpowers/specs/2026-10-26-eye-simulation-design.md` §4.2 (the M0 follow-up): replace "time constant ≈ 0.3 s, configurable" with a cross-reference to the §4.4 dynamics bullet and `data/eom/dynamics.json` (Kasthurirangan & Glasser).

Data (Deviation 2): `saccade: { form: "linear-main-sequence", interceptMs: 21, slopeMsPerDeg: 2.2, profile: "minimum-jerk", citation: Carpenter 1988 via Devillez et al. 2020, verified: false }`, `vergence: { latencyS: 0.16, timeConstantS: 0.4, citation, verified: false }`, `accommodation: { latencyS: 0.35, timeConstantS: 0.25, citation: Kasthurirangan & Glasser 2006 (values from the master plan, not the paper's tables), verified: false }`.

**Interfaces:**
- Produces:
  - `DYNAMICS_TABLE`.
  - `interface DynamicTargets { version: GazeDeg; vergenceDeg: number; accommodationD: { left: number; right: number } }`. Version is the cyclopean gaze in the head frame (Hering).
  - `interface DynamicState { timeS; version: GazeDeg; vergenceDeg; accommodationD: { left; right }; saccade: { from: GazeDeg; to: GazeDeg; startS; durationS } | null; vergenceQueue: Array<{ atS; value }>; accommodationQueue: Array<{ atS; value: { left; right } }>; lastTargets: DynamicTargets }`.
  - `initialDynamics(targets, timeS = 0): DynamicState`, which is at rest on the targets.
  - `stepDynamics(prev, targets, dtS, consts = DYNAMICS_TABLE): DynamicState`:
    - A change of `targets.version` starts a saccade from the current version with duration `(intercept + slope·amplitude)/1000` s and a minimum-jerk profile.
    - A change of the vergence or accommodation target enqueues it to take effect after the latency. A first-order approach `x += (x* − x)(1 − e^{−dt/τ})` then runs toward the effective target.
    - `dt = 0` returns `prev` unchanged, and `dt < 0` throws.
  - `eyeGazes(state: DynamicState): { left: GazeDeg; right: GazeDeg }` splits version and vergence into per-eye local gazes, with each eye taking half the vergence nasally.

- [ ] **Step 1:** Failing tests:
  - a 10° saccade completes within 43 ms ± 2 (21 + 2.2·10) and lands on the target within 1e-9;
  - peak velocity occurs at mid-duration;
  - a 4° vergence step does not move before 0.16 s and reaches 95% within 0.16 + 3·0.4 s;
  - accommodation does not move before 0.35 s;
  - `dt = 0` is a no-op, and `dt < 0` throws;
  - retargeting at mid-saccade starts the new saccade at the current position (no jump between consecutive frames larger than the peak velocity times dt);
  - `eyeGazes` of zero vergence equals the version for both eyes (mirrored).
- [ ] **Step 2:** Run; FAIL. Implement. Run; PASS. Full gate.
- [ ] **Step 3:** Commit: `feat(eye-model): saccade, vergence, and accommodation dynamics`.

### Task 2.6: Derive gaze and muscles into EyeState; scene defaults

**Files:**
- Create: `data/scene/defaults.json`, `web/packages/eye-model/src/scene/defaults.ts`, `test/binocular.test.ts`
- Modify: `src/state/types.ts`, `src/state/derive.ts`, `src/presets/load.ts`, `src/index.ts`, `test/derive.test.ts`, `test/types-drift.test.ts` if affected

Data: `data/scene/defaults.json` = `{ ipdMm: 63 (spec §4.4 default, citation "spec §4.4; typical adult IPD"), ageYears: 30, luminanceCdM2: 100, targetDistanceM: 6, targetDirectionDeg: {x:0,y:0}, ageRangeYears: [6, 90] (spec §4.1), citation per field, verified: false }`. This closes the M1 follow-up on hard-coded `DEFAULT_IPD_MM`, store defaults, and Inspector age bounds; the age bounds come from `AMPLITUDE_TABLE.domain`.

**Interfaces:**
- Modify `EyeState`: `gaze: Quat`; `gazeDeg: GazeDeg`; `targetDistanceM: number` (this eye's distance); `eomLengthMm: number[]`, `eomRestLengthMm: number[]`, and `eomActivation: number[]` in `MUSCLE_NAMES` order; `eomPaths: MusclePath[]`.
- `deriveEyeState(scene, params, side, farPointD = 0, farPointOf?, gazeOverride?: GazeDeg, accommodationOverride?: number): EyeState`.
  - Gaze comes from `eyeDirections(scene target, scene.ipdMm)[side]` unless `gazeOverride` is given (dynamics).
  - Demand uses this eye's own distance.
  - Muscles come from `musclesFromDocument(params)`. Muscle tables are in each eye's local frame (x temporal), so no muscle coordinate is mirrored; only the gaze is converted to the local frame.
- `deriveBinocular(scene, eyes: { left: EyeParameters; right: EyeParameters }, opts?: { farPointD?: {left; right}; dynamics?: DynamicState }): { left: EyeState; right: EyeState; vergenceDeg: number }` (spec §4.5).
- `loadPreset` attaches `extraocularMuscles: toDocumentMuscles()` and reads `interpupillaryDistanceMm` from `SCENE_DEFAULTS`.
- `SCENE_DEFAULTS` typed export; `defaultScene(preset): SceneState`.

- [ ] **Step 1:** Failing tests:
  - midline target: left and right `eomActivation` are equal within 1e-12;
  - target 20° to the subject's right at 6 m: the right lateral rectus and the left medial rectus are above baseline, and the right medial rectus and left lateral rectus are below;
  - moving a midline target from 6 m to 0.33 m increases `vergenceDeg` and both medial-rectus activations;
  - `demandD` at 0.333 m straight ahead equals `1/hypot(0.333, 0.0315)` within 1e-9;
  - `loadPreset("navarro-1985").extraocularMuscles` has six entries and validates;
  - existing derive tests still pass with the new fields;
  - the `SchemaVersionError` test still passes through `deriveBinocular`.
- [ ] **Step 2:** Run; FAIL. Implement. Run; PASS. Full gate (viewer lint will need the `EyeState` changes threaded through; keep the viewer compiling with minimal edits).
- [ ] **Step 3:** Commit: `feat(eye-model): binocular derivation of gaze, muscle length, and activation`.

### Task 2.7: Worker owns optics derivation; store rework

Closes the M1 follow-ups:
- derive on the main thread;
- the target-distance clamp;
- debounce versus throttle;
- error fields;
- the initial derive outside try/catch;
- the duplicated launch offset;
- the misnamed worker budget test.

**Files:**
- Modify: `web/packages/optics/src/metrics/defocus.ts` and `src/index.ts` (export `DEFAULT_LAUNCH_OFFSET_MM = 1`, used by `retinalDefocusD` and by the viewer fan), `web/apps/viewer/src/worker/messages.ts`, `src/worker/handle.ts`, `src/store/scene.ts`, `test/worker.test.ts`
- Create: `web/apps/viewer/src/store/throttle.ts`, `test/throttle.test.ts`, `test/store.test.ts`
- Delete: `web/apps/viewer/src/store/derive.ts`

**Interfaces:**
- `OpticsRequest = { id; eyes: Array<{ side: "left"|"right"; params: EyeParameters; accommodationD: number; objectDistanceM: number; pupilSemiDiamMm: number; fanRays: number }> }`.
- `EyeOptics = { side; surfaces: Surface[]; lensParameterA; paraxialPowerD; farPointD; defocusD; bestFocusZMm; retinaZMm; rmsSpotMm; fan: Vec3[][]; vignettedRays }`; `OpticsResponse = { id; eyes: EyeOptics[]; elapsedMs }`.
- `handle(req)`:
  - computes each document's relaxed far point (cached per document object);
  - solves `lensParameterFor(params, accommodationD, farPointOf)`;
  - builds surfaces, then computes paraxial power, defocus, and the fan;
  - aims the fan at `firstVertexZ − DEFAULT_LAUNCH_OFFSET_MM`.
- `throttle(fn, ms)`: calls at most once per `ms`, always makes a trailing call with the latest arguments, and has `cancel()`.
- Store state:
  - `scene`, `eyes: { left: EyeParameters; right: EyeParameters }`, `binocular: { left: EyeState; right: EyeState; vergenceDeg }`, and `optics: OpticsResponse | null`;
  - `paramError: string | null` and `workerError: string | null`, kept separate;
  - `dynamics: DynamicState`, `playing: boolean`, and `history` (ring buffer of `{ timeS, version, vergenceDeg, accommodationD }`, 20 s);
  - `hovered`, `pinned`.
- Store actions:
  - `setTargetDistance(m)` clamps to `[MIN_TARGET_DISTANCE_M, ∞)` once, and the clamped value is stored and sent;
  - `setTargetDirection({x, y})`, `setAge`, `setIpd`, `setPreset`;
  - `setPlaying(b)`, `tick(dtS)`, `scrub(timeS)`, `setHovered`, `setPinned`.
- The initial derivation runs inside the same try/catch as updates. A failure sets `paramError` and keeps a safe fallback state, so the app renders the banner instead of blanking.

- [ ] **Step 1:** Failing tests:
  - `handle` returns two eyes, each with 11 polylines of 1 + 5 vertices, and the right-eye defocus at 0.5 m with the controller's accommodation is below 0.6 D in magnitude for age 30;
  - the paraxial power and lens parameter returned for A = 2 match `paraxialPower(buildSurfaces(...))` computed in the test;
  - `handle` finishes both eyes in under 16 ms median over 5 runs (renamed "per-frame budget, two eyes");
  - `throttle` makes a leading call, a trailing call with the last arguments, and no call after `cancel`;
  - store: `setTargetDistance(0)` stores 0.05;
  - store: a `"2.0.0"` document set through a test hook yields `paramError` naming the version, while `workerError` stays null;
  - store: a simulated worker success does not clear `paramError`.
- [ ] **Step 2:** Run; FAIL. Implement. Run; PASS. Full gate, e2e included (the M1 e2e must still pass with the new store).
- [ ] **Step 3:** Commit: `refactor(viewer): optics derivation in the worker, throttled requests, separate error fields`.

### Task 2.8: Binocular stage

**Files:**
- Create: `data/anatomy/orbit-drawing.json` (drawing only, `verified: false`: orbit rim and apex outline points, optic nerve radius 1.5 mm and length, muscle belly max radius, tendon radius, annulus radius; citation "drawing approximation"), `web/apps/viewer/src/scene/Globe.tsx`, `src/scene/Muscle.tsx`, `src/scene/Orbit.tsx`, `src/scene/Target.tsx`, `src/scene/dragTarget.ts`, `src/scene/tube.ts`, `test/dragTarget.test.ts`, `test/tube.test.ts`
- Modify: `src/scene/Stage.tsx`, `src/scene/EyeCutaway.tsx`, `src/scene/RayFan.tsx`, `src/scene/profiles.ts` (pupil radius from `params.pupil` via `pupilDiameterMm` instead of the hard-coded 2), `test/profiles.test.ts`

**Interfaces:**
- `taperedRadius(u: number, beltMaxMm, tendonMm, tendonFraction): number`: tube radius along the normalized path, a tendon-thin end at the insertion, and a fusiform belly.
- `activationColor(a: number): string`, interpolating from the neutral muscle token to the single hot token.
- `dragToTarget(rayOrigin: Vec3, rayDir: Vec3, planeZMm: number): { distanceM; directionDeg: {x, y} } | null`, which intersects the pointer ray with the frontal plane through the current target.
- Globe placement: each eye's center of rotation at `(±ipd/2, 0, 0)` in the head frame, oriented by `EyeState.gaze` (left mirrored). The right eye renders the existing cutaway lathe (translated so the globe center is the origin) with its ray fan. The left eye renders a closed globe (sclera, cornea, iris, pupil).
- The cut plane follows the right globe's rotation (local clipping plane updated from the group's world matrix each frame).
- Hover on a muscle sets `hovered` to `{ kind: "muscle", side, name }`; the label shows name, length, activation, and "Approximation: length-proxy activation; no pulleys".

- [ ] **Step 1:** Failing tests:
  - `taperedRadius` equals the tendon radius at u = 1 and the belly maximum in the belly;
  - `dragToTarget` straight ahead at plane z = −333 gives 0.333 m and 0°;
  - a ray 20° to the right gives `x = 20°`;
  - a ray parallel to the plane gives null;
  - `globeProfiles` uses the document's pupil diameter;
  - the `profiles.test.ts` name "zero demand at 6 m" becomes "0.17 D demand at 6 m".
- [ ] **Step 2:** Run; FAIL. Implement the pure helpers; PASS. Implement the components. Run the full gate and e2e.
- [ ] **Step 3:** Commit: `feat(viewer): binocular globes, extraocular muscles, orbit, and draggable target`.

### Task 2.9: Inspector, muscle table, transport, readouts

**Files:**
- Create: `web/apps/viewer/src/ui/MuscleTable.tsx`, `src/ui/Transport.tsx`, `src/ui/format.ts`, `test/format.test.ts`, `test/tooltips.test.ts` (extend)
- Modify: `src/ui/Inspector.tsx`, `src/ui/Readout.tsx`, `src/ui/tooltips.ts`, `src/App.tsx`, `src/theme.css`

**Interfaces:**
- Inspector Scene panel: target distance (number plus log slider), azimuth and elevation (`data-testid="target-azimuth"`, `"target-elevation"`, range ±40°), and luminance (read-only until M3). The note under the distance field reads "Meters from the midpoint between the eyes; 6 m is 0.17 D of demand". The Subject panel adds IPD. Age bounds come from `AMPLITUDE_TABLE.domain`.
- `MuscleTable`: two blocks (Right, Left), six rows each, columns Length (mm), Δ (mm), and Activation, with a small bar in the hot color. Cell test ids are `muscle-<side>-<name>-activation` and `-length`. The header tooltip reads "Approximation: length-proxy activation…".
- `Transport`: play/pause (`data-testid="transport-play"`), time readout, a scrub slider over the history buffer, and "snap" (static mode). When paused, gaze and accommodation snap to the static targets; when playing, the store's `tick` advances dynamics from `requestAnimationFrame`.
- Readout:
  - per-eye accommodation and defocus for the right eye (cutaway eye), plus vergence (`data-testid="vergence"`);
  - Demand gets an "Approximation:" tooltip naming the homogeneous-index paraxial far point;
  - the Amplitude tooltip includes the table's `domain.note` (ages above 70 extrapolate the fit);
  - the Pupil tooltip names `params.pupil`.
- `tooltips.ts` gains `muscleTooltip`, `vergenceTooltip`, and `demand`.

- [ ] **Step 1:** Failing tests:
  - `readoutTooltips(...).amplitude` contains "70";
  - `demand` starts with "Approximation:";
  - `muscleTooltip` starts with "Approximation:";
  - `formatDelta(+0.04)` gives "+0.04" and `formatDelta(−0)` gives "0.00".
- [ ] **Step 2:** Run; FAIL. Implement. Run; PASS. Full gate.
- [ ] **Step 3:** Commit: `feat(viewer): muscle table, transport, binocular readouts`.

### Task 2.10: End-to-end tests

**Files:**
- Create: `web/apps/viewer/e2e/binocular.spec.ts`
- Modify: `web/apps/viewer/e2e/slice.spec.ts`

- [ ] **Step 1:** Write the Playwright tests:
  - `slice.spec.ts`: drive `target-distance-slider` to its minimum through `fill`/keyboard and assert the demand reads above 9 D (log mapping, 0.1 m); restore 0.33 m via the slider and assert a demand of 3.0x D. This closes the M1 slider follow-up;
  - `binocular.spec.ts`, target direction: set the azimuth to 20; the right lateral rectus activation and the left medial rectus activation each rise above their primary-position values read beforehand;
  - `binocular.spec.ts`, vergence: set the distance from 6 to 0.33; the vergence readout increases from below 1° to above 10°;
  - `binocular.spec.ts`, transport: press play and set a new azimuth; the time readout advances and the activations settle to the static values within 2 s.
- [ ] **Step 2:** Run `pnpm --filter @eye/viewer e2e`; fix until PASS. Full gate.
- [ ] **Step 3:** Commit: `test(viewer): binocular end-to-end tests`.

### Task 2.11: Finish

- [ ] Update this plan's Status and add Outcome notes (what landed, the remaining unverified values).
- [ ] Confirm every item in the table below is done, and that any new deferrals are in `2026-10-27-m2-followups.md`.
- [ ] Full gate and e2e. Update the PR body with a summary and the verification run; mark the PR ready.

## Follow-ups absorbed from earlier milestones

Per the driver playbook, these lines were deleted from `2026-10-26-m0-followups.md` and `2026-10-27-m1-followups.md` in the commit that added this plan; this table and the owning task steps are now their record.

| Follow-up | Task |
|---|---|
| M0: spec §4.2 accommodation time constant uncited | 2.5 |
| M1: clamp target distance once in the store | 2.7 |
| M1: "6 m is optical infinity" text and test name | 2.8 (test), 2.9 (text) |
| M1: debounce → throttle with trailing call | 2.7 |
| M1: hard-coded IPD, scene defaults, pupil radius, age bounds | 2.6, 2.8, 2.9 |
| M1: derive on the main thread | 2.7 |
| M1: initial derive outside try/catch; SchemaVersionError banner test | 2.7 |
| M1: worker success clears parameter errors | 2.7 |
| M1: e2e never moves the slider | 2.10 |
| M1: duplicated fan launch offset | 2.7 |
| M1: Demand readout tooltip | 2.9 |
| M1: Amplitude tooltip extrapolation above 70 | 2.9 |
| M1: worker "per-frame budget" test name | 2.7 |
| M1: Anderson `verified` | 2.0 |
| M1: lag-default Zapata-Díaz quote | 2.0 |
| M1: ora serrata position | 2.0 |
| M1: schematic-eyes README status | 2.0 |
| M1: Navarro accommodation description | 2.0 |
| M1: M1 plan Task 1.8 golden-section text | 2.0 |
