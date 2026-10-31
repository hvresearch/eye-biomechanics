"""Elastic orbital foundation (M6 plan, Task 6.6, step 1; data/eom/orbital-foundation.json)."""

import numpy as np
import pytest

from eyebiomech.fem.data import foundation_stiffness, load_orbital_foundation
from eyebiomech.fem.loads import Loads
from eyebiomech.fem.material import NeoHookean
from eyebiomech.fem.mesh import make_sphere_shell
from eyebiomech.fem.solve import Foundation, make_context, orbit_foundation, solve

A_MM, B_MM = 10.0, 11.0


@pytest.fixture(scope="module")
def sphere_ctx():
    return make_context(make_sphere_shell(A_MM, B_MM, layers=1, n_face=4))


def test_foundation_stiffness_follows_the_table():
    table = load_orbital_foundation()
    k_n, k_t = foundation_stiffness(table)
    g = table["shearModulusKPa"]["value"] * 1e-3
    h = table["layerThicknessMm"]["value"]
    assert k_n == pytest.approx(3 * g / h) and k_t == pytest.approx(g / h)
    lo, hi = table["shearModulusKPa"]["range"]
    assert lo <= table["shearModulusKPa"]["value"] <= hi
    assert table["verified"] is False


def test_a_translation_is_resisted_by_the_hemisphere_integral(sphere_ctx):
    """For a rigid translation e the springs' resultant is −(2πR²/3)(k_n + 2 k_t) e: on a
    hemisphere of radius R, ∫ N Nᵀ dA = (2πR²/3) I."""
    ctx = sphere_ctx
    k_n, k_t = 3e-4, 1e-4
    K = orbit_foundation(ctx, k_n, k_t)
    assert abs(K - K.T).max() < 1e-12 * abs(K).max()
    for axis in range(3):
        u = np.zeros(ctx.n)
        u[ctx.vector_dofs[axis]] = 1.0
        resultant = np.array([np.sum((K @ u)[ctx.vector_dofs[c]]) for c in range(3)])
        expected = np.zeros(3)
        expected[axis] = 2 * np.pi * B_MM**2 / 3 * (k_n + 2 * k_t)
        assert resultant == pytest.approx(expected, rel=0.01, abs=1e-3 * expected[axis])


def test_the_foundation_follows_the_gaze(sphere_ctx):
    """Turned 180° about x, the orbit's posterior hemisphere is the globe's anterior one."""
    ctx = sphere_ctx
    flip = np.diag([1.0, -1.0, -1.0])
    K0, K1 = orbit_foundation(ctx, 1e-4, 1e-4), orbit_foundation(ctx, 1e-4, 1e-4, flip)
    z = ctx.sb.doflocs[2]
    u = np.zeros(ctx.n)
    u[ctx.vector_dofs[0]] = np.where(z < -1.0, 1.0, 0.0)  # moves the anterior cap only
    assert np.linalg.norm(K0 @ u) < 1e-9 and np.linalg.norm(K1 @ u) > 0


def test_negative_stiffness_is_refused(sphere_ctx):
    with pytest.raises(ValueError, match="non-negative"):
        orbit_foundation(sphere_ctx, -1.0, 0.0)


def test_the_foundation_holds_its_rest_state(sphere_ctx):
    """A pressurized sphere solved with a foundation at rest in that state is unchanged by it
    (the springs act on u − u_rest, so the IOP-only eye is the orbit's rest state)."""
    ctx = sphere_ctx
    mats = {name: NeoHookean(0.4, 0.5) for name in ("cornea", "limbus", "sclera")}
    kw = {"support": "axis_points", "context": ctx, "steps": 2}
    free = solve(ctx.shell, mats, Loads().iop(15.0), **kw)
    held = solve(
        ctx.shell,
        mats,
        Loads().iop(15.0),
        foundation=Foundation(orbit_foundation(ctx, 1e-2, 1e-2), free.u),
        initial_u=free.u,
        **kw,
    )
    assert np.allclose(held.u, free.u, atol=1e-12)
