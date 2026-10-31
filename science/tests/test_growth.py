"""Stress-driven growth toward a homeostatic target (M5 plan, Task 5.7, Deviation 3)."""

import json

import numpy as np
import pytest

from eyebiomech.fem.data import DATA_DIR, load_materials
from eyebiomech.fem.export import SAMPLE_MARGIN_MM
from eyebiomech.fem.loads import Loads
from eyebiomech.fem.material import HGO, NeoHookean, region_materials
from eyebiomech.fem.mesh import make_shell_mesh, make_sphere_shell
from eyebiomech.fem.solve import make_context, solve
from eyebiomech.fem.surfaces import sample_surface, surface_change
from eyebiomech.remodel.growth import (
    GrownMaterial,
    GrowthState,
    cauchy_stress,
    grow,
    growth_rate,
    growth_strain,
    load_growth_table,
    tangent_projector,
)

RNG = np.random.default_rng(11)
H = 1e-6
FIXTURE = json.loads((DATA_DIR / "fixtures" / "emmetrope-right.eye.json").read_text())
MATS = load_materials()
ON = MATS["opticNerve"]["radiusMm"]


def _unit(n):
    a = RNG.standard_normal((3, n))
    return a / np.linalg.norm(a, axis=0)


def _sym(n, scale):
    e = scale * RNG.standard_normal((3, 3, n))
    return 0.5 * (e + np.swapaxes(e, 0, 1))


def test_identity_growth_is_the_base_material():
    n = 7
    base = HGO(mu=0.3, lam=4.0, k1=1.0, k2=5.0, kappa=0.1, fibers=[_unit(n)])
    grown = GrownMaterial(base, np.repeat(np.eye(3)[:, :, None], n, axis=2))
    F = np.eye(3)[:, :, None] + 0.05 * RNG.standard_normal((3, 3, n))
    assert np.allclose(grown.first_pk(F), base.first_pk(F), atol=1e-14)
    assert np.allclose(grown.tangent_tensor(F), base.tangent_tensor(F), atol=1e-12)


def test_grown_stress_and_tangent_are_consistent():
    """P = Jg P_e(F Fg⁻¹) Fg⁻ᵀ is the derivative of Jg W(F Fg⁻¹), and the tangent tensor is the
    derivative of P (central differences)."""
    n = 9
    base = HGO(mu=0.3, lam=4.0, k1=1.0, k2=5.0, kappa=0.05, fibers=[_unit(n), _unit(n)])
    fg = np.eye(3)[:, :, None] + _sym(n, 0.03)
    grown = GrownMaterial(base, fg)
    F = np.eye(3)[:, :, None] + 0.06 * RNG.standard_normal((3, 3, n))
    P = grown.first_pk(F)
    for i in range(3):
        for j in range(3):
            dF = np.zeros_like(F)
            dF[i, j] = H
            num = (grown.energy(F + dF) - grown.energy(F - dF)) / (2 * H)
            assert np.allclose(P[i, j], num, rtol=1e-6, atol=1e-9)
    A = grown.tangent_tensor(F)
    dF = RNG.standard_normal((3, 3, n))
    num = (grown.first_pk(F + H * dF) - grown.first_pk(F - H * dF)) / (2 * H)
    assert np.allclose(np.einsum("ijkl...,kl...->ij...", A, dF), num, rtol=1e-6, atol=1e-8)


@pytest.fixture(scope="module")
def sphere_case():
    shell = make_sphere_shell(10.0, 11.0, layers=1, n_face=4)
    ctx = make_context(shell)
    mats = {"sclera": NeoHookean(0.3, 3.0)}
    loads = Loads().iop(15.0)
    sol = solve(shell, mats, loads, support="axis_points", steps=1, context=ctx)
    sigma = cauchy_stress(ctx, mats, sol.u)
    return shell, ctx, mats, loads, sol, sigma


def test_homeostatic_stress_gives_no_growth(sphere_case):
    shell, ctx, mats, loads, sol, sigma = sphere_case
    rate = growth_rate(sigma, sigma, ctx, rate_per_year=0.01, ratio=1.0)
    assert np.max(np.abs(rate)) <= 1e-12 * 0.01


def test_uniform_over_stress_grows_a_sphere_isotropically(sphere_case):
    """With h = 0.8 the pressurized sphere is over-stressed everywhere by the same ratio: it
    grows in-plane uniformly, and the grown sphere under the same pressure is uniformly larger."""
    shell, ctx, mats, loads, sol, sigma = sphere_case
    state = GrowthState.zero(ctx)
    grown, after = grow(
        shell,
        mats,
        loads,
        state,
        sigma,
        rate_per_year=0.01,
        ratio=0.8,
        dt_years=1.0,
        context=ctx,
        support="axis_points",
        initial_u=sol.u,
        max_step_fraction=np.inf,
    )
    X = shell.mesh.doflocs
    r = np.linalg.norm(X, axis=0)
    outer = np.isclose(r, 11.0)
    dr = np.sum((after.nodal() - sol.nodal()) * X, axis=0)[outer] / 11.0
    assert dr.mean() > 0
    assert np.ptp(dr) < 0.01 * dr.mean()
    eps = grown.eps
    assert np.allclose(np.einsum("ii...->...", eps), np.einsum("ii...->...", eps).mean(), rtol=1e-6)


def test_lid_over_stress_grows_the_corneal_astigmatism_the_lids_cause():
    """IOP plus the two lid bands, h = 1: one growth step changes the anterior c(2,2) in the
    direction of the elastic change under the same loads (growth continues the deformation,
    as creep does)."""
    shell = make_shell_mesh(FIXTURE, layers=1, n_face=4)
    ctx = make_context(shell)
    mats = region_materials(MATS, FIXTURE["age"], shell.geometry)
    iop = Loads().iop(15.0)
    ref = solve(shell, mats, iop, optic_nerve_radius_mm=ON, steps=2, context=ctx)
    sigma_iop = cauchy_stress(ctx, mats, ref.u)
    loads = Loads().iop(15.0).eyelid(4.0, 4.0, 8.8, 1.5, 1.5).orbital_support()
    loaded = solve(
        shell,
        mats,
        loads,
        optic_nerve_radius_mm=ON,
        steps=2,
        context=ctx,
        initial_u=ref.u,
        ramp="dead",
    )
    _, grown = grow(
        shell,
        mats,
        loads,
        GrowthState.zero(ctx),
        sigma_iop,
        rate_per_year=2e-5,
        ratio=1.0,
        dt_years=1.0,
        context=ctx,
        optic_nerve_radius_mm=ON,
        initial_u=loaded.u,
    )
    r = 4.0 + SAMPLE_MARGIN_MM
    base = sample_surface(shell, ref.nodal(), "outer", r)
    elastic = surface_change(base, sample_surface(shell, loaded.nodal(), "outer", r), 4.0)
    remodeled = surface_change(base, sample_surface(shell, grown.nodal(), "outer", r), 4.0)
    c_el, c_gr = elastic.coeffs_um[5], remodeled.coeffs_um[5]
    assert abs(c_el) > 1e-3
    assert np.sign(c_gr - c_el) == np.sign(c_el)


def test_a_step_too_large_is_refused(sphere_case):
    shell, ctx, mats, loads, sol, sigma = sphere_case
    with pytest.raises(ValueError, match="step"):
        grow(
            shell,
            mats,
            loads,
            GrowthState.zero(ctx),
            sigma,
            rate_per_year=10.0,
            ratio=0.8,
            dt_years=1.0,
            context=ctx,
            support="axis_points",
            initial_u=sol.u,
        )


def test_the_growth_table_names_its_law():
    t = load_growth_table()
    assert t["form"] == "rodriguez1994-inplane"
    assert t["thickness"]["form"] == "none"  # the validated law (M6 plan, Task 6.6)
    assert t["thickness"]["kappa"] > 0 and "assumption" in t["thickness"]["citation"]
    assert t["ratePerYear"]["default"] > 0
    assert t["homeostaticRatio"]["default"] == 1.0
    assert 0 < t["maxStepFraction"]["value"] < 1


@pytest.fixture(scope="module")
def sphere_drive():
    """A coarse sphere's context and an in-plane drive: a tangent-plane tensor at every point."""
    ctx = make_context(make_sphere_shell(10.0, 11.0, layers=1, n_face=4))
    Pt = tangent_projector(ctx)
    rng = np.random.default_rng(3)
    A = rng.normal(size=(3, 3) + ctx.x_quad.shape[1:])
    A = 0.5 * (A + np.swapaxes(A, 0, 1))
    return ctx, np.einsum("ik...,kl...,lj...->ij...", Pt, A, Pt)


def test_thickness_growth_adds_only_a_normal_component(sphere_drive):
    """M6 plan, Task 6.6: "none" is the in-plane law; "isochoric" leaves tr εg = 0 (Jg = 1 to
    first order); "stress" adds κ tr(drive)/2 through the thickness and keeps the in-plane
    part."""
    ctx, d = sphere_drive
    n = ctx.shell.geometry.outer_normal(ctx.x_quad)
    Pt = tangent_projector(ctx)
    in_plane = lambda e: np.einsum("ik...,kl...,lj...->ij...", Pt, e, Pt)  # noqa: E731
    normal = lambda e: np.einsum("i...,ij...,j...->...", n, e, n)  # noqa: E731
    trace = np.einsum("ii...->...", d)
    assert np.array_equal(growth_strain(d, ctx), d)
    iso = growth_strain(d, ctx, "isochoric")
    assert np.allclose(np.einsum("ii...->...", iso), 0, atol=1e-12)
    assert np.allclose(in_plane(iso), d, atol=1e-12)
    thick = growth_strain(d, ctx, "stress", kappa=2.0)
    assert np.allclose(normal(thick), trace, atol=1e-12)
    assert np.allclose(in_plane(thick), d, atol=1e-12)
    with pytest.raises(ValueError, match="kappa"):
        growth_strain(d, ctx, "stress")
    with pytest.raises(ValueError, match="thickness"):
        growth_strain(d, ctx, "volumetric")
