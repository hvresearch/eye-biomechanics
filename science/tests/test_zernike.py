"""OSA/ANSI Zernike polynomials, checked against the TypeScript optics package."""

import json

import numpy as np
import pytest

from eyebiomech.fem.data import DATA_DIR
from eyebiomech.zernike import zernike_count, zernike_index, zernike_matrix, zernike_value


def test_index_round_trip():
    for j in range(45):
        n, m = zernike_index(j)
        assert abs(m) <= n and (n - m) % 2 == 0
        assert (n * (n + 2) + m) // 2 == j
    assert zernike_count(8) == 45


def test_defocus_polynomial():
    rho, theta = np.array([0.3, 0.9]), np.array([0.1, 2.0])
    assert np.allclose(zernike_value(4, rho, theta), np.sqrt(3) * (2 * rho**2 - 1))


def test_matches_the_typescript_values():
    fx = json.loads((DATA_DIR / "oracle" / "zernike-values.json").read_text())
    rho = np.array([p["rho"] for p in fx["points"]])
    theta = np.array([p["theta"] for p in fx["points"]])
    want = np.array(fx["values"])
    got = zernike_matrix(8, rho, theta)
    assert got.shape == want.shape
    assert np.max(np.abs(got - want)) < 1e-12


def test_orthonormal_on_the_unit_disk():
    # Polar Gauss–Legendre in ρ² and uniform θ (numerical).
    xg, wg = np.polynomial.legendre.leggauss(30)
    r2 = (xg + 1) / 2
    th = np.linspace(0, 2 * np.pi, 64, endpoint=False)
    R2, TH = np.meshgrid(r2, th, indexing="ij")
    W = np.repeat(wg[:, None] / 2, th.size, axis=1) / th.size
    Z = zernike_matrix(6, np.sqrt(R2).ravel(), TH.ravel())
    gram = Z.T @ (Z * W.ravel()[:, None])
    assert np.allclose(gram, np.eye(Z.shape[1]), atol=1e-10)


def test_rejects_negative_index():
    with pytest.raises(ValueError):
        zernike_index(-1)
