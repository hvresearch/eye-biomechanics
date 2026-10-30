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
        "obliquePlus",
        "obliqueMinus",
    ):
        a = fiber_directions(x, family, g)
        assert np.allclose(np.linalg.norm(a, axis=0), 1)
        assert np.allclose(np.sum(a * n, axis=0), 0, atol=1e-12)
    with pytest.raises(ValueError):
        fiber_directions(x, "radial", g)


def test_corneal_diagonals_sit_at_45_degrees_to_the_preferred_pair_at_every_azimuth():
    """The cornea's diagonal families are ±45° to nasal-temporal/superior-inferior wherever the
    point lies; built from meridional ± circumferential (the review of edd021b) they fall onto
    superior-inferior and nasal-temporal at 45° azimuth."""
    doc = json.loads((DATA_DIR / "fixtures" / "emmetrope-right.eye.json").read_text())
    g = eye_geometry(doc)
    families = [f["direction"] for f in load_materials()["regions"]["cornea"]["fibers"]["families"]]
    assert families == ["nasalTemporal", "superiorInferior", "obliquePlus", "obliqueMinus"]
    phi = np.radians(np.arange(0, 360, 15))
    # Projecting frame-fixed directions onto the curved cap bends their angles a little away
    # from the axes (about 6° at 4 mm); the meridional-based diagonals miss by 45° at 45° azimuth.
    for rho, tol in ((0.5, 0.5), (2.0, 2.0), (4.0, 7.0)):
        theta = np.full(phi.shape, np.arcsin(rho / g.r_out(np.array([0.3]))[0]))
        d = np.stack([np.sin(theta) * np.cos(phi), np.sin(theta) * np.sin(phi), -np.cos(theta)])
        x = d * g.r_out(theta)
        nt = fiber_directions(x, "nasalTemporal", g)
        si = fiber_directions(x, "superiorInferior", g)
        for family in ("obliquePlus", "obliqueMinus"):
            a = fiber_directions(x, family, g)
            for ref in (nt, si):
                angle = np.degrees(np.arccos(np.abs(np.sum(a * ref, axis=0))))
                assert np.all(np.abs(angle - 45) < tol), (rho, family, angle)
        plus, minus = fiber_directions(x, "obliquePlus", g), fiber_directions(x, "obliqueMinus", g)
        between = np.degrees(np.arccos(np.abs(np.sum(plus * minus, axis=0))))
        assert np.all(90 - between < 2 * tol)


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


def test_tangent_tensor_is_the_tangent_the_solver_uses():
    """`tangent_tensor` (assembled by the solver) agrees with `tangent` and with the central
    difference of `first_pk`, for an HGO with dispersion and unequal shares, fibers stretched
    (M4 follow-up, review of 8ac4f73)."""
    n = 12
    a, b = _unit(n), _unit(n)
    m = HGO(mu=0.2, lam=9.0, k1=1.0, k2=5.0, kappa=0.1, fibers=[a, b], shares=[0.5, 1.0])
    # Stretch along both fibers so the fiber terms are active.
    F = np.eye(3)[:, :, None] + 0.08 * (
        np.einsum("in,jn->ijn", a, a) + np.einsum("in,jn->ijn", b, b)
    )
    F = F + 0.02 * RNG.standard_normal((3, 3, n))
    for E, *_ in m._fiber_terms(F, None):
        assert np.all(E > 0)
    A = m.tangent_tensor(F)
    for _ in range(3):
        dF = RNG.standard_normal((3, 3, n))
        via_tensor = np.einsum("ijkl...,kl...->ij...", A, dF)
        assert np.allclose(via_tensor, m.tangent(F, dF), rtol=1e-10, atol=1e-12)
        num = (m.first_pk(F + H * dF) - m.first_pk(F - H * dF)) / (2 * H)
        assert np.allclose(via_tensor, num, rtol=1e-6, atol=1e-8)
