# Optics oracle

Cross-check data for the TypeScript ray tracer (spec §12: Optiland for rotationally symmetric
cases, a small Python reference tracer for toric and Zernike cases).

| File | Content |
|---|---|
| `cases.json` | 40 reproducible systems (20 conic, 10 toric, 10 Zernike-perturbed), each two to four refracting surfaces plus a flat image plane, with five rays each. Surfaces carry absolute `vertexZMm`; `"Infinity"` encodes an infinite radius. |
| `expected.json` | Image-plane hit of every ray from `science/eyebiomech/oracle/reference_tracer.py`. |

The reference tracer is written independently of `web/packages/optics`: every intersection is
found by Newton iteration from the vertex plane (no closed-form conic root), normals come from a
finite-difference sag gradient, and the Zernike polynomials are evaluated from the factorial
formula.

Checks:

- `science/tests/test_oracle.py`: the reference tracer agrees with Optiland (0.6.3) within
  1e-6 mm on all 20 conic systems; the committed files equal a fresh generation.
- `web/packages/optics/test/oracle.test.ts`: `traceRay` agrees with `expected.json` within
  1e-6 mm for all 40 systems.

Regenerate both files with `cd science && uv run python -m eyebiomech.oracle.generate` (seed
20261028), then rerun both tests.

Optiland stays in the `dev` dependency group (the M0 follow-up asked whether to move it to an
optional extra if install time became a problem): CI installs all groups and the cloud
sessions' `uv sync --all-groups` completes without trouble, so no change was needed.
