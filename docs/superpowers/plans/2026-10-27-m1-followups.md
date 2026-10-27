# Milestone 1 follow-ups

Minor findings deferred from the Milestone 1 driver reviews of PR #3 (2026-10-27,
heads 5a5e34d and 903e329; the Critical and Important findings were fixed on
the PR). Each
line names the milestone that should absorb it. Resolve an item in the task that
touches the same file, and delete its line here in that commit.

## Viewer

- `web/apps/viewer/src/store/scene.ts` and `src/ui/Inspector.tsx`: the target
  distance box accepts values below `MIN_TARGET_DISTANCE_M` (0.05 m); the
  controller clamps but the worker traces the raw value. Clamp once in the store
  and send the clamped value. (M2)
- `web/apps/viewer/src/ui/Inspector.tsx`: "6 m is optical infinity for this
  readout" is wrong (demand 0.17 D); the test name at
  `web/apps/viewer/test/profiles.test.ts` says "zero demand at 6 m" while it
  asserts 1/6. (M2)
- `web/apps/viewer/src/store/scene.ts`: the 16 ms debounce restarts on every
  input event, so the readout can freeze during a fast drag; use a throttle with
  a trailing call. (M2)
- Values hard-coded outside `data/`: `presets/load.ts` (`DEFAULT_IPD_MM = 63`),
  `store/scene.ts` (default age, luminance, IPD), `scene/profiles.ts`
  (`pupilR = 2`, ignores `params.pupil`), `ui/Inspector.tsx` (age bounds 6/90
  duplicate `AMPLITUDE_TABLE.domain`). Read them from `data/`, `params`, or the table. (M2)

- `web/apps/viewer/src/store/derive.ts`: `paraxialPower` and the lens-parameter
  bisection (~60 ABCD evaluations, under 1 ms) run on the main thread, while
  CLAUDE.md says all optics computation runs in a web worker. Move `derive`
  into the worker or record an explicit exception in CLAUDE.md. (M2)
- `web/apps/viewer/src/store/scene.ts`: the initial `derive` runs outside
  try/catch, so a bad starting document blanks the app instead of showing the
  banner; add a test that a `SchemaVersionError` reaches the banner. (M2, with
  document loading)
- `web/apps/viewer/src/store/scene.ts`: a successful worker response sets
  `error: null`, which can silently clear a parameter-error banner raised
  during an in-flight request; keep worker and parameter errors in separate
  fields. (M2)
- `web/apps/viewer/e2e/slice.spec.ts`: the e2e test fills the number box but
  never moves `target-distance-slider`, so the log mapping in `Inspector.tsx`
  is untested; drive the slider and assert the demand. (M2)
- `web/apps/viewer/src/worker/handle.ts`: the fan aims at `firstVertexZ - 1`,
  duplicating the `launchOffsetMm = 1` default in
  `web/packages/optics/src/metrics/defocus.ts`; export one constant from
  `optics` or pass it in the request. (M2)
- `web/apps/viewer/test/worker.test.ts`: the test named "per-frame budget"
  asserts under 100 ms while `handle` measures 1–6 ms; tighten to 16 ms or
  rename. (M2)

## Optics

- `web/packages/optics/src/paraxial/abcd.ts` and `src/metrics/defocus.ts`: the
  image surface is found by exact refractive-index equality, so a future
  index-matched or stop surface (iris aperture) would end the trace early.
  Identify the retina by name or an explicit flag. (M3, before the pupil stop)
- `web/packages/optics/src/trace/sequential.ts`: every `intersect` miss is
  reported as `"aperture"`; the `"miss"` reason is never produced. (M3)

## Data and provenance

- `data/accommodation/anderson-2008-amplitude.json`: `verified: true`, but the
  only test re-evaluates the same equation; set `verified: false` until it is
  compared with the paper's group means, or define "verified" for
  non-schematic tables. (M2)
- `data/accommodation/lag-default.json`: quotes a Zapata-Díaz 2019 value ("slope
  0.72 at age 25") from a paper this session could not reach; source it or
  remove it. (M2, or M3 with the Zapata-Díaz transcription)
- `data/schematic-eyes/navarro-1985.json`: the pupil `diameterMm: 4.0` and the
  `apertureSemiDiamMm` values have no source; cite them or mark them as
  modeling choices. (M3)
- The Table 4 conic coefficients listed as `unverified` are applied at every
  accommodation level, but nothing surfaces the list; mention it in the defocus
  tooltip until they are confirmed. (M3, with the confirmation item in the M0
  follow-ups)
- `data/anatomy/globe-cutaway.json`: the ora serrata is usually referenced from
  the limbus, so `oraSerrataZMm: 8.0` from the corneal vertex is probably about
  2 mm too far forward (drawing only). (M2)
- `data/schematic-eyes/README.md`: the status column still says "verification
  set by Task 1.6". (M2)
- `data/schematic-eyes/navarro-1985.json`: `accommodation.description` still
  says the vitreous is held fixed and axial length grows; since the review fix
  the retina stays at `axialLengthMm` and the vitreous absorbs the change.
  Correct the text. (M2)

## Docs

- `docs/superpowers/plans/2026-10-26-m1-vertical-slice.md`: Task 1.8 says
  "golden-section search over z", but the implementation is the closed-form
  best-RMS focus. Update the step. (M2)
