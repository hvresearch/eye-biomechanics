"""Cohort forward model (M5 plan, Task 5.10)."""

import json
from pathlib import Path

import numpy as np
import pytest

from eyebiomech.calib.fit import start_params
from eyebiomech.calib.forward import (
    AGES,
    class_weights,
    load_priors,
    make_cohort,
    mean_j0_slope,
    predict_targets,
    stiffness_function,
    subject_vectors,
    targets,
)
from eyebiomech.fem.data import load_materials
from eyebiomech.remodel.history import GROUPS
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
    v = subject_vectors(p, _zero_library(), COHORT)
    assert np.allclose(v, v[:, :1, :])
    assert np.allclose(v[:, 0, 1], p["baseline_j0_mean"] + p["baseline_j_sd"] * COHORT.z[:, 0])


def test_stronger_lids_give_more_with_the_rule_astigmatism():
    """The lids give with-the-rule J0 in this model (lids@distance J0 > 0 in the library)."""
    assert LIBRARY.elastic(1.0)[GROUPS.index("lids@distance"), 1] > 0
    p = start_params(PRIORS)
    weak = subject_vectors({**p, "lid_pressure_scale": 0.5}, LIBRARY, COHORT)
    strong = subject_vectors({**p, "lid_pressure_scale": 2.0}, LIBRARY, COHORT)
    assert np.all(strong[:, 20:, 1].mean(axis=0) > weak[:, 20:, 1].mean(axis=0))


@pytest.mark.parametrize("j0, cls", [(0.5, 0), (-0.5, 1)])
def test_axis_classes(j0, cls):
    v = np.array([[0.0, j0, 0.0]])
    astig, classes = class_weights(v, 0.5)
    assert astig[0] == 1 and classes[0, cls] == 1
    oblique = class_weights(np.array([[0.0, 0.0, 0.5]]), 0.5)[1]
    assert oblique[0, 2] == 1


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
