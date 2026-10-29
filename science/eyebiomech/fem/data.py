"""Loaders for the tables the package reads (data/materials, data/eyelid, data/eom, ...).

The tables are found by `data_root()`: an override set with `data_root_override` (the CLI's
`--data-root`), else the `EYEBIOMECH_DATA` environment variable, else the repository's `data/`
when running from a checkout, else the copy the wheel ships under `eyebiomech/data/`
(`[tool.hatch.build.targets.wheel.force-include]` in pyproject.toml; M4 follow-up: `DATA_DIR`
pointed into the repository, so the installed wheel could not find its tables).
"""

from __future__ import annotations

import json
import math
import os
from collections.abc import Iterator
from contextlib import contextmanager
from importlib.resources import files
from pathlib import Path

_REPOSITORY_DATA = Path(__file__).resolve().parents[3] / "data"
_override: Path | None = None


def data_root() -> Path:
    if _override is not None:
        return _override
    env = os.environ.get("EYEBIOMECH_DATA")
    if env:
        return Path(env)
    if (_REPOSITORY_DATA / "materials").is_dir():
        return _REPOSITORY_DATA
    return Path(str(files("eyebiomech").joinpath("data")))


@contextmanager
def data_root_override(path: Path | str) -> Iterator[Path]:
    """Read every table from `path` inside the block."""
    global _override
    previous, _override = _override, Path(path)
    try:
        yield _override
    finally:
        _override = previous


# The data root at import (a checkout's data/ in development and tests).
DATA_DIR = data_root()


def _load(path: Path | str | None, *default: str) -> dict:
    return json.loads(Path(path or data_root().joinpath(*default)).read_text())


def load_materials(path: Path | str | None = None) -> dict:
    return _load(path, "materials", "cornea-sclera.json")


def load_eyelid(path: Path | str | None = None) -> dict:
    return _load(path, "eyelid", "shaw-2010.json")


def load_eom_table(path: Path | str | None = None) -> dict:
    return _load(path, "eom", "geometry-default.json")


def load_eom_forces(path: Path | str | None = None) -> dict:
    return _load(path, "eom", "forces.json")


def lame_lambda(mu: float, poisson_ratio: float) -> float:
    """First Lamé constant from the shear modulus and Poisson ratio, λ = 2μν / (1 − 2ν)."""
    if not -1 < poisson_ratio < 0.5:
        raise ValueError(f"Poisson ratio {poisson_ratio} is outside (-1, 0.5)")
    return 2 * mu * poisson_ratio / (1 - 2 * poisson_ratio)


def age_factor(age_years: float, materials: dict) -> float:
    """Multiplier on every stiffness for the subject's age (``ageStiffening`` of the materials
    table): exp(rate · (age − reference)) with the age clamped to the table's range."""
    if not math.isfinite(age_years):
        raise ValueError(f"age must be finite, got {age_years}")
    t = materials["ageStiffening"]
    if t["form"] != "exponential":
        raise ValueError(f"unknown ageStiffening form {t['form']!r}")
    lo, hi = t["clampAgeYears"]
    age = min(max(age_years, lo), hi)
    return math.exp(t["ratePerYear"] * (age - t["referenceAgeYears"]))
