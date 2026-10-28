# Milestone 4: Corneoscleral biomechanics

Date: 2026-10-28
Status: in progress (draft PR "Milestone 4: Corneoscleral biomechanics")
Master plan: `docs/superpowers/plans/2026-10-26-master-plan.md` (Milestone 4 section)

**Goal:** `uv run eyebiomech fem --eye data/fixtures/emmetrope-right.eye.json --gaze 0,0 --iop 15 --out data/results/fem/emmetrope-right-primary-15mmHg.eye.json` builds a 3D hyperelastic model of the corneoscleral shell from the document, loads it with intraocular pressure, the six muscle insertion forces exported from the TypeScript eye model, a ciliary ring load, and the eyelid band, solves it with Newton's method in scikit-fem, fits the deformed corneal surfaces to conic-plus-Zernike height maps, and writes a new EyeParameters document with provenance. The viewer loads that document (from a results dropdown or a file input), shows the induced refraction against the unloaded eye, and paints a displacement heat map on the globe with an exaggeration slider. The Milestone 0–3 follow-ups assigned to M4 are closed or re-filed with a reason. Every result is labeled **elastic**; remodeling is Milestone 5.

**Architecture:** `science/eyebiomech/fem/` holds the mesh (`mesh.py`), materials (`material.py`), loads (`loads.py`), the Newton solver (`solve.py`), surface sampling and Zernike fitting (`surfaces.py`), the exporter (`export.py`), and the CLI (`cli.py`, entry point `eyebiomech`). `science/eyebiomech/forces/from_viewer.py` reads the muscle force table that `pnpm --filter @eye/eye-model export-forces` writes from the TypeScript eye model, so the two sides share one muscle model. The only document crossing into the viewer is EyeParameters (schema unchanged at 1.0.0) plus a sidecar `*.deformation.json` holding the outer-surface displacement field for the heat map. `optics` gains tilted surfaces (the M3 follow-up) and the oracle gains decentered and tilted cases, optical path length, and the miss/aperture reasons.

**Tech Stack:** Python 3.12, uv, NumPy, SciPy (sparse LU), scikit-fem 12 (MeshHex2, ElementHex2, ElementVector, FacetBasis), jsonschema, pytest, ruff. TypeScript strict, Vitest, Vite 8's module runner for the force-export script, React 19, Zustand, three + react-three-fiber, Playwright 1.63.0.

**Spec:** `docs/superpowers/specs/2026-10-26-eye-simulation-design.md` §1.2 (scientific stance), §3.2 (EyeParameters, `extraocularMuscles`, `eyelid`, `zernikeHeight`, provenance), §4.4 (tendons, insertion width), §5.1 (tilt and decenter), §6.2 and §12 (displacement heat map with exaggeration slider, results under `data/results/`), §7 (all), §9 (pressurized sphere check, schema round trips).

## Deviations from the master plan (decided at planning time)

1. **Literature values are transcribed from search excerpts where the papers are unreachable.** The session's network policy denies the literature hosts (PMC, ARVO, doi.org, Europe PMC, publisher sites; checked again 2026-10-28). Material constants (Elsheikh 2007 age stiffening; Whitford 2015 and Pandolfi & Holzapfel 2008 fiber parameters), regional thicknesses, eyelid pressure and contact geometry (Shaw et al. 2008-2010), muscle force capacity, and tendon stiffness are taken from search-engine excerpts, each with its source named and `verified: false`. Values no excerpt gives are labeled `"assumption"` with the reasoning. The inflation verification (Task 4.4) uses whatever published apex-rise-versus-IOP points the excerpts give (Elsheikh 2007 if reachable, otherwise the first published corneal inflation study with numbers in an excerpt), stored as `inflationReference` with the source named; if none has numbers, the test is written against the stored points marked `"assumption"` and the item is re-filed. The test then checks the solver and mesh, and the claim of agreement with a publication waits for transcription.
2. **Cubed-sphere hexahedral mesh, quadratic elements.** The master plan's `n_theta × n_phi` mapped sector has a pole singularity where the cornea's apex sits. The mesh instead maps the six faces of a cube onto the shell (`n_face × n_face` cells per face, `layers` through the thickness), which is watertight with no degenerate cells, and uses 27-node quadratic hexahedra (`MeshHex2`, `ElementHex2`) because trilinear hexahedra lock in bending at the shell's 0.5 mm thickness. Interface: `make_shell_mesh(params, layers=3, n_face=12) -> ShellMesh`.
3. **Reference configuration and incremental reporting.** The measured geometry already carries the in-vivo IOP. No inverse (prestress) solve is done in M4. The model treats the document geometry as stress-free and reports the change caused by the non-IOP loads: it solves IOP alone and IOP plus the other loads, and adds the difference of the two deformed corneal surfaces to the document's surfaces. With `--loads iop` only, the absolute IOP inflation is reported instead (used by the inflation verification). This is labeled "Approximation:" in the viewer tooltip and in the provenance citation.
4. **Boundary condition.** A closed shell under net muscle force needs support. The outer-surface nodes within the optic-nerve radius of the posterior pole are fixed (the nerve and its sheath tether the globe; radius from the materials table). The analytic sphere test instead fixes the two tangential components at the six axis points, which the exact radial solution satisfies.
5. **Tendons transmit the muscle force unchanged.** In static equilibrium a series-elastic tendon carries the same force as the muscle in series with it, so "stiffness and slack reduce transmitted force" would be wrong while the muscle is a force source (length-proxy activation × maximum force). The tendon contributes its slack length and stiffness to the force table (tendon elongation `force / stiffness`, reported), and the footprint width to the load. A tendon with zero or missing stiffness is rejected, so the M2 placeholder 0 must be replaced (Task 4.3). A Hill-type muscle that makes the force depend on the tendon is left for the M5 or v2 equilibrium.
6. **Provenance fields.** The schema's `provenance` has `source, citation, generatedBy, gitHash, date, verified` and no `command`. The exporter writes `source: "eyebiomech fem"`, the full command line in `generatedBy`, the loads summary and "elastic" in `citation`, and `verified: false`.
7. **Displacement field in a sidecar.** EyeParameters has `additionalProperties: false` and holds surfaces, not fields. The CLI also writes `<name>.deformation.json` (schema `schemas/deformation.schema.json`, new, version 1.0.0) with the outer surface triangulation, vertex positions, displacements, the region per vertex, the loads, and the reference (unloaded) EyeParameters document embedded, so the viewer can compute induced refraction without the input file. A loaded EyeParameters without a sidecar shows refraction but no heat map; the tooltip says so.
8. **FEM frame and globe placement.** The FEM uses the EOM frame: origin at the globe center, x temporal, y superior, z posterior (mm). The sclera is a sphere of the EOM table's globe radius; the anterior cornea is the document's first surface placed so that it meets the scleral sphere at the limbus radius of the EOM table. The FEM globe's axial length therefore differs slightly from the document's `axialLengthMm`; the exporter changes the document's axial dimensions only by computed displacement differences, never by the mesh's absolute geometry.
9. **Lens and retina follow the globe.** The exported document keeps the lens's shape. Its axial position follows the mean axial displacement of the scleral-spur ring (the ciliary body suspends the lens), and the retina follows the posterior pole. So `cornea.anterior.thicknessToNextMm`, `cornea.posterior.thicknessToNextMm`, `lens.posterior.thicknessToNextMm`, and `axialLengthMm` change by the computed differences. Labeled "Approximation:".
10. **Force export runs through Vite's module runner.** The eye-model sources import JSON and use extensionless specifiers, which plain Node cannot run. `web/packages/eye-model/scripts/run.mjs` loads a TypeScript entry with `runnerImport` from `vite` (already in the lockfile through Vitest; declared as an explicit devDependency at the locked version). No new package enters the lockfile.
11. **HGO form.** The fiber term uses the Gasser–Ogden–Holzapfel dispersed invariant `E = κ(I₁ − 3) + (1 − 3κ)(I₄ − 1)` on the full (not isochoric) invariants, active only in tension (`E > 0`), added to a compressible neo-Hookean matrix `W = μ/2 (I₁ − 3) − μ ln J + λ/2 (ln J)²`. Fiber families: two orthogonal in-plane families in the cornea (nasal–temporal and superior–inferior), one circumferential family in the limbus, and two dispersed in-plane families in the sclera (meridional and circumferential), parameters from the materials table.
12. **The ciliary load is an assumption.** No excerpt gives the force the ciliary muscle exerts on the scleral spur per diopter. `data/materials/cornea-sclera.json` stores `ciliaryTensionNPerMmPerD` labeled `"assumption"` with an order-of-magnitude argument, and the CLI defaults to accommodation 0 D, so the committed result does not depend on it.
13. **Accommodation demand follow-up moves to M6.** The M3 follow-up on driving accommodation demand by the prescription's refraction measure is an optics and viewer behavior with no biomechanics content; M6 owns the other worker and readout follow-ups, so Task 4.0 re-files it there with this reason.

## Global Constraints

- Units: millimeters, diopters, degrees in data files and UI; radians internal to math modules; the FEM works in mm, N, and MPa (N/mm²), so 1 kPa = 1e-3 MPa and 1 mmHg = 1.33322e-4 MPa (a unit conversion, defined once in `fem/units.py` with its derivation). Right-handed; the FEM frame is the EOM frame (Deviation 8).
- TypeScript `strict: true`, no `any` in `eye-model` or `optics`. These two packages import nothing from the DOM or React. `optics` does not import `eye-model`.
- Every numeric constant lives in `data/` with a citation; code never hard-codes a physiological value. Numerical choices (mesh resolution, tolerances, quadrature order, iteration limits) are named constants with a comment saying they are numerical.
- All optics computation runs in a web worker; the main thread never blocks more than 16 ms per frame (the induced-refraction comparison runs in the worker).
- `EyeParameters.schemaVersion` stays `"1.0.0"`; Python validates every document it reads and writes; the viewer validates every document it loads and rejects an unknown major version with a banner naming the version.
- Python 3.12; dependencies stay NumPy, SciPy, scikit-fem, jsonschema (no new runtime dependency).
- Results are labeled "elastic" everywhere (provenance, viewer readout); the viewer and docs keep the §1.2 stance that the muscle-loading hypothesis is being tested, not assumed.
- Approximations (stress-free reference geometry, fixed optic-nerve cap, lens and retina following the globe, force from length-proxy activation × maximum force, tilt ignored by paraxial optics) are labeled "Approximation:" in the UI tooltip of the affected readout.
- Full gate before every commit: `(cd web && pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build) && (cd science && uv run ruff check . && uv run pytest -m "not slow")`, plus `(cd web && pnpm --filter @eye/viewer e2e)` because `web/apps/viewer/e2e/` exists. Run the slow Python tests (`uv run pytest -m slow`) before the tasks that add them are committed.
- Commit messages end with `Co-Authored-By: Claude <model name> <noreply@anthropic.com>` naming the model that wrote them. One task per commit; push after every commit.

## Review Focus

Failure modes this milestone owns, each tied to the task that tests it:

1. **Unphysical FEM result reaches the viewer.** The exporter raises `UnphysicalResultError` when any fitted height map's RMS exceeds 500 µm or the Newton solve did not converge; nothing is written. → Task 4.7.
2. **Newton divergence.** The solver stops after a bounded number of iterations, reports the residual history, and raises `NewtonDidNotConverge`; load stepping (default 4 increments) keeps the follower pressure stable. → Task 4.4.
3. **Rigid-body modes.** The stiffness matrix is singular without support; every solve applies the optic-nerve cap (or the sphere test's axis constraints), and a test checks the solution is unique (two solves agree to round-off). → Task 4.4.
4. **Muscle order and frame mismatch across the TS/Python boundary.** The force table names each muscle and states its frame; the Python loader rejects an unknown muscle, a missing muscle, or a frame string it does not recognize; the TS and Python sides agree on `MUSCLE_NAMES` order. → Task 4.3.
5. **Zernike fit outside its domain.** Surface sampling uses only nodes within the normalization radius, the fit refuses fewer samples than three times the number of terms, and a pure sphere fits to coefficients below 1e-3 µm. → Task 4.6.
6. **Schema drift.** Exported documents validate on both sides (Python on write, TS in a test that loads the committed result); the sidecar validates against its own schema on both sides. → Task 4.7, Task 4.8.
7. **Tilted surfaces in the fast trace paths.** A tilted surface never takes the untilted closed-form fast path; zero tilt reproduces the old results bit for bit. → Task 4.1.

## File structure

```
data/materials/cornea-sclera.json         stiffness, fibers, thickness by region, age function, optic-nerve radius, spur position, ciliary assumption (Task 4.2)
data/materials/README.md                  sources and excerpt status
data/eyelid/shaw-2010.json                lid pressures, contact band heights, palpebral aperture (Task 4.2)
data/eyelid/README.md
data/eom/forces.json                      maximum muscle force per muscle, cited (Task 4.3)
data/eom/geometry-default.json            (modify) tendon stiffness replaces the 0 placeholder (Task 4.3)
data/results/forces/default.json          committed force table, 5 × 5 gaze grid (Task 4.3)
data/results/fem/emmetrope-right-primary-15mmHg.eye.json          committed elastic result (Task 4.7)
data/results/fem/emmetrope-right-primary-15mmHg.deformation.json  its displacement sidecar (Task 4.7)
data/results/README.md                    what each result is and how it was made
schemas/deformation.schema.json           sidecar schema (Task 4.7)
science/eyebiomech/schemas/               (package data) copies of the two schemas, kept identical by a test (Task 4.7)
science/eyebiomech/fem/
  __init__.py
  units.py         mmHg/kPa → MPa
  data.py          loaders for the materials, eyelid, and EOM tables
  mesh.py          cubed-sphere corneoscleral hex mesh with region tags
  material.py      NeoHookean, HGO, fiber directions, age scaling
  loads.py         Loads: iop, insertion, ciliary, eyelid
  solve.py         Newton solve with load stepping, Dirichlet supports
  surfaces.py      deformed surface sampling, conic + Zernike fit
  export.py        EyeParameters and sidecar writer; UnphysicalResultError
  cli.py           `eyebiomech fem ...`
science/eyebiomech/forces/
  __init__.py
  from_viewer.py   load_force_table
science/tests/test_fem_mesh.py, test_fem_material.py, test_fem_solve.py, test_fem_loads.py,
  test_fem_surfaces.py, test_fem_export.py, test_forces.py, test_zernike.py
web/packages/optics/src/surfaces/tilt.ts                 tilted local frames (Task 4.1)
web/packages/eye-model/scripts/run.mjs                   Vite module-runner launcher (Task 4.3)
web/packages/eye-model/scripts/export-forces.ts          gaze grid → insertion force vectors JSON (Task 4.3)
web/packages/eye-model/src/eom/forces.ts                 muscleForces(gaze, params) (Task 4.3)
web/apps/viewer/src/results/catalog.ts                   results dropdown entries via import.meta.glob (Task 4.8)
web/apps/viewer/src/results/load.ts                      parse + validate EyeParameters and sidecar (Task 4.8)
web/apps/viewer/src/scene/DeformationMap.tsx             displacement heat map + exaggeration (Task 4.8)
web/apps/viewer/src/ui/Biomechanics.tsx                  inspector panel: results dropdown, file input, induced refraction, exaggeration slider, legend (Task 4.8)
web/apps/viewer/e2e/biomechanics.spec.ts
```

---

### Task 4.0: Follow-ups that need no new code

Closes or re-files the follow-ups assigned to M4 that are data, packaging metadata, or document transcription.

**Files:**
- Modify: `science/pyproject.toml` (only if a cap is needed), `data/schematic-eyes/README.md`, `data/eom/README.md`
- Create: `docs/superpowers/plans/2026-10-28-m4-followups.md`

**Interfaces:** none (data and docs).

- [ ] **Step 1:** Python cap (M0 follow-up "requires-python is uncapped; consider `<3.14` once scikit-fem and SciPy wheels for 3.14 are confirmed"). `uv.lock` already lists cp314 wheels for NumPy and SciPy, and scikit-fem is pure Python, so the condition for leaving it uncapped holds: confirm with `grep -c cp314 science/uv.lock` and `uv run --python 3.14 --isolated python -c "import skfem"` if a 3.14 interpreter is available offline; record the outcome in `2026-10-28-m4-followups.md` ("closed: wheels confirmed" or "cap added because ..."), and add `<3.14` only if the import fails.
- [ ] **Step 2:** Re-search, once each, for the values that need document access: Zapata-Díaz 2019 Table 1 (`data/schematic-eyes/zapata-diaz-2019.json`), Navarro 1985 Table 4 conic coefficients, Volkmann 1869 rectus and oblique origins, Clark, Miller & Demer 2000 pulley coordinates, Polans 2015 angle alpha and lens tilt, and the superior/inferior rectus and oblique insertion widths and tendon lengths (M2 follow-up). Transcribe any value an excerpt gives with its source and `verified: false`. Re-file what remains in `2026-10-28-m4-followups.md` naming M5 ("needs a session with document access"), with the date and the hosts tried. Tilt support itself lands in Task 4.1, so the Polans item becomes transcription only.
- [ ] **Step 3:** Re-file the accommodation-demand follow-up (M3 "Modeling") to M6 in `2026-10-28-m4-followups.md` with Deviation 13's reason.
- [ ] **Step 4:** Full gate. Commit: `chore: M4 follow-up triage (python cap, transcription search, re-files)`.

### Task 4.1: Tilted surfaces and the extended oracle

Closes the M3 follow-ups "surface tilt still throws (`assertNoTilt`); spec §5.1 asks for tilt and decenter" and "the oracle compares final image hits only; add optical path length, decentered surfaces, and the `miss`/`aperture` reasons".

**Files:**
- Create: `web/packages/optics/src/surfaces/tilt.ts`, `web/packages/optics/test/tilt.test.ts`
- Modify: `web/packages/optics/src/surfaces/conic.ts` (remove `assertNoTilt`), `src/surfaces/geometry.ts`, `src/surfaces/types.ts` (doc comment), `src/trace/sequential.ts`, `src/paraxial/abcd.ts` (doc comment: tilt ignored, approximation), `src/index.ts`, `test/oracle.test.ts`
- Modify: `science/eyebiomech/oracle/reference_tracer.py`, `cases.py`, `generate.py`, `science/tests/test_oracle.py`, `data/oracle/cases.json`, `data/oracle/expected.json`

**Interfaces:**
- Produces (optics): `tilt.ts`: `interface SurfaceFrame { pivot: Vec3; rot: Mat3 /* local→global */ }`; `surfaceFrame(s: SurfaceBase): SurfaceFrame | null` (null when both tilts are zero); `toLocal(f, p: Vec3): Vec3`, `dirToLocal(f, d: Vec3): Vec3`, `toGlobal(f, p)`, `dirToGlobal(f, d)`. The pivot is the vertex `(decenter.xMm, decenter.yMm, vertexZMm)`; the rotation is `R = Ry(yDeg)·Rx(xDeg)` (first about x, then about y, both right-handed, Zemax "tilt about X then Y" order), applied to the surface about the pivot. `intersect(s, origin, dir)` and `normalAt` work in the local frame and return global quantities; the aperture is measured in the local x–y plane. Zero tilt takes the existing code path unchanged.
- Produces (oracle): each case's expected record gains `opticalPathMm: number | null` (OPL from the launch point to the final hit, index × length summed) and `status: "ok" | "miss" | "aperture"` with `surfaceIndex` of the first failure.

- [ ] **Step 1:** Failing tests:
  - `tilt.test.ts`: `toGlobal(toLocal(p)) = p` within 1e-12 for random points and tilts; a plane tilted by `xDeg = 10` reflects the geometry (the intersection of a z-parallel ray at height y lies at `z = vertexZ + y·tan(10°)` with the sign of the right-hand rotation about +x); a sphere tilted about its vertex equals the same sphere decentered to its rotated center of curvature, for 20 random rays (1e-9 mm); a ray through a tilted conic's local aperture edge is clipped by the local, not global, radius; the zero-tilt Navarro trace is identical to the pre-change result (bit for bit on 10 rays).
  - `oracle.test.ts`: the TypeScript tracer matches the Python reference on every case in the extended `expected.json`, comparing hit points (1e-6 mm), `opticalPathMm` (1e-6 mm), and `status`/`surfaceIndex` exactly.
  - `test_oracle.py`: the reference tracer agrees with Optiland on the conic cases including the new decentered ones (Optiland supports decenter; tilted cases are compared only TS vs Python); the generator writes the new fields; at least 4 decentered, 4 tilted, 2 miss, and 2 aperture cases exist.
- [ ] **Step 2:** Run `cd web && pnpm --filter @eye/optics test` and `cd science && uv run pytest tests/test_oracle.py`; expect FAIL.
- [ ] **Step 3:** Implement `tilt.ts`, the local-frame dispatch in `geometry.ts` and `trace/sequential.ts` (tilted surfaces skip the untilted scalar fast paths), the Python tracer's tilt/decenter/OPL/status, the new cases, and regenerate `expected.json` with `uv run python -m eyebiomech.oracle.generate`.
- [ ] **Step 4:** Run; PASS. Full gate (the worker bench must stay under 100 ms). Commit: `feat(optics): tilted surfaces; oracle with OPL, decenter, tilt, and failure reasons`.

### Task 4.2: Materials and eyelid tables

**Files:**
- Create: `data/materials/cornea-sclera.json`, `data/materials/README.md`, `data/eyelid/shaw-2010.json`, `data/eyelid/README.md`, `science/eyebiomech/fem/__init__.py`, `science/eyebiomech/fem/units.py`, `science/eyebiomech/fem/data.py`, `science/tests/test_fem_data.py`
- Modify: `docs/literature/README.md` (rows for the sources used, DOIs where an excerpt gives them; closes the M0 DOI item for the material, eyelid, and remodeling rows that M4 transcribes)

**Data:** `cornea-sclera.json`:
```
{ name, citation, verified: false,
  regions: {
    cornea:  { neoHookean: { muMPa, lambdaMPa }, fibers: { k1MPa, k2, kappa, families: ["nasalTemporal", "superiorInferior"] }, thicknessMm: { central: "document", limbal } },
    limbus:  { neoHookean, fibers: { k1MPa, k2, kappa, families: ["circumferential"] }, halfWidthDeg },
    sclera:  { neoHookean, fibers: { k1MPa, k2, kappa, families: ["meridional", "circumferential"] }, thicknessMm: { limbus, equator, posterior } } },
  ageStiffening: { form: "exponential", referenceAge, ratePerYear, citation },
  opticNerve: { radiusMm, citation },
  scleralSpur: { arcFromLimbusMm, citation },
  ciliaryTensionNPerMmPerD: { value, citation: "assumption", reasoning },
  inflationReference: { source, iopMmHg: [...], apexRiseUm: [...], specimenAgeYears, citation, verified } }
```
Each leaf group carries its own `citation` and `verified`. `shaw-2010.json`: `{ upperPressureMmHg, lowerPressureMmHg, upperContactHeightMm, lowerContactHeightMm, palpebralApertureMm, citation, verified }`.

**Interfaces:**
- Produces: `units.py`: `MMHG_TO_MPA: float`, `KPA_TO_MPA: float`, `mmhg_to_mpa(p) -> float`. `data.py`: `DATA_DIR: Path`; `load_materials(path=None) -> dict`; `load_eyelid(path=None) -> dict`; `load_eom_table(path=None) -> dict`; `age_factor(age_years: float, table: dict) -> float` (multiplies every stiffness; 1 at the reference age, clamped to the table's age range 6–90).

- [ ] **Step 1:** Search excerpts for each quantity (Elsheikh et al. 2007 Curr Eye Res 32:11-19 age stiffening; Whitford, Studer, Boote, Meek, Elsheikh 2015 J Mech Behav Biomed Mater 42:76-87 fiber parameters; Pandolfi & Holzapfel 2008 J Biomech Eng 130:061006; central/limbal corneal and regional scleral thickness (Olsen 1998, Vurgese 2012, Norman 2010); optic nerve sheath radius at the sclera; scleral spur position; Shaw, Collins, Davis & Carney 2008-2010 lid pressure and contact height; a published corneal inflation curve with numbers). Write the two tables and the READMEs with excerpt status per value.
- [ ] **Step 2:** Failing tests (`test_fem_data.py`): both tables load; every leaf group has `citation` and `verified`; `age_factor` is 1 at the reference age, monotone non-decreasing, and clamps at 6 and 90; `mmhg_to_mpa(15) ≈ 0.0019998` (1e-7); every stiffness is positive and `lambdaMPa / muMPa > 10` (near incompressibility, a check of the transcription).
- [ ] **Step 3:** Run `cd science && uv run pytest tests/test_fem_data.py`; FAIL. Implement `units.py`, `data.py`. Run; PASS.
- [ ] **Step 4:** Full gate. Commit: `feat(fem): material, thickness, and eyelid tables with loaders`.

### Task 4.3: Muscle force export and import

Closes the M2 follow-up "tendon stiffness is a 0 placeholder; transcribe before the M4 force export".

**Files:**
- Create: `data/eom/forces.json`, `web/packages/eye-model/src/eom/forces.ts`, `web/packages/eye-model/test/forces.test.ts`, `web/packages/eye-model/scripts/run.mjs`, `web/packages/eye-model/scripts/export-forces.ts`, `web/packages/eye-model/test/export-forces.test.ts`, `science/eyebiomech/forces/__init__.py`, `science/eyebiomech/forces/from_viewer.py`, `science/tests/test_forces.py`, `data/results/forces/default.json`, `data/results/README.md`
- Modify: `data/eom/geometry-default.json` (tendon stiffness), `data/eom/README.md`, `web/packages/eye-model/package.json` (`export-forces` script, explicit `vite` devDependency at the locked version), `web/packages/eye-model/src/eom/geometry.ts` (`EomTable` gains nothing; `EomMuscle.tendon` unchanged), `web/packages/eye-model/src/index.ts`

**Data:** `forces.json`: `{ name, citation, verified: false, muscles: { lateralRectus: { maxForceN, citation }, ... }, note: "force = activation × maxForceN, an approximation (length-proxy activation)" }`. Tendon `stiffnessNPerMm` in `geometry-default.json` from an excerpt (or a labeled assumption with an order-of-magnitude argument if none), positive for every muscle.

**Interfaces:**
- Produces (TS): `forces.ts`: `interface MuscleForce { name: MuscleName; insertionMm: Vec3 /* rotated with gaze, eye frame */; tangentPointMm: Vec3; pullDir: Vec3; forceN: number; activation: number; pathLengthMm: number; tendonElongationMm: number; insertionWidthMm: number }`; `muscleForces(gaze: Quat, muscles?: EomMuscle[], table?: ForceTable): MuscleForce[]` in `MUSCLE_NAMES` order, rest lengths from the primary-position paths, activation from `activations`, `forceN = activation × maxForceN`, `tendonElongationMm = forceN / stiffnessNPerMm` (throws on non-positive stiffness). `FORCE_TABLE: ForceTable`.
- Produces (script): `pnpm --filter @eye/eye-model export-forces --grid 5 --range 30 --out <path>` writes `{ schema: "eye-forces/1", frame: "<EOM frame string>", muscles: MUSCLE_NAMES, gazes: [{ horizontalDeg, verticalDeg, entries: MuscleForce[] }], provenance: { generatedBy, gitHash, date, citation } }`, with gazes on an `grid × grid` lattice over `±range` degrees (Listing's law quaternion from `gazeQuaternion`).
- Produces (Python): `from_viewer.py`: `@dataclass(frozen=True) ForceTable { muscles: tuple[str, ...]; gazes_deg: NDArray (G, 2); insertion_mm: NDArray (G, 6, 3); pull_dir: NDArray (G, 6, 3); force_n: NDArray (G, 6); width_mm: NDArray (G, 6); tangent_mm: NDArray (G, 6, 3) }`; `load_force_table(path) -> ForceTable` (rejects a different `schema`, frame, or muscle list); `ForceTable.at(horizontal_deg, vertical_deg) -> index` (exact grid match, else `KeyError`). `MUSCLE_NAMES` in Python equals the TS order.

- [ ] **Step 1:** Search excerpts for maximum (or tetanic) extraocular muscle force per muscle and for human extraocular tendon stiffness; write `forces.json` and the tendon stiffness with sources and `verified: false`.
- [ ] **Step 2:** Failing tests:
  - `forces.test.ts`: at primary gaze all six forces equal `baseline × maxForceN` (the activation table's baseline) and every `pullDir` is a unit vector pointing away from the globe surface at the tangent point (`pullDir · tangentPoint/|tangentPoint| ≥ 0`); at 20° abduction the lateral rectus force rises and the medial falls; tendon elongation is `force / stiffness`; a zero stiffness throws.
  - `export-forces.test.ts`: running the script's `buildForceTable({ grid: 5, rangeDeg: 30 })` gives 25 gazes × 6 entries, the center gaze is primary, and the JSON round-trips; the CLI writes the file (spawned through `scripts/run.mjs`, temp dir).
  - `test_forces.py`: `load_force_table("data/results/forces/default.json")` returns arrays of shape (25, 6, 3), (25, 6); a table with a muscle missing, an unknown frame, or a wrong `schema` raises `ValueError` naming the problem.
- [ ] **Step 3:** Run; FAIL. Implement `forces.ts`, `run.mjs` (`runnerImport` from `vite`, forwards argv), `export-forces.ts`, `from_viewer.py`. Generate `data/results/forces/default.json`. Run; PASS.
- [ ] **Step 4:** Full gate. Commit: `feat: muscle insertion force export and import`.

### Task 4.4: Shell mesh, hyperelastic materials, and Newton solver with analytic checks

The master plan's Tasks 4.1 and 4.2 in one commit, because the mesh's acceptance (volume, watertightness) and the solver's (Lamé, inflation) share fixtures and neither is useful alone.

**Files:**
- Create: `science/eyebiomech/fem/mesh.py`, `material.py`, `solve.py`, `science/tests/test_fem_mesh.py`, `test_fem_material.py`, `test_fem_solve.py`

**Interfaces:**
- Produces:
  - `mesh.py`: `@dataclass ShellMesh { mesh: skfem.MeshHex2; region: NDArray[int] /* per element: 0 cornea, 1 limbus, 2 sclera */; outer_facets: NDArray; inner_facets: NDArray; apex_z_mm: float; limbus_polar_rad: float; sclera_radius_mm: float }`; `REGIONS = ("cornea", "limbus", "sclera")`; `make_shell_mesh(params: dict, layers: int = 3, n_face: int = 12, materials: dict | None = None, eom: dict | None = None) -> ShellMesh` (Deviation 2, 8: outer surface = anterior cornea within the limbus, scleral sphere outside; inner = posterior cornea within the limbus, the sclera's inner surface `R − t(θ)` outside with `t` interpolated limbus → equator → posterior from the table; a smoothstep blend across the limbal band); `make_sphere_shell(inner_mm: float, outer_mm: float, layers: int = 2, n_face: int = 6) -> ShellMesh` for verification (all elements region "sclera").
  - `material.py`: `NeoHookean(mu: float, lam: float)`; `HGO(mu: float, lam: float, k1: float, k2: float, kappa: float, fibers: NDArray /* (F, 3, nqp…) or callable */)`; each has `energy(F) -> NDArray`, `first_pk(F) -> NDArray (3, 3, …)`, `tangent(F, dF) -> NDArray` (directional derivative of P). `fiber_directions(points: NDArray (3, …), region: str, frame: ShellGeometry) -> list[NDArray]` (unit, tangent to the shell). `region_materials(materials: dict, age: float) -> dict[str, Material]` with `age_factor` applied.
  - `solve.py`: `class NewtonDidNotConverge(RuntimeError)` (carries `residual_history`); `@dataclass Solution { u: NDArray; basis: skfem.Basis; residual_history: list[float]; converged: bool; load_steps: int }`; `solve(shell: ShellMesh, materials: dict[str, Material], loads: Loads, *, support: "optic_nerve" | "axis_points" = "optic_nerve", optic_nerve_radius_mm: float | None = None, steps: int = 4, tol: float = 1e-8, max_iter: int = 25) -> Solution` (relative residual tolerance; consistent tangent including the follower-pressure load stiffness; sparse LU per iteration).
  - `Loads` is defined in Task 4.5; this task uses a minimal `Loads` with only `iop` (the class grows in Task 4.5 without changing `solve`).

Constants (numerical): quadrature order 4 for volume integrals of the 27-node element (exact for the mass-like terms, sufficient for the nonlinear ones), 4 on facets; `n_face = 12`, `layers = 3` for the CLI; `n_face = 6`, `layers = 2` in fast tests.

- [ ] **Step 1:** Failing tests:
  - `test_fem_mesh.py`: the shell has exactly two boundary surfaces (outer and inner), each a closed 2-manifold (every boundary edge shared by two boundary facets, Euler characteristic 2) — "watertight"; `make_sphere_shell(10, 11)` volume within 0.5% of `4π(11³ − 10³)/3`; for the fixture eye the volume is within 2% of the analytic volume of the region between the outer and inner surfaces (computed by 1D quadrature over polar angle); every node's radius lies between the inner and outer surface radii along its direction (1e-9); region tags: the apex element is cornea, the posterior pole element is sclera, and some elements are limbus.
  - `test_fem_material.py`: zero energy and zero stress at `F = I`; `first_pk` equals the numerical derivative of `energy` (central differences, 1e-6 relative) for random `F` near `I`; `tangent` equals the numerical derivative of `first_pk` (1e-6 relative); HGO fibers carry no stress in compression; the small-strain limit of the neo-Hookean gives `E = μ(3λ + 2μ)/(λ + μ)`.
  - `test_fem_solve.py`: a neo-Hookean `make_sphere_shell(10, 11)` under 1 kPa internal pressure (support `axis_points`) has outer radial displacement within 2% of the Lamé solution `u(b) = p a³ [(1 − 2ν) b + (1 + ν) b / 2] / (E (b³ − a³))` (evaluated at r = b); two solves agree to 1e-10 relative (rigid modes removed); the residual history decreases quadratically in the last iterations (ratio test); a load too large for the mesh raises `NewtonDidNotConverge` with the history. `@pytest.mark.slow`: the fixture eye's apex rise under IOP alone at the `inflationReference` pressures is within 15% of the reference points (Deviation 1), using the reference specimen age.
- [ ] **Step 2:** Run `cd science && uv run pytest tests/test_fem_mesh.py tests/test_fem_material.py tests/test_fem_solve.py`; FAIL.
- [ ] **Step 3:** Implement `mesh.py` (cube-face grids merged by node deduplication, mapped to directions, radial layers; `MeshHex2` built from the `MeshHex1` connectivity via `skfem`'s quadratic conversion with mid-nodes projected onto the mapped geometry), `material.py`, `solve.py` (follower pressure: traction `−p J F⁻ᵀ N` on the inner facets with its linearization).
- [ ] **Step 4:** Run (including `-m slow`); PASS. Full gate. Commit: `feat(fem): corneoscleral hex shell mesh, hyperelastic materials, Newton solver with analytic checks`.

### Task 4.5: Loads: IOP, insertions, ciliary ring, eyelid band

**Files:**
- Create: `science/eyebiomech/fem/loads.py`, `science/tests/test_fem_loads.py`
- Modify: `science/eyebiomech/fem/solve.py` (consume every load kind)

**Interfaces:**
- Produces: `class Loads` with builder methods returning `self`:
  - `.iop(pressure_mmhg: float)` (follower pressure on the inner surface);
  - `.insertion(muscle: str, force_n: float, pull_dir: ArrayLike, center_mm: ArrayLike, footprint_width_mm: float, tendon: dict, footprint_length_mm: float | None = None)`: a dead-load traction uniform over the footprint on the outer surface (a band of `footprint_width_mm` across the pull direction and `footprint_length_mm` along it, centered at the insertion; the length defaults to the table's `insertionFootprintLengthMm`), scaled so its integral equals `force_n · pull_dir` exactly on the discrete surface; `tendon` is validated (positive stiffness) and recorded (Deviation 5);
  - `.ciliary(tension_n_per_mm: float, accommodation_d: float)`: a line load around the scleral-spur circle (arc from the limbus from the table), tangent to the outer surface along the meridian, pointing posterior, magnitude `tension_n_per_mm × accommodation_d` per mm of circumference (Deviation 12);
  - `.eyelid(upper_kpa: float, lower_kpa: float, aperture_mm: float, upper_height_mm: float, lower_height_mm: float)`: normal pressure on the outer surface over the anterior hemisphere (`z < 0`) in the bands `aperture/2 ≤ y ≤ aperture/2 + upper_height` and `−aperture/2 − lower_height ≤ y ≤ −aperture/2`;
  - `.from_force_table(table: ForceTable, gaze_index: int, eom: dict)`: one `.insertion` per muscle;
  - `.summary() -> dict` (JSON-serializable list of loads with magnitudes, for provenance);
  - `.assemble(basis, facet_basis_outer, facet_basis_inner, u) -> (residual_contribution, tangent_contribution)` used by `solve`.
- Constants (numerical): facet quadrature order for band indicators 6.

- [ ] **Step 1:** Failing tests:
  - total applied insertion force equals the input force vector within 1e-6 N for each muscle of the default force table at primary gaze;
  - on `make_sphere_shell(11.5, 12)` (sphere geometry, so the band area is analytic), the lid band's total normal force equals `p · π · R · h` per band within 2% (quadrature of a band edge cut through elements, at `n_face = 12`);
  - the ciliary ring's total force is axial with magnitude `tension × A × 2π r_spur × cos(slope)` within 2%, and zero at 0 D;
  - a symmetric load set (IOP plus equal upper and lower lid bands, on the fixture eye, `n_face = 6`) produces a displacement field mirror-symmetric under `x → −x` to 1e-6 relative to its maximum (mirror nodes found with a KD-tree);
  - `summary()` is JSON-serializable and lists each load once.
- [ ] **Step 2:** Run; FAIL. Implement; run; PASS.
- [ ] **Step 3:** Full gate. Commit: `feat(fem): IOP, insertion, ciliary, and eyelid loads`.

### Task 4.6: Deformed-surface sampling and Zernike fit

**Files:**
- Create: `science/eyebiomech/zernike.py` (OSA/ANSI polynomials matching `web/packages/optics/src/math/zernike.ts`), `science/eyebiomech/fem/surfaces.py`, `science/tests/test_zernike.py`, `science/tests/test_fem_surfaces.py`

**Interfaces:**
- Produces:
  - `zernike.py`: `zernike_index(j) -> (n, m)`, `zernike_count(max_order) -> int`, `zernike_value(j, rho, theta) -> NDArray` (OSA/ANSI, unit-RMS, θ from +x toward +y, as in the optics package).
  - `surfaces.py`: `@dataclass ConicFit { radius_mm: float; conic: float; apex_z_mm: float; rms_residual_um: float }`; `fit_conic(points_xyz) -> ConicFit` (least squares on the sag equation in the optics frame); `fit_surface_zernike(points_xyz: NDArray (N, 3), norm_radius_mm: float, max_order: int = 8, conic: ConicFit | None = None) -> tuple[NDArray, ConicFit]` (coefficients in µm, OSA order, of the height residual after subtracting the best-fit conic, points beyond `norm_radius_mm` excluded, raises `ValueError` with fewer than `3 × zernike_count(max_order)` samples); `deformed_corneal_surfaces(shell: ShellMesh, u: NDArray, norm_radius_mm: float, max_order: int = 8) -> CornealSurfaces { anterior: (coeffs, ConicFit); posterior: (coeffs, ConicFit); outer_points; inner_points }`. Points are converted from the FEM frame (Deviation 8) to the optics frame of the anterior surface (z from the undeformed apex toward the retina, x temporal, y superior) before fitting.

- [ ] **Step 1:** Failing tests:
  - `test_zernike.py`: index round trip for j < 45; `Z(2,0) = √3(2ρ² − 1)`; values agree with the TypeScript implementation at 20 points written into a small fixture by the optics package's test (`data/oracle/zernike-values.json`, generated once by a TS test helper and committed) within 1e-12.
  - `test_fem_surfaces.py`: points sampled from a pure sphere (R 7.8 mm, 4 mm radius) fit to all coefficients below 1e-3 µm and `radius_mm` within 1e-6 mm; a synthetic 1 µm `C(2,2)` added to a conic is recovered within 1%; a conic `k = −0.26` is recovered within 1e-4; too few points raise; `deformed_corneal_surfaces` on the undeformed fixture mesh (u = 0) returns the document's radius within 0.5% and conic within 0.05 (mesh discretization of the outer surface).
- [ ] **Step 2:** Run; FAIL. Implement; run; PASS.
- [ ] **Step 3:** Full gate. Commit: `feat(fem): deformed surface Zernike fitting`.

### Task 4.7: Exporter, CLI, schemas as package data, committed result

Closes the M0 follow-up "`schema.py` reads the schema from the repository checkout; packaging `eyebiomech` outside the repo needs the schema bundled as package data".

**Files:**
- Create: `schemas/deformation.schema.json`, `science/eyebiomech/schemas/eye-parameters.schema.json`, `science/eyebiomech/schemas/deformation.schema.json`, `science/eyebiomech/fem/export.py`, `science/eyebiomech/fem/cli.py`, `science/tests/test_fem_export.py`, `science/tests/test_packaging.py`, `data/results/fem/emmetrope-right-primary-15mmHg.eye.json`, `data/results/fem/emmetrope-right-primary-15mmHg.deformation.json`
- Modify: `science/eyebiomech/schema.py` (load from package data via `importlib.resources`; add `validate_deformation`), `science/pyproject.toml` (`[project.scripts] eyebiomech = "eyebiomech.fem.cli:main"`, package data included), `data/results/README.md`, `docs/superpowers/plans/2026-10-26-m0-followups.md` (line already removed at plan time)

**Interfaces:**
- Produces:
  - `export.py`: `class UnphysicalResultError(ValueError)`; `MAX_MAP_RMS_UM = 500` (master plan Review Focus 5, a sanity limit, numerical); `build_result(params: dict, reference: CornealSurfaces, loaded: CornealSurfaces, shift: AxialShifts, provenance: dict) -> dict` (Deviation 3, 9: anterior and posterior cornea become `type: "zernike"` with the loaded best-fit conic plus the change from reference, `zernikeHeight.normRadiusMm` = fit radius; thicknesses and `axialLengthMm` updated); `check_physical(doc) -> None` (raises when any map RMS, excluding piston, exceeds 500 µm, or a radius is non-finite); `build_deformation(shell, u_reference, u_loaded, loads_summary, reference_doc) -> dict`; `write_result(doc, sidecar, out_path) -> tuple[Path, Path]` (validates both, then writes; `out_path` ends in `.eye.json`, the sidecar replaces it with `.deformation.json`).
  - `cli.py`: `main(argv: list[str] | None = None) -> int`; `eyebiomech fem --eye PATH --gaze H,V --iop MMHG [--accommodation D] [--forces PATH] [--no-eyelid] [--loads all|iop] [--age YEARS] [--n-face N] [--layers N] --out PATH`. Defaults: forces `data/results/forces/default.json`, eyelid from `data/eyelid/shaw-2010.json` when the document has no `eyelid`, age from the document. Exit code 2 with a message on validation errors or `UnphysicalResultError`; the message names the problem.
  - `schema.py`: `validate_eye_parameters(doc)` unchanged in behavior; `validate_deformation(doc)`.
- Sidecar (`schemas/deformation.schema.json`, `schemaVersion: "1.0.0"`): `{ schemaVersion, id, provenance (same shape as EyeParameters), frame, elastic: true, loads: [...], vertices: number[][3] (mm), triangles: int[][3], displacementMm: number[][3] (loaded minus reference), region: ("cornea"|"limbus"|"sclera")[], reference: EyeParameters }`.

- [ ] **Step 1:** Failing tests:
  - `test_fem_export.py`: `check_physical` raises `UnphysicalResultError` for a document whose anterior map has RMS 600 µm and passes for 1 µm; a non-converged solution is refused; `build_result` on reference = loaded returns the input surfaces' radii and zero Zernike coefficients (1e-9) and unchanged thicknesses; the written document validates with `validate_eye_parameters` and the sidecar with `validate_deformation`; provenance has `source: "eyebiomech fem"`, a `generatedBy` with the command, a 40-hex or empty `gitHash`, today's date, `verified: false`, and "elastic" in the citation; `cli.main([...])` on the fixture with `--n-face 4 --layers 2` writes both files and returns 0, and returns 2 with a message for a `schemaVersion: "2.0.0"` input.
  - `test_packaging.py`: `eyebiomech/schemas/*.json` are byte-identical to `schemas/*.json`; `importlib.resources.files("eyebiomech").joinpath("schemas/eye-parameters.schema.json")` exists; `uv build --wheel` output contains both schema files (`@pytest.mark.slow`).
  - TypeScript (`web/packages/eye-model/test/results.test.ts`): every `data/results/fem/*.eye.json` validates with `validateEyeParameters` and its sidecar against `schemas/deformation.schema.json` with Ajv2020.
- [ ] **Step 2:** Run; FAIL. Implement `export.py`, `cli.py`, the schema copies and `schema.py` change, and the pyproject entry point.
- [ ] **Step 3:** Run the CLI on the fixture with the production mesh: `cd science && uv run eyebiomech fem --eye ../data/fixtures/emmetrope-right.eye.json --gaze 0,0 --iop 15 --out ../data/results/fem/emmetrope-right-primary-15mmHg.eye.json`; record run time, Newton iterations, the fitted coefficients, and the induced refraction estimate in `data/results/README.md`; commit both files.
- [ ] **Step 4:** Run; PASS. Full gate. Commit: `feat(fem): exporter and CLI with committed elastic result`.

### Task 4.8: Viewer loading with induced refraction and deformation map

**Files:**
- Create: `web/apps/viewer/src/results/catalog.ts`, `src/results/load.ts`, `src/scene/DeformationMap.tsx`, `src/ui/Biomechanics.tsx`, `web/apps/viewer/test/results.test.ts`, `web/apps/viewer/e2e/biomechanics.spec.ts`
- Modify: `web/apps/viewer/src/store/scene.ts` (loaded document per eye, sidecar, exaggeration, error banner), `src/worker/messages.ts`, `src/worker/handle.ts` (`induced` request: refraction of the loaded and reference documents at the relaxed state), `src/worker/client.ts`, `src/ui/Inspector.tsx`, `src/ui/tooltips.ts`, `src/scene/Stage.tsx`, `src/scene/palette.ts` (sequential heat-map ramp), `web/apps/viewer/test/store.test.ts`, `web/apps/viewer/test/worker.test.ts`, `web/apps/viewer/test/tooltips.test.ts`

**Interfaces:**
- Produces:
  - `catalog.ts`: `interface ResultEntry { id: string; label: string; eyePath: string; load(): Promise<{ eye: unknown; deformation: unknown | null }> }`; `RESULTS: ResultEntry[]` from `import.meta.glob("../../../../../data/results/**/*.eye.json")` with the sidecar paired by name.
  - `load.ts`: `class LoadError extends Error`; `parseEyeDocument(raw: unknown): EyeParameters` (runs `assertSupported` then `validateEyeParameters`, throws `LoadError` naming the schema version or the first schema error); `parseDeformation(raw: unknown): Deformation` (Ajv2020 against `schemas/deformation.schema.json`); `interface Deformation { id; vertices: Float32Array; triangles: Uint32Array; displacementMm: Float32Array; magnitudeUm: Float32Array; maxUm: number; region: Uint8Array; reference: EyeParameters; loads: unknown[] }`.
  - Store: `loadedResult: { id: string; label: string; eye: EyeParameters; deformation: Deformation | null } | null`, `loadError: string | null`, `exaggeration: number` (1 to 200, default 50), actions `loadResult(entry: ResultEntry)`, `loadEyeFile(file: File)`, `clearLoadedResult()`, `setExaggeration(x)`. Loading replaces the right eye's document; clearing restores the preset.
  - Worker: request `{ kind: "induced"; loaded: EyeParameters; reference: EyeParameters; pupilMm: number }` → `{ kind: "induced"; loaded: Refraction; reference: Refraction; delta: { M; J0; J45; sphereD; cylinderD; axisDeg /* TABO */ } }` (both documents relaxed, on the visual axis, 555 nm, paraxial-method refraction so spherical aberration does not bias the difference).
  - `DeformationMap.tsx`: a mesh of the sidecar's outer surface placed on the right globe, vertex positions `x + exaggeration · u`, vertex colors from the magnitude on a sequential ramp, with a legend (0 to max µm) in the panel.
  - `Biomechanics.tsx`: inspector panel "Biomechanics (elastic)": results dropdown, "Load EyeParameters" file input (accepts `.eye.json` and an optional `.deformation.json` together), exaggeration slider (1× to 200×), induced refraction readout (ΔSphere, ΔCylinder × axis, ΔM, J0, J45, 3 decimals), the legend, and the §1.2 stance line ("tests the hypothesis that muscle and lid loading shape the cornea; not an established result").
- Tooltips: induced refraction ("Approximation: stress-free reference geometry; change from the IOP-only state; lens follows the scleral spur, retina the posterior pole; elastic, no remodeling"); heat map ("Displacement magnitude of the outer surface, loaded minus IOP-only, exaggerated ×N for display").

- [ ] **Step 1:** Failing tests:
  - `results.test.ts`: `RESULTS` includes the committed result with its sidecar; `parseEyeDocument` rejects `schemaVersion: "2.0.0"` with a message naming it and a document missing `surfaces` with a message naming the key; `parseDeformation` of the committed sidecar gives `triangles.length % 3 === 0`, `vertices.length === displacementMm.length`, and `maxUm > 0`.
  - `store.test.ts`: `loadResult` sets the right eye's document and `loadedResult`; `clearLoadedResult` restores the preset; `setExaggeration` clamps to [1, 200]; a bad file sets `loadError`.
  - `worker.test.ts`: `induced` for identical documents returns a zero delta (1e-9); for the committed result the delta's cylinder is finite and its magnitude is reported (the e2e checks nonzero).
  - `tooltips.test.ts`: the induced-refraction tooltip starts with "Approximation:" and says "elastic".
- [ ] **Step 2:** Run `cd web && pnpm --filter @eye/viewer test`; FAIL.
- [ ] **Step 3:** Implement; design per spec §6.6 (the heat map's sequential ramp follows the palette's rules; muscles keep the only hot hue, so the ramp is a cool-to-light sequential scale).
- [ ] **Step 4:** Playwright `biomechanics.spec.ts`: choose the committed result in the dropdown; the induced-refraction readout shows a cylinder value that is not `0.000`; the heat-map legend is visible with a maximum above 0 µm; the exaggeration slider changes the legend's "×N" label; loading a file with `schemaVersion: "2.0.0"` shows the error banner naming the version.
- [ ] **Step 5:** Run; PASS. Full gate including e2e. Commit: `feat(viewer): load biomechanics results with induced refraction and deformation map`.

### Task 4.9: Finish

- [ ] Update this plan's status and add Outcome notes (solver timing, the committed result's induced refraction, what stays unverified); write the remaining deferred items to `2026-10-28-m4-followups.md`.
- [ ] Update `data/results/README.md` and `docs/literature/README.md`.
- [ ] Full gate including `-m slow` and e2e. Commit: `docs: M4 outcome notes and follow-ups`.
- [ ] Update the PR body with a summary and the verification run, then mark the PR ready.

## Follow-ups absorbed from earlier milestones

| Source | Item | Owner |
|---|---|---|
| M0 | `schema.py` reads the schema from the checkout; bundle as package data | Task 4.7 |
| M0 | `requires-python` uncapped; decide on `<3.14` | Task 4.0 |
| M0 | DOIs "to be added" for the material, remodeling, and eyelid rows | Task 4.2 (material, eyelid); remodeling stays for M5 |
| M2 | SR/IR insertion widths and tendon lengths, oblique widths: transcribe the BCSC table | Task 4.0 (search; re-file if unreachable) |
| M2 | Tendon stiffness is a 0 placeholder; transcribe before the M4 force export | Task 4.3 |
| M3 | Transcribe Zapata-Díaz 2019 Table 1 | Task 4.0 (search; re-file if unreachable) |
| M3 | Confirm Navarro 1985 Table 4 conic coefficients | Task 4.0 |
| M3 | Volkmann 1869 origins | Task 4.0 |
| M3 | Clark, Miller & Demer 2000 pulleys | Task 4.0 |
| M3 | Accommodation demand from the prescription's refraction measure (M4 or M6) | Task 4.0 re-files to M6 (Deviation 13) |
| M3 | Polans 2015 angle alpha and lens tilt (needs tilted surfaces) | Task 4.1 (tilt), Task 4.0 (transcription search) |
| M3 review | Surface tilt throws (`assertNoTilt`) | Task 4.1 |
| M3 review | Oracle: add OPL, decentered surfaces, miss/aperture reasons | Task 4.1 |
