# SyntEyes data

| File | Content | Status |
|---|---|---|
| `rozema-2016-params.json` | Baseline refraction of the synthetic calibration cohort as a Gaussian mixture over the clinical power vector (M, J0, J45) at the reference age (6 years) | stand-in: the SyntEyes parameters (Rozema et al. 2016) were not in any excerpt, so one component with assumed means and an independent diagonal covariance is used; `transcribed: false`, `verified: false` |

The J0 mean and the astigmatic spread are calibration nuisance parameters
(`data/calibration/priors.json`), so the stand-in's values are starting points, not inputs to
the result. `science/eyebiomech/synth/synteyes.py` samples it (`sample_vectors`) and accepts a
multi-component table once the real one is transcribed.
