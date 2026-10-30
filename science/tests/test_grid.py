"""Prediction of a subject profile and the prediction grid (M5 plan, Task 5.11)."""

import json
from pathlib import Path

import numpy as np
import pytest

from eyebiomech.calib.forward import PARAM_NAMES
from eyebiomech.cli import main
from eyebiomech.fem.data import data_root
from eyebiomech.predict.cli import calibration_summary
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


def test_the_grid_records_its_table_clamps(grid):
    """M5 review rounds 2-3 (M6 plan, Task 6.5): the stiffness draws clamped to the response
    library's table and the acuity table's blur limits are written to the grid."""
    assert 0.0 <= grid["stiffnessClampedFraction"] <= 1.0
    assert grid["acuityClipD"] == {"sphericalBlur": 4.0, "astigmaticBlur": 1.5}
    steep = {**POSTERIOR, "best": {**BEST, "stiffness_age_slope": 0.08}}
    g = predict_grid(steep, LIBRARY, near_hours=(0.0,), baseline_sph=(0.0,), baseline_cyl=(0.0,),
                     draws=4)  # fmt: skip
    # exp(0.08 × 40) ≈ 25 times the stiffness at 50 by 90: every draw leaves the 0.5-4 table.
    assert g["stiffnessClampedFraction"] == 1.0
    validate_predictions(g)


def test_a_grid_of_the_wrong_shape_is_refused(grid):
    bad = json.loads(json.dumps(grid))
    bad["sphere"]["p50"] = bad["sphere"]["p50"][:1]
    with pytest.raises(SchemaError, match="sphere/p50"):
        validate_predictions(bad)


@pytest.mark.parametrize(
    ("key", "path", "edit"),
    [
        # A ragged row deep in the array (the old validator looked only at the first element).
        ("/sphere/p50", ("sphere", "p50", 1, 1, 1), lambda row: row[:-1]),
        ("/cylinder/p95", ("cylinder", "p95", 0, 1), lambda plane: plane + [plane[0]]),
        # An empty inner array (the old validator raised IndexError).
        ("/cylinder/p05", ("cylinder", "p05", 0, 0), lambda plane: []),
        ("/axisDeg/p50", ("axisDeg", "p50", 1, 0, 0), lambda row: row[:3]),
        ("/logMAR/p50", ("logMAR", "p50", 0), lambda block: block[:1]),
        ("/onset/acuity/p95", ("onset", "acuity", "p95", 1, 1), lambda row: row + [None]),
        ("/onset/refraction/p05", ("onset", "refraction", "p05", 0), lambda block: [[]]),
    ],
)
def test_every_row_of_the_grid_is_shape_checked(grid, key, path, edit):
    """M5 review rounds 1-3 (M6 plan, Task 6.4)."""
    bad = json.loads(json.dumps(grid))
    parent = bad
    for p in path[:-1]:
        parent = parent[p]
    parent[path[-1]] = edit(parent[path[-1]])
    with pytest.raises(SchemaError, match=key):
        validate_predictions(bad)


def test_the_grid_summary_is_closed_and_optional_in_1_x(grid):
    validate_predictions({**grid, "summary": {"stance": "s", "finding": "f"}})
    validate_predictions({**grid, "schemaVersion": "1.0.0"})
    with pytest.raises(SchemaError, match="summary"):
        validate_predictions({**grid, "summary": {"stance": "s"}})
    with pytest.raises(SchemaError, match="summary"):
        validate_predictions({**grid, "summary": {"stance": "s", "finding": "f", "x": 1}})


def test_the_grid_carries_the_calibration_summary(tmp_path):
    """The stance and finding the viewer shows come from the grid document, which the grid
    command copies from the calibration's summary file (M5 review round 3; M6 Task 6.4)."""
    post = tmp_path / "posterior.json"
    post.write_text(json.dumps(POSTERIOR))
    out = tmp_path / "grid.json"
    argv = ["grid", "--posterior", str(post), "--library", str(FIXTURE), "--draws", "2",
            "--out", str(out)]  # fmt: skip
    assert main(argv) == 0
    doc = json.loads(out.read_text())
    assert doc["schemaVersion"] == "1.1.0"
    assert doc["summary"] == calibration_summary()
    assert "not a clinical prediction" in doc["summary"]["stance"]


def test_the_committed_grid_carries_the_committed_summary():
    doc = json.loads((data_root() / "results" / "predictions" / "v1.json").read_text())
    validate_predictions(doc)
    assert doc["summary"] == calibration_summary()


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
