# Pupil data

| File | Content | Status |
|---|---|---|
| `watson-yellott-2012.json` | Unified formula: Stanley & Davies base, age adjustment, monocular factor, viewer defaults | partly excerpt-confirmed, partly from luxpy 1.12.5 (secondary); `verified: false` |
| `near-response.json` | Near miosis per meter angle of vergence demand, 2 mm floor | derived from a review's quote of Gislén et al. 2008; `verified: false` |

The pupil diameter of a `watsonYellott2012` document is the unified formula at the scene's
luminance and the subject's age (clamped to 20–83 years), minus the near miosis for the
current vergence demand, floored at 2 mm (`web/packages/eye-model/src/pupil/model.ts`).
Documents with `pupil.model: "fixed"` (test fixtures) keep their `diameterMm`.

The unit test compares the implementation with three points computed by luxpy's
`get_pupil_diameter_watson2012` (L = 1, 100, 1000 cd/m², 3600 deg², binocular, age 30:
4.9799, 2.8155, 2.3495 mm), an independent implementation of the same formula, not the paper.
