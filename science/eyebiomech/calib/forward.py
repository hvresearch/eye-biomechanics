"""Cohort forward model of the population calibration (M5 plan, Task 5.10).

A synthetic cohort starts at the baseline age (6 years) with power vectors (M, J0, J45) from the
SyntEyes stand-in, whose J0 mean and astigmatic spread are nuisance parameters, and with daily
near-work hours from `data/calibration/priors.json`. Each subject's refraction then changes by
the response library's remodeled trajectory (`eyebiomech.remodel.library`) under the duty
cycle's load intensities (`eyebiomech.remodel.history`). Growth runs from the growth start age
(birth) under the baseline age's intensities, so the cohort's eyes at the baseline age already
carry the growth their loads have caused, and the trajectory after it has no transient from a
zero starting state. Because the library's dynamics are linear in the intensities and the
intensities are affine in the near-work fraction f, a subject's change is
Δ_distance(age) + f·(Δ_near(age) − Δ_distance(age)): two simulations per parameter set serve
the whole cohort.

The growth rate is bounded so that the growth exposure r·t from birth to the last age stays in
the range the response library is validated for (`max_rate_per_year`).

The stiffness follows the age stiffening of data/materials with the fitted slope, anchored at
the rigidity calibration's age (the calibrated stiffness there is kept).

Targets (`targets`):
- axis-class proportions among astigmatic eyes in an age band (subjects at every whole age of
  the band), with soft class boundaries for the fit;
- the slope of the cohort's mean J0 against age over an age window;
- optionally (`bound_sphere`), envelopes on the six-year change of the mean spherical
  equivalent in adult bands, which cost only when the mechanical change exceeds the observed
  one in magnitude (the lens, not modeled, accounts for the rest).
Either may be restricted to a near-work stratum (`near_hours`), which only the synthetic
identifiability test uses (Deviation 8).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from numpy.typing import NDArray

from eyebiomech.calib.data import CLASSES, load_axis_shift, load_j0_slopes, load_sphere_bounds
from eyebiomech.fem.data import _load, data_root, load_materials
from eyebiomech.remodel.growth import load_growth_table
from eyebiomech.remodel.history import (
    SubjectProfile,
    history_loads,
    load_duty_cycle,
    near_fraction,
)
from eyebiomech.synth.synteyes import load_synteyes, sample_vectors

PARAM_NAMES = (
    "rate_per_year",
    "lid_pressure_scale",
    "eom_tone_scale",
    "stiffness_age_slope",
    "baseline_j0_mean",
    "baseline_j_sd",
)
AGES = np.arange(6.0, 91.0)  # whole years of the trajectories (the spec's age range)


def load_priors(path=None) -> dict:
    return _load(path, "calibration", "priors.json")


@dataclass(frozen=True)
class Cohort:
    m: NDArray  # (n,) baseline M, D
    z: NDArray  # (n, 2) standard normal draws for J0 and J45
    near_fraction: NDArray  # (n,)
    baseline_age: float


def make_cohort(priors: dict | None = None, *, n: int | None = None, seed: int | None = None):
    """The calibration cohort with common random numbers (fixed draws, so the targets are
    smooth in the parameters)."""
    priors = priors or load_priors()
    c = priors["cohort"]
    n = c["n"] if n is None else n
    seed = c["seed"] if seed is None else seed
    syn = load_synteyes()
    v = sample_vectors(n, None, seed, syn)
    rng = np.random.default_rng(seed + 1)
    nh = c["nearHours"]
    if nh["form"] != "uniform":
        raise ValueError(f"unknown near-hours form {nh['form']!r}")
    hours = rng.uniform(nh["low"], nh["high"], size=n)
    duty = load_duty_cycle()
    return Cohort(
        m=v[:, 0],
        z=rng.standard_normal((n, 2)),
        near_fraction=np.array([near_fraction(h, duty) for h in hours]),
        baseline_age=float(syn["referenceAgeYears"]),
    )


def stiffness_function(slope: float, materials: dict | None = None):
    """Stiffness relative to the library's unit (the calibrated stiffness at the age-stiffening
    reference age) at each age: the table's form with the given slope, anchored so that the
    stiffness at the rigidity calibration's age is the table's."""
    materials = materials or load_materials()
    t = materials["ageStiffening"]
    lo, hi = t["clampAgeYears"]
    ref = t["referenceAgeYears"]
    anchor_age = materials["calibration"]["ageYears"]
    anchor = math.exp(t["ratePerYear"] * (min(max(anchor_age, lo), hi) - ref))
    a0 = min(max(anchor_age, lo), hi)

    def s(age: float) -> float:
        return anchor * math.exp(slope * (min(max(age, lo), hi) - a0))

    return s


def max_rate_per_year(library, ages: NDArray = AGES) -> float:
    """The largest growth rate whose exposure r·t from the growth start age to the last age stays
    within the library's validated range (`Library.valid_rate_time`; M5 plan, Task 5.14)."""
    start = load_growth_table()["growthStartAgeYears"]["value"]
    return library.valid_rate_time / (float(ages[-1]) - start)


# The calibration clamps stiffness scales outside the response library's table to its edges
# (approximation, stated in data/results/README.md: the prior's slope reaches below 0.5x and
# above 4x at the oldest and youngest ages); the library itself refuses by default.
CALIBRATION_ON_EDGE = "clamp"


def state_trajectories(
    params: dict, library, ages: NDArray = AGES, ratio: float = 1.0, on_edge: str = "raise"
):
    """Remodeled (M, J0, J45) changes at the distance-only and near-only duty cycles, each
    (ages, 3): the elastic response plus the growth since the growth start age of
    data/remodeling/growth.json (approximation: intensities before the first age held at the
    first age's values). A stiffness outside the library's table raises unless `on_edge` is
    "clamp" (`Library.simulate`)."""
    duty = load_duty_cycle()
    waking = duty["wakingHours"]["value"]
    scales = {
        "eom_tone_scale": params["eom_tone_scale"],
        "lid_pressure_scale": params["lid_pressure_scale"],
    }
    stiffness = stiffness_function(params["stiffness_age_slope"])
    history = max(0.0, float(ages[0]) - load_growth_table()["growthStartAgeYears"]["value"])
    out = []
    for hours in (0.0, waking):
        profile = SubjectProfile(age_years=float(ages[0]), near_hours=hours)

        def intensities(age, profile=profile):
            return history_loads(profile, age, duty, **scales).as_vector()

        traj = library.simulate(
            intensities,
            ages,
            rate_per_year=params["rate_per_year"],
            ratio=ratio,
            stiffness=stiffness,
            history_years=history,
            on_edge=on_edge,
        )
        out.append(traj[:, 1])
    return out[0], out[1]


def subject_vectors(
    params: dict,
    library,
    cohort: Cohort,
    ages: NDArray = AGES,
    near: NDArray | None = None,
    trajectories=None,
    on_edge: str = "raise",
) -> NDArray:
    """(n, ages, 3) power vectors; `near` overrides the cohort's near-work fractions; `on_edge`
    as in `state_trajectories`."""
    if ages[0] != cohort.baseline_age:
        raise ValueError(f"trajectories must start at the baseline age {cohort.baseline_age}")
    dist, nr = trajectories or state_trajectories(params, library, ages, on_edge=on_edge)
    f = cohort.near_fraction if near is None else near
    delta = dist[None] + f[:, None, None] * (nr - dist)[None]
    base = np.stack(
        [
            cohort.m,
            params["baseline_j0_mean"] + params["baseline_j_sd"] * cohort.z[:, 0],
            params["baseline_j_sd"] * cohort.z[:, 1],
        ],
        axis=1,
    )
    return base[:, None, :] + delta


def _sigmoid(x: NDArray) -> NDArray:
    return 0.5 * (1.0 + np.tanh(0.5 * x))


def axis_class_boundary_cos(path=None) -> float:
    """cos 2w of the axis classes' half-width w (data/population/axis-shift-by-age.json
    `definition.axisClassHalfWidthDeg`): WTR when cos 2α exceeds it, ATR when below its negative."""
    return _boundary_cos(str(path or data_root()), path is not None)


@lru_cache(maxsize=4)
def _boundary_cos(where: str, is_file: bool) -> float:
    t = _load(where if is_file else None, "population", "axis-shift-by-age.json")
    return math.cos(2 * math.radians(float(t["definition"]["axisClassHalfWidthDeg"])))


def class_weights(
    vectors: NDArray,
    threshold_d: float,
    width_d: float = 0.0,
    width_cos: float = 0.0,
    boundary_cos: float | None = None,
) -> tuple[NDArray, NDArray]:
    """Astigmatism weight (…,) and class membership (…, 3: WTR, ATR, oblique) of clinical power
    vectors. Minus cylinder C = −2|J|; the axis α satisfies cos 2α = J0/|J|: WTR when
    cos 2α > b (axis within the half-width of 180), ATR when < −b (within it of 90), with b the
    data's boundary (`axis_class_boundary_cos`, 0.5 for 30°) unless given. Zero widths give
    hard classes; positive widths logistic boundaries."""
    b = axis_class_boundary_cos() if boundary_cos is None else boundary_cos
    J0, J45 = vectors[..., 1], vectors[..., 2]
    mag = np.hypot(J0, J45)
    cyl = 2 * mag
    c2 = np.divide(J0, mag, out=np.zeros_like(mag), where=mag > 0)
    if width_d > 0:
        astig = _sigmoid((cyl - threshold_d) / width_d)
    else:
        astig = (cyl >= threshold_d).astype(float)
    if width_cos > 0:
        wtr = _sigmoid((c2 - b) / width_cos)
        atr = _sigmoid((-b - c2) / width_cos)
    else:
        wtr = (c2 > b).astype(float)
        atr = (c2 < -b).astype(float)
    return astig, np.stack([wtr, atr, 1.0 - wtr - atr], axis=-1)


def band_proportions(vectors: NDArray, ages: NDArray, band: tuple[float, float], **kw) -> NDArray:
    """Class proportions among astigmatic eyes of subjects at the band's whole ages."""
    sel = (ages >= band[0]) & (ages <= band[1])
    astig, classes = class_weights(vectors[:, sel], **kw)
    total = astig.sum()
    if total <= 0:
        return np.full(3, np.nan)
    return (astig[..., None] * classes).reshape(-1, 3).sum(axis=0) / total


def mean_j0_slope(vectors: NDArray, ages: NDArray, window: tuple[float, float]) -> float:
    sel = (ages >= window[0]) & (ages <= window[1])
    mean = vectors[:, sel, 1].mean(axis=0)
    return float(np.polyfit(ages[sel], mean, 1)[0])


def mean_m_change(vectors: NDArray, ages: NDArray, band: tuple[float, float], interval: float):
    """The cohort's mean change of M over `interval` years for subjects of the band's whole
    baseline ages (those whose later age is still on the trajectory)."""
    later = ages + interval
    sel = (ages >= band[0]) & (ages <= band[1]) & (later <= ages[-1])
    if not sel.any():
        raise ValueError(f"no baseline age of {band} has a change over {interval} years")
    j = np.searchsorted(ages, later[sel])
    return float((vectors[:, j, 0] - vectors[:, sel, 0]).mean())


def targets(priors: dict | None = None, *, bound_sphere: bool = False) -> list[dict]:
    """The real calibration targets: axis-class bands and J0 slopes marked `useInFit`; with
    `bound_sphere`, also the envelopes on the adult spherical-equivalent change marked
    `useAsBound` (one-sided: only a mechanical change larger in magnitude than the observed one
    costs; Task 5.14 Step 6)."""
    priors = priors or load_priors()
    n_eff = priors["effectiveSampleSize"]["value"]
    out = []
    for s in load_axis_shift():
        if not s.use_in_fit:
            continue
        for b in s.bands:
            for c in s.fit_classes:
                p = b.proportions[c]
                out.append(
                    {
                        "kind": "class",
                        "source": s.id,
                        "band": (b.age_from, b.age_to),
                        "class": c,
                        "threshold": s.threshold_d,
                        "value": p,
                        "se": math.sqrt(max(p * (1 - p), 0.01) / (b.n or n_eff)),
                        "nearHours": None,
                    }
                )
    for s in load_j0_slopes():
        if s.use_in_fit:
            out.append(
                {
                    "kind": "j0slope",
                    "source": s.id,
                    "band": (s.age_from, s.age_to),
                    "value": s.slope_d_per_year,
                    "se": s.se_d_per_year,
                    "nearHours": None,
                }
            )
    if bound_sphere:
        for b in load_sphere_bounds():
            out.append(
                {
                    "kind": "spherebound",
                    "source": b.id,
                    "band": (b.age_from, b.age_to),
                    "intervalYears": b.interval_years,
                    "value": b.bound_d,
                    "se": b.se_d,
                    "nearHours": None,
                }
            )
    return out


def predict_targets(
    params: dict, library, cohort: Cohort, data: list[dict], *, soft: bool = True, priors=None
) -> NDArray:
    """The model's value of each target of `data` (soft classes unless `soft` is False)."""
    priors = priors or load_priors()
    cls = priors["classification"]
    kw_soft = {"width_d": cls["softWidthD"], "width_cos": cls["softWidthCos"]} if soft else {}
    trajectories = state_trajectories(params, library, on_edge=CALIBRATION_ON_EDGE)
    duty = load_duty_cycle()
    cache: dict = {}
    out = []
    for t in data:
        key = t["nearHours"]
        if key not in cache:
            near = None if key is None else np.full(cohort.m.size, near_fraction(key, duty))
            cache[key] = subject_vectors(
                params, library, cohort, near=near, trajectories=trajectories
            )
        v = cache[key]
        if t["kind"] == "class":
            p = band_proportions(v, AGES, t["band"], threshold_d=t["threshold"], **kw_soft)
            out.append(p[CLASSES.index(t["class"])])
        elif t["kind"] == "j0slope":
            out.append(mean_j0_slope(v, AGES, t["band"]))
        elif t["kind"] == "spherebound":
            out.append(mean_m_change(v, AGES, t["band"], t["intervalYears"]))
        else:
            raise ValueError(f"unknown target kind {t['kind']!r}")
    return np.array(out)
