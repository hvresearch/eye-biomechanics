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
        # Absolute placement: Optiland's x, y decenter the surface's own axis, as ours does.
        o.surfaces.add(
            index=i + 1,
            radius=s["radiusMm"],
            conic=s["conic"],
            material=IdealMaterial(s["index"]),
            is_stop=i == 0,
            x=s.get("decenterX", 0.0),
            y=s.get("decenterY", 0.0),
            z=s["vertexZMm"],
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


CONIC_CASES = [c for c in CASES["cases"] if c["kind"] in ("conic", "decentered")]


@pytest.mark.parametrize("case", CONIC_CASES, ids=lambda c: c["id"])
def test_reference_tracer_agrees_with_optiland_on_conic_systems(case):
    ref = np.array(
        [trace(case["surfaces"], r["origin"], r["direction"])["hits"][-1] for r in case["rays"]]
    )
    assert np.max(np.abs(_optiland_image_hits(case) - ref)) < 1e-6


def test_case_counts():
    kinds = [c["kind"] for c in CASES["cases"]]
    counts = {k: kinds.count(k) for k in ("conic", "toric", "zernike", "decentered", "tilted")}
    assert counts == {"conic": 20, "toric": 10, "zernike": 10, "decentered": 4, "tilted": 4}
    assert kinds.count("miss") >= 2 and kinds.count("aperture") >= 2
    assert all(len(c["rays"]) == 5 for c in CASES["cases"])


def test_decentered_and_tilted_cases_carry_their_transform():
    for c in CASES["cases"]:
        if c["kind"] == "decentered":
            assert any(s.get("decenterX", 0) or s.get("decenterY", 0) for s in c["surfaces"])
        if c["kind"] == "tilted":
            assert any(s.get("tiltXDeg", 0) or s.get("tiltYDeg", 0) for s in c["surfaces"])


def test_failure_cases_report_their_reason_and_surface():
    for case in CASES["cases"]:
        if case["kind"] not in ("miss", "aperture"):
            continue
        statuses = [trace(case["surfaces"], r["origin"], r["direction"]) for r in case["rays"]]
        failed = [r for r in statuses if r["vignetted"]]
        assert failed, case["id"]
        assert all(r["status"] == case["kind"] for r in failed)
        assert any(not r["vignetted"] for r in statuses), case["id"]
    surfaces = {c["kind"]: set() for c in CASES["cases"]}
    for case in CASES["cases"]:
        for r in case["rays"]:
            res = trace(case["surfaces"], r["origin"], r["direction"])
            if res["vignetted"]:
                surfaces[case["kind"]].add(res["surfaceIndex"])
    # Failures happen both at the first surface and at a later one.
    assert {0, 1} <= surfaces["miss"] and {0, 1} <= surfaces["aperture"]


def test_expected_records_status_and_optical_path():
    for case, exp in zip(CASES["cases"], EXPECTED["cases"], strict=True):
        assert len(exp["status"]) == len(exp["opticalPathMm"]) == len(case["rays"])
        for k, status in enumerate(exp["status"]):
            if status == "ok":
                assert exp["opticalPathMm"][k] > 0 and exp["surfaceIndex"][k] is None
            else:
                assert exp["imageHitsMm"][k] is None and exp["opticalPathMm"][k] is None


def test_tilted_sphere_equals_the_decentered_sphere():
    """A sphere tilted about its vertex is the same sphere with its vertex moved on the circle."""
    r_mm, a = 20.0, np.radians(4.0)
    tilted = [
        {"kind": "conic", "radiusMm": r_mm, "conic": 0.0, "vertexZMm": 0.0, "index": 1.5,
         "apertureSemiDiamMm": 8.0, "tiltXDeg": 4.0},
        {"kind": "conic", "radiusMm": float("inf"), "conic": 0.0, "vertexZMm": 30.0,
         "index": 1.5, "apertureSemiDiamMm": 50.0},
    ]
    # Center of curvature (0, 0, R) rotated about +x by a: (0, -R sin a, R cos a).
    moved = [dict(tilted[0]), tilted[1]]
    del moved[0]["tiltXDeg"]
    moved[0].update(decenterY=-r_mm * np.sin(a), vertexZMm=r_mm * np.cos(a) - r_mm,
                    apertureSemiDiamMm=50.0)
    for y in (-2.0, -0.5, 0.7, 2.5):
        ra = trace(tilted, [0.3, y, -5.0], [0.0, 0.0, 1.0])
        rb = trace(moved, [0.3, y, -5.0], [0.0, 0.0, 1.0])
        assert np.max(np.abs(np.array(ra["hits"]) - np.array(rb["hits"]))) < 1e-9


def test_tilted_plane_hit_height():
    plane = {"kind": "conic", "radiusMm": float("inf"), "conic": 0.0, "vertexZMm": 2.0,
             "index": 1.5, "apertureSemiDiamMm": 10.0, "tiltXDeg": 10.0}
    r = trace([plane], [0.0, 3.0, -5.0], [0.0, 0.0, 1.0])
    assert r["hits"][0][2] == pytest.approx(2.0 + 3.0 * np.tan(np.radians(10.0)), abs=1e-12)


def test_committed_cases_and_expected_hits_match_a_fresh_run():
    assert json.loads(json.dumps(make_cases(), default=str)) == json.loads(
        json.dumps(CASES, default=str)
    )
    fresh = expected_for(CASES)
    # The reference tracer's finite-difference Newton steps round differently on different CPUs
    # (1.3e-9 mm seen on some CI runners); 1e-8 mm still catches any regeneration with changed
    # code and is 100 times tighter than the 1e-6 mm TypeScript cross-check.
    tol = 1e-8
    assert json.loads(json.dumps(fresh)).keys() == EXPECTED.keys()
    for a, b in zip(fresh["cases"], EXPECTED["cases"], strict=True):
        assert a["id"] == b["id"]
        assert a["status"] == b["status"] and a["surfaceIndex"] == b["surfaceIndex"]
        for ha, hb, la, lb in zip(
            a["imageHitsMm"], b["imageHitsMm"], a["opticalPathMm"], b["opticalPathMm"], strict=True
        ):
            assert (ha is None) == (hb is None) and (la is None) == (lb is None)
            if ha is not None:
                assert np.max(np.abs(np.array(ha) - np.array(hb))) < tol
                assert abs(la - lb) < tol


def test_reference_zernike_polynomials():
    assert zernike(4, 0.5, 0.3) == pytest.approx(np.sqrt(3) * (2 * 0.25 - 1))
    assert zernike(5, 0.5, 0.3) == pytest.approx(np.sqrt(6) * 0.25 * np.cos(0.6))
    assert zernike(3, 0.5, 0.3) == pytest.approx(np.sqrt(6) * 0.25 * np.sin(0.6))
