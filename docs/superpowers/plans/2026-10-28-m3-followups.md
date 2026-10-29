# Milestone 3 follow-ups

Items deferred while implementing Milestone 3 (2026-10-28). Each line names the
milestone that should absorb it. Resolve an item in the task that touches the
same file, and delete its line here in that commit.

## Modeling (from implementation)

- `data/pupil/watson-yellott-2012.json`: confirm the age-slope constants and the
  monocular factor against the paper; consider the paper's appendix extension below 20
  years instead of clamping. `data/pupil/near-response.json`: replace the derived
  coefficient with a transcribed one. (any session with document access)
- `web/packages/optics/src/image/psf.ts`: the PSF is built from the order-8 Zernike fit,
  so vignetting enters only through the pupil disk and orders above 8 are dropped; if a
  case needs them, build the pupil function from the raw OPD map. (M6, if needed)

## Review round 1 (minor findings, deferred)

- `web/apps/viewer/src/store/scene.ts` (`letterArcmin: 5`) and
  `web/packages/optics/src/image/targets.ts` (5 strokes) duplicate
  `data/acuity/optotypes.json`; read the data file instead. (M6)
- `web/apps/viewer/src/worker/handle.ts` (`stage`): each wavelength's OPD is referenced to
  its own chief-ray retinal point, so transverse chromatic aberration (about an arcminute at
  5° alpha) is dropped; reference every wavelength to the 555 nm image point, or say in the
  PSF tooltip that TCA is omitted. (M6)
- `web/packages/optics/src/trace/aim.ts`: rays whose aiming failed are traced as launched
  and kept as valid OPD samples; mark them invalid. Latent (no failures found up to ±20 D,
  −8 D cylinder, 7.5 mm pupil, 5° field). (M6)
- `web/apps/viewer/src/worker/handle.ts`: a `ChiefRayError` or `InsufficientRaysError`
  from the wave pipeline fails the whole response; catch per eye and return `wave: null`
  with a message. (M6)
- `web/apps/viewer/src/ui/Readout.tsx`: the near-miosis tooltip shows base − final, which
  is negative when the 2 mm floor binds; show `nearMiosisMm(vergenceMA)` and note the floor.
  (M6)
- `web/apps/viewer/src/store/scene.ts`: preset solving and the refraction decomposition run
  paraxial optics on the main thread (about 2.4 ms), against CLAUDE.md's "all optics in a web
  worker"; move them to the worker. (M6)
- `web/packages/optics/src/surfaces/geometry.ts`: Newton stepping outside the sag domain
  reports `"miss"` even where the aperture is the true cause; classify by aperture first.
  (M6)
