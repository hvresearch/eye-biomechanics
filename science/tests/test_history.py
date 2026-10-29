"""Load history from a daily near-work duty cycle (M5 plan, Task 5.6)."""

import numpy as np
import pytest

from eyebiomech.accommodation import accommodation_response, amplitude_for_age, demand_from_distance
from eyebiomech.fem.data import DATA_DIR
from eyebiomech.forces.from_viewer import load_force_table
from eyebiomech.remodel.history import (
    GROUPS,
    SubjectProfile,
    history_loads,
    load_duty_cycle,
    time_averaged_force_sets,
)

DUTY = load_duty_cycle()
WAKING = DUTY["wakingHours"]["value"]


def _vec(hours, age=20.0, **kw):
    return history_loads(SubjectProfile(age_years=age, near_hours=hours), **kw).as_vector()


def test_no_near_work_is_distance_only():
    v = dict(zip(GROUPS, _vec(0.0), strict=True))
    assert v["muscles@distance"] == 1 and v["lids@distance"] == 1
    assert v["muscles@near"] == 0 and v["lids@near"] == 0 and v["ciliary"] == 0


def test_all_waking_hours_at_near_is_near_only():
    v = dict(zip(GROUPS, _vec(WAKING), strict=True))
    assert v["muscles@distance"] == 0 and v["lids@distance"] == 0
    assert v["muscles@near"] == 1 and v["lids@near"] == 1
    near = demand_from_distance(DUTY["near"]["targetDistanceM"])
    assert v["ciliary"] == pytest.approx(accommodation_response(near, amplitude_for_age(20.0)))


def test_intensities_are_linear_in_near_hours():
    a, b, c = _vec(0.0), _vec(WAKING), _vec(0.25 * WAKING)
    assert np.allclose(c, 0.75 * a + 0.25 * b, atol=1e-12)
    assert _vec(2 * WAKING) == pytest.approx(b)  # clamped to the waking day


def test_presbyopia_removes_the_ciliary_load():
    young, old = _vec(8.0, age=20.0), _vec(8.0, age=60.0)
    i = GROUPS.index("ciliary")
    assert old[i] < young[i]
    demand = demand_from_distance(DUTY["near"]["targetDistanceM"])
    assert young[i] <= 8.0 / WAKING * demand


def test_calibration_scales_multiply_their_groups():
    base, scaled = _vec(4.0), _vec(4.0, eom_tone_scale=2.0, lid_pressure_scale=0.5)
    for g, k in (("muscles@distance", 2), ("muscles@near", 2), ("lids@distance", 0.5)):
        i = GROUPS.index(g)
        assert scaled[i] == pytest.approx(k * base[i])
    assert scaled[GROUPS.index("ciliary")] == base[GROUPS.index("ciliary")]


def test_force_sets_weight_the_duty_cycle_gazes():
    table = load_force_table(DATA_DIR / "results" / "forces" / "duty-cycle.json")
    sets = time_averaged_force_sets(SubjectProfile(30.0, 4.0), table)
    assert [g for _, g in sets] == [table.find("distance"), table.find("near")]
    assert sum(w for w, _ in sets) == pytest.approx(1.0)
    assert sets[1][0] == pytest.approx(4.0 / WAKING)


def test_a_profile_refuses_negative_hours():
    with pytest.raises(ValueError):
        SubjectProfile(age_years=10, near_hours=-1)
