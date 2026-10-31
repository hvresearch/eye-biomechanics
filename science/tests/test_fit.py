"""Calibration: synthetic recovery of known parameters (M5 plan, Task 5.10; Review Focus 5,
Deviation 8)."""

import json
from pathlib import Path

import numpy as np
import pytest

from eyebiomech.calib.data import CLASSES
from eyebiomech.calib.fit import (
    Space,
    degrees_of_freedom,
    fit,
    rate_starts,
    residuals,
    start_params,
    with_rate_floor,
)
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


def test_a_rate_floor_lowers_only_the_growth_rate_bound():
    """The sensitivity fit of review round 3 (`eyebiomech calibrate --rate-floor`) lowers the
    rate's lower bound and leaves the priors and every other bound as they were."""
    i = PARAM_NAMES.index("rate_per_year")
    lowered = with_rate_floor(PRIORS, 1e-9)
    assert np.exp(Space(lowered).bounds(LIBRARY)[0][i]) == pytest.approx(1e-9)
    assert PRIORS["parameters"]["rate_per_year"]["bounds"][0] == 1e-05
    lo, hi = Space(lowered).bounds(LIBRARY)
    lo0, hi0 = Space(PRIORS).bounds(LIBRARY)
    assert np.delete(lo, i) == pytest.approx(np.delete(lo0, i))
    assert hi == pytest.approx(hi0)
    with pytest.raises(ValueError, match="positive"):
        with_rate_floor(PRIORS, 0.0)


def test_one_sided_envelopes_are_not_counted_as_degrees_of_freedom():
    """M5 review round 3 (M6 plan, Task 6.5): an inactive envelope adds no information."""
    data = [{"kind": "class"}] * 7 + [{"kind": "j0slope"}] * 2 + [{"kind": "spherebound"}] * 4
    assert degrees_of_freedom(data, 6) == 3


def test_a_sphere_bound_costs_only_beyond_the_envelope(monkeypatch):
    """The spherical-equivalent envelope is one-sided in magnitude (Task 5.14 Step 6)."""
    import eyebiomech.calib.fit as fit_module

    data = [
        {"kind": "spherebound", "value": 0.5, "se": 0.1},
        {"kind": "j0slope", "value": 0.5, "se": 0.1},
    ]
    space = Space(PRIORS)
    x = space.to_x(start_params(PRIORS))
    n_prior = space.prior_residuals(x).size
    for model, want in ((0.3, (0.0, -2.0)), (-0.3, (0.0, -8.0)), (-0.8, (3.0, -13.0))):
        monkeypatch.setattr(fit_module, "predict_targets", lambda *a, m=model, **k: np.full(2, m))
        r = residuals(x, space, LIBRARY, COHORT, data, PRIORS)
        assert r[: len(r) - n_prior] == pytest.approx(want)


def test_least_squares_recovers_known_parameters():
    data = _rich_design()
    post = fit(start_params(PRIORS), data, library=LIBRARY, cohort=COHORT, priors=_flat_priors())
    assert post.lsq_converged
    for name in PARAM_NAMES:
        assert post.best[name] == pytest.approx(TRUTH[name], rel=0.10), name


def test_the_nested_model_holds_the_rate_at_zero():
    """M6 plan, Task 6.6: r = 0 fitted as a nested model; with growth in the truth it fits
    worse than the full model, and it has one parameter fewer."""
    data = _rich_design()
    kw = {"library": LIBRARY, "cohort": COHORT, "priors": _flat_priors()}
    full = fit(start_params(PRIORS), data, **kw)
    nested = fit(start_params(PRIORS), data, growth=False, **kw)
    assert nested.best["rate_per_year"] == 0.0 and nested.fixed == {"rate_per_year": 0.0}
    assert "rate_per_year" not in nested.names and len(nested.names) == len(PARAM_NAMES) - 1
    assert nested.dof == full.dof + 1
    assert nested.cost > full.cost


def test_several_starts_keep_every_optimum():
    """The least squares from rates log-spaced over the rate's bounds (ends included); the
    result is the best optimum, and every start is recorded."""
    starts = rate_starts(PRIORS, LIBRARY, 3)
    lo, hi = Space(PRIORS).bounds(LIBRARY)
    i = Space(PRIORS).names.index("rate_per_year")
    rates = [s["rate_per_year"] for s in starts]
    assert rates[0] == pytest.approx(np.exp(lo[i])) and rates[-1] == pytest.approx(np.exp(hi[i]))
    assert rates[1] == pytest.approx(np.sqrt(rates[0] * rates[2]))
    assert rate_starts(PRIORS, LIBRARY, 1) == [start_params(PRIORS)]
    post = fit(None, _rich_design(), library=LIBRARY, cohort=COHORT, priors=_flat_priors(),
               starts=starts)  # fmt: skip
    assert len(post.starts) == 3
    assert post.cost == pytest.approx(min(s["cost"] for s in post.starts))


def test_a_chain_continues_from_its_last_walkers():
    """A chain built in two segments keeps the first segment's steps, continues from its last
    walkers, and counts its steps, acceptance, and segments over the whole chain."""
    data = _rich_design()[:8]
    kw = {"library": LIBRARY, "cohort": COHORT, "priors": _flat_priors(), "n_walkers": 12,
          "burn": 1}  # fmt: skip
    first = fit(start_params(PRIORS), data, "mcmc", n_steps=3, **kw)
    state = first.chain_state
    assert state["chain"].shape == (3, 12, len(PARAM_NAMES)) and state["segments"] == 1
    second = fit(start_params(PRIORS), data, "mcmc", n_steps=2, previous=state, **kw)
    both = second.chain_state
    assert both["chain"].shape[0] == 5 and both["segments"] == 2
    assert np.array_equal(both["chain"][:3], state["chain"])
    assert second.chain_steps == 4 and second.samples.shape == (4 * 12, len(PARAM_NAMES))
    assert 0 <= second.acceptance <= 1
    with pytest.raises(ValueError, match="walkers"):
        fit(start_params(PRIORS), data, "mcmc", n_steps=1, previous=state,
            **{**kw, "n_walkers": 14})  # fmt: skip


@pytest.mark.slow
def test_the_posterior_contains_the_truth():
    data = _rich_design()
    post = fit(start_params(PRIORS), data, "mcmc", library=LIBRARY, cohort=COHORT,
               priors=_flat_priors(), n_walkers=16, n_steps=400, burn=150)  # fmt: skip
    for i, name in enumerate(PARAM_NAMES):
        lo, hi = np.percentile(post.samples[:, i], [5, 95])
        assert lo <= TRUTH[name] <= hi, (name, lo, hi)
