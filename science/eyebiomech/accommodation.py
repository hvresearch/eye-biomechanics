"""Accommodative amplitude and the steady-state accommodation controller (spec §4.2), the
Python mirror of web/packages/eye-model/src/accommodation/{amplitude,controller}.ts, reading
the same tables (data/accommodation/). Agreement with the TypeScript functions is checked on
values the TypeScript tests write to data/oracle/accommodation-values.json.
"""

from __future__ import annotations

import math
from functools import lru_cache

from eyebiomech.fem.data import _load, data_root


@lru_cache(maxsize=4)
def _cached(root: str, name: str) -> dict:
    return _load(None, "accommodation", name)


def amplitude_table() -> dict:
    return _cached(str(data_root()), "anderson-2008-amplitude.json")


def lag_table() -> dict:
    return _cached(str(data_root()), "lag-default.json")


def amplitude_for_age(age_years: float, table: dict | None = None) -> float:
    """Anderson et al. 2008 sigmoid, D: the age-6 value below the domain, 0 above it."""
    if math.isnan(age_years):
        raise ValueError("age_years is NaN")
    t = table or amplitude_table()
    lo, hi = t["domain"]["minAgeYears"], t["domain"]["maxAgeYears"]
    if age_years > hi:
        return 0.0
    age = max(age_years, lo)
    c = t["coefficients"]
    return c["maxD"] / (1 + math.exp(c["slopePerYear"] * (age - c["centerAgeYears"]) - c["offset"]))


def demand_from_distance(target_distance_m: float, far_point_d: float = 0.0) -> float:
    """Accommodative demand, D: max(0, 1/d + farPoint) with d clamped to the table's minimum
    target distance; an infinite distance is 0 stimulus."""
    if math.isnan(target_distance_m) or target_distance_m < 0:
        raise ValueError(f"target_distance_m must be >= 0, got {target_distance_m}")
    d = max(target_distance_m, lag_table()["minTargetDistanceM"])
    stimulus = 0.0 if math.isinf(d) else 1.0 / d
    return max(0.0, stimulus + far_point_d)


def default_lag(demand_d: float) -> float:
    c = lag_table()["coefficients"]
    return max(0.0, c["slope"] * (demand_d - c["onsetD"]))


def accommodation_response(demand_d: float, amplitude_d: float) -> float:
    """Demand minus lag, clipped to [0, amplitude], D."""
    return min(max(demand_d - default_lag(demand_d), 0.0), max(amplitude_d, 0.0))
