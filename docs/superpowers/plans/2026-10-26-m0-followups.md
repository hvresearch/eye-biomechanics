# Milestone 0 follow-ups

Minor findings deferred from the Milestone 0 reviews (2026-10-26). None blocks
Milestone 1. Each line names the milestone or task that should absorb it.
Resolve an item in the task that touches the same file, and delete its line here
in that commit.

## Spec and literature

- `docs/literature/README.md`: DOIs still "to be added" for Feil 2017,
  Atchison & Thibos 2016, the material, remodeling (Rodriguez 1994 and the two
  Grytz papers; searched in M5, 2026-10-29, not in the excerpts), eyelid, and
  dynamics rows; fill them in the milestone that transcribes each source. Rozema
  2016 was filled in M5.

## Schema and validators

- `schemas/scenario.schema.json` uses `$ref` to the EyeParameters schema; no test
  compiles it. Add an Ajv2020 compile test in TS and, in Python, resolve the
  reference with `referencing.Registry`. (M6, Task 6.1)
- Negative schema tests assert only `ok === false`; also assert the error names
  the offending key. (first task that edits `schema.test.ts`)
- Python `re.fullmatch(..., re.ASCII)` and the TS regex agree, but the schema
  pattern's `$` tolerates a trailing newline in some regex engines. Cosmetic.

## Web workspace

- `web/package.json` engines is `>=22.12`; Vitest 5 excludes Node 25. Works in
  practice and the cloud VM runs Node 22. No action unless CI breaks.

## Python


## CI and workflows (edit locally; cloud tokens lack the workflow scope)

- Setup steps are duplicated between `ci.yml` and `pages.yml`; extract a
  composite action if a third workflow appears.
- `pages.yml` does not depend on the CI `web` job; `workflow_run` would enforce
  it. Main is protected by required checks, so a red commit cannot land anyway.
- Remove the `hashFiles` guard on the Playwright steps now that
  `web/apps/viewer/e2e/` exists (M1 added it). Local follow-up PR.
- The viewer bundle is ~1.3 MB minified (three.js); add a `manualChunks` split
  for `three` if Pages load time matters. (M6)

## Docs

- `docs/cloud-sessions.md` kickoff prompts lack a period after the plan
  filename. Cosmetic.
