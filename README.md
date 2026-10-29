# Eye Biomechanics

An interactive, browser-based binocular eye and extraocular muscle visualization with full wave optics and spectacle correction. It renders both eyes, their six muscles each, gaze and vergence dynamics, and the resulting retinal image through a physically modeled optical system, including the effect of prescribed lenses.

An offline Python package models corneoscleral biomechanics and calibrates it against population data, to test whether muscle, tendon, and eyelid loading predict the onset of astigmatism. Muscle-driven astigmatism is a hypothesis this tool tests, not assumes.

Status: Milestone 5 (remodeling, calibration, prediction)

## Quick start

Web viewer:

```sh
cd web && pnpm install && pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build
```

Science package:

```sh
cd science && uv sync --all-groups && uv run ruff check . && uv run pytest
```

Science pipeline (each step writes a committed result under `data/results/` with its provenance; see [data/results/README.md](data/results/README.md)):

```sh
cd science
# Elastic FEM result for an EyeParameters file (minutes)
uv run eyebiomech fem --eye ../data/fixtures/navarro-1985-preset.eye.json --gaze 0,0 --iop 15 --out ../data/results/fem/emmetrope-right-primary-15mmHg.eye.json
# Reduced-order response library (hours at the production mesh)
uv run eyebiomech library --eye ../data/fixtures/navarro-1985-preset.eye.json --out ../data/results/response/library-v1.json --n-face 20
# Population calibration (least squares, then ensemble MCMC)
uv run eyebiomech calibrate --out ../data/results/calibration/posterior-v1.json --method mcmc
# One subject's predicted trajectory and onset ages, anchored at the profile's age
uv run eyebiomech predict --profile age=12,nearHours=4,sphere=0,cyl=-0.5 --out /tmp/profile.json
# The prediction grid the viewer's timeline interpolates
uv run eyebiomech grid --out ../data/results/predictions/v1.json
```

Predictions are outputs of a remodeled mechanical model calibrated to population data: a test of the hypothesis, not a clinical prediction.

## Documentation

- [Design spec](docs/superpowers/specs/2026-10-26-eye-simulation-design.md)
- [Master plan](docs/superpowers/plans/2026-10-26-master-plan.md)
- [Literature index](docs/literature/README.md)
- [Cloud sessions](docs/cloud-sessions.md)

## License

MIT. See [LICENSE](LICENSE).
