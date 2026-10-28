"""Cubed-sphere corneoscleral shell mesh (M4 plan, Task 4.4)."""

import json
from collections import Counter

import numpy as np
import pytest
from skfem import Basis, ElementHex2, Functional, MeshHex2

from eyebiomech.fem.data import DATA_DIR
from eyebiomech.fem.mesh import REGIONS, make_shell_mesh, make_sphere_shell

FIXTURE = json.loads((DATA_DIR / "fixtures" / "emmetrope-right.eye.json").read_text())


@Functional
def _one(w):
    return 1.0 + 0.0 * w.x[0]


def _volume(shell) -> float:
    return _one.assemble(Basis(shell.mesh, ElementHex2(), intorder=6))


@pytest.fixture(scope="module")
def eye():
    return make_shell_mesh(FIXTURE, layers=2, n_face=8)


def _surface_is_closed_manifold(mesh, facets) -> None:
    quads = mesh.facets[:, facets]  # 4 vertex indices per facet (cyclic order)
    edges = Counter()
    for q in quads.T:
        for i in range(4):
            a, b = int(q[i]), int(q[(i + 1) % 4])
            edges[(min(a, b), max(a, b))] += 1
    assert set(edges.values()) == {2}, "every edge of the surface is shared by exactly two facets"
    vertices = np.unique(quads).size
    assert vertices - len(edges) + quads.shape[1] == 2, "Euler characteristic of a sphere"


def test_shell_is_watertight_with_two_closed_boundary_surfaces(eye):
    assert isinstance(eye.mesh, MeshHex2)
    boundary = eye.mesh.boundary_facets()
    assert set(boundary) == set(eye.outer_facets) | set(eye.inner_facets)
    assert len(eye.outer_facets) == len(eye.inner_facets) == 6 * 8 * 8
    _surface_is_closed_manifold(eye.mesh, eye.outer_facets)
    _surface_is_closed_manifold(eye.mesh, eye.inner_facets)


def test_sphere_shell_volume():
    shell = make_sphere_shell(10.0, 11.0, layers=2, n_face=6)
    exact = 4 * np.pi * (11.0**3 - 10.0**3) / 3
    assert _volume(shell) == pytest.approx(exact, rel=5e-3)


def test_eye_shell_volume_matches_the_profiles(eye):
    g = eye.geometry
    theta = np.linspace(0, np.pi, 4001)
    integrand = (g.r_out(theta) ** 3 - g.r_in(theta) ** 3) / 3 * np.sin(theta)
    exact = 2 * np.pi * np.trapezoid(integrand, theta)
    assert _volume(eye) == pytest.approx(exact, rel=0.02)


def test_every_node_lies_between_the_inner_and_outer_surfaces(eye):
    x = eye.mesh.doflocs
    r = np.linalg.norm(x, axis=0)
    theta = eye.geometry.polar(x)
    assert np.all(r >= eye.geometry.r_in(theta) - 1e-9)
    assert np.all(r <= eye.geometry.r_out(theta) + 1e-9)


def test_outer_surface_follows_the_document_cornea_and_the_scleral_sphere(eye):
    g = eye.geometry
    # The anterior pole sits at the corneal apex, the posterior pole on the sclera.
    assert g.r_out(np.array([0.0]))[0] == pytest.approx(-eye.apex_z_mm, abs=1e-12)
    assert g.r_out(np.array([np.pi]))[0] == pytest.approx(eye.sclera_radius_mm)
    # Central corneal thickness is the document's.
    t0 = g.r_out(np.array([0.0]))[0] - g.r_in(np.array([0.0]))[0]
    assert t0 == pytest.approx(FIXTURE["surfaces"][0]["thicknessToNextMm"], abs=1e-9)
    # The cornea meets the sphere at the limbus.
    tl = np.array([eye.limbus_polar_rad])
    assert g.r_out(tl)[0] == pytest.approx(eye.sclera_radius_mm, abs=1e-9)


def test_region_tags(eye):
    assert REGIONS == ("cornea", "limbus", "sclera")
    centers = eye.mesh.doflocs[:, eye.mesh.t].mean(axis=1)
    theta = eye.geometry.polar(centers)
    assert eye.region[np.argmin(theta)] == 0
    assert eye.region[np.argmax(theta)] == 2
    assert np.any(eye.region == 1)
    assert set(np.unique(eye.region)) == {0, 1, 2}


def test_elements_are_positively_oriented(eye):
    b = Basis(eye.mesh, ElementHex2(), intorder=4)
    assert np.all(b.mapping.detDF(b.X) > 0)


def test_sphere_shell_is_all_sclera():
    shell = make_sphere_shell(10.0, 11.0, layers=1, n_face=4)
    assert np.all(shell.region == 2)
