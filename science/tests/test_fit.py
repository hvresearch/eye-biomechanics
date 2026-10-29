"""Calibration: synthetic recovery of known parameters (M5 plan, Task 5.10; Review Focus 5,
Deviation 8)."""

import json
from pathlib import Path

import numpy as np
import pytest

from eyebiomech.calib.data import CLASSES
from eyebiomech.calib.fit import Space, fit, start_params
from eyebiomech.calib.forward import PARAM_NAMES, load_priors, make_cohort, predict_targets
from eyebiomech.remodel.library import Library

FIXTURE = Path(__file__).parent / "fixtures" / "library-coarse.json"
LIBRARY = Library.from_json(json.loads(FIXTURE.read_text()))
PRIORS = load_priors()
COHORT = make_cohort(PRIORS, n=300)
TRUTH = {
    "rate_per_year": 0.003,
    "lid_pressure_scale": 1.6,
    "eom_tone_scale": 0.7,
    "stiffness_age_slope": 0.03,
    "baseline_j0_mean": 0.25,
    "baseline_j_sd": 0.3,
}


def _rich_design() -> list[dict]:
    """Axis classes by decade and J0 slopes by age window, each in near-work strata of 0 and
    8 hours (the real targets have no strata, which leaves muscle tone and lid pressure
    entangled; Deviation 8)."""
    out = []
    for hours in (0.0, 8.0):
        for lo in range(6, 90, 10):
            for c in CLASSES:
                band = {"band": (lo, lo + 9), "class": c, "threshold": 0.5}
                out.append({"kind": "class", "source": "synthetic", "se": 0.01, **band,
                            "nearHours": hours})  # fmt: skip
        for window in ((30, 50), (50, 70), (70, 90), (10, 30)):
            out.append({"kind": "j0slope", "source": "synthetic", "band": window, "se": 5e-4,
                        "nearHours": hours})  # fmt: skip
    values = predict_targets(TRUTH, LIBRARY, COHORT, out, priors=PRIORS)
    for t, v in zip(out, values, strict=True):
        t["value"] = float(v)
    return out


def _flat_priors():
    """The physical priors' z-scores would pull the fit off the truth; the recovery test checks
    identifiability under the data alone."""
    p = json.loads(json.dumps(PRIORS))
    for spec in p["parameters"].values():
        if spec["prior"] in ("normal", "log-normal"):
            spec["prior"] = "uniform"
    return p


def test_the_growth_rate_is_bounded_by_the_validated_exposure():
    """A library that records its validated growth exposure caps the rate so that r·t from
    birth to 90 years stays within it (M5 plan, Task 5.14, Step 4); one too short for the
    prior's lower bound is refused."""
    i = PARAM_NAMES.index("rate_per_year")
    unbounded = Space(PRIORS).bounds(LIBRARY)[1][i]
    assert np.exp(unbounded) == pytest.approx(PRIORS["parameters"]["rate_per_year"]["bounds"][1])
    lib = Library(LIBRARY.groups, LIBRARY.levels, {**LIBRARY.meta, "validRateTime": 0.01})
    assert np.exp(Space(PRIORS).bounds(lib)[1][i]) == pytest.approx(0.01 / 90.0)
    short = Library(LIBRARY.groups, LIBRARY.levels, {**LIBRARY.meta, "validRateTime": 1e-4})
    with pytest.raises(ValueError, match="lower bound"):
        Space(PRIORS).bounds(short)


def test_least_squares_recovers_known_parameters():
    data = _rich_design()
    post = fit(start_params(PRIORS), data, library=LIBRARY, cohort=COHORT, priors=_flat_priors())
    assert post.converged
    for name in PARAM_NAMES:
        assert post.best[name] == pytest.approx(TRUTH[name], rel=0.10), name


@pytest.mark.slow
def test_the_posterior_contains_the_truth():
    data = _rich_design()
    post = fit(start_params(PRIORS), data, "mcmc", library=LIBRARY, cohort=COHORT,
               priors=_flat_priors(), n_walkers=16, n_steps=400, burn=150)  # fmt: skip
    for i, name in enumerate(PARAM_NAMES):
        lo, hi = np.percentile(post.samples[:, i], [5, 95])
        assert lo <= TRUTH[name] <= hi, (name, lo, hi)
