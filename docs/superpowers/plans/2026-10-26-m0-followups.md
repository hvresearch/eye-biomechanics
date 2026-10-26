# Milestone 0 follow-ups

Minor findings deferred from the Milestone 0 reviews (2026-10-26). None blocks
Milestone 1. Each line names the milestone or task that should absorb it.
Resolve an item in the task that touches the same file, and delete its line here
in that commit.

## Spec and literature

- `docs/literature/README.md`: fill in DOIs, volumes, and pages for the rows
  still marked "to be added"; cite the BCSC volume rather than a DOI. (M1,
  Task 1.1, while the papers are open)
- Spec §5.6: the Navarro 1985 fixture's paraxial power computes to 60.60 D with
  BFD 16.341 mm against a 16.40 mm vitreous; the spec quotes ≈60.4 D. Reconcile
  against the paper, including the index wavelength, and set the Task 1.6
  tolerance from the reconciled value. (M1, Task 1.1 / 1.6)
- Spec §8: the 20/40 acuity threshold should read "default, configurable", as
  §12 does. (M1, any spec edit)
- Spec §4.2: the accommodation "time constant ≈ 0.3 s" is uncited; cross-reference
  the §4.4 dynamics bullet (Kasthurirangan & Glasser 2005). (M2, Task 2.5)

## Schema and validators

- `schemas/scenario.schema.json` uses `$ref` to the EyeParameters schema; no test
  compiles it. Add an Ajv2020 compile test in TS and, in Python, resolve the
  reference with `referencing.Registry`. (M6, Task 6.1)
- `Surface.conic`, `tilt`, and `decenter` are optional with schema default zero;
  `buildSurfaces` must apply the defaults rather than trust the document. (M1,
  Task 1.9)
- Negative schema tests assert only `ok === false`; also assert the error names
  the offending key. (M1, first task that edits `schema.test.ts`)
- `science/eyebiomech/schema.py` reads the schema from the repository checkout;
  packaging `eyebiomech` outside the repo needs the schema bundled as package
  data. (M4, Task 4.6 CLI)
- Add a type-drift guard: a test that the hand-written `types.ts` matches the
  schema (for example, generate types with `json-schema-to-typescript` in a test
  and diff). (M1, Task 1.9)
- Python `re.fullmatch(..., re.ASCII)` and the TS regex agree, but the schema
  pattern's `$` tolerates a trailing newline in some regex engines. Cosmetic.

## Web workspace

- `web/apps/viewer/tsconfig.json` applies `node` types to `src/` as well as
  `vite.config.ts`; split the config so browser code cannot see Node globals.
  (M1, Task 1.10)
- `@types/node` versions differ between the viewer (26.x) and the packages'
  test configs (22.x); align them. (M1, Task 1.10)
- Vite dev server needs `server.fs.allow` for `schemas/` and `data/`, which live
  outside `web/`. (M1, Task 1.11)
- `web/package.json` engines is `>=22.12`; Vitest 5 excludes Node 25. Works in
  practice and the cloud VM runs Node 22. No action unless CI breaks.

## Python

- `requires-python = ">=3.12"` is uncapped; consider `<3.14` once scikit-fem and
  SciPy wheels for 3.14 are confirmed. (M4)
- Optiland pulls compiled transitive dependencies; it is dev-only. Move it to an
  optional extra if install time in cloud sessions becomes a problem. (M3,
  Task 3.8)

## CI and workflows (edit locally; cloud tokens lack the workflow scope)

- Setup steps are duplicated between `ci.yml` and `pages.yml`; extract a
  composite action if a third workflow appears.
- `pages.yml` does not depend on the CI `web` job; `workflow_run` would enforce
  it. Main is protected by required checks, so a red commit cannot land anyway.
- Remove the `hashFiles` guard on the Playwright steps once
  `web/apps/viewer/e2e/` exists. (M1, Task 1.11, local follow-up PR)

## Docs

- `docs/cloud-sessions.md` kickoff prompts lack a period after the plan
  filename. Cosmetic.
