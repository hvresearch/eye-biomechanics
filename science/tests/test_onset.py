"""Onset ages (M5 plan, Task 5.11; Review Focus 6)."""

import numpy as np
import pytest

from eyebiomech.predict.onset import onset_ages

AGES = np.arange(6.0, 91.0)


def test_a_cylinder_crossing_at_40():
    out = onset_ages(AGES, np.zeros_like(AGES), -np.clip((AGES - 6) * 0.75 / 34, 0, None))
    assert out["refraction"] == pytest.approx(40.0)
    assert out["acuity"] is None


def test_a_flat_trajectory_has_no_onset():
    z = np.zeros_like(AGES)
    assert onset_ages(AGES, z, z, z - 0.1) == {"refraction": None, "acuity": None}


def test_already_above_at_baseline_is_the_first_age():
    out = onset_ages(AGES, np.full_like(AGES, -1.0), np.zeros_like(AGES), np.full_like(AGES, 0.5))
    assert out == {"refraction": 6.0, "acuity": 6.0}


def test_crossings_interpolate_between_grid_ages():
    ages = np.array([10.0, 20.0])
    out = onset_ages(ages, np.array([0.0, 1.0]), np.zeros(2), np.array([0.1, 0.5]))
    assert out["refraction"] == pytest.approx(15.0)  # |sphere| passes 0.5 halfway
    assert out["acuity"] == pytest.approx(15.0)  # logMAR passes 0.3 halfway


def test_sphere_needs_to_exceed_its_threshold():
    """|sphere| > 0.5 D is strict: exactly 0.5 is not an onset."""
    assert onset_ages(AGES, np.full_like(AGES, 0.5), np.zeros_like(AGES))["refraction"] is None
