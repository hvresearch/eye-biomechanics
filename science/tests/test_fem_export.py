"""Exporter and CLI of the elastic FEM (M4 plan, Task 4.7)."""

import copy
import json
import re
from datetime import date

import numpy as np
import pytest

from eyebiomech.fem.cli import main
from eyebiomech.fem.data import DATA_DIR
from eyebiomech.fem.export import (
    UnphysicalResultError,
    build_deformation,
    build_result,
    check_physical,
    write_result,
)
from eyebiomech.fem.mesh import make_shell_mesh
from eyebiomech.schema import validate_deformation, validate_eye_parameters

FIXTURE = json.loads((DATA_DIR / "fixtures" / "emmetrope-right.eye.json").read_text())
PROV = {
    "source": "eyebiomech fem",
    "citation": "elastic test",
    "generatedBy": "test",
    "gitHash": "",
    "date": "2026-10-28",
    "verified": False,
}


@pytest.fixture(scope="module")
def shell():
    return make_shell_mesh(FIXTURE, layers=1, n_face=12)


def _zernike_doc(rms_um: float) -> dict:
    doc = copy.deepcopy(FIXTURE)
    s = doc["surfaces"][0]
    s.update(
        type="zernike",
        zernikeHeight={"normRadiusMm": 4.0, "coeffsMicrons": [0.0, 0.0, 0.0, 0.0, rms_um]},
    )
    return doc


def test_check_physical_rejects_a_huge_map_and_accepts_a_small_one():
    check_physical(_zernike_doc(1.0))
    with pytest.raises(UnphysicalResultError, match="500"):
        check_physical(_zernike_doc(600.0))
    bad = _zernike_doc(1.0)
    bad["surfaces"][0]["zernikeHeight"]["coeffsMicrons"][4] = float("nan")
    with pytest.raises(UnphysicalResultError):
        check_physical(bad)


def test_identical_states_return_the_input_surfaces(shell):
    U = np.zeros_like(shell.mesh.doflocs)
    doc, shifts = build_result(FIXTURE, shell, U, U, PROV)
    validate_eye_parameters(doc)
    for i in (0, 1):
        s, s0 = doc["surfaces"][i], FIXTURE["surfaces"][i]
        assert s["type"] == "zernike"
        assert s["radiusMm"] == s0["radiusMm"] and s["conic"] == s0.get("conic", 0)
        assert np.max(np.abs(s["zernikeHeight"]["coeffsMicrons"])) < 1e-9
    for a, b in zip(doc["surfaces"], FIXTURE["surfaces"], strict=True):
        assert a["thicknessToNextMm"] == pytest.approx(b["thicknessToNextMm"], abs=1e-12)
    assert doc["axialLengthMm"] == pytest.approx(FIXTURE["axialLengthMm"], abs=1e-12)
    assert all(v == 0 for v in shifts.values())


def test_axial_shifts_move_the_vertices(shell):
    """A uniform translation along z moves nothing relative to anything else."""
    U = np.zeros_like(shell.mesh.doflocs)
    T = U.copy()
    T[2] = -0.01
    doc, shifts = build_result(FIXTURE, shell, U, T, PROV)
    for a, b in zip(doc["surfaces"], FIXTURE["surfaces"], strict=True):
        assert a["thicknessToNextMm"] == pytest.approx(b["thicknessToNextMm"], abs=1e-9)
    assert shifts["anteriorApexMm"] == pytest.approx(-0.01, abs=1e-9)


def _rotation_y(angle: float) -> np.ndarray:
    c, s = np.cos(angle), np.sin(angle)
    return np.array([[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]])


@pytest.mark.parametrize(
    "motion",
    ["translate-x", "pivot-about-the-nerve"],
)
def test_rigid_motion_of_the_anterior_segment_leaves_the_cornea_unchanged(shell, motion):
    """The lens rides on the scleral spur, so a lateral shift or tilt the whole anterior segment
    shares (here a rigid motion of the globe) is no change of the cornea relative to the lens:
    the maps stay empty and the thicknesses stay put (review of b6f5a0d)."""
    X = shell.mesh.doflocs
    U = np.zeros_like(X)
    if motion == "translate-x":
        T = U.copy()
        T[0] = -0.113
    else:
        pole = np.array([0.0, 0.0, shell.sclera_radius_mm])[:, None]
        T = _rotation_y(0.005) @ (X - pole) + pole - X
    doc, shifts = build_result(FIXTURE, shell, U, T, PROV)
    for i in (0, 1):
        c = np.asarray(doc["surfaces"][i]["zernikeHeight"]["coeffsMicrons"])
        assert np.max(np.abs(c)) < 1e-4
    for a, b in zip(doc["surfaces"], FIXTURE["surfaces"], strict=True):
        assert a["thicknessToNextMm"] == pytest.approx(b["thicknessToNextMm"], abs=1e-6)


def test_written_files_validate_and_carry_provenance(shell, tmp_path):
    U = np.zeros_like(shell.mesh.doflocs)
    doc, _ = build_result(FIXTURE, shell, U, U, PROV)
    side = build_deformation(shell, U, U, [{"kind": "iop", "pressureMmHg": 15.0}], FIXTURE, PROV)
    validate_deformation(side)
    eye, defo = write_result(doc, side, tmp_path / "r.eye.json")
    assert eye.name == "r.eye.json" and defo.name == "r.deformation.json"
    validate_eye_parameters(json.loads(eye.read_text()))
    validate_deformation(json.loads(defo.read_text()))
    with pytest.raises(ValueError, match=".eye.json"):
        write_result(doc, side, tmp_path / "r.json")


def test_sidecar_triangulates_the_outer_surface(shell):
    U = np.zeros_like(shell.mesh.doflocs)
    side = build_deformation(shell, U, U, [], FIXTURE, PROV)
    v = np.asarray(side["vertices"])
    tri = np.asarray(side["triangles"])
    assert tri.max() < len(v) and len(side["region"]) == len(v)
    assert len(tri) == 2 * 6 * 12 * 12
    # Triangle areas sum to about the outer surface's area (sphere plus corneal cap).
    a = v[tri[:, 1]] - v[tri[:, 0]]
    b = v[tri[:, 2]] - v[tri[:, 0]]
    area = 0.5 * np.linalg.norm(np.cross(a, b), axis=1).sum()
    assert 0.95 * 4 * np.pi * 12**2 < area < 1.05 * 4 * np.pi * 12**2


def test_cli_end_to_end_on_a_coarse_mesh(tmp_path, capsys):
    out = tmp_path / "x.eye.json"
    fixture = DATA_DIR / "fixtures" / "emmetrope-right.eye.json"
    args = ["fem", "--eye", str(fixture), "--gaze", "0,0", "--iop", "15", "--n-face", "6"]
    code = main([*args, "--layers", "1", "--steps", "1", "--out", str(out)])
    assert code == 0, capsys.readouterr().err
    doc = json.loads(out.read_text())
    validate_eye_parameters(doc)
    side = json.loads(out.with_name("x.deformation.json").read_text())
    validate_deformation(side)
    prov = doc["provenance"]
    assert prov["source"] == "eyebiomech fem"
    assert "--gaze 0,0" in prov["generatedBy"]
    assert re.fullmatch(r"([0-9a-f]{40}(-dirty)?)?", prov["gitHash"])
    assert prov["date"] == date.today().isoformat()
    assert prov["verified"] is False and "elastic" in prov["citation"].lower()
    assert np.max(np.abs(side["displacementMm"])) > 0


def test_cli_rejects_a_future_schema_version(tmp_path, capsys):
    doc = copy.deepcopy(FIXTURE)
    doc["schemaVersion"] = "2.0.0"
    src = tmp_path / "future.eye.json"
    src.write_text(json.dumps(doc))
    code = main(["fem", "--eye", str(src), "--out", str(tmp_path / "y.eye.json")])
    assert code == 2
    assert "2.0.0" in capsys.readouterr().err


@pytest.mark.parametrize("gaze", ["15,0", "30,30", "0,-15"])
def test_cli_rejects_eccentric_gazes(tmp_path, capsys, gaze):
    """Until passive orbital torques exist and the lid bands follow the gaze, only primary gaze
    has a defensible load set."""
    fixture = DATA_DIR / "fixtures" / "emmetrope-right.eye.json"
    out = tmp_path / "e.eye.json"
    code = main(["fem", "--eye", str(fixture), "--gaze", gaze, "--out", str(out)])
    assert code == 2
    assert "primary gaze" in capsys.readouterr().err
    assert not out.exists()


def test_cli_rejects_a_gaze_off_the_lattice(tmp_path, capsys):
    fixture = DATA_DIR / "fixtures" / "emmetrope-right.eye.json"
    code = main(
        ["fem", "--eye", str(fixture), "--gaze", "7,0", "--out", str(tmp_path / "z.eye.json")]
    )
    assert code == 2
    assert "gaze" in capsys.readouterr().err


def test_check_physical_ignores_piston_and_tilt():
    """Tilt is rigid motion of the surface, not deformation; it does not count toward the
    500 µm limit (M4 follow-up, review of 8ac4f73)."""
    doc = _zernike_doc(1.0)
    doc["surfaces"][0]["zernikeHeight"]["coeffsMicrons"][:3] = [600.0, 600.0, 600.0]
    check_physical(doc)


def _corneal_field(shell, bulge_mm: float, c22_mm: float) -> np.ndarray:
    """A non-rigid displacement confined to the cornea (zero at the scleral spur): a radial
    bulge and an axial c(2,2)-like height change, both fading to zero at the limbus."""
    X = shell.mesh.doflocs
    theta = shell.geometry.polar(X)
    fade = np.clip(1.0 - (theta / shell.limbus_polar_rad) ** 2, 0.0, None)
    W = bulge_mm * fade * X / np.linalg.norm(X, axis=0)
    W[2] += c22_mm * fade * (X[0] ** 2 - X[1] ** 2) / 16.0
    return W


def test_relative_to_lens_keeps_a_non_rigid_field_under_a_pivot(shell):
    """A corneal deformation carried by a pivot of the globe about the optic nerve comes back as
    the deformation alone, up to the axial translation the function keeps (M4 follow-up,
    review of 34e8f59)."""
    from eyebiomech.fem.export import relative_to_lens

    X = shell.mesh.doflocs
    W = _corneal_field(shell, 0.004, 0.002)
    pole = np.array([0.0, 0.0, shell.sclera_radius_mm])[:, None]
    R = _rotation_y(0.004)
    U = R @ (X + W - pole) + pole - X
    rel = relative_to_lens(shell, np.zeros_like(X), U)
    diff = rel - W
    assert np.max(np.abs(diff[:2])) < 1e-9
    assert np.ptp(diff[2]) < 1e-9


def test_relative_to_lens_passes_torsion_through(shell):
    from eyebiomech.fem.export import relative_to_lens

    X = shell.mesh.doflocs
    c, s_ = np.cos(0.01), np.sin(0.01)
    Rz = np.array([[c, -s_, 0.0], [s_, c, 0.0], [0.0, 0.0, 1.0]])
    U = Rz @ X - X
    assert np.max(np.abs(relative_to_lens(shell, np.zeros_like(X), U) - U)) < 1e-9


def test_cli_exits_2_without_files_when_newton_fails(tmp_path, capsys, monkeypatch):
    """A non-converged solve is refused with exit code 2 and writes nothing (M4 Task 4.7)."""
    import eyebiomech.fem.cli as fem_cli
    from eyebiomech.fem.solve import NewtonDidNotConverge

    def fail(*args, **kwargs):
        raise NewtonDidNotConverge("load increment to 0.5 failed", [1.0, 0.5])

    monkeypatch.setattr(fem_cli, "solve", fail)
    out = tmp_path / "n.eye.json"
    fixture = DATA_DIR / "fixtures" / "emmetrope-right.eye.json"
    code = main(["fem", "--eye", str(fixture), "--n-face", "4", "--layers", "1", "--out", str(out)])
    assert code == 2
    assert "failed" in capsys.readouterr().err
    assert not out.exists() and not out.with_name("n.deformation.json").exists()


def test_cli_names_a_missing_or_malformed_input(tmp_path, capsys):
    fixture = DATA_DIR / "fixtures" / "emmetrope-right.eye.json"
    out = str(tmp_path / "m.eye.json")
    assert main(["fem", "--eye", str(tmp_path / "nope.eye.json"), "--out", out]) == 2
    assert "nope.eye.json" in capsys.readouterr().err
    bad = tmp_path / "bad.json"
    bad.write_text("{not json")
    assert main(["fem", "--eye", str(bad), "--out", out]) == 2
    assert "bad.json" in capsys.readouterr().err
    table = tmp_path / "forces.json"
    table.write_text(json.dumps({"schema": "eye-forces/1", "frame": "?", "gazes": []}))
    assert main(["fem", "--eye", str(fixture), "--forces", str(table), "--out", out]) == 2
    assert "forces.json" in capsys.readouterr().err


def test_cli_rejects_a_document_whose_muscles_differ_from_the_force_table(tmp_path, capsys):
    """The force table is generated from the default muscle geometry; a document with other
    muscles would be loaded with forces that do not belong to it (M4 follow-up, review of
    edd021b)."""
    from eyebiomech.forces.from_viewer import document_muscles

    doc = copy.deepcopy(FIXTURE)
    doc["extraocularMuscles"] = document_muscles()
    src = tmp_path / "same.eye.json"
    src.write_text(json.dumps(doc))
    from eyebiomech.forces.from_viewer import check_document_muscles

    check_document_muscles(doc)  # the default geometry passes
    doc["extraocularMuscles"][0]["insertionDistFromLimbusMm"] += 0.5
    src.write_text(json.dumps(doc))
    code = main(["fem", "--eye", str(src), "--out", str(tmp_path / "d.eye.json")])
    assert code == 2
    err = capsys.readouterr().err
    assert "lateralRectus" in err and "regenerate" in err


def test_git_hash_marks_a_dirty_tree(tmp_path):
    import subprocess

    from eyebiomech.fem.cli import _git_hash

    run = lambda *a: subprocess.run(["git", *a], cwd=tmp_path, check=True, capture_output=True)  # noqa: E731
    run("init", "-q")
    run("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x")
    assert re.fullmatch(r"[0-9a-f]{40}", _git_hash(tmp_path))
    (tmp_path / "f.txt").write_text("change")
    assert re.fullmatch(r"[0-9a-f]{40}-dirty", _git_hash(tmp_path))


def test_cli_iop_default_comes_from_the_data():
    """No physiological value in code: the default IOP is the materials table's (M4 follow-up,
    review of 8ac4f73)."""
    from eyebiomech.cli import _parser
    from eyebiomech.fem.cli import default_iop_mmhg
    from eyebiomech.fem.data import load_materials

    args = _parser().parse_args(["fem", "--eye", "x.eye.json", "--out", "y.eye.json"])
    assert args.iop is None
    assert default_iop_mmhg() == load_materials()["intraocularPressure"]["meanMmHg"]
