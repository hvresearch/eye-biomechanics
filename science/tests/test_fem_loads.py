"""IOP, insertion, ciliary, and eyelid loads (M4 plan, Task 4.5)."""

import json

import numpy as np
import pytest
from scipy.spatial import cKDTree

from eyebiomech.fem.data import DATA_DIR, load_eom_table, load_materials
from eyebiomech.fem.loads import Loads
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


def test_force_table_loads_are_torque_balanced():
    """The six muscle moments about the globe center sum to zero after the smallest weighted
    force change that keeps the total tension (the v1 stand-in for the v2 static equilibrium)."""
    for gaze in ((0, 0), (15, 0), (30, 30)):
        g = TABLE.at(*gaze)
        loads = Loads().from_force_table(TABLE, g, EOM)
        items = [i for i in loads.summary() if i["kind"] == "insertion"]
        M = sum(i["forceN"] * np.cross(i["centerMm"], i["insertionDir"]) for i in items)
        assert np.linalg.norm(M) < 1e-12
        assert all(i["forceN"] >= 0 for i in items)
        total = sum(i["forceN"] for i in items)
        assert total == pytest.approx(sum(i["tableForceN"] for i in items), rel=1e-9)
    raw = Loads().from_force_table(TABLE, TABLE.at(0, 0), EOM, balance_moments=False)
    items = [i for i in raw.summary() if i["kind"] == "insertion"]
    assert all(i["forceN"] == i["tableForceN"] for i in items)


def test_nasal_gaze_has_no_non_negative_torque_balance():
    """Without passive orbital torques the length-proxy model cannot hold a nasal gaze."""
    with pytest.raises(ValueError, match="torque-balanced"):
        Loads().from_force_table(TABLE, TABLE.at(-30, 0), EOM)


@pytest.mark.parametrize("gaze", [(30, 0), (0, 15), (0, -15), (0, 30)])
def test_balancing_that_unloads_a_loaded_muscle_is_rejected(gaze):
    """In these gazes the smallest balancing change switches off a muscle the table loads (the
    agonist), which is not a stand-in for equilibrium; refuse it rather than solve it."""
    with pytest.raises(ValueError, match="unloads"):
        Loads().from_force_table(TABLE, TABLE.at(*gaze), EOM)
