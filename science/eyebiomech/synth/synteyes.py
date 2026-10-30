"""Synthetic subjects from a Gaussian-mixture model of baseline refraction (spec §8 SyntEyes;
M5 plan, Task 5.9). data/synteyes/rozema-2016-params.json holds the mixture; until the SyntEyes
supplement is transcribed it is a one-component stand-in over the clinical power vector
(M, J0, J45), whose J0 mean and spread the calibration fits as nuisance parameters.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

from eyebiomech.fem.data import _load

VARIABLES = ("M", "J0", "J45")


def load_synteyes(path=None) -> dict:
    t = _load(path, "synteyes", "rozema-2016-params.json")
    if t.get("form") != "gaussian-mixture":
        raise ValueError(f"unknown SyntEyes form {t.get('form')!r}")
    if tuple(t["variables"][:3]) != VARIABLES:
        raise ValueError(f"the first variables must be {VARIABLES}, got {t['variables']}")
    weights = np.array([c["weight"] for c in t["components"]], dtype=float)
    if not np.isclose(weights.sum(), 1.0) or np.any(weights <= 0):
        raise ValueError("mixture weights must be positive and sum to 1")
    return t


def mixture_moments(table: dict) -> tuple[NDArray, NDArray]:
    """Mean and covariance of the mixture's (M, J0, J45)."""
    w = np.array([c["weight"] for c in table["components"]], dtype=float)
    mu = np.array([np.asarray(c["mean"], dtype=float)[:3] for c in table["components"]])
    cov = np.array([np.asarray(c["cov"], dtype=float)[:3, :3] for c in table["components"]])
    mean = w @ mu
    d = mu - mean
    total = np.einsum("k,kij->ij", w, cov) + np.einsum("k,ki,kj->ij", w, d, d)
    return mean, total


def sample_vectors(n: int, age: float | None = None, seed: int = 0, table: dict | None = None):
    """(n, 3) baseline power vectors (M, J0, J45), D, at the table's reference age (the age
    argument is accepted for the interface and must equal it or be None: the stand-in has no
    age dependence)."""
    t = table or load_synteyes()
    if age is not None and age != t["referenceAgeYears"]:
        raise ValueError(
            f"the mixture describes age {t['referenceAgeYears']}, not {age}; the forward model "
            "carries subjects from there"
        )
    if n < 1:
        raise ValueError("n must be positive")
    rng = np.random.default_rng(seed)
    w = np.array([c["weight"] for c in t["components"]], dtype=float)
    which = rng.choice(len(w), size=n, p=w / w.sum())
    out = np.empty((n, 3))
    for k, c in enumerate(t["components"]):
        sel = which == k
        if np.any(sel):
            out[sel] = rng.multivariate_normal(
                np.asarray(c["mean"], dtype=float)[:3],
                np.asarray(c["cov"], dtype=float)[:3, :3],
                size=int(sel.sum()),
            )
    return out


def sample(n: int, age: float | None = None, seed: int = 0) -> list[dict]:
    """Subjects as dicts with `refraction: {M, J0, J45}` and the reference age (the stand-in
    has no surface variables, so no EyeParameters document is built)."""
    t = load_synteyes()
    v = sample_vectors(n, age, seed, t)
    return [
        {
            "ageYears": t["referenceAgeYears"],
            "refraction": dict(zip(VARIABLES, map(float, row), strict=True)),
        }
        for row in v
    ]
