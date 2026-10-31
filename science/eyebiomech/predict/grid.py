"""Predicted refraction trajectories with uncertainty and onset ages: for one subject profile
(`eyebiomech predict`) and over the subject grid the viewer interpolates (`eyebiomech grid`)
(spec §8, §12; M5 plan, Task 5.11, Deviation 7).

A subject's power vector at age a is its baseline at the anchor age plus the model's change
since then: v(a) = v₀ + Δ(a) − Δ(a₀), with Δ the remodeled change of the response library under
the subject's duty cycle (`eyebiomech.calib.forward.state_trajectories`). Uncertainty comes from
posterior draws of the calibrated parameters only (not from subject variability). Acuity uses
the stand-in metric of `eyebiomech.predict.acuity` on the residual blur: myopic spherical
equivalent counts fully, hyperopic only beyond the accommodative amplitude for the age.
"""

from __future__ import annotations

import math
from datetime import date

import numpy as np
from numpy.typing import NDArray

from eyebiomech.accommodation import amplitude_for_age
from eyebiomech.calib.forward import (
    AGES,
    PARAM_NAMES,
    load_priors,
    state_trajectories,
    stiffness_function,
)
from eyebiomech.predict.acuity import TABLE_J, TABLE_M, acuity_pupil_mm, logmar_lookup
from eyebiomech.predict.onset import onset_ages
from eyebiomech.remodel.history import load_duty_cycle, near_fraction

# Predictions schema version; 1.1.0 adds the optional `summary` (M6 Task 6.4).
SCHEMA_VERSION = "1.1.0"
# Draws of the parameter posterior used for the bands (numerical).
DEFAULT_DRAWS = 200


def vector_from_refraction(sphere: float, cylinder: float, axis_deg: float) -> NDArray:
    """Clinical (M, J0, J45) of sphere, cylinder (either sign), axis (TABO), D."""
    a = math.radians(axis_deg)
    return np.array(
        [sphere + cylinder / 2, -cylinder / 2 * math.cos(2 * a), -cylinder / 2 * math.sin(2 * a)]
    )


def to_refraction(v: NDArray) -> tuple[NDArray, NDArray, NDArray]:
    """Sphere, minus cylinder, and axis of power vectors (..., 3)."""
    J = np.hypot(v[..., 1], v[..., 2])
    C = -2 * J
    S = v[..., 0] - C / 2
    axis = np.degrees(0.5 * np.arctan2(v[..., 2], v[..., 1])) % 180.0
    axis = np.where(axis == 0, 180.0, axis)
    return S, C, axis


def logmar(v: NDArray, ages: NDArray) -> NDArray:
    """Stand-in logMAR of power vectors (..., ages, 3) at each age's pupil (the interpolated
    table of `eyebiomech.predict.acuity`), with accommodation clearing hyperopia up to the
    amplitude for the age."""
    amp = np.array([amplitude_for_age(a) for a in ages])
    pupil = np.array([acuity_pupil_mm(a) for a in ages])
    M = v[..., 0]
    residual = np.where(M < 0, -M, np.maximum(0.0, M - amp))
    j = np.hypot(v[..., 1], v[..., 2])
    return logmar_lookup(residual, j, np.broadcast_to(pupil, M.shape))


def posterior_draws(
    posterior: dict, n: int = DEFAULT_DRAWS, seed: int = 0, library=None
) -> list[dict]:
    """Parameter sets: thinned MCMC samples when the posterior has them, else draws from its
    Gauss-Newton normal approximation in the transformed space, clipped to the calibration's
    bounds (with `library`, its validated growth exposure too); the best fit first."""
    from eyebiomech.calib.fit import Space

    names = tuple(posterior["names"])
    best = posterior["best"]
    draws = [dict(best)]
    rng = np.random.default_rng(seed)
    samples = posterior.get("samples")
    if samples:
        s = np.asarray(samples, dtype=float)
        idx = rng.choice(len(s), size=min(n - 1, len(s)), replace=False)
        draws += [dict(zip(names, map(float, s[i]), strict=True)) for i in idx]
    else:
        space = Space(load_priors(), names)
        lo, hi = space.bounds(library)
        x0 = space.to_x(best)
        cov = np.asarray(posterior["cov"], dtype=float)
        xs = rng.multivariate_normal(x0, cov, size=n - 1, check_valid="ignore")
        draws += [space.to_params(np.clip(x, lo, hi)) for x in xs]
    return draws


def _changes(draws: list[dict], library) -> tuple[NDArray, NDArray]:
    """Remodeled changes at the distance-only and near-only duty cycles, (draws, ages, 3).
    Stiffness scales outside the library's table clamp to its edges (approximation; the grid
    records the clamped fraction of draws, `stiffness_clamped_fraction`)."""
    trajectories = (state_trajectories(p, library, on_edge="clamp") for p in draws)
    dist, near = zip(*trajectories, strict=True)
    return np.array(dist), np.array(near)


def stiffness_clamped_fraction(draws: list[dict], library, ages: NDArray = AGES) -> float:
    """The fraction of parameter draws whose stiffness leaves the library's table at some age."""
    lo, hi = library.stiffness_range
    tol = 1e-9

    def outside(p: dict) -> bool:
        s = stiffness_function(p["stiffness_age_slope"])
        return any(not lo * (1 - tol) <= s(float(a)) <= hi * (1 + tol) for a in ages)

    return sum(outside(p) for p in draws) / len(draws)


def _bands(v: NDArray, ages: NDArray, onset_from: float | None = None) -> dict:
    """Median and 5/95% of sphere and cylinder over draws (draws, ages, 3), axis and logMAR
    of the median vector, and the onsets (median trajectory; 5-95% over draws), searched from
    `onset_from` on (all ages by default)."""
    S, C, _ = to_refraction(v)
    med = np.median(v, axis=0)
    s_med, c_med, ax_med = to_refraction(med)
    lm = logmar(med, ages)
    lm_draws = logmar(v, ages)
    keep = ages >= (ages[0] if onset_from is None else onset_from)
    onset = onset_ages(ages[keep], s_med[keep], c_med[keep], lm[keep])
    per_draw = []
    for d in range(v.shape[0]):
        sd, cd, _ = to_refraction(v[d])
        per_draw.append(onset_ages(ages[keep], sd[keep], cd[keep], lm_draws[d][keep]))

    def spread(key):
        x = np.array([np.inf if o[key] is None else o[key] for o in per_draw], dtype=float)
        with np.errstate(invalid="ignore"):  # inf − inf between two draws without an onset
            lo, hi = np.percentile(x, [5, 95])
        return [
            None if not np.isfinite(lo) else float(lo),
            None if not np.isfinite(hi) else float(hi),
        ]

    return {
        "sphere": {
            k: np.percentile(S, q, axis=0) for k, q in (("p05", 5), ("p50", 50), ("p95", 95))
        },
        "cylinder": {
            "p05": np.percentile(C, 95, axis=0),  # minus cylinder: the 5% least negative
            "p50": np.percentile(C, 50, axis=0),
            "p95": np.percentile(C, 5, axis=0),
        },
        "axisDeg": ax_med,
        "logMAR": lm,
        "onset": {
            "refraction": {
                "p50": onset["refraction"],
                **dict(zip(("p05", "p95"), spread("refraction"), strict=True)),
            },
            "acuity": {
                "p50": onset["acuity"],
                **dict(zip(("p05", "p95"), spread("acuity"), strict=True)),
            },
        },
    }


def predict_profile(
    profile, posterior: dict, library, *, ages: NDArray = AGES, draws: int = DEFAULT_DRAWS
) -> dict:
    """The trajectory of one subject (`SubjectProfile`), anchored at the profile's age; onsets
    are searched from that age on (the profile describes the subject from then)."""
    ps = posterior_draws(posterior, draws, library=library)
    dist, near = _changes(ps, library)
    f = near_fraction(profile.near_hours, load_duty_cycle())
    delta = dist + f * (near - dist)
    anchor = np.array(
        [
            np.interp(profile.age_years, ages, delta[d, :, k])
            for d in range(len(ps))
            for k in range(3)
        ]
    ).reshape(len(ps), 1, 3)
    v0 = vector_from_refraction(profile.sphere_d, profile.cylinder_d, profile.axis_deg)
    v = v0[None, None, :] + delta - anchor
    out = _bands(v, ages, onset_from=profile.age_years)
    return {
        "profile": {
            "ageYears": profile.age_years,
            "nearHours": profile.near_hours,
            "sphereD": profile.sphere_d,
            "cylinderD": profile.cylinder_d,
            "axisDeg": profile.axis_deg,
        },
        "ages": ages.tolist(),
        **_jsonable(out),
    }


def _jsonable(x, digits: int = 4):
    if isinstance(x, dict):
        return {k: _jsonable(v, digits) for k, v in x.items()}
    if isinstance(x, np.ndarray):
        return np.round(x, digits).tolist()
    if isinstance(x, float):
        return round(x, digits)
    return x


def predict_grid(
    posterior: dict,
    library,
    *,
    ages: NDArray = AGES,
    near_hours=(0.0, 2.0, 4.0, 6.0, 8.0),
    baseline_sph=(-3.0, -2.0, -1.0, 0.0, 1.0, 2.0),
    baseline_cyl=(0.0, 0.5, 1.0),
    baseline_axis_deg: float = 180.0,
    draws: int = DEFAULT_DRAWS,
    provenance: dict | None = None,
) -> dict:
    """The prediction grid (schemas/predictions.schema.json): trajectories from a baseline at
    the first age, arrays in C order over (nearHours, baselineSphereD, baselineCylinderD, ages)
    and onsets over the first three axes."""
    ps = posterior_draws(posterior, draws, library=library)
    dist, near = _changes(ps, library)
    duty = load_duty_cycle()
    shape = (len(near_hours), len(baseline_sph), len(baseline_cyl))
    fields = {
        k: np.zeros(shape + (len(ages),))
        for k in ("s05", "s50", "s95", "c05", "c50", "c95", "axis", "logmar")
    }
    onset = {k: np.full(shape, np.nan) for k in ("r50", "r05", "r95", "a50", "a05", "a95")}
    for i, h in enumerate(near_hours):
        f = near_fraction(h, duty)
        delta = dist + f * (near - dist)
        delta = delta - delta[:, :1, :]  # the baseline is the first age's refraction
        for j, s in enumerate(baseline_sph):
            for k, c in enumerate(baseline_cyl):
                v0 = vector_from_refraction(s, -abs(c), baseline_axis_deg)
                b = _bands(v0[None, None, :] + delta, ages)
                idx = (i, j, k)
                fields["s05"][idx], fields["s50"][idx], fields["s95"][idx] = (
                    b["sphere"][q] for q in ("p05", "p50", "p95")
                )
                fields["c05"][idx], fields["c50"][idx], fields["c95"][idx] = (
                    b["cylinder"][q] for q in ("p05", "p50", "p95")
                )
                fields["axis"][idx] = b["axisDeg"]
                fields["logmar"][idx] = b["logMAR"]
                for key, name in (("r", "refraction"), ("a", "acuity")):
                    for q in ("50", "05", "95"):
                        val = b["onset"][name][f"p{q}"]
                        onset[f"{key}{q}"][idx] = np.nan if val is None else val

    def arr(x, digits=3):
        return np.round(x, digits).tolist()

    def onset_arr(x):
        return [
            [[None if np.isnan(v) else round(float(v), 2) for v in row] for row in plane]
            for plane in x
        ]

    return {
        "schemaVersion": SCHEMA_VERSION,
        "id": "predictions-v1",
        "provenance": provenance or {},
        "remodeled": True,
        "baselineAgeYears": float(ages[0]),
        "baselineAxisDeg": baseline_axis_deg,
        "axes": {
            "ages": [float(a) for a in ages],
            "nearHours": list(map(float, near_hours)),
            "baselineSphereD": list(map(float, baseline_sph)),
            "baselineCylinderD": [-abs(float(c)) for c in baseline_cyl],
        },
        "parameters": list(PARAM_NAMES),
        "draws": len(ps),
        "sphere": {"p05": arr(fields["s05"]), "p50": arr(fields["s50"]), "p95": arr(fields["s95"])},
        "cylinder": {
            "p05": arr(fields["c05"]),
            "p50": arr(fields["c50"]),
            "p95": arr(fields["c95"]),
        },
        "axisDeg": {"p50": arr(fields["axis"], 1)},
        "logMAR": {"p50": arr(fields["logmar"])},
        "stiffnessClampedFraction": round(stiffness_clamped_fraction(ps, library, ages), 4),
        # The acuity table's blur limits: larger residual blur reads as the limit's logMAR.
        "acuityClipD": {"sphericalBlur": float(TABLE_M[-1]), "astigmaticBlur": float(TABLE_J[-1])},
        "onset": {
            "refraction": {
                "p50": onset_arr(onset["r50"]),
                "p05": onset_arr(onset["r05"]),
                "p95": onset_arr(onset["r95"]),
            },
            "acuity": {
                "p50": onset_arr(onset["a50"]),
                "p05": onset_arr(onset["a05"]),
                "p95": onset_arr(onset["a95"]),
            },
        },
        "date": date.today().isoformat(),
    }
