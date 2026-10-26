# Eye Biomechanics

A browser-based binocular eye and extraocular muscle simulator with full wave optics and spectacle correction (TypeScript, pnpm workspace in `web/`), plus an offline Python package `eyebiomech` in `science/` for corneoscleral biomechanics and population calibration. The scientific question is whether muscle, tendon, and eyelid loading predict astigmatism onset; treat that as a hypothesis to test, not assume.

## Layout

```
web/                 pnpm workspace
  packages/eye-model   eye geometry, muscles, gaze (no DOM/React)
  packages/optics      wave optics (no DOM/React; does not import eye-model)
  apps/viewer          React + Vite app composing the packages
science/             Python 3.12 package `eyebiomech` (uv), tests in science/tests
schemas/             JSON schemas (EyeParameters etc.)
data/                every physiological constant, with citations
docs/                spec, plans, literature index, cloud-session notes
scripts/             helper scripts (install_pkgs.sh SessionStart hook)
```

## Commands

Run `pnpm -r test && (cd science && uv run pytest)` before every commit.

Web:

```sh
cd web && pnpm install && pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build
```

Science:

```sh
cd science && uv sync --all-groups && uv run ruff check . && uv run pytest
```

## Conventions

- Units: millimeters, diopters, degrees in data files and UI; radians internal to math modules. Right-handed, z along the optical axis toward the retina, x temporal for the right eye, y superior.
- TypeScript `strict: true`, no `any` in `eye-model` or `optics`. These two packages import nothing from the DOM or React.
- `optics` does not import `eye-model`. The viewer composes them.
- Every numeric constant lives in `data/` with a citation; code never hard-codes a physiological value.
- All optics computation runs in a web worker; the main thread never blocks more than 16 ms per frame.
- `EyeParameters.schemaVersion` is `"1.0.0"`; any reader rejects an unknown major version with a clear error.
- Python 3.12 pinned in `science/.python-version`; deps pip-installable with no compiled extensions beyond NumPy/SciPy wheels.
- No commit to `main` without green CI. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Approximations (length-proxy activation, fixed pulleys, homogeneous lens index) are labeled "approximation" in the UI tooltip of the affected readout.

## Workflow

- Work on feature branches and merge to `main` through pull requests; CI (jobs `web` and `python`) must pass.
- Commit often, one task per commit, with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Where things are decided

- The spec is the authority: `docs/superpowers/specs/2026-10-26-eye-simulation-design.md`.
- The master plan: `docs/superpowers/plans/2026-10-26-master-plan.md`.
- Literature index: `docs/literature/README.md`.
- Every physiological number lives in `data/` with a citation.

## Cloud sessions

See `docs/cloud-sessions.md` (a SessionStart hook runs `scripts/install_pkgs.sh` when `CLAUDE_CODE_REMOTE=true`).
