"""Loaders for the tables the FEM reads: data/materials, data/eyelid, and data/eom."""

from __future__ import annotations

import json
import math
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parents[3] / "data"


def _load(path: Path | str | None, default: Path) -> dict:
    return json.loads(Path(path or default).read_text())


def load_materials(path: Path | str | None = None) -> dict:
    return _load(path, DATA_DIR / "materials" / "cornea-sclera.json")


def load_eyelid(path: Path | str | None = None) -> dict:
    return _load(path, DATA_DIR / "eyelid" / "shaw-2010.json")


def load_eom_table(path: Path | str | None = None) -> dict:
    return _load(path, DATA_DIR / "eom" / "geometry-default.json")


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
