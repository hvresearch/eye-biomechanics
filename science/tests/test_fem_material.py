"""Hyperelastic materials: energy, stress, and tangent consistency (M4 plan, Task 4.4)."""

import json

import numpy as np
import pytest

from eyebiomech.fem.data import DATA_DIR, load_materials
from eyebiomech.fem.material import HGO, NeoHookean, fiber_directions, region_materials
from eyebiomech.fem.mesh import eye_geometry

RNG = np.random.default_rng(4)
H = 1e-6  # central-difference step (numerical)


def _random_f(n: int, scale: float = 0.1) -> np.ndarray:
    F = np.eye(3)[:, :, None] + scale * RNG.standard_normal((3, 3, n))
    assert np.all(np.linalg.det(np.moveaxis(F, -1, 0)) > 0)
    return F


def _unit(n: int) -> np.ndarray:
    a = RNG.standard_normal((3, n))
    return a / np.linalg.norm(a, axis=0)


def _materials(n: int):
    return [
        NeoHookean(mu=0.3, lam=2.0),
        HGO(mu=0.3, lam=2.0, k1=2.9, k2=20.0, kappa=0.0, fibers=[_unit(n), _unit(n)]),
        HGO(mu=0.2, lam=9.0, k1=1.0, k2=5.0, kappa=0.1, fibers=[_unit(n)]),
        HGO(
            mu=0.2, lam=9.0, k1=1.0, k2=5.0, kappa=0.0, fibers=[_unit(n), _unit(n)], shares=[0.5, 2]
        ),
    ]


@pytest.mark.parametrize("index", [0, 1, 2, 3])
def test_zero_energy_and_stress_in_the_reference_state(index):
    n = 5
    m = _materials(n)[index]
    F = np.repeat(np.eye(3)[:, :, None], n, axis=2)
    # Round-off only: a unit fiber has |a|² − 1 of order 1e-16.
    assert np.allclose(m.energy(F), 0, atol=1e-13)
    assert np.allclose(m.first_pk(F), 0, atol=1e-13)


@pytest.mark.parametrize("index", [0, 1, 2, 3])
def test_stress_is_the_derivative_of_the_energy(index):
    n = 20
    m = _materials(n)[index]
    F = _random_f(n)
    P = m.first_pk(F)
    for i in range(3):
        for j in range(3):
            dF = np.zeros_like(F)
            dF[i, j] = H
            num = (m.energy(F + dF) - m.energy(F - dF)) / (2 * H)
            assert np.allclose(P[i, j], num, rtol=1e-6, atol=1e-9)


@pytest.mark.parametrize("index", [0, 1, 2, 3])
def test_tangent_is_the_derivative_of_the_stress(index):
    n = 20
    m = _materials(n)[index]
    F = _random_f(n)
    dF = RNG.standard_normal((3, 3, n))
    num = (m.first_pk(F + H * dF) - m.first_pk(F - H * dF)) / (2 * H)
    assert np.allclose(m.tangent(F, dF), num, rtol=1e-6, atol=1e-8)


def test_fibers_carry_no_stress_in_compression():
    a = np.array([[1.0], [0.0], [0.0]])
    m = HGO(mu=0.3, lam=2.0, k1=2.9, k2=20.0, kappa=0.0, fibers=[a])
    base = NeoHookean(mu=0.3, lam=2.0)
    F = np.diag([0.95, 1.0, 1.0])[:, :, None]
    assert np.allclose(m.first_pk(F), base.first_pk(F))
    F = np.diag([1.05, 1.0, 1.0])[:, :, None]
    assert m.first_pk(F)[0, 0, 0] > base.first_pk(F)[0, 0, 0]


def test_small_strain_limit_gives_youngs_modulus():
    mu, lam = 0.3, 2.0
    m = NeoHookean(mu=mu, lam=lam)
    E = mu * (3 * lam + 2 * mu) / (lam + mu)
    nu = lam / (2 * (lam + mu))
    eps = 1e-6
    # Uniaxial stress: stretch x, contract y and z by ν·ε (linear limit).
    F = np.diag([1 + eps, 1 - nu * eps, 1 - nu * eps])[:, :, None]
    assert m.first_pk(F)[0, 0, 0] / eps == pytest.approx(E, rel=1e-5)
    assert abs(m.first_pk(F)[1, 1, 0] / eps) < 1e-5 * E


def test_region_materials_scale_with_age():
    mats = load_materials()
    young = region_materials(mats, 30.0)
    old = region_materials(mats, 80.0)
    assert set(young) == {"cornea", "limbus", "sclera"}
    assert old["cornea"].mu > young["cornea"].mu
    assert old["sclera"].k1 / young["sclera"].k1 == pytest.approx(
        old["sclera"].mu / young["sclera"].mu
    )


def test_fiber_directions_are_unit_and_tangent_to_the_shell():
    doc = json.loads((DATA_DIR / "fixtures" / "emmetrope-right.eye.json").read_text())
    g = eye_geometry(doc)
    theta = RNG.uniform(0.05, 3.0, 200)
    phi = RNG.uniform(0, 2 * np.pi, 200)
    d = np.stack([np.sin(theta) * np.cos(phi), np.sin(theta) * np.sin(phi), -np.cos(theta)])
    x = d * g.r_out(theta)
    n = g.outer_normal(x)
    for family in (
        "nasalTemporal",
        "superiorInferior",
        "circumferential",
        "meridional",
        "diagonalPlus",
        "diagonalMinus",
    ):
        a = fiber_directions(x, family, g)
        assert np.allclose(np.linalg.norm(a, axis=0), 1)
        assert np.allclose(np.sum(a * n, axis=0), 0, atol=1e-12)
    with pytest.raises(ValueError):
        fiber_directions(x, "radial", g)


def test_half_share_families_double_up_to_the_same_equibiaxial_response():
    """Four families at half k1 (0°, 90°, ±45°) give the same equibiaxial stress as two at full
    k1 (0°, 90°), and add in-plane shear stiffness."""
    e1, e2 = np.array([[1.0], [0.0], [0.0]]), np.array([[0.0], [1.0], [0.0]])
    d1, d2 = (e1 + e2) / np.sqrt(2), (e1 - e2) / np.sqrt(2)
    two = HGO(mu=0.2, lam=9.0, k1=2.9, k2=20.0, kappa=0.0, fibers=[e1, e2])
    four = HGO(
        mu=0.2, lam=9.0, k1=2.9, k2=20.0, kappa=0.0, fibers=[e1, e2, d1, d2], shares=[0.5] * 4
    )
    F = np.diag([1.02, 1.02, 1 / 1.02**2])[:, :, None]
    assert np.allclose(four.first_pk(F), two.first_pk(F), rtol=1e-3)
    shear = np.eye(3)[:, :, None].copy()
    shear[0, 1, 0] = 0.02
    assert four.first_pk(shear)[0, 1, 0] > 1.5 * two.first_pk(shear)[0, 1, 0]
