# Milestone 4 follow-ups

Items deferred while implementing Milestone 4 (2026-10-28). Each line names the
milestone that should absorb it. Resolve an item in the task that touches the
same file, and delete its line here in that commit.

Every item that named Milestone 5 was absorbed by the Milestone 5 plan
(`2026-10-29-m5-remodeling-calibration-prediction.md`, "Follow-ups absorbed from earlier
milestones") and removed here on 2026-10-29.

## Closed in Task 4.0

- Python cap (M0): closed, no cap. `science/uv.lock` lists cp314 wheels for NumPy
  and SciPy, scikit-fem is pure Python, and `uv run --python 3.14 --isolated --with
  scikit-fem --with numpy --with scipy` imports scikit-fem 12.0.2, NumPy 2.5.4, and
  SciPy 1.18.1 on CPython 3.14.6 (2026-10-28). CI still tests 3.12 only.
- Superior oblique insertion width (M2): transcribed from an excerpt (10.32 mm,
  Korean cadaver study), `verified: false`.

## Modeling

- `web/apps/viewer/src/store/scene.ts` / `worker/handle.ts`: accommodation demand uses
  the paraxial far point of the worn configuration, while auto-prescribe minimizes the
  RMS wavefront error; wearing the auto lens therefore adds about 0.2-0.36 D of
  accommodation and some defocus. Drive demand (or the far point it uses) by the same
  refraction measure as the prescription, or prescribe with the controller in the loop.
  Re-filed from M3 to M6: it is optics and viewer behavior with no biomechanics
  content, and M6 owns the other worker and readout follow-ups (M4 plan, Deviation 13).
  (M6)

## From implementation (2026-10-28)

- `web/apps/viewer/src/scene/DeformationMap.tsx`: the heat map is a full shell that hides the
  cutaway while shown; clip it to the cutaway's half or draw it translucent. (M6)
- `web/apps/viewer/test/bench.test.ts`: in this cloud container the worker benchmark varies
  between 50 and 140 ms per run (median near the 100 ms budget) with or without the M4 changes;
  watch CI and implement the planned performance work if it flakes. (M6)

## From the driver review of edd021b (2026-10-28, Minor findings not fixed in M4)

- `web/apps/viewer/src/results/load.ts` (`parseFiles`): check that the sidecar's `id` matches the
  EyeParameters document. (M6)

## From the driver review of 8ac4f73 (2026-10-28, Minor findings not fixed in M4)

- `web/apps/viewer/test/worker.test.ts`: the committed-result test asserts `cylinderD <= 0`,
  which a zero cylinder passes; also assert `|ΔC| > 1e-3`. (M6)

## From the driver review of b6f5a0d (2026-10-28, Minor findings not fixed in M4)

- `web/apps/viewer/src/ui/Biomechanics.tsx`: with a document loaded without a sidecar, ΔSphere
  and ΔCylinder show "…" indefinitely while the row below says "no reference"; show "—" or "no
  reference" in all three. (M6)
- `web/apps/viewer/src/ui/tooltips.ts`: tilted or decentered EyeParameters files can be loaded,
  but the paraxial-power, demand, and far-point readouts (`paraxial/abcd.ts`) ignore tilt and
  decenter; say so in their tooltips ("Approximation:"). (M6)
