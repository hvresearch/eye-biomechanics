# Scenarios

Saved viewer states with a timeline (spec §6.5; `schemas/scenario.schema.json`, version
1.0.0). A scenario holds the scene, both eyes' complete EyeParameters documents, the
spectacle prescription, whether it is worn, the id of a committed biomechanics result to
load, and keyframes over the transport's time axis (seconds). It is the reproducibility unit
for experiments: the viewer's **Export JSON** writes the current state in this format and
**Import scenario** reads it back.

Keyframes set any of `targetDistanceM` (null is a target at infinity; interpolated in
diopters), `targetDirectionDeg`, `luminanceCdM2`, `ageYears` (interpolated linearly), and
`corrected` (stepped). A field no keyframe sets keeps the viewer's value, so the user can
still move it while a scenario plays.

| File | What it shows |
|---|---|
| `near-to-far-refocus.json` | An emmetrope aged 25 looks from 0.33 m to 6 m and back (steps at 1 s and 4 s); vergence and accommodation follow with their latencies and time constants. |
| `presbyopia-20-to-60.json` | Reading at 0.4 m while age sweeps from 20 to 60 over 12 s. The eye is re-derived at each age (amplitude and pupil tables); no growth or remodeling is involved. |
| `astigmat-corrected-vs-uncorrected.json` | The 1.5 D against-the-rule corneal astigmat with its auto-prescribed spectacles, removed and worn every 3 s. |
| `fem-result-loaded.json` | The committed elastic FEM result (`data/results/fem/emmetrope-right-primary-15mmHg`) in the right eye with its displacement heat map. |

The four files are built from the viewer's own state by `web/apps/viewer/test/scenario.test.ts`
("bundled scenarios"), which fails when a committed file differs from what the current code
builds. Regenerate them with

```sh
cd web/apps/viewer && WRITE_SCENARIOS=1 npx vitest run test/scenario.test.ts
```

and run the test again without the variable (the viewer's catalog is read at import time).
