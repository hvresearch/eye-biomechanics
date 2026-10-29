"""Material, eyelid, and EOM tables used by the FEM (data/materials, data/eyelid, data/eom)."""

import math

import pytest

from eyebiomech.fem.data import (
    age_factor,
    lame_lambda,
    load_eom_table,
    load_eyelid,
    load_materials,
)
from eyebiomech.fem.units import KPA_TO_MPA, MMHG_TO_KPA, MMHG_TO_MPA, mmhg_to_mpa

MATERIALS = load_materials()
EYELID = load_eyelid()


def _groups(materials):
    for name, region in materials["regions"].items():
        for key, group in region.items():
            if isinstance(group, dict):
                yield f"{name}.{key}", group
    for key in (
        "ageStiffening",
        "opticNerve",
        "scleralSpur",
        "ciliaryTensionNPerMmPerD",
        "inflationReference",
    ):
        yield key, materials[key]


def test_every_material_group_carries_a_citation_and_verified_flag():
    groups = dict(_groups(MATERIALS))
    assert {"cornea.matrix", "cornea.fibers", "sclera.thicknessMm", "limbus.fibers"} <= set(groups)
    for name, group in groups.items():
        assert isinstance(group.get("citation"), str) and group["citation"], name
        assert isinstance(group.get("verified"), bool), name


def test_stiffnesses_are_positive_and_matrices_nearly_incompressible():
    for name, region in MATERIALS["regions"].items():
        mu = region["matrix"]["muMPa"]
        lam = lame_lambda(mu, region["matrix"]["poissonRatio"])
        assert mu > 0 and lam / mu > 10, name
        assert region["fibers"]["k1MPa"] > 0 and region["fibers"]["k2"] > 0, name
        assert 0 <= region["fibers"]["kappa"] < 1 / 3, name


def test_lame_lambda_matches_the_poisson_relation():
    assert lame_lambda(1.0, 0.25) == pytest.approx(1.0)  # λ = μ when ν = 1/4
    assert lame_lambda(2.0, 0.49) == pytest.approx(2 * 2.0 * 0.49 / 0.02)
    with pytest.raises(ValueError):
        lame_lambda(1.0, 0.5)


def test_age_factor_is_one_at_the_reference_age_monotone_and_clamped():
    ref = MATERIALS["ageStiffening"]["referenceAgeYears"]
    assert age_factor(ref, MATERIALS) == 1.0
    ages = list(range(0, 121, 3))
    factors = [age_factor(a, MATERIALS) for a in ages]
    assert all(b >= a for a, b in zip(factors, factors[1:], strict=False))
    lo, hi = MATERIALS["ageStiffening"]["clampAgeYears"]
    assert age_factor(6, MATERIALS) == age_factor(lo, MATERIALS)
    assert age_factor(120, MATERIALS) == age_factor(hi, MATERIALS)
    rate = MATERIALS["ageStiffening"]["ratePerYear"]
    assert age_factor(80, MATERIALS) == pytest.approx(math.exp(rate * (80 - ref)))
    with pytest.raises(ValueError):
        age_factor(float("nan"), MATERIALS)


def test_unit_conversions():
    assert mmhg_to_mpa(15) == pytest.approx(0.0019998, abs=1e-7)
    assert MMHG_TO_MPA == pytest.approx(MMHG_TO_KPA * KPA_TO_MPA)
    assert MMHG_TO_KPA == pytest.approx(0.1333224, abs=1e-7)


def test_eyelid_table():
    for key in (
        "upperPressureMmHg",
        "lowerPressureMmHg",
        "upperContactHeightMm",
        "lowerContactHeightMm",
        "palpebralApertureMm",
    ):
        assert EYELID[key] > 0, key
    for key in (
        "upperPressureCitation",
        "upperContactCitation",
        "lowerCitation",
        "apertureCitation",
    ):
        assert EYELID[key], key
    assert EYELID["verified"] is False


def test_eom_table_has_six_muscles_and_a_globe():
    eom = load_eom_table()
    assert len(eom["muscles"]) == 6
    assert eom["globe"]["radiusMm"] > eom["globe"]["limbusRadiusMm"] > 0
