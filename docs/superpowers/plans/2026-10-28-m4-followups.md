# Milestone 4 follow-ups

Items deferred while implementing Milestone 4 (2026-10-28). Each line names the
milestone that should absorb it. Resolve an item in the task that touches the
same file, and delete its line here in that commit.

Every item that named Milestone 5 was absorbed by the Milestone 5 plan
(`2026-10-29-m5-remodeling-calibration-prediction.md`, "Follow-ups absorbed from earlier
milestones") and removed here on 2026-10-29.

Every item that named Milestone 6 was absorbed by the Milestone 6 plan
(`2026-10-30-m6-polish-scenarios-performance.md`, "Follow-ups absorbed from earlier
milestones") and removed here on 2026-10-30.

## Closed in Task 4.0

- Python cap (M0): closed, no cap. `science/uv.lock` lists cp314 wheels for NumPy
  and SciPy, scikit-fem is pure Python, and `uv run --python 3.14 --isolated --with
  scikit-fem --with numpy --with scipy` imports scikit-fem 12.0.2, NumPy 2.5.4, and
  SciPy 1.18.1 on CPython 3.14.6 (2026-10-28). CI still tests 3.12 only.
- Superior oblique insertion width (M2): transcribed from an excerpt (10.32 mm,
  Korean cadaver study), `verified: false`.
