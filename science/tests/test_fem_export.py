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
    assert re.fullmatch(r"[0-9a-f]{40}|", prov["gitHash"])
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


def test_cli_rejects_a_gaze_off_the_lattice(tmp_path, capsys):
    fixture = DATA_DIR / "fixtures" / "emmetrope-right.eye.json"
    code = main(
        ["fem", "--eye", str(fixture), "--gaze", "7,0", "--out", str(tmp_path / "z.eye.json")]
    )
    assert code == 2
    assert "gaze" in capsys.readouterr().err
