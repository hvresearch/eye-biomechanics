# Milestone 1 follow-ups

Minor findings deferred from the Milestone 1 driver reviews of PR #3 (2026-10-27,
heads 5a5e34d, 903e329, and 0618e91; the Critical and Important findings were fixed on
the PR). Each
line names the milestone that should absorb it. Resolve an item in the task that
touches the same file, and delete its line here in that commit.

## Optics

- `web/packages/optics/src/paraxial/abcd.ts` and `src/metrics/defocus.ts`: the
  image surface is found by exact refractive-index equality, so a future
  index-matched or stop surface (iris aperture) would end the trace early.
  Identify the retina by name or an explicit flag. (M3, before the pupil stop)
- `web/packages/optics/src/trace/sequential.ts`: every `intersect` miss is
  reported as `"aperture"`; the `"miss"` reason is never produced. (M3)

## Data and provenance

- `data/schematic-eyes/navarro-1985.json`: the pupil `diameterMm: 4.0` and the
  `apertureSemiDiamMm` values have no source; cite them or mark them as
  modeling choices. (M3)
- The Table 4 conic coefficients listed as `unverified` are applied at every
  accommodation level, but nothing surfaces the list; mention it in the defocus
  tooltip until they are confirmed. (M3, with the confirmation item in the M0
  follow-ups)
