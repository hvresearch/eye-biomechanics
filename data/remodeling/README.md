# Remodeling data

| File | Content | Status |
|---|---|---|
| `growth.json` | Form and equation of the stress-driven growth law (Rodriguez, Hoger & McCulloch 1994 multiplicative decomposition, in-plane growth toward a homeostatic stress; since M6 an optional growth through the thickness, off by default), the thickness option's ratio κ, the default rate per year and homeostatic ratio with their bounds, and the explicit step limit | the law's form by excerpt; the rate, ratio, and κ are assumptions with the reasoning in the file (κ is chosen so that the spherical growth mode is restoring, not measured) and are calibration parameters (`data/calibration/priors.json`); the step limit is numerical; `verified: false` |

`science/eyebiomech/remodel/growth.py` implements the law on the FEM (Task 5.7) and
`science/eyebiomech/remodel/library.py` its reduced form (Task 5.8). With the homeostatic ratio
`h = 1` the pressurized eye of the reference age does not grow, so only the deviations of the
muscle, lid, and ciliary loads from it drive growth (M5 plan, Deviation 3).
