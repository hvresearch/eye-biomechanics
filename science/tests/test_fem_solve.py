"""Newton solver: analytic pressurized sphere, convergence, supports (M4 plan, Task 4.4)."""

import json

import numpy as np
import pytest

from eyebiomech.fem.data import DATA_DIR, load_materials
from eyebiomech.fem.loads import Loads
from eyebiomech.fem.material import NeoHookean, region_materials
from eyebiomech.fem.mesh import make_shell_mesh, make_sphere_shell
from eyebiomech.fem.solve import NewtonDidNotConverge, make_context, solve
from eyebiomech.fem.units import KPA_TO_MPA, MMHG_TO_KPA

E, NU = 1.0, 0.3
MU, LAM = E / (2 * (1 + NU)), E * NU / ((1 + NU) * (1 - 2 * NU))
A_MM, B_MM = 10.0, 11.0


@pytest.fixture(scope="module")
def sphere():
    shell = make_sphere_shell(A_MM, B_MM, layers=1, n_face=4)
    return shell, make_context(shell)


def _lame_ur(r, p_mpa):
    """Small-strain radial displacement of a thick sphere under internal pressure p."""
    return (
        p_mpa
        * A_MM**3
        * ((1 - 2 * NU) * r + (1 + NU) * B_MM**3 / (2 * r**2))
        / (E * (B_MM**3 - A_MM**3))
    )


def _radial(sol):
    X = sol.context.shell.mesh.doflocs
    r = np.linalg.norm(X, axis=0)
    return r, np.sum(sol.nodal() * X, axis=0) / r


def _solve_sphere(sphere, p_kpa, **kw):
    shell, ctx = sphere
    loads = Loads().iop(p_kpa / MMHG_TO_KPA)
    kw.setdefault("steps", 1)
    return solve(
        shell, {"sclera": NeoHookean(MU, LAM)}, loads, support="axis_points", context=ctx, **kw
    )


def test_pressurized_sphere_matches_lame_at_1_kpa(sphere):
    sol = _solve_sphere(sphere, 1.0)
    r, ur = _radial(sol)
    outer = np.isclose(r, B_MM)
    assert ur[outer].mean() == pytest.approx(_lame_ur(B_MM, KPA_TO_MPA), rel=0.02)


def test_small_load_limit_is_the_linear_lame_solution(sphere):
    sol = _solve_sphere(sphere, 0.01)
    r, ur = _radial(sol)
    for radius in (A_MM, B_MM):
        sel = np.isclose(r, radius)
        assert ur[sel].mean() == pytest.approx(_lame_ur(radius, 0.01 * KPA_TO_MPA), rel=1e-3)
        assert np.ptp(ur[sel]) < 1e-2 * ur[sel].mean()  # spherically symmetric


def test_newton_converges_quadratically(sphere):
    sol = _solve_sphere(sphere, 1.0)
    h = sol.residual_history
    assert h[-1] < 1e-8
    # Once in the basin, each residual is at most ~the square of the previous one (until the
    # round-off floor near 1e-12 is reached).
    pairs = [(a, b) for a, b in zip(h, h[1:], strict=False) if a < 1e-1 and b > 1e-11]
    assert pairs and all(b <= 10 * a**2 for a, b in pairs)


def test_solution_is_unique_and_path_independent(sphere):
    one = _solve_sphere(sphere, 1.0, steps=1)
    three = _solve_sphere(sphere, 1.0, steps=3)
    assert three.load_steps == 3
    assert np.max(np.abs(one.u - three.u)) < 1e-8 * np.max(np.abs(one.u))
    assert np.all(one.u[one.fixed_dofs] == 0)


def test_divergence_raises_with_the_residual_history(sphere):
    with pytest.raises(NewtonDidNotConverge) as info:
        _solve_sphere(sphere, 5e4, steps=1, max_iter=3, max_cuts=1)
    assert len(info.value.residual_history) >= 1


def test_supports_are_validated(sphere):
    shell, ctx = sphere
    loads = Loads().iop(1.0)
    with pytest.raises(ValueError, match="support"):
        solve(shell, {"sclera": NeoHookean(MU, LAM)}, loads, support="free", context=ctx)
    with pytest.raises(ValueError, match="optic_nerve_radius_mm"):
        solve(shell, {"sclera": NeoHookean(MU, LAM)}, loads, context=ctx)


def test_the_eye_inflates_outward_under_iop():
    doc = json.loads((DATA_DIR / "fixtures" / "emmetrope-right.eye.json").read_text())
    shell = make_shell_mesh(doc, layers=1, n_face=4)
    mats = load_materials()
    sol = solve(
        shell,
        region_materials(mats, doc["age"], shell.geometry),
        Loads().iop(15.0),
        optic_nerve_radius_mm=mats["opticNerve"]["radiusMm"],
        steps=2,
    )
    X = shell.mesh.doflocs
    apex = int(np.argmin(X[2]))
    assert sol.nodal()[2, apex] < 0  # the apex moves anteriorly (toward −z)
    assert np.all(sol.u[sol.fixed_dofs] == 0)


def cavity_volume_change(sol) -> float:
    """First-order change of the enclosed volume (mm³ = µL): ∫ u · (−N) dA over the inner
    surface, N the solid's outward normal there (pointing toward the center)."""
    fb = sol.context.fb_inner
    u = np.asarray(fb.interpolate(sol.u))
    return float(np.sum(np.sum(u * -fb.normals, axis=0) * fb.dx))


@pytest.mark.slow
def test_ocular_rigidity_is_within_the_plausibility_band_of_the_in_vivo_mean():
    """Friedenwald coefficient K = ln(P2/P1) / ΔV between 10 and 20 mmHg, against Pallikaris
    et al. 2005 (data/materials/cornea-sclera.json, ocularRigidityReference; Deviation 1)."""
    doc = json.loads((DATA_DIR / "fixtures" / "emmetrope-right.eye.json").read_text())
    mats = load_materials()
    ref = mats["ocularRigidityReference"]
    shell = make_shell_mesh(doc, layers=1, n_face=8)
    ctx = make_context(shell)
    materials = region_materials(mats, mats["ageStiffening"]["referenceAgeYears"], shell.geometry)
    volume = {}
    for p in (10.0, 20.0):
        sol = solve(
            shell,
            materials,
            Loads().iop(p),
            optic_nerve_radius_mm=mats["opticNerve"]["radiusMm"],
            steps=2,
            context=ctx,
        )
        volume[p] = cavity_volume_change(sol)
    k_model = np.log(20.0 / 10.0) / (volume[20.0] - volume[10.0])
    ratio = k_model / ref["coefficientPerUl"]
    assert 1 / ref["plausibilityFactor"] < ratio < ref["plausibilityFactor"]
