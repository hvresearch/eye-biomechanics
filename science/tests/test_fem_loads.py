"""IOP, insertion, ciliary, and eyelid loads (M4 plan, Task 4.5)."""

import json

import numpy as np
import pytest
from scipy.spatial import cKDTree

from eyebiomech.fem.data import DATA_DIR, load_eom_table, load_materials
from eyebiomech.fem.loads import Loads, _torque_balanced
from eyebiomech.fem.material import region_materials
from eyebiomech.fem.mesh import make_shell_mesh, make_sphere_shell
from eyebiomech.fem.solve import make_context, solve
from eyebiomech.fem.units import mmhg_to_mpa
from eyebiomech.forces.from_viewer import load_force_table

FIXTURE = json.loads((DATA_DIR / "fixtures" / "emmetrope-right.eye.json").read_text())
TABLE = load_force_table(DATA_DIR / "results" / "forces" / "default.json")
EOM = load_eom_table()
MATS = load_materials()


@pytest.fixture(scope="module")
def eye_ctx():
    return make_context(make_shell_mesh(FIXTURE, layers=1, n_face=8))


@pytest.fixture(scope="module")
def sphere_ctx():
    return make_context(make_sphere_shell(11.5, 12.0, layers=1, n_face=12))


def resultant(ctx, loads) -> np.ndarray:
    """Net force (N) of the assembled load vector: Σ over the dofs of each component (the basis
    functions sum to one)."""
    f, _ = loads.assemble(ctx, np.zeros(ctx.n), 1.0)
    return f[ctx.vector_dofs].sum(axis=1)


def _muscle(g, i):
    body = TABLE.body_frame(g)
    return dict(
        muscle=TABLE.muscles[i],
        force_n=float(TABLE.force_n[g, i]),
        pull_dir=body["pull_dir"][i],
        center_mm=body["insertion_mm"][i],
        footprint_width_mm=float(TABLE.width_mm[g, i]),
        tendon=EOM["muscles"][[m["name"] for m in EOM["muscles"]].index(TABLE.muscles[i])][
            "tendon"
        ],
        insertion_dir=body["insertion_dir"][i],
    )


def test_insertion_footprint_applies_exactly_the_input_force(eye_ctx):
    g = TABLE.at(0, 0)
    for i in range(6):
        m = _muscle(g, i)
        loads = Loads().insertion(**m)
        expected = m["force_n"] * np.asarray(m["insertion_dir"])
        assert np.max(np.abs(resultant(eye_ctx, loads) - expected)) < 1e-6


def test_wrapping_muscle_pulls_the_globe_along_its_free_segment(eye_ctx):
    g = TABLE.at(0, 0)
    for i in range(6):
        if TABLE.arc_mm[g, i] <= 0:
            continue
        m = _muscle(g, i)
        loads = Loads().insertion(**m, tangent_point_mm=TABLE.body_frame(g)["tangent_mm"][i])
        expected = m["force_n"] * np.asarray(m["pull_dir"])
        assert np.linalg.norm(resultant(eye_ctx, loads) - expected) < 0.01 * m["force_n"]


def test_insertion_rejects_bad_inputs():
    m = _muscle(TABLE.at(0, 0), 0)
    with pytest.raises(ValueError, match="stiffness"):
        Loads().insertion(**{**m, "tendon": {"stiffnessNPerMm": 0, "slackLengthMm": 7}})
    with pytest.raises(ValueError, match="force"):
        Loads().insertion(**{**m, "force_n": -1.0})


def _band_resultant(p_mpa, y1, y2, R):
    """Net force of a pressure p pushing inward on the zone y1 ≤ y ≤ y2, z < 0 of a sphere."""
    ys = np.linspace(y1, y2, 20001)
    fz = 2 * p_mpa * np.trapezoid(np.sqrt(R * R - ys * ys), ys)
    return np.array([0.0, -p_mpa * np.pi * (y2**2 - y1**2) / 2, fz])


def test_eyelid_bands_integrate_to_the_expected_force(sphere_ctx):
    R, a, h = 12.0, 10.1, 0.6
    p_kpa = 1.0
    upper = Loads().eyelid(
        upper_kpa=p_kpa, lower_kpa=0, aperture_mm=a, upper_height_mm=h, lower_height_mm=h
    )
    lower = Loads().eyelid(
        upper_kpa=0, lower_kpa=p_kpa, aperture_mm=a, upper_height_mm=h, lower_height_mm=h
    )
    p = p_kpa * 1e-3
    exp_up = _band_resultant(p, a / 2, a / 2 + h, R)
    exp_lo = _band_resultant(p, -a / 2 - h, -a / 2, R)
    got_up, got_lo = resultant(sphere_ctx, upper), resultant(sphere_ctx, lower)
    assert np.linalg.norm(got_up - exp_up) < 0.02 * np.linalg.norm(exp_up)
    assert np.linalg.norm(got_lo - exp_lo) < 0.02 * np.linalg.norm(exp_lo)
    assert got_up[1] < 0 < got_lo[1]  # each lid pushes toward the center line


def test_eyelid_band_resultants_are_independent_of_the_mesh(sphere_ctx):
    """Each band's resultant is normalized to the surface integral (M6 plan, Task 6.6, mesh
    convergence): on the sphere it matches the analytic bands within 0.1%, and on the eye the
    coarse and fine meshes agree within 0.1%, also with the globe turned under the lids
    (before, the band's integrated force moved by about 4% between meshes)."""
    R, a, h, p_kpa = 12.0, 10.1, 0.6, 1.0
    loads = Loads().eyelid(p_kpa, p_kpa, a, h, h)
    p = p_kpa * 1e-3
    expected = _band_resultant(p, a / 2, a / 2 + h, R) + _band_resultant(p, -a / 2 - h, -a / 2, R)
    got = resultant(sphere_ctx, loads)
    assert np.linalg.norm(got - expected) < 1e-3 * np.linalg.norm(expected)

    def both(ctx):
        lids = Loads().eyelid(1.0, 0.5, 10.1, 1.5, 1.0)
        turned = Loads().gaze(_elevation(-15)).eyelid(1.0, 0.5, 10.1, 1.5, 1.0)
        return resultant(ctx, lids), resultant(ctx, turned)

    for g6, g10 in zip(
        both(make_context(make_shell_mesh(FIXTURE, layers=1, n_face=6))),
        both(make_context(make_shell_mesh(FIXTURE, layers=1, n_face=10))),
        strict=True,
    ):
        assert np.linalg.norm(g6 - g10) < 1e-3 * np.linalg.norm(g10)


def test_ciliary_ring_pulls_the_spur_posteriorly(eye_ctx):
    tension, acc = 1e-3, 3.0
    loads = Loads().ciliary(tension, acc)
    shell = eye_ctx.shell
    R = shell.sclera_radius_mm
    theta = shell.limbus_polar_rad + MATS["scleralSpur"]["arcFromLimbusMm"] / R
    expected = tension * acc * 2 * np.pi * R * np.sin(theta) * np.sin(theta)
    got = resultant(eye_ctx, loads)
    assert got[2] == pytest.approx(expected, rel=0.02)
    assert np.hypot(got[0], got[1]) < 0.01 * expected
    assert np.allclose(resultant(eye_ctx, Loads().ciliary(tension, 0.0)), 0)


def test_summary_lists_each_load_once_and_is_json():
    g = TABLE.at(0, 0)
    loads = (
        Loads()
        .iop(15)
        .from_force_table(TABLE, g, EOM)
        .ciliary(1e-3, 0.0)
        .eyelid(1.0, 1.0, 10.1, 0.6, 0.6)
    )
    s = loads.summary()
    json.dumps(s)
    kinds = [item["kind"] for item in s]
    assert kinds.count("iop") == 1 and kinds.count("insertion") == 6
    assert kinds.count("ciliary") == 1 and kinds.count("eyelid") == 1


def test_symmetric_loads_give_a_mirror_symmetric_displacement():
    shell = make_shell_mesh(FIXTURE, layers=1, n_face=6)
    loads = Loads().iop(15).eyelid(1.0, 1.0, 10.1, 0.6, 0.6)
    sol = solve(
        shell,
        region_materials(MATS, 30, shell.geometry),
        loads,
        optic_nerve_radius_mm=MATS["opticNerve"]["radiusMm"],
        steps=1,
    )
    X = shell.mesh.doflocs
    mirrored = X * np.array([[-1.0], [1.0], [1.0]])
    dist, idx = cKDTree(X.T).query(mirrored.T)
    assert np.max(dist) < 1e-9
    U = sol.nodal()
    Um = U[:, idx] * np.array([[-1.0], [1.0], [1.0]])
    assert np.max(np.abs(U - Um)) < 1e-6 * np.max(np.abs(U))


def test_iop_follower_pressure_in_mpa():
    assert Loads().iop(15).summary() == [{"kind": "iop", "pressureMmHg": 15.0}]
    assert mmhg_to_mpa(15) > 0


def _moment(ctx, loads):
    f, _ = loads.assemble(ctx, np.zeros(ctx.n), 1.0)
    F = f[ctx.vector_dofs]  # (3, nscalar)
    X = ctx.sb.doflocs
    return F.sum(axis=1), np.cross(X.T, F.T).sum(axis=0)


def test_orbital_support_balances_the_dead_loads(eye_ctx):
    g = TABLE.at(0, 0)
    unbalanced = Loads().from_force_table(TABLE, g, EOM).eyelid(1.0, 1.0, 10.1, 0.6, 0.6)
    F0, M0 = _moment(eye_ctx, unbalanced)
    assert np.linalg.norm(M0) > 1e-3  # the length-proxy muscles alone do not balance
    balanced = (
        Loads().from_force_table(TABLE, g, EOM).eyelid(1.0, 1.0, 10.1, 0.6, 0.6).orbital_support()
    )
    F, M = _moment(eye_ctx, balanced)
    assert np.linalg.norm(F) < 1e-9 * np.linalg.norm(F0) + 1e-12
    assert np.linalg.norm(M) < 1e-9 * np.linalg.norm(M0)
    assert balanced.summary()[-1]["kind"] == "orbitalSupport"


def test_orbital_support_leaves_iop_alone(eye_ctx):
    a = Loads().iop(15)
    b = Loads().iop(15).orbital_support()
    fa, _ = a.assemble(eye_ctx, np.zeros(eye_ctx.n), 1.0)
    fb, _ = b.assemble(eye_ctx, np.zeros(eye_ctx.n), 1.0)
    assert np.allclose(fa, fb)


def test_force_table_loads_balance_the_passive_orbit():
    """The six muscle moments about the globe center cancel the passive orbital moment (zero in
    primary gaze), within the capacities; `passive=False` keeps M4's balance (no moment, the
    total tension kept); `balance_moments=False` leaves the table forces."""
    for gaze in ((0, 0), (15, 0), (30, 30), (-30, 0)):
        g = TABLE.at(*gaze)
        loads = Loads().from_force_table(TABLE, g, EOM)
        items = [i for i in loads.summary() if i["kind"] == "insertion"]
        M = sum(i["forceN"] * np.cross(i["centerMm"], i["insertionDir"]) for i in items)
        passive = np.asarray(items[0]["passiveMomentNmm"])
        assert np.linalg.norm(M + passive) < 1e-9
        assert all(i["forceN"] >= 0 for i in items)
        assert loads.unloaded_muscles() == []
    m4 = Loads().from_force_table(TABLE, TABLE.at(15, 0), EOM, passive=False)
    items = [i for i in m4.summary() if i["kind"] == "insertion"]
    assert (
        np.linalg.norm(sum(i["forceN"] * np.cross(i["centerMm"], i["insertionDir"]) for i in items))
        < 1e-12
    )
    assert sum(i["forceN"] for i in items) == pytest.approx(sum(i["tableForceN"] for i in items))
    raw = Loads().from_force_table(TABLE, TABLE.at(0, 0), EOM, balance_moments=False)
    items = [i for i in raw.summary() if i["kind"] == "insertion"]
    assert all(i["forceN"] == i["tableForceN"] for i in items)


def test_equilibrium_is_the_exact_optimum_at_every_lattice_gaze():
    """KKT conditions of the equilibrium program with bounds at every gaze of the table: the
    weighted-change gradient is a combination of the moment rows on the free muscles, at least
    it on muscles held at zero, and at most it on muscles at capacity."""
    from eyebiomech.forces.equilibrium import capacities_n, equilibrium_forces, passive_moment

    cap = capacities_n()
    for g in range(TABLE.force_n.shape[0]):
        body = TABLE.body_frame(g)
        f0 = np.asarray(TABLE.force_n[g], dtype=float)
        Mp = passive_moment(TABLE.quaternions[g])
        f = equilibrium_forces(f0, body["insertion_mm"], body["insertion_dir"], Mp, cap)
        A = np.cross(body["insertion_mm"], body["insertion_dir"]).T
        s = np.maximum(f0, f0.mean() / 4)
        grad = 2 * (f - f0) / s**2
        free = (f > 0) & (f < cap)
        lam = np.linalg.lstsq(A[:, free].T, grad[free], rcond=None)[0]
        nu = grad - A.T @ lam
        tol = 1e-9 * max(np.abs(grad).max(), 1e-12)
        assert np.abs(nu[free]).max(initial=0) < tol
        assert np.all(nu[f == 0] >= -tol) and np.all(nu[f == cap] <= tol)
        assert np.linalg.norm(A @ f + Mp) < 1e-9


def test_torque_balance_is_the_exact_optimum_at_every_lattice_gaze():
    """KKT conditions of the balancing program at every gaze of the table that has a balanced
    set: the weighted-change gradient is a combination of the constraint rows on the loaded
    muscles and exceeds it on the unloaded ones. An iterative solver failed this on some CPUs."""
    solved = 0
    for g in range(TABLE.force_n.shape[0]):
        body = TABLE.body_frame(g)
        f0 = np.asarray(TABLE.force_n[g], dtype=float)
        try:
            f = _torque_balanced(f0, body["insertion_mm"], body["insertion_dir"])
        except ValueError:
            continue
        solved += 1
        A = np.cross(body["insertion_mm"], body["insertion_dir"]).T
        B = np.vstack([A, np.ones(f.size)])
        s = np.maximum(f0, f0.mean() / 4)
        grad = 2 * (f - f0) / s**2
        free = f > 0
        lam = np.linalg.lstsq(B[:, free].T, grad[free], rcond=None)[0]
        nu = grad - B.T @ lam
        assert np.abs(nu[free]).max() < 1e-9 * np.abs(grad).max()
        assert np.all(nu[~free] >= -1e-9 * np.abs(grad).max())
        assert np.linalg.norm(A @ f) < 1e-12
    assert solved >= 17


def test_m4_balance_records_the_muscles_it_unloads():
    """M4's balance (no passive moment, total kept) switches the medial rectus off in nasal gaze;
    the loads record that instead of refusing, and a gaze with no balanced set still raises."""
    loads = Loads().from_force_table(TABLE, TABLE.at(-30, 0), EOM, passive=False)
    assert loads.unloaded_muscles() == ["medialRectus"]
    with pytest.raises(ValueError, match="no non-negative"):
        Loads().from_force_table(TABLE, TABLE.at(-30, 30), EOM, passive=False)


def _elevation(deg: float) -> np.ndarray:
    """Quaternion of an upward rotation (the front of the globe, −z, toward +y): about +x."""
    a = np.radians(deg) / 2
    return np.array([np.sin(a), 0.0, 0.0, np.cos(a)])


def test_lid_bands_stay_in_the_orbit_when_the_globe_turns(sphere_ctx):
    """At 20° up the globe turns under the lids: the bands keep their area (same total force on
    the sphere) and their net force turns with the orbit, i.e. is the primary-gaze force rotated
    back by the gaze, in the globe's frame."""
    from eyebiomech.forces.from_viewer import rotation_matrix

    q = _elevation(20)
    primary = resultant(sphere_ctx, Loads().eyelid(2.0, 0.0, 6.0, 1.5, 1.5))
    turned = resultant(sphere_ctx, Loads().gaze(q).eyelid(2.0, 0.0, 6.0, 1.5, 1.5))
    assert np.linalg.norm(turned) == pytest.approx(np.linalg.norm(primary), rel=0.02)
    expected = rotation_matrix(q).T @ primary
    assert np.linalg.norm(turned - expected) < 0.02 * np.linalg.norm(primary)


def test_lid_margins_place_the_bands():
    loads = Loads().eyelid(1.0, 1.0, 9.0, 0.6, 0.6, upper_margin_mm=3.3, lower_margin_mm=-5.5)
    item = loads.summary()[0]
    assert item["upperMarginMm"] == 3.3 and item["lowerMarginMm"] == -5.5
    assert item["apertureMm"] == pytest.approx(8.8)
    with pytest.raises(ValueError, match="above"):
        Loads().eyelid(1.0, 1.0, 9.0, 0.6, 0.6, upper_margin_mm=-6, lower_margin_mm=-5.5)


def test_orbital_support_balances_an_eccentric_gaze(eye_ctx):
    """With the near gaze's equilibrium forces, gaze-placed lids, and the ciliary ring, the
    orbital reaction cancels the dead loads' net force and moment (it carries the passive
    moment)."""
    duty = load_force_table(DATA_DIR / "results" / "forces" / "duty-cycle.json")
    loads = (
        Loads()
        .from_force_table(duty, duty.find("near"), EOM)
        .eyelid(1.0, 1.0, 9.0, 0.6, 0.6, upper_margin_mm=3.3, lower_margin_mm=-5.5)
        .ciliary(1e-3, 2.0)
        .orbital_support()
    )
    f = loads._dead(eye_ctx)
    X = eye_ctx.sb.doflocs
    F = f[eye_ctx.vector_dofs]
    assert np.linalg.norm(F.sum(axis=1)) < 1e-9 * np.abs(F).sum()
    moment = np.cross(X, F, axis=0).sum(axis=1)
    assert np.linalg.norm(moment) < 1e-9 * np.abs(np.cross(X, F, axis=0)).sum()


def test_dead_load_cache_lives_on_the_context():
    """A context built after another is garbage-collected may reuse its id(); the cached dead
    load must not carry over (M4 follow-up, review of b6f5a0d)."""
    import gc

    loads = Loads().eyelid(1.0, 1.0, 9.0, 0.6, 0.6)
    first = make_context(make_sphere_shell(11.5, 12.0, layers=1, n_face=4))
    f1, _ = loads.assemble(first, np.zeros(first.n), 1.0)
    del first
    gc.collect()
    second = make_context(make_sphere_shell(10.0, 11.0, layers=1, n_face=4))
    f2, _ = loads.assemble(second, np.zeros(second.n), 1.0)
    fresh, _ = Loads().eyelid(1.0, 1.0, 9.0, 0.6, 0.6).assemble(second, np.zeros(second.n), 1.0)
    assert np.array_equal(f2, fresh)
    assert not np.array_equal(f1, f2)
    assert second.load_cache  # the cache is on the context
