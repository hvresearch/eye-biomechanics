# Eye Biomechanics

An interactive, browser-based binocular eye and extraocular muscle visualization with full wave optics and spectacle correction. It renders both eyes, their six muscles each, gaze and vergence dynamics, and the resulting retinal image through a physically modeled optical system, including the effect of prescribed lenses.

An offline Python package models corneoscleral biomechanics and calibrates it against population data, to test whether muscle, tendon, and eyelid loading predict the onset of astigmatism. Muscle-driven astigmatism is a hypothesis this tool tests, not assumes.

Status: Milestone 0 (bootstrap)

## Quick start

Web viewer:

```sh
cd web && pnpm install && pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build
```

Science package:

```sh
cd science && uv sync --all-groups && uv run ruff check . && uv run pytest
```

## Documentation

- [Design spec](docs/superpowers/specs/2026-10-26-eye-simulation-design.md)
- [Master plan](docs/superpowers/plans/2026-10-26-master-plan.md)
- [Literature index](docs/literature/README.md)
- [Cloud sessions](docs/cloud-sessions.md)

## License

MIT. See [LICENSE](LICENSE).
