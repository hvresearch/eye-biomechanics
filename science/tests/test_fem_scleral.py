"""Scleral height maps (spec §7; M4 Deviation 17; M5 plan, Task 5.5)."""

import numpy as np
import pytest

from eyebiomech.fem.mesh import make_sphere_shell
from eyebiomech.fem.scleral import projected_coordinates, scleral_maps
from eyebiomech.zernike import zernike_value


@pytest.fixture(scope="module")
def sphere():
    return make_sphere_shell(11.5, 12.0, layers=1, n_face=8)


def _bulge(shell, amplitude_mm: float, j: int) -> np.ndarray:
    """A radial displacement a · Z_j on the posterior hemisphere of the stereographic map."""
    X = shell.mesh.doflocs
    rho, phi, posterior = projected_coordinates(X, shell.sclera_radius_mm)
    U = np.zeros_like(X)
    dr = np.where(posterior, amplitude_mm * zernike_value(j, np.clip(rho, 0, 1), phi), 0.0)
    return U + dr * X / np.linalg.norm(X, axis=0)


@pytest.mark.parametrize("j", [5, 4, 12])
def test_a_synthetic_bulge_is_recovered(sphere, j):
    a = 0.002
    maps = scleral_maps(sphere, np.zeros_like(sphere.mesh.doflocs), _bulge(sphere, a, j))
    c = np.asarray(maps["coeffsMicrons"])
    assert c[j] == pytest.approx(a * 1e3, rel=0.02)
    others = np.delete(c, j)
    assert np.max(np.abs(others)) < 0.02 * a * 1e3
    assert maps["normRadiusMm"] == pytest.approx(2 * sphere.sclera_radius_mm)


def test_no_change_gives_an_empty_map(sphere):
    U = np.zeros_like(sphere.mesh.doflocs)
    maps = scleral_maps(sphere, U, U)
    assert np.max(np.abs(maps["coeffsMicrons"])) < 1e-12
    assert maps["rmsResidualUm"] < 1e-12
