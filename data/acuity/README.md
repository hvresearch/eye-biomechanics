# Acuity data

| File | Content | Status |
|---|---|---|
| `optotypes.json` | Optotype geometry (ISO 8596: 20/20 letter of 1 arcmin stroke, 5 arcmin height) for the viewer's retinal image (M3) | a definition; `verified: false` |
| `watson-ahumada-2008.json` | The acuity metric of the onset by acuity and the onset thresholds of spec §8 (cylinder ≥ 0.75 D, \|sphere\| > 0.5 D, logMAR > 0.3): the intended Watson & Ahumada 2008 model could not be transcribed, so the file names an MTF-threshold stand-in (threshold contrast 0.1, floor logMAR −0.1, both assumptions) and the pupil it is evaluated at (Watson & Yellott at 100 cd/m², a 60° × 60° field, both eyes) | stand-in; `verified: false` |
| `standin-table.json` | The stand-in's logMAR on a grid of residual spherical blur, astigmatic blur, and pupil diameter, which the prediction grid interpolates | generated: `cd science && uv run python -m eyebiomech.predict.acuity` |

The stand-in (`science/eyebiomech/predict/acuity.py`) computes the radially averaged optical MTF
of the sphero-cylindrical pupil function by FFT and takes the letter whose critical frequency is
where the MTF first falls below the threshold contrast. It has no neural transfer function and no
noise, so it is labeled "Approximation" wherever its acuity is shown.
