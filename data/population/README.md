# Population data

Calibration targets of the remodeling model (spec §8; M5 plan, Task 5.9). Every value is quoted
from a search excerpt of the source named in its entry (2026-10-29, Deviation 1); none is
verified against the full text.

| File | Content | Status |
|---|---|---|
| `axis-shift-by-age.json` | Proportions of with-the-rule, against-the-rule, and oblique astigmatism among astigmatic eyes by age band, per source, with each source's measure (refractive, corneal) and whether the fit uses it | children (Zibo City) and the adult bands of Read, Collins & Carney 2007 fitted; the corneal astigmatism of two cataract populations kept for comparison; `verified: false` |
| `refraction-by-age.json` | Mean J0 slope over 30–80 years from two studies (fitted, with an assumed standard error), individual cylinder changes (Beesley & Elliott 2024), six-year spherical-equivalent changes (Guangzhou), and NHANES prevalence (comparison only) | `verified: false` |

The spherical-equivalent changes of adults come mostly from the crystalline lens, which the
mechanical model does not contain, so they are not fitted. NHANES microdata
(`science/eyebiomech/calib/download_nhanes.py`) go to the gitignored `data/large/`; the
script was not run in the cloud session (cdc.gov is not reachable there).
