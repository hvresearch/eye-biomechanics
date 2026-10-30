"""Stress-free reference geometry by fixed-point inverse solve (M5 plan, Task 5.3)."""

import json

import numpy as np
import pytest

from eyebiomech.fem.data import DATA_DIR, load_materials
from eyebiomech.fem.inverse import unloaded_shell
from eyebiomech.fem.loads import Loads
from eyebiomech.fem.material import NeoHookean, region_materials
from eyebiomech.fem.mesh import make_shell_mesh, make_sphere_shell
from eyebiomech.fem.solve import solve
from eyebiomech.fem.units import KPA_TO_MPA, MMHG_TO_KPA

E, NU = 1.0, 0.3
MU, LAM = E / (2 * (1 + NU)), E * NU / ((1 + NU) * (1 - 2 * NU))
A_MM, B_MM = 10.0, 11.0
FIXTURE = json.loads((DATA_DIR / "fixtures" / "emmetrope-right.eye.json").read_text())


def _lame_ur(r, p_mpa):
    return (
        p_mpa
        * A_MM**3
        * ((1 - 2 * NU) * r + (1 + NU) * B_MM**3 / (2 * r**2))
        / (E * (B_MM**3 - A_MM**3))
    )


@pytest.fixture(scope="module")
def sphere_inverse():
    shell = make_sphere_shell(A_MM, B_MM, layers=1, n_face=4)
    mats = {"sclera": NeoHookean(MU, LAM)}
    result = unloaded_shell(
        shell, mats, 1.0 / MMHG_TO_KPA, support="axis_points", tol_mm=1e-8, steps=1
    )
    return shell, mats, result


def test_the_unloaded_sphere_is_smaller_by_the_lame_displacement(sphere_inverse):
    measured, _, result = sphere_inverse
    X = measured.mesh.doflocs
    r = np.linalg.norm(X, axis=0)
    outer = np.isclose(r, B_MM)
    shrink = -np.sum(result.offset * X, axis=0) / r
    assert shrink[outer].mean() == pytest.approx(_lame_ur(B_MM, KPA_TO_MPA), rel=0.02)
    assert np.all(np.linalg.norm(result.shell.mesh.doflocs, axis=0)[outer] < B_MM)


def test_pressurizing_the_unloaded_sphere_returns_the_measured_geometry(sphere_inverse):
    measured, mats, result = sphere_inverse
    sol = solve(
        result.shell,
        mats,
        Loads().iop(1.0 / MMHG_TO_KPA),
        support="axis_points",
        steps=1,
    )
    pressurized = result.shell.mesh.doflocs + sol.nodal()
    assert np.max(np.abs(pressurized - measured.mesh.doflocs)) < 1e-8
    assert result.residual_mm < 1e-8
    # The returned reference solution is that pressurized state.
    assert np.max(np.abs(result.solution.nodal() - sol.nodal())) < 1e-9


def test_the_fixture_eye_converges_in_a_few_iterations():
    shell = make_shell_mesh(FIXTURE, layers=1, n_face=4)
    mats = region_materials(load_materials(), FIXTURE["age"], shell.geometry)
    on = load_materials()["opticNerve"]["radiusMm"]
    result = unloaded_shell(shell, mats, 15.0, optic_nerve_radius_mm=on, tol_mm=1e-5, steps=1)
    assert result.iterations <= 8
    assert result.residual_mm < 1e-5
    assert all(b < a for a, b in zip(result.history, result.history[1:], strict=False))
    # The apex moves back (the cornea is flatter and smaller before the pressure inflates it).
    apex = int(np.argmin(shell.mesh.doflocs[2]))
    assert result.offset[2, apex] > 0


def test_zero_pressure_changes_nothing():
    shell = make_sphere_shell(A_MM, B_MM, layers=1, n_face=4)
    result = unloaded_shell(shell, {"sclera": NeoHookean(MU, LAM)}, 0.0, support="axis_points")
    assert result.iterations == 0
    assert np.array_equal(result.shell.mesh.doflocs, shell.mesh.doflocs)
    assert not np.any(result.offset)
