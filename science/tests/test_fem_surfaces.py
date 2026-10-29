"""Conic + Zernike fits of corneal surfaces and sampling of the deformed mesh (Task 4.6)."""

import json

import numpy as np
import pytest

from eyebiomech.fem.data import DATA_DIR
from eyebiomech.fem.mesh import conic_sag, make_shell_mesh
from eyebiomech.fem.surfaces import (
    deformed_corneal_surfaces,
    fit_conic,
    fit_surface_zernike,
    sample_surface,
    surface_change,
)
from eyebiomech.zernike import zernike_value

FIXTURE = json.loads((DATA_DIR / "fixtures" / "emmetrope-right.eye.json").read_text())
RNG = np.random.default_rng(11)


def _disk(n: int, radius: float) -> tuple[np.ndarray, np.ndarray]:
    r = radius * np.sqrt(RNG.uniform(0, 1, n))
    t = RNG.uniform(0, 2 * np.pi, n)
    return r * np.cos(t), r * np.sin(t)


def _conic_points(R, k, apex_z=0.0, extra=None, n=2000, radius=4.0):
    x, y = _disk(n, radius)
    z = apex_z + conic_sag(R, k, np.hypot(x, y))
    if extra is not None:
        z = z + extra(x, y)
    return np.stack([x, y, z], axis=1)


def test_pure_sphere_has_no_residual_coefficients():
    pts = _conic_points(7.8, 0.0, apex_z=0.3)
    coeffs, conic = fit_surface_zernike(pts, 4.0)
    assert conic.radius_mm == pytest.approx(7.8, abs=1e-6)
    assert conic.apex_z_mm == pytest.approx(0.3, abs=1e-9)
    assert np.max(np.abs(coeffs)) < 1e-3


def test_conic_constant_is_recovered():
    fit = fit_conic(_conic_points(7.72, -0.26))
    assert fit.radius_mm == pytest.approx(7.72, abs=1e-6)
    assert fit.conic == pytest.approx(-0.26, abs=1e-4)


def test_astigmatic_perturbation_is_recovered():
    a = 4.0

    def c22(x, y):  # 1 µm of Z(2, 2) = √6 ρ² cos 2θ
        return 1e-3 * zernike_value(5, np.hypot(x, y) / a, np.arctan2(y, x))

    pts = _conic_points(7.72, -0.26, extra=c22)
    coeffs, _ = fit_surface_zernike(pts, a, conic=fit_conic(_conic_points(7.72, -0.26)))
    assert coeffs[5] == pytest.approx(1.0, rel=0.01)
    assert np.max(np.abs(np.delete(coeffs, 5))) < 1e-2


def test_too_few_samples_are_refused():
    with pytest.raises(ValueError, match="samples"):
        fit_surface_zernike(_conic_points(7.8, 0, n=100), 4.0)


def test_points_beyond_the_normalization_radius_are_excluded():
    pts = _conic_points(7.8, 0.0, radius=5.0)
    far = np.hypot(pts[:, 0], pts[:, 1]) > 4.0
    pts[far, 2] += 0.5  # a step outside the disk must not leak into the fit
    coeffs, conic = fit_surface_zernike(pts, 4.0, conic=fit_conic(pts[~far]))
    assert np.max(np.abs(coeffs)) < 1e-3


@pytest.fixture(scope="module")
def shell():
    # n_face = 12: at 8 the inner surface misses the document's posterior cornea by up to 15 µm
    # near the 3 mm edge (the thickness cap starts close by); at 12 it is within 1 µm.
    return make_shell_mesh(FIXTURE, layers=1, n_face=12)


def test_sampled_outer_surface_lies_on_the_document_cornea(shell):
    pts = sample_surface(shell, None, "outer", radius_mm=4.0)
    assert pts.shape[1] == 3 and len(pts) > 3 * 45
    assert np.max(np.hypot(pts[:, 0], pts[:, 1])) <= 4.0 + 1e-12
    rho = np.hypot(pts[:, 0], pts[:, 1])
    ant = FIXTURE["surfaces"][0]
    z = conic_sag(ant["radiusMm"], ant["conic"], rho)
    # Optics frame: z from the undeformed anterior apex; the quadratic geometry is within 2 µm.
    assert np.max(np.abs(pts[:, 2] - z)) < 2e-3


def _fitted_sag(fit, x, y, norm_radius):
    coeffs, conic = fit
    rho = np.hypot(x, y)
    Z = np.stack(
        [zernike_value(j, rho / norm_radius, np.arctan2(y, x)) for j in range(len(coeffs))], 1
    )
    return conic.apex_z_mm + conic_sag(conic.radius_mm, conic.conic, rho) + 1e-3 * Z @ coeffs


def test_undeformed_mesh_returns_the_document_surfaces(shell):
    """The fitted maps reproduce the document's surfaces (radius and conic constant trade off
    over a small disk, so the sag itself is compared)."""
    s = deformed_corneal_surfaces(shell, None, norm_radius_mm=4.0, posterior_radius_mm=3.0)
    ant, post = FIXTURE["surfaces"][0], FIXTURE["surfaces"][1]
    for fit, surf, z0, a in (
        (s.anterior, ant, 0.0, 4.0),
        (s.posterior, post, ant["thicknessToNextMm"], 3.0),
    ):
        x, y = _disk(500, a)
        want = z0 + conic_sag(surf["radiusMm"], surf.get("conic", 0.0), np.hypot(x, y))
        assert np.max(np.abs(_fitted_sag(fit, x, y, a) - want)) < 2e-3


def test_surface_change_of_identical_surfaces_is_zero(shell):
    pts = sample_surface(shell, None, "outer", radius_mm=4.0)
    change = surface_change(pts, pts, 4.0)
    assert abs(change.apex_shift_mm) < 1e-12
    assert np.max(np.abs(change.coeffs_um)) < 1e-9


def test_surface_change_recovers_a_known_height_change():
    ref = _conic_points(7.72, -0.26, n=3000)
    a = 4.0

    def bump(x, y):  # 0.5 µm of Z(2, −2) plus a 2 µm forward shift
        return 1e-3 * 0.5 * zernike_value(3, np.hypot(x, y) / a, np.arctan2(y, x)) - 2e-3

    loaded = ref.copy()
    loaded[:, 2] += bump(ref[:, 0], ref[:, 1])
    change = surface_change(ref, loaded, a)
    assert change.apex_shift_mm == pytest.approx(-2e-3, abs=1e-9)
    assert change.coeffs_um[3] == pytest.approx(0.5, rel=1e-6)
    # The apex shift moves the vertex; the height map is zero there.
    assert abs(change.height_um(np.array([0.0]), np.array([0.0]))[0]) < 1e-9


def test_surface_change_uses_the_eulerian_height_at_fixed_lateral_position():
    """A lateral slide along a sphere changes no height at any lateral position."""
    R = 7.8
    ref = _conic_points(R, 0.0, n=3000, radius=4.1)
    loaded = ref.copy()
    dx = 0.05  # mm, slide every point along x on the same sphere
    loaded[:, 0] += dx
    loaded[:, 2] = conic_sag(R, 0.0, np.hypot(loaded[:, 0], loaded[:, 1]))
    change = surface_change(ref, loaded, 4.0)
    assert abs(change.apex_shift_mm) < 1e-12
    assert np.max(np.abs(change.coeffs_um)) < 1e-9


@pytest.mark.parametrize("shift", [(-0.117, 0.0014, 0.043), (0.08, -0.15, -0.02)])
def test_surface_change_of_a_rigidly_translated_conic_is_exact(shift):
    """Moving a conic by (a, b, c) changes the height at x by c + sag(x − a) − sag(x), to all
    orders in the translation (the review of edd021b found the first-order map dropped
    0.06 µm of Z(2,0) and 0.04 µm of Z(2,2) for the committed result's 117 µm shift)."""
    R, k, a = 7.8, -0.26, 4.0
    ref = _conic_points(R, k, n=4000, radius=4.25)
    loaded = ref + np.asarray(shift)
    change = surface_change(ref, loaded, a)
    x, y = _disk(500, a)
    ax, ay, az = shift
    want = 1e3 * (
        az + conic_sag(R, k, np.hypot(x - ax, y - ay)) - conic_sag(R, k, np.hypot(x, y))
    )
    got = 1e3 * change.apex_shift_mm + change.height_um(x, y)
    assert np.max(np.abs(got - want)) < 2e-3  # µm, order-8 truncation; first order misses ~0.06
    assert change.coeffs_um[4] != pytest.approx(0.0, abs=1e-3)  # Z(2,0) is not dropped


def test_surface_change_refuses_samples_that_do_not_cover_the_moved_disk():
    ref = _conic_points(7.8, 0.0, n=3000, radius=4.0)
    with pytest.raises(ValueError, match="lateral motion"):
        surface_change(ref, ref + np.array([0.2, 0.0, 0.0]), 4.0)
