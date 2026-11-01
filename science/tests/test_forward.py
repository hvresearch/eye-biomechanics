"""Cohort forward model (M5 plan, Task 5.10)."""

import json
from pathlib import Path

import numpy as np
import pytest

from eyebiomech.calib.fit import start_params
from eyebiomech.calib.forward import (
    AGES,
    axis_class_boundary_cos,
    class_weights,
    load_priors,
    make_cohort,
    mean_j0_slope,
    mean_m_change,
    predict_targets,
    state_trajectories,
    stiffness_function,
    subject_vectors,
    targets,
)
from eyebiomech.fem.data import load_materials
from eyebiomech.remodel.growth import load_growth_table
from eyebiomech.remodel.history import GROUPS, SubjectProfile, history_loads
from eyebiomech.remodel.library import LevelResponse, Library

FIXTURE = Path(__file__).parent / "fixtures" / "library-coarse.json"
LIBRARY = Library.from_json(json.loads(FIXTURE.read_text()))
PRIORS = load_priors()
COHORT = make_cohort(PRIORS, n=300)


def _zero_library():
    n = len(GROUPS)
    z = np.zeros((n, 3))
    return Library(GROUPS, [LevelResponse(1.0, z, z, -np.eye(n), np.eye(n), np.ones(n))])


def test_no_response_leaves_every_subject_at_baseline():
    p = start_params(PRIORS)
    # The one-level library tables only the unit stiffness; the age stiffening clamps to it.
    v = subject_vectors(p, _zero_library(), COHORT, on_edge="clamp")
    assert np.allclose(v, v[:, :1, :])
    assert np.allclose(v[:, 0, 1], p["baseline_j0_mean"] + p["baseline_j_sd"] * COHORT.z[:, 0])


def test_stronger_lids_give_more_with_the_rule_astigmatism():
    """The lids give with-the-rule J0 in this model (lids@distance J0 > 0 in the library)."""
    assert LIBRARY.elastic(1.0)[GROUPS.index("lids@distance"), 1] > 0
    p = start_params(PRIORS)
    weak = subject_vectors({**p, "lid_pressure_scale": 0.5}, LIBRARY, COHORT)
    strong = subject_vectors({**p, "lid_pressure_scale": 2.0}, LIBRARY, COHORT)
    assert np.all(strong[:, 20:, 1].mean(axis=0) > weak[:, 20:, 1].mean(axis=0))


def test_growth_runs_from_the_growth_start_age():
    """The trajectories carry the growth since the growth start age (birth): at the baseline
    age the remodeled change already differs from the elastic one, and it equals a library
    run with that history (M5 review, round 1)."""
    p = {**start_params(PRIORS), "rate_per_year": 0.05}
    dist, _ = state_trajectories(p, LIBRARY)
    start = load_growth_table()["growthStartAgeYears"]["value"]
    assert start < AGES[0]
    profile = SubjectProfile(age_years=float(AGES[0]), near_hours=0.0)
    scales = {k: p[k] for k in ("eom_tone_scale", "lid_pressure_scale")}
    run = LIBRARY.simulate(
        lambda a: history_loads(profile, a, **scales).as_vector(),
        AGES,
        rate_per_year=p["rate_per_year"],
        ratio=1.0,
        stiffness=stiffness_function(p["stiffness_age_slope"]),
        history_years=AGES[0] - start,
    )
    assert np.allclose(dist, run[:, 1])
    assert np.abs(run[0, 1] - run[0, 0]).max() > 1e-3


@pytest.mark.parametrize("j0, cls", [(0.5, 0), (-0.5, 1)])
def test_axis_classes(j0, cls):
    v = np.array([[0.0, j0, 0.0]])
    astig, classes = class_weights(v, 0.5)
    assert astig[0] == 1 and classes[0, cls] == 1
    oblique = class_weights(np.array([[0.0, 0.0, 0.5]]), 0.5)[1]
    assert oblique[0, 2] == 1


def test_the_axis_class_boundaries_come_from_the_data():
    """M5 review round 2 (M6 plan, Task 6.5): the 30° half-width is the data file's, not code's."""
    assert axis_class_boundary_cos() == pytest.approx(0.5)
    # An axis 40° from 180 (cos 2α = 0.17) is oblique with 30° classes, WTR with 45° ones.
    a = np.radians(40.0)
    v = np.array([[0.0, 0.5 * np.cos(2 * a), 0.5 * np.sin(2 * a)]])
    assert class_weights(v, 0.5)[1][0, 2] == 1
    assert class_weights(v, 0.5, boundary_cos=np.cos(np.radians(90.0)))[1][0, 0] == 1


def test_soft_classes_approach_hard_ones():
    rng = np.random.default_rng(2)
    v = rng.normal(0, 0.4, size=(5000, 3))
    a_h, c_h = class_weights(v, 0.5)
    a_s, c_s = class_weights(v, 0.5, width_d=1e-4, width_cos=1e-4)
    hard = (a_h[:, None] * c_h).sum(0) / a_h.sum()
    soft = (a_s[:, None] * c_s).sum(0) / a_s.sum()
    assert np.allclose(hard, soft, atol=0.01)


def test_the_stiffness_is_anchored_at_the_calibration_age():
    m = load_materials()
    t, age = m["ageStiffening"], m["calibration"]["ageYears"]
    a = stiffness_function(t["ratePerYear"])(age)
    assert stiffness_function(0.0)(age) == pytest.approx(a)
    assert stiffness_function(0.04)(90) > stiffness_function(0.01)(90)
    assert stiffness_function(0.04)(20) == stiffness_function(0.04)(50)  # clamped below 50


def test_targets_and_predictions_line_up():
    data = targets(PRIORS)
    assert {t["kind"] for t in data} == {"class", "j0slope"}
    m = predict_targets(start_params(PRIORS), LIBRARY, COHORT, data)
    assert m.shape == (len(data),) and np.all(np.isfinite(m))
    v = subject_vectors(start_params(PRIORS), LIBRARY, COHORT)
    slope = mean_j0_slope(v, AGES, (30, 80))
    assert slope == pytest.approx(m[[t["kind"] == "j0slope" for t in data]][0])


def test_the_sphere_bounds_are_six_year_changes_of_the_mean():
    """The bounding targets (M5 plan, Task 5.14 Step 6) are the Guangzhou bands' magnitudes,
    and the model's value is the mean M change over the interval from the band's ages."""
    bounds = [t for t in targets(PRIORS, bound_sphere=True) if t["kind"] == "spherebound"]
    assert [t["band"] for t in bounds] == [(35, 44), (45, 54), (55, 64), (65, 80)]
    assert [t["value"] for t in bounds] == pytest.approx([0.24, 0.51, 0.26, 0.05])
    assert not any(t["kind"] == "spherebound" for t in targets(PRIORS))
    v = np.zeros((4, AGES.size, 3))
    v[:, :, 0] = -0.02 * AGES  # a myopic drift of 0.02 D per year
    assert mean_m_change(v, AGES, (35, 44), 6) == pytest.approx(-0.12)
    assert mean_m_change(v, AGES, (65, 90), 6) == pytest.approx(-0.12)  # ages past 84 skipped
    with pytest.raises(ValueError, match="no baseline age"):
        mean_m_change(v, AGES, (89, 90), 6)
