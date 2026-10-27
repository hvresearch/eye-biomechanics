# Milestone driver playbook

This file is the full instruction set for the cloud routine **eye-biomechanics
driver**. The routine fires about once an hour and on pull-request events. Each
run starts in a fresh cloud session with this repository cloned at `main`, reads
this file, performs **exactly one step** of the state machine below, and exits.
Nothing here depends on memory from earlier runs: every decision is derived from
the repository and its pull requests.

Authoritative inputs, in order: the spec
`docs/superpowers/specs/2026-10-26-eye-simulation-design.md`, the master plan
`docs/superpowers/plans/2026-10-26-master-plan.md`, `CLAUDE.md`, and the
per-milestone kickoff prompts in `docs/cloud-sessions.md`.

## Constants

| Milestone | PR title (exact) | Branch |
|---|---|---|
| 1 | `Milestone 1: Vertical slice` | `m1-vertical-slice` |
| 2 | `Milestone 2: Extraocular muscles, gaze, dynamics` | `m2-muscles-gaze-dynamics` |
| 3 | `Milestone 3: Wave optics, pupil, visual axis, spectacles` | `m3-wave-optics-spectacles` |
| 4 | `Milestone 4: Corneoscleral biomechanics` | `m4-corneoscleral-biomechanics` |
| 5 | `Milestone 5: Remodeling, calibration, prediction` | `m5-remodeling-calibration-prediction` |
| 6 | `Milestone 6: Polish, scenarios, performance` | `m6-polish-scenarios-performance` |

- `REPO` = `hvresearch/eye-biomechanics`.
- Review marker: an issue comment on the PR whose first line is
  `<!-- driver-review sha=<40-hex head sha> verdict=APPROVE|CHANGES -->`.
- Stale threshold: a draft PR whose head commit is older than **4 hours** is
  considered abandoned by its session and may be resumed.
- Full gate (run from the repo root before every commit):
  `(cd web && pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build) && (cd science && uv run ruff check . && uv run pytest)`.
  When `web/apps/viewer/e2e/` exists also run `(cd web && pnpm --filter @eye/viewer e2e)`.

## Hard rules

1. Never edit anything under `.github/`. The cloud token lacks the `workflow`
   scope, so such pushes are rejected. If a workflow change is required, open
   an issue titled `needs-local: <what>` describing the exact edit, label it
   `needs-local` if the label exists, and continue without it.
2. Never force-push, never rewrite published history, never push to `main`.
3. Never merge a PR whose required checks (`web`, `python`) are not all green,
   and never merge a PR without an `APPROVE` review marker for its current head.
4. The reviewer must not be the author. Within a run that reviews, the review is
   done by a **subagent** (Agent tool) that receives only the diff and the plan,
   not the implementation conversation. Fixes to review findings happen in the
   parent session after the subagent returns.
5. Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
   One task per commit. Push after every commit so progress is visible and
   overlapping runs can see the head age.
6. Use `gh` for GitHub. If a `gh pr ...` subcommand fails with a 403 on GraphQL,
   use the REST API through `gh api` instead (examples below).
7. Do one step, then stop. Do not loop waiting for CI inside a run; the next
   fire will pick up the new state.
8. Runs can overlap, because the routine fires on the hour and on every
   pull-request and check-suite event. Before a review, a fix, or a merge on a
   ready PR, post a lock comment on the PR:
   `<!-- driver-lock step=<review|fix|merge> sha=<head sha> at=<UTC ISO time> -->`.
   If a lock comment for the same sha and step exists and is less than
   **90 minutes** old, another run owns that step: **exit** without acting. A
   lock older than 90 minutes is stale and may be taken over. The draft PR is
   the lock for implementation and needs no comment.

## Step 0: observe

```sh
gh pr list -R $REPO --state open --base main \
  --json number,title,isDraft,headRefName,headRefOid,updatedAt
gh pr list -R $REPO --state merged --base main --json number,title --limit 50
```

Let `OPEN` be the open PRs whose title starts with `Milestone <digit>:`. Let `M`
be the largest digit among merged PRs with such titles (0 if none).

## Step 1: an open milestone PR exists

Exactly one is expected. If two or more exist, act on the lowest milestone
number and leave a comment on the others saying the driver is ignoring them
until it is closed.

### 1a. Draft PR (implementation in progress)

Compute the head commit's age from `git log -1 --format=%cI origin/<branch>`
after `git fetch origin <branch>`.

- Age under the stale threshold: another run is working. **Exit.**
- Otherwise resume: `git checkout <branch>`, read the plan file named in the PR
  body, find the first task whose checkbox steps are not all checked (verify
  against the code and tests, not just the checkboxes), and continue from
  there following the implementation procedure in Step 2c. When every task is
  done, finish as in Step 2d.

### 1b. Ready PR (not draft)

Run `gh pr checks <n> -R $REPO`.

- Any check pending or queued: **exit.**
- Any required check failing: check out the branch, reproduce the failure
  locally with the gate, fix it, commit, push. **Exit.** Do not merge in the
  same run.
- All checks passing: post or respect the lock comment (rule 8), then fetch the issue comments
  (`gh api repos/$REPO/issues/<n>/comments --paginate`) and look for a review
  marker whose `sha` equals `headRefOid`.
  - **No marker for this sha → review** (Step 1c).
  - Marker with `verdict=APPROVE` → **merge** (Step 1d). This path also
    recovers from a run that approved but failed to merge.
  - Marker with `verdict=CHANGES` → a previous run posted findings but did not
    push fixes. Fix them now (Step 1c, fixing part). **Exit.**

### 1c. Review

Dispatch one reviewer subagent with the most capable available model. Give it:
the PR number, `git diff origin/main...origin/<branch>` written to a file, the
plan file path, the spec path, and the instruction to judge spec compliance,
correctness, numerical fidelity (every constant must trace to `data/` with a
citation), test quality, and the Global Constraints in `CLAUDE.md`. It must
report findings grouped as Critical, Important, Minor, each with `file:line`,
what is wrong, why it matters, and a fix, and end with a verdict: APPROVE when
there are no Critical or Important findings, CHANGES otherwise.

Post the report as one issue comment on the PR, prefixed by the marker line:

```
<!-- driver-review sha=<headRefOid> verdict=<APPROVE|CHANGES> -->
```

Then:

- Verdict APPROVE: proceed directly to Step 1d in the same run.
- Verdict CHANGES: check out the branch, fix every Critical and Important
  finding (Minor findings are optional; record skipped ones in the followups
  file for the milestone), run the gate, commit as `fix(review): ...`, push.
  **Exit.** The next run re-reviews the new head.

### 1d. Merge

```sh
gh api -X PUT repos/$REPO/pulls/<n>/merge \
  -f merge_method=squash \
  -f commit_title="<PR title> (#<n>)" \
  -f commit_message="<first paragraph of the PR body>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
gh api -X DELETE repos/$REPO/git/refs/heads/<branch>
```

If the merge is rejected because checks are not green or the branch is behind
`main` with `strict` protection, update the branch
(`gh api -X PUT repos/$REPO/pulls/<n>/update-branch`) and **exit**; CI reruns
and the next fire re-evaluates. **Exit** after a successful merge; starting the
next milestone is a separate run.

## Step 2: no open milestone PR

- If `M` is 6: if no open issue titled `All milestones complete` exists, open
  one summarizing the final state and asking the owner to disable the routine.
  **Exit.**
- Otherwise `N = M + 1`. Also make sure no remote branch for milestone `N`
  already exists without a PR (`git ls-remote --heads origin m<N>-*`); if one
  does, open the draft PR for it and treat it as Step 1a.

### 2a. Claim the milestone

```sh
git checkout -b <branch for N> origin/main
```

Write the expanded plan for milestone `N` to
`docs/superpowers/plans/<today>-m<N>-<slug>.md` following the kickoff prompt
for milestone `N` in `docs/cloud-sessions.md` and the Plan conventions in
`CLAUDE.md`. Include every item from
`docs/superpowers/plans/*-followups.md` that names milestone `N`, as explicit
steps in the tasks that own them, and delete those lines from the followups
file in the same commit. Commit the plan, push, and immediately open a **draft**
PR with the exact title from the constants table and a body that names the plan
file. The draft PR is the lock that stops other runs from starting the same
milestone.

### 2b. Plan check

Before implementing, scan the plan once for internal conflicts (two tasks
defining the same interface differently, a test that cannot be satisfied by
the specified code). Fix the plan and commit before starting.

### 2c. Implement

Task by task, in plan order, test first: write the failing test, run it,
implement, run the gate, commit, push. If the superpowers skills are available
(`superpowers:subagent-driven-development` or `superpowers:executing-plans`),
use one of them; otherwise follow the plan directly. Keep the UI work to the
standards in the spec: fidelity and polish are both required, and every
approximation is labeled in its tooltip.

If the session is running out of context, finish the current task, push, and
**exit**; a later run resumes via Step 1a once the head is stale, or sooner if
a pull-request event fires.

### 2d. Finish

When all tasks pass the gate, update the PR body with a summary and the
verification you ran, then mark it ready:

```sh
gh pr ready <n> -R $REPO
```

**Exit.** Review happens in a different run and session.

## Reporting

End every run with a one-paragraph summary of the state observed, the step
taken, and the resulting PR or commit URLs. If something blocks the step
(missing tool, repeated CI failure you cannot reproduce, a spec contradiction),
open an issue titled `driver-blocked: <what>` with the details, unless one with
the same title is already open, and exit.
