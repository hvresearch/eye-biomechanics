"""Cross-check of the reference tracer against Optiland, and drift check of data/oracle."""

import json

import numpy as np
import pytest

from eyebiomech.oracle.cases import make_cases
from eyebiomech.oracle.generate import ORACLE_DIR, decode, expected_for
from eyebiomech.oracle.reference_tracer import trace, zernike

CASES = decode(json.loads((ORACLE_DIR / "cases.json").read_text()))
EXPECTED = json.loads((ORACLE_DIR / "expected.json").read_text())


def _optiland_image_hits(case: dict) -> np.ndarray:
    from optiland import optic
    from optiland.materials import IdealMaterial
    from optiland.rays import RealRays

    surfaces = case["surfaces"]
    o = optic.Optic()
    o.surfaces.add(index=0, thickness=np.inf)
    for i, s in enumerate(surfaces):
        last = i == len(surfaces) - 1
        kwargs = {} if last else {"thickness": surfaces[i + 1]["vertexZMm"] - s["vertexZMm"]}
        o.surfaces.add(
            index=i + 1,
            radius=s["radiusMm"],
            conic=s["conic"],
            material=IdealMaterial(s["index"]),
            is_stop=i == 0,
            **kwargs,
        )
    o.set_aperture(aperture_type="EPD", value=4)
    o.fields.set_type("angle")
    o.fields.add(y=0)
    o.wavelengths.add(0.555, is_primary=True)
    rays = case["rays"]
    rr = RealRays(
        x=np.array([r["origin"][0] for r in rays]),
        y=np.array([r["origin"][1] for r in rays]),
        z=np.array([r["origin"][2] for r in rays]),
        L=np.array([r["direction"][0] for r in rays]),
        M=np.array([r["direction"][1] for r in rays]),
        N=np.array([r["direction"][2] for r in rays]),
        intensity=np.ones(len(rays)),
        wavelength=np.full(len(rays), 0.555),
    )
    out = o.surfaces.trace(rr, skip=1)
    return np.stack([np.asarray(out.x), np.asarray(out.y), np.asarray(out.z)], axis=1)


CONIC_CASES = [c for c in CASES["cases"] if c["kind"] == "conic"]


@pytest.mark.parametrize("case", CONIC_CASES, ids=lambda c: c["id"])
def test_reference_tracer_agrees_with_optiland_on_conic_systems(case):
    ref = np.array(
        [trace(case["surfaces"], r["origin"], r["direction"])["hits"][-1] for r in case["rays"]]
    )
    assert np.max(np.abs(_optiland_image_hits(case) - ref)) < 1e-6


def test_case_counts():
    kinds = [c["kind"] for c in CASES["cases"]]
    assert (kinds.count("conic"), kinds.count("toric"), kinds.count("zernike")) == (20, 10, 10)
    assert all(len(c["rays"]) == 5 for c in CASES["cases"])


def test_committed_cases_and_expected_hits_match_a_fresh_run():
    assert json.loads(json.dumps(make_cases(), default=str)) == json.loads(
        json.dumps(CASES, default=str)
    )
    fresh = expected_for(CASES)
    for a, b in zip(fresh["cases"], EXPECTED["cases"], strict=True):
        assert a["id"] == b["id"]
        assert np.max(np.abs(np.array(a["imageHitsMm"]) - np.array(b["imageHitsMm"]))) < 1e-9


def test_reference_zernike_polynomials():
    assert zernike(4, 0.5, 0.3) == pytest.approx(np.sqrt(3) * (2 * 0.25 - 1))
    assert zernike(5, 0.5, 0.3) == pytest.approx(np.sqrt(6) * 0.25 * np.cos(0.6))
    assert zernike(3, 0.5, 0.3) == pytest.approx(np.sqrt(6) * 0.25 * np.sin(0.6))
