# Milestone 1 follow-ups

Minor findings deferred from the Milestone 1 driver review of PR #3 (2026-10-27,
head 5a5e34d; the Critical and Important findings were fixed on the PR). Each
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
  (`pupilR = 2`, ignores `params.pupil`), `ui/Readout.tsx` ("4 mm pupil" in
  the tooltip), `ui/Inspector.tsx` (age bounds 6/90 duplicate
  `AMPLITUDE_TABLE.domain`). Read them from `data/`, `params`, or the table. (M2)

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
