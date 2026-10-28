# Optics oracle

Cross-check data for the TypeScript ray tracer (spec §12: Optiland for rotationally symmetric
cases, a small Python reference tracer for toric and Zernike cases).

| File | Content |
|---|---|
| `cases.json` | 52 reproducible systems: 20 conic, 10 toric, 10 Zernike-perturbed (M3); 4 with a decentered conic and 4 with a tilted and decentered conic or toric (M4, drawn from a second random stream so the M3 cases are unchanged); 2 "miss" and 2 "aperture" systems built by hand so that rays fail at the first or the second surface. Each has two to four refracting surfaces plus a flat image plane and five rays. Surfaces carry absolute `vertexZMm`, optional `decenterX`/`decenterY` (mm) and `tiltXDeg`/`tiltYDeg` (rotation about the vertex, about x first, then y, right-handed); `"Infinity"` encodes an infinite radius. |
| `expected.json` | Per ray, from `science/eyebiomech/oracle/reference_tracer.py`: the image-plane hit and the optical path Σ n·|segment| from the launch point (null when vignetted), the status (`ok`, `miss`, `aperture`, `tir`), and the index of the failing surface (null when ok). |

The reference tracer is written independently of `web/packages/optics`: every intersection is
found by Newton iteration from the vertex plane (no closed-form conic root), normals come from a
finite-difference sag gradient, and the Zernike polynomials are evaluated from the factorial
formula.

Checks:

- `science/tests/test_oracle.py`: the reference tracer agrees with Optiland within 1e-6 mm on
  the 20 conic and 4 decentered systems (every surface placed at absolute x, y, z in
  Optiland); a tilted sphere equals the same sphere with its vertex moved on the circle; the
  committed files equal a fresh generation.
- `web/packages/optics/test/oracle.test.ts`: `traceRay` agrees with `expected.json` for all 52
  systems: hits and optical paths within 1e-6 mm, failure reason and surface exactly. Tilted
  cases are checked TypeScript against Python only (the tilt convention is ours).

Regenerate both files with `cd science && uv run python -m eyebiomech.oracle.generate` (seed
20261028), then rerun both tests.

Optiland stays in the `dev` dependency group (the M0 follow-up asked whether to move it to an
optional extra if install time became a problem): CI installs all groups and the cloud
sessions' `uv sync --all-groups` completes without trouble, so no change was needed.
