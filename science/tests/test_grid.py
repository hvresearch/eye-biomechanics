"""Prediction of a subject profile and the prediction grid (M5 plan, Task 5.11)."""

import json
from pathlib import Path

import numpy as np
import pytest

from eyebiomech.calib.forward import PARAM_NAMES
from eyebiomech.cli import main
from eyebiomech.predict.grid import predict_grid, vector_from_refraction
from eyebiomech.remodel.library import Library
from eyebiomech.schema import SchemaError, validate_predictions

FIXTURE = Path(__file__).parent / "fixtures" / "library-coarse.json"
LIBRARY = Library.from_json(json.loads(FIXTURE.read_text()))
BEST = {
    "rate_per_year": 0.003,
    "lid_pressure_scale": 1.0,
    "eom_tone_scale": 1.0,
    "stiffness_age_slope": 0.02,
    "baseline_j0_mean": 0.15,
    "baseline_j_sd": 0.25,
}
# A posterior of the shape `eyebiomech calibrate` writes, without samples (the normal
# approximation with a small covariance in the transformed space).
POSTERIOR = {
    "schema": "eye-posterior/1",
    "names": list(PARAM_NAMES),
    "best": BEST,
    "samples": None,
    "cov": (np.eye(len(PARAM_NAMES)) * 1e-4).tolist(),
}


@pytest.fixture(scope="module")
def grid():
    return predict_grid(
        POSTERIOR, LIBRARY, near_hours=(0.0, 8.0), baseline_sph=(-1.0, 1.0),
        baseline_cyl=(0.0, 1.0), draws=8,
    )  # fmt: skip


def test_the_grid_validates_and_starts_at_its_baseline(grid):
    validate_predictions(grid)
    assert grid["remodeled"] is True
    assert grid["axes"]["ages"][0] == grid["baselineAgeYears"]
    # Every cell starts at its own baseline refraction (cylinder minus, axis 180).
    for j, s in enumerate(grid["axes"]["baselineSphereD"]):
        for k, c in enumerate(grid["axes"]["baselineCylinderD"]):
            assert grid["sphere"]["p50"][1][j][k][0] == pytest.approx(s, abs=1e-3)
            assert grid["cylinder"]["p50"][1][j][k][0] == pytest.approx(c, abs=1e-3)


def test_a_grid_of_the_wrong_shape_is_refused(grid):
    bad = json.loads(json.dumps(grid))
    bad["sphere"]["p50"] = bad["sphere"]["p50"][:1]
    with pytest.raises(SchemaError, match="sphere/p50"):
        validate_predictions(bad)


def test_the_cli_anchors_a_profile_at_its_age(tmp_path):
    post = tmp_path / "posterior.json"
    post.write_text(json.dumps(POSTERIOR))
    out = tmp_path / "profile.json"
    profile = "age=30,nearHours=4,sphere=-1.25,cyl=-0.75"
    argv = ["predict", "--profile", profile, "--axis", "170", "--posterior", str(post),
            "--library", str(FIXTURE), "--draws", "6", "--out", str(out)]  # fmt: skip
    assert main(argv) == 0
    doc = json.loads(out.read_text())
    assert doc["remodeled"] is True and "not a clinical prediction" in doc["citation"]
    ages = np.array(doc["ages"])
    i = int(np.flatnonzero(ages == 30)[0])
    got = vector_from_refraction(
        doc["sphere"]["p50"][i], doc["cylinder"]["p50"][i], doc["axisDeg"][i]
    )
    want = vector_from_refraction(-1.25, -0.75, 170)
    # The median passes through the profile at its age (to the file's rounding, 1e-4 D).
    assert got == pytest.approx(want, abs=2e-4)
    # Onsets are searched from the profile's age: this subject already needs correction then.
    assert doc["onset"]["refraction"]["p50"] == pytest.approx(30.0)


def test_the_cli_refuses_a_posterior_of_another_schema(tmp_path, capsys):
    """M5 review round 1, Minor 14."""
    post = tmp_path / "posterior.json"
    post.write_text(json.dumps({**POSTERIOR, "schema": "eye-posterior/2"}))
    argv = ["predict", "--profile", "age=30,nearHours=4,sphere=0,cyl=0", "--posterior",
            str(post), "--library", str(FIXTURE), "--out", str(tmp_path / "x.json")]  # fmt: skip
    assert main(argv) == 2
    assert "eye-posterior/1" in capsys.readouterr().err
    assert not (tmp_path / "x.json").exists()


def test_the_cli_refuses_a_bad_profile(tmp_path, capsys):
    argv = ["predict", "--profile", "age=3,nearHours=4,sphere=0,cyl=0", "--library", str(FIXTURE),
            "--out", str(tmp_path / "x.json")]  # fmt: skip
    assert main(argv) == 2
    assert "outside 6-90" in capsys.readouterr().err
