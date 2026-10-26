# Cloud sessions

Most development happens in Claude Code cloud sessions. A cloud session is a fresh clone of the GitHub repo on Ubuntu 24.04 x86_64 with Node 22 (npm, pnpm, yarn), Python 3 with uv, pip, ruff, pytest, plus gh, git, jq, and ripgrep.

## What a session loads

- Loaded: the repo's `CLAUDE.md`, `.claude/settings.json` (hooks, permissions, env), `.claude/agents/`, and committed skills.
- Not loaded: your `~/.claude` settings and plugins.

## Setup hook

`.claude/settings.json` registers a `SessionStart` hook running `scripts/install_pkgs.sh`. It runs on every session start and resume, so it is idempotent, and it exits immediately unless `CLAUDE_CODE_REMOTE=true`, leaving local sessions unaffected. It installs web dependencies (`pnpm install --frozen-lockfile`), syncs the Python environment (`uv sync --all-groups`), and attempts to install Playwright Chromium.

The same file raises `BASH_DEFAULT_TIMEOUT_MS` and `BASH_MAX_TIMEOUT_MS` to 600000 (cloud default is 2 minutes, max 10) so installs do not time out. The same env block applies to local sessions in this repo too.

## Network and Playwright

Default "Trusted" network access allows github.com, the npm registry, pypi.org, and files.pythonhosted.org. Playwright browser download hosts are not confirmed to be allowed, so the browser install is best-effort (`|| echo ...`). CI remains the authoritative runner for end-to-end tests.

## Workflow files and tokens

A gh token lacking the `workflow` scope cannot push changes under `.github/workflows` from a cloud session. Make workflow changes locally, or use a token with that scope.

## Starting a session

- From a terminal after pushing: `claude --cloud "<task text>"` (clones the GitHub remote at the current branch).
- From the web: claude.ai/code, pick the repo and branch, type the task.
- Each task is its own session and `claude/*` branch. Ask it to open a PR; choose "Auto-fix" in the PR menu so it responds to CI failures and review comments.
- Pull a cloud session into your local terminal with `claude --teleport`.

## Milestone kickoff prompts

Paste one per session. Adjust the date in the plan filename to the day you start.

### Milestone 1: Vertical slice

```text
Read CLAUDE.md, docs/superpowers/specs/2026-10-26-eye-simulation-design.md, and docs/superpowers/plans/2026-10-26-master-plan.md. Write an expanded task-level plan for Milestone 1 to docs/superpowers/plans/2026-MM-DD-m1-vertical-slice.md If the superpowers skills are available use writing-plans then subagent-driven-development or executing-plans; otherwise follow the Plan conventions in CLAUDE.md. Execute it task by task with tests, committing after each task, keeping `pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build` (web/) and `uv run ruff check . && uv run pytest` (science/) green. Open a PR titled 'Milestone 1: Vertical slice' when all tasks pass.
```

### Milestone 2: Extraocular muscles, gaze, dynamics

```text
Read CLAUDE.md, docs/superpowers/specs/2026-10-26-eye-simulation-design.md, and docs/superpowers/plans/2026-10-26-master-plan.md. Write an expanded task-level plan for Milestone 2 to docs/superpowers/plans/2026-MM-DD-m2-muscles-gaze-dynamics.md If the superpowers skills are available use writing-plans then subagent-driven-development or executing-plans; otherwise follow the Plan conventions in CLAUDE.md. Execute it task by task with tests, committing after each task, keeping `pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build` (web/) and `uv run ruff check . && uv run pytest` (science/) green. Open a PR titled 'Milestone 2: Extraocular muscles, gaze, dynamics' when all tasks pass.
```

### Milestone 3: Wave optics, pupil, visual axis, spectacles

```text
Read CLAUDE.md, docs/superpowers/specs/2026-10-26-eye-simulation-design.md, and docs/superpowers/plans/2026-10-26-master-plan.md. Write an expanded task-level plan for Milestone 3 to docs/superpowers/plans/2026-MM-DD-m3-wave-optics-spectacles.md If the superpowers skills are available use writing-plans then subagent-driven-development or executing-plans; otherwise follow the Plan conventions in CLAUDE.md. Execute it task by task with tests, committing after each task, keeping `pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build` (web/) and `uv run ruff check . && uv run pytest` (science/) green. Open a PR titled 'Milestone 3: Wave optics, pupil, visual axis, spectacles' when all tasks pass.
```

### Milestone 4: Corneoscleral biomechanics

```text
Read CLAUDE.md, docs/superpowers/specs/2026-10-26-eye-simulation-design.md, and docs/superpowers/plans/2026-10-26-master-plan.md. Write an expanded task-level plan for Milestone 4 to docs/superpowers/plans/2026-MM-DD-m4-corneoscleral-biomechanics.md If the superpowers skills are available use writing-plans then subagent-driven-development or executing-plans; otherwise follow the Plan conventions in CLAUDE.md. Execute it task by task with tests, committing after each task, keeping `pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build` (web/) and `uv run ruff check . && uv run pytest` (science/) green. Open a PR titled 'Milestone 4: Corneoscleral biomechanics' when all tasks pass.
```

### Milestone 5: Remodeling, calibration, prediction

```text
Read CLAUDE.md, docs/superpowers/specs/2026-10-26-eye-simulation-design.md, and docs/superpowers/plans/2026-10-26-master-plan.md. Write an expanded task-level plan for Milestone 5 to docs/superpowers/plans/2026-MM-DD-m5-remodeling-calibration-prediction.md If the superpowers skills are available use writing-plans then subagent-driven-development or executing-plans; otherwise follow the Plan conventions in CLAUDE.md. Execute it task by task with tests, committing after each task, keeping `pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build` (web/) and `uv run ruff check . && uv run pytest` (science/) green. Open a PR titled 'Milestone 5: Remodeling, calibration, prediction' when all tasks pass.
```

### Milestone 6: Polish, scenarios, performance

```text
Read CLAUDE.md, docs/superpowers/specs/2026-10-26-eye-simulation-design.md, and docs/superpowers/plans/2026-10-26-master-plan.md. Write an expanded task-level plan for Milestone 6 to docs/superpowers/plans/2026-MM-DD-m6-polish-scenarios-performance.md If the superpowers skills are available use writing-plans then subagent-driven-development or executing-plans; otherwise follow the Plan conventions in CLAUDE.md. Execute it task by task with tests, committing after each task, keeping `pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build` (web/) and `uv run ruff check . && uv run pytest` (science/) green. Open a PR titled 'Milestone 6: Polish, scenarios, performance' when all tasks pass.
```
