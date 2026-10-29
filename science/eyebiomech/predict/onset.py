"""Onset of needing correction along a predicted trajectory (spec §8; M5 plan, Task 5.11)."""

from __future__ import annotations

import numpy as np
from numpy.typing import ArrayLike

from eyebiomech.predict.acuity import acuity_table


def _first_crossing(ages: np.ndarray, value: np.ndarray, threshold: float, strict: bool):
    """First age at which `value` reaches the threshold (≥, or > when strict), linearly
    interpolated between grid ages; the first age when already there; None if never."""
    above = value > threshold if strict else value >= threshold
    if not np.any(above):
        return None
    i = int(np.argmax(above))
    if i == 0:
        return float(ages[0])
    v0, v1 = value[i - 1], value[i]
    return float(ages[i - 1] + (threshold - v0) * (ages[i] - ages[i - 1]) / (v1 - v0))


def onset_ages(
    ages: ArrayLike,
    sphere: ArrayLike,
    cylinder: ArrayLike,
    logmar: ArrayLike | None = None,
    *,
    cyl_threshold: float | None = None,
    sphere_threshold: float | None = None,
    logmar_threshold: float | None = None,
) -> dict[str, float | None]:
    """{"refraction": age | None, "acuity": age | None}: refraction when |cylinder| ≥ the
    cylinder threshold or |sphere| > the sphere threshold (whichever comes first), acuity when
    logMAR > its threshold. Thresholds default to data/acuity/watson-ahumada-2008.json."""
    t = acuity_table()["thresholds"]
    ct = t["cylinderD"] if cyl_threshold is None else cyl_threshold
    st = t["sphereD"] if sphere_threshold is None else sphere_threshold
    lt = t["logMAR"] if logmar_threshold is None else logmar_threshold
    a = np.asarray(ages, dtype=float)
    crossings = [
        _first_crossing(a, np.abs(np.asarray(cylinder, dtype=float)), ct, strict=False),
        _first_crossing(a, np.abs(np.asarray(sphere, dtype=float)), st, strict=True),
    ]
    found = [c for c in crossings if c is not None]
    acuity = None
    if logmar is not None:
        acuity = _first_crossing(a, np.asarray(logmar, dtype=float), lt, strict=True)
    return {"refraction": min(found) if found else None, "acuity": acuity}
