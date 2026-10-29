"""Paraxial refraction of EyeParameters documents (M5 plan, Task 5.8; Review Focus 7)."""

import copy
import json

import numpy as np
import pytest

from eyebiomech.fem.data import DATA_DIR
from eyebiomech.optics.paraxial import (
    induced_refraction,
    refraction,
    refraction_from_vector,
    rho2_coefficient,
)
from eyebiomech.zernike import zernike_index, zernike_value

ORACLE = json.loads((DATA_DIR / "oracle" / "induced-refraction.json").read_text())
FIXTURE = json.loads((DATA_DIR / "fixtures" / "emmetrope-right.eye.json").read_text())


@pytest.mark.parametrize("case", ORACLE["cases"], ids=lambda c: c["name"])
def test_induced_refraction_matches_the_viewer(case):
    got = induced_refraction(case["reference"], case["loaded"])
    for k in ("M", "J0", "J45"):
        assert got[k] == pytest.approx(case[k], abs=0.01)


@pytest.mark.parametrize("j", range(28))
def test_rho2_coefficients(j):
    """The ρ² coefficient of Z_j, from a polynomial fit of its radial profile."""
    n, m = zernike_index(j)
    rho = np.linspace(0, 1, 2 * n + 3)
    theta = 0.0 if m >= 0 else np.pi / (2 * abs(m))  # where cos(mθ) or sin(|m|θ) is 1
    poly = np.polynomial.polynomial.polyfit(rho, zernike_value(j, rho, theta), n)
    expected = poly[2] if abs(m) in (0, 2) and n >= 2 else 0.0
    assert rho2_coefficient(j) == pytest.approx(expected, abs=1e-9)


def test_pure_defocus_height_changes_the_power_analytically():
    """c(2,0) of 1 µm on the anterior cornea (normalized at 4 mm) adds Δn·4√3·c/a² of power,
    a myopic change of that size."""
    doc = copy.deepcopy(FIXTURE)
    s = doc["surfaces"][0]
    s.update(
        type="zernike", zernikeHeight={"normRadiusMm": 4.0, "coeffsMicrons": [0, 0, 0, 0, 1.0]}
    )
    dn = s["mediumAfter"]["index555"] - 1.0
    dP = dn * 4 * np.sqrt(3) * 1e-3 / 16 * 1000  # D
    got = induced_refraction(FIXTURE, doc)
    assert got["M"] == pytest.approx(-dP, rel=0.03)  # vertex vergence vs surface power
    assert abs(got["J0"]) < 1e-12 and abs(got["J45"]) < 1e-12


def test_no_change_no_refraction():
    got = induced_refraction(FIXTURE, copy.deepcopy(FIXTURE))
    assert all(v == 0 for v in got.values())
    assert abs(refraction(FIXTURE)["M"]) < 0.5  # the fixture is near emmetropic


@pytest.mark.parametrize("M, J0, J45", [(0.5, 0.25, 0.0), (-1.0, -0.3, 0.2), (0.0, 0.0, 0.0)])
def test_sphere_cylinder_round_trip(M, J0, J45):
    S, C, axis = refraction_from_vector(M, J0, J45)
    assert C <= 0 and 0 < axis <= 180
    a = np.radians(axis)
    assert S + C / 2 == pytest.approx(M)
    assert -C / 2 * np.cos(2 * a) == pytest.approx(J0, abs=1e-12)
    assert -C / 2 * np.sin(2 * a) == pytest.approx(J45, abs=1e-12)
