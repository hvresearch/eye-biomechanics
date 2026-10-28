# Milestone 2 follow-ups

Items deferred while implementing Milestone 2 (2026-10-27). Each line names the
milestone that should absorb it. Resolve an item in the task that touches the
same file, and delete its line here in that commit.

## Data and provenance (needs a session with document access)

- `data/eom/geometry-default.json`: transcribe the rectus origins and the oblique
  origins and insertions from Volkmann 1869 (Eggers, Duane's Foundations vol. 1
  ch. 31, Table 2, or Helmholtz's *Physiological Optics*), replacing the common
  annulus point and the 51° construction; keep Volkmann's frame conversion in
  the README. (M3 or any session with document access)
- `data/eom/geometry-default.json`: rectus pulleys are `null`; transcribe fixed
  pulley coordinates from Clark, Miller & Demer, IOVS 41:3787-3797, 2000.
  Without pulleys and with one annulus point, the primary-position medial
  rectus path is 39.5 mm against 44.5 mm published (muscle + tendon) and the
  lateral rectus arc of contact is 15.4 mm against 10-12 mm; tighten the
  `path.test.ts` tolerance once pulleys land. (M3 or any session with document
  access)
- `data/eom/geometry-default.json`: superior and inferior rectus insertion widths
  and tendon lengths and the oblique widths are assumptions; transcribe the BCSC
  table. Tendon stiffness is a 0 placeholder; transcribe from Miller &
  Robinson's Orbit model or Quaia et al. before the M4 force export. (M4 at the
  latest)

## From the M2 review (Minor findings deferred)

- `web/apps/viewer/src/store/scene.ts` and `worker/client.ts`: worker requests have
  no backpressure while playing; if one pass exceeds ~16 ms every response is
  stale and the readouts stay pending. Keep at most one request in flight and send
  the latest state when it returns. (M3, which adds heavier wave optics)
- `web/apps/viewer/test/worker.test.ts`: the aim-plane assertion
  `first - DEFAULT_LAUNCH_OFFSET_MM < first` is always true; assert instead that
  an off-axis fan ray crosses `firstVertexZ - DEFAULT_LAUNCH_OFFSET_MM` at its
  pupil height. (M3)
- `web/apps/viewer/src/scene/Muscle.tsx`: look up the tendon length by muscle
  `name`, not by index in `MUSCLE_NAMES` order. (M3)
- `web/apps/viewer/src/scene/Target.tsx`: clamp target drags to the inspector's
  ±40° direction range (in `setTarget` or `dragToTarget`). (M3)
- Spec §6.2 items missing from M2: readout pinning (`pinned`/`setPinned` in the
  store), the read-only luminance field in the Scene panel, and insertion
  markers on the stage. (M3 for luminance with the pupil model; M6 otherwise)
- `web/apps/viewer/src/ui/Readout.tsx`: give the Gaze readout an
  "Approximation:" tooltip (centre of rotation at the globe centre). (M3)
- `web/apps/viewer/src/scene/EyeCutaway.tsx`: call
  `group.current.updateWorldMatrix(true, false)` before copying the cut plane so it
  does not lag the globe by one frame during saccades. (M6)
- `data/eom/README.md`: add `activation.json` (approximation by design) and
  `dynamics.json` (partly confirmed) to the status table. (M3)
