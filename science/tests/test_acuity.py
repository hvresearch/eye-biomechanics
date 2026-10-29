"""Acuity stand-in and the Watson & Yellott pupil (M5 plan, Task 5.11)."""

import json

import numpy as np
import pytest

from eyebiomech.fem.data import DATA_DIR
from eyebiomech.predict.acuity import (
    acuity_pupil_mm,
    acuity_table,
    logmar_from_refraction,
    logmar_lookup,
    pupil_diameter_mm,
    radial_mtf,
)

PUPILS = json.loads((DATA_DIR / "oracle" / "pupil-values.json").read_text())


def test_no_blur_is_the_neural_floor():
    assert logmar_from_refraction(0.0, 0.0, 3.0) <= 0.0


def test_acuity_worsens_monotonically_with_defocus():
    """At 3 mm, logMAR rises with defocus and passes the 0.3 onset threshold between 0.25 and
    2 D (a sanity band for the stand-in, which has no transcribed calibration point)."""
    blur = np.arange(0.0, 3.01, 0.25)
    v = np.array([logmar_from_refraction(-b, 0.0, 3.0) for b in blur])
    assert np.all(np.diff(v) >= -1e-9)
    crossing = blur[np.argmax(v > 0.3)]
    assert 0.25 <= crossing <= 2.0


def test_the_diffraction_limited_mtf_cuts_off_at_d_over_lambda():
    f, m = radial_mtf(0.0, 0.0, 180.0, 3.0, 555.0)
    cutoff = 3e-3 / 555e-9 * np.pi / 180  # cycles/deg
    assert m[0] == pytest.approx(1.0)
    assert f[np.argmax(m < 1e-6)] == pytest.approx(cutoff, rel=0.03)


@pytest.mark.parametrize("row", PUPILS["values"])
def test_pupil_matches_the_eye_model(row):
    got = pupil_diameter_mm(row["luminanceCdM2"], row["fieldDeg2"], row["ageYears"], row["eyes"])
    assert got == pytest.approx(row["diameterMm"], abs=1e-12)


def test_the_stand_in_is_labeled():
    t = acuity_table()
    assert t["model"] == "mtf-threshold-standin" and "assumption" in t["standin"]["citation"]


@pytest.mark.parametrize(
    ("m", "j", "age"), [(0.55, 0.0, 10), (0.6, 0.2, 40), (0.9, 0.45, 70), (1.1, 0.0, 90)]
)
def test_the_table_interpolates_the_stand_in(m, j, age):
    """The committed lookup table (data/acuity/standin-table.json) agrees with direct evaluation
    within 0.02 logMAR between its nodes, near the 0.3 onset threshold, at the acuity pupil."""
    p = acuity_pupil_mm(age)
    direct = logmar_from_refraction(-m + j, -2 * j, p)
    assert float(logmar_lookup(np.array(m), np.array(j), np.array(p))) == pytest.approx(
        direct, abs=0.02
    )


def test_the_acuity_pupil_lies_inside_the_table():
    t = json.loads((DATA_DIR / "acuity" / "standin-table.json").read_text())
    pupils = [acuity_pupil_mm(a) for a in range(6, 91)]
    assert t["pupilMm"][0] <= min(pupils) and max(pupils) <= t["pupilMm"][-1]
