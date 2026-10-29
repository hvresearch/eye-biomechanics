# Milestone 2 follow-ups

Items deferred while implementing Milestone 2 (2026-10-27). Each line names the
milestone that should absorb it. Resolve an item in the task that touches the
same file, and delete its line here in that commit.

## From the M2 review (Minor findings deferred)

- Spec §6.2 items missing from M2: readout pinning (`pinned`/`setPinned` in the
  store) and insertion markers on the stage. (M6; the luminance field moved to
  the M3 plan, Task 3.11)
- `web/apps/viewer/src/scene/EyeCutaway.tsx`: call
  `group.current.updateWorldMatrix(true, false)` before copying the cut plane so it
  does not lag the globe by one frame during saccades. (M6)
