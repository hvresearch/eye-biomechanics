"""Ocular rigidity and the stiffness calibration (M5 plan, Task 5.4, Deviation 10)."""

import json

import pytest

from eyebiomech.fem.data import DATA_DIR, load_materials
from eyebiomech.fem.material import region_materials
from eyebiomech.fem.mesh import eye_geometry
from eyebiomech.fem.rigidity import calibrate_stiffness, ocular_rigidity

FIXTURE = json.loads((DATA_DIR / "fixtures" / "emmetrope-right.eye.json").read_text())
MATS = load_materials()
COARSE = {"n_face": 4, "layers": 1, "reference": "measured"}  # fast: no inverse solve


@pytest.fixture(scope="module")
def k_unit():
    return ocular_rigidity(FIXTURE, MATS, scale=1.0, **COARSE)


def test_a_stiffer_globe_is_more_rigid(k_unit):
    stiffer = ocular_rigidity(FIXTURE, MATS, scale=2.0, **COARSE)
    assert stiffer > 1.5 * k_unit  # about proportional (the fibers stiffen nonlinearly)


def test_the_calibration_reaches_its_target_on_a_coarse_mesh(k_unit):
    target = 0.6 * k_unit
    result = calibrate_stiffness(FIXTURE, MATS, target, tol=0.02, **COARSE)
    assert result.rigidity_per_ul == pytest.approx(target, rel=0.02)
    assert 0.3 < result.scale < 0.9
    assert ocular_rigidity(FIXTURE, MATS, scale=result.scale, **COARSE) == pytest.approx(
        result.rigidity_per_ul, rel=1e-9
    )


def test_region_materials_apply_the_calibrated_scale():
    scaled = json.loads(json.dumps(MATS))
    scaled["calibration"]["stiffnessScale"] = 0.5
    geo = eye_geometry(FIXTURE)
    age = MATS["ageStiffening"]["referenceAgeYears"]
    a = region_materials(MATS, age, geo, scale=1.0)
    b = region_materials(scaled, age, geo)
    for name in a:
        assert b[name].mu == pytest.approx(0.5 * a[name].mu)
        assert b[name].k1 == pytest.approx(0.5 * a[name].k1)


@pytest.mark.slow
def test_the_calibrated_globe_matches_the_in_vivo_mean():
    """At the production mesh, the committed scale gives the Pallikaris et al. 2005 mean within
    5% (the calibration's own tolerance is 2%; the rest allows for solver round-off)."""
    cal = MATS["calibration"]
    k = ocular_rigidity(
        FIXTURE,
        MATS,
        n_face=cal["meshNFace"],
        layers=cal["meshLayers"],
        age_years=cal["ageYears"],
    )
    assert k == pytest.approx(MATS["ocularRigidityReference"]["coefficientPerUl"], rel=0.05)


def test_ocular_rigidity_is_within_the_plausibility_band_of_the_in_vivo_mean():
    """Kept in CI by the owner's decision on M4 (#14): with the calibrated scale, a coarse globe
    (document geometry taken as stress-free, for speed) stays within the stored plausibility
    factor of the Pallikaris et al. 2005 mean; the slow test above checks the calibration
    itself at the production mesh."""
    ref = MATS["ocularRigidityReference"]
    k = ocular_rigidity(FIXTURE, MATS, n_face=6, layers=1, reference="measured")
    ratio = k / ref["coefficientPerUl"]
    assert 1 / ref["plausibilityFactor"] < ratio < ref["plausibilityFactor"]
