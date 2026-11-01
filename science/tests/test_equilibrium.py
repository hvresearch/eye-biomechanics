"""Static equilibrium of the muscle forces against the passive orbit (M5 plan, Task 5.2)."""

import numpy as np
import pytest

from eyebiomech.fem.data import DATA_DIR, load_eom_table
from eyebiomech.fem.loads import Loads, _torque_balanced
from eyebiomech.forces.equilibrium import (
    InfeasibleEquilibrium,
    capacities_n,
    equilibrium_forces,
    load_passive_orbit,
    passive_moment,
    stiffness_nmm_per_deg,
)
from eyebiomech.forces.from_viewer import load_force_table

TABLE = load_force_table(DATA_DIR / "results" / "forces" / "default.json")
DUTY = load_force_table(DATA_DIR / "results" / "forces" / "duty-cycle.json")
EOM = load_eom_table()
PASSIVE = load_passive_orbit()


def _arms(table, g):
    body = table.body_frame(g)
    return body["insertion_mm"], body["insertion_dir"]


def _moment(forces, centers, directions):
    return np.cross(centers, directions).T @ forces


def test_keeping_the_total_with_no_moment_is_the_m4_balance():
    g = TABLE.at(0, 0)
    c, d = _arms(TABLE, g)
    f0 = TABLE.force_n[g]
    assert np.allclose(
        equilibrium_forces(f0, c, d, np.zeros(3), keep_total=True), _torque_balanced(f0, c, d)
    )


def test_primary_gaze_has_no_passive_moment():
    assert np.allclose(passive_moment(TABLE.quaternions[TABLE.at(0, 0)], PASSIVE), 0)


def test_abduction_is_resisted_toward_adduction():
    """At 15° abduction the orbit pulls the eye back nasally: the moment opposes the rotation and
    its size is 15 × the horizontal stiffness."""
    g = TABLE.at(15, 0)
    q = TABLE.quaternions[g]
    M = passive_moment(q, PASSIVE)
    angle = 2 * np.arctan2(np.linalg.norm(q[:3]), q[3])
    axis = q[:3] / np.linalg.norm(q[:3])
    assert np.dot(M, axis) < 0  # opposes the rotation (globe frame; the axis is the same)
    k_h = stiffness_nmm_per_deg(PASSIVE)[1]
    assert np.linalg.norm(M) == pytest.approx(np.degrees(angle) * k_h, rel=1e-9)


@pytest.mark.parametrize(
    "gaze",
    [(h, v) for h in (-15, 0, 15) for v in (-15, 0, 15)],
)
def test_equilibrium_holds_and_keeps_the_agonists(gaze):
    """Within ±15° the forces balance the passive moment within capacity and keep every muscle
    the table loads (the M4 balance switched the agonist off here)."""
    g = TABLE.at(*gaze)
    c, d = _arms(TABLE, g)
    f0 = TABLE.force_n[g]
    M = passive_moment(TABLE.quaternions[g], PASSIVE)
    cap = capacities_n()
    f = equilibrium_forces(f0, c, d, M, capacities=cap)
    assert np.linalg.norm(_moment(f, c, d) + M) < 1e-9
    assert np.all(f >= 0) and np.all(f <= cap)
    assert np.all(f[f0 > 0] > 0), dict(zip(TABLE.muscles, f, strict=True))


def test_the_agonist_carries_the_passive_moment_in_horizontal_gazes():
    """At ±30° the horizontal agonist carries at least 40% of the passive moment over its 12 mm
    arm; in adduction the vertical recti and obliques, which also adduct there, carry the rest."""
    k_h = stiffness_nmm_per_deg(PASSIVE)[1]
    for gaze, agonist, antagonist in (((30, 0), 0, 1), ((-30, 0), 1, 0)):
        g = TABLE.at(*gaze)
        c, d = _arms(TABLE, g)
        f = equilibrium_forces(
            TABLE.force_n[g], c, d, passive_moment(TABLE.quaternions[g]), capacities_n()
        )
        assert (f[agonist] - f[antagonist]) * 12 > 0.4 * 30 * k_h


def test_the_near_gaze_keeps_its_agonists():
    g = DUTY.find("near")
    c, d = _arms(DUTY, g)
    f0 = DUTY.force_n[g]
    f = equilibrium_forces(f0, c, d, passive_moment(DUTY.quaternions[g], PASSIVE), capacities_n())
    assert np.all(f[f0 > 0] > 0)


def test_an_impossible_moment_is_refused():
    g = TABLE.at(0, 0)
    c, d = _arms(TABLE, g)
    with pytest.raises(InfeasibleEquilibrium, match="within capacity"):
        equilibrium_forces(TABLE.force_n[g], c, d, np.array([0.0, 1e2, 0.0]), capacities_n())


def _stiff_orbit(factor: float) -> dict:
    k = PASSIVE["stiffnessGfPerDeg"]
    return {**PASSIVE, "stiffnessGfPerDeg": {axis: v * factor for axis, v in k.items()}}


def test_an_infeasible_gaze_is_named():
    """M5 review round 2 (M6 plan, Task 6.5): the error names the gaze of the force table."""
    stiff = _stiff_orbit(1e4)
    with pytest.raises(InfeasibleEquilibrium, match="gaze 15,0") as exc:
        Loads().from_force_table(TABLE, TABLE.at(15, 0), EOM, passive=stiff)
    assert exc.value.gaze_label == "15,0"
    with pytest.raises(InfeasibleEquilibrium, match="gaze near") as exc:
        Loads().from_force_table(DUTY, DUTY.find("near"), EOM, passive=stiff)
    assert exc.value.gaze_label == "near"
    assert isinstance(exc.value, ValueError)


def test_loads_record_the_passive_moment_and_balance_it():
    g = DUTY.find("near")
    loads = Loads().from_force_table(DUTY, g, EOM)
    ins = [i for i in loads.summary() if i["kind"] == "insertion"]
    M = np.asarray(ins[0]["passiveMomentNmm"])
    assert np.linalg.norm(M) > 0
    total = sum(i["forceN"] * np.cross(i["centerMm"], i["insertionDir"]) for i in ins)
    assert np.linalg.norm(total + M) < 1e-9


def test_force_table_finds_gazes_by_label_or_angles():
    assert DUTY.find("distance") == 0 and DUTY.find("near") == 1
    x, y = DUTY.gazes_deg[1]
    assert DUTY.find(f"{float(x)!r},{float(y)!r}") == 1
    assert TABLE.find("15,0") == TABLE.at(15, 0)
    with pytest.raises(KeyError):
        DUTY.find("far")
