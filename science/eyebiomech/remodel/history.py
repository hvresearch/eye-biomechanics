"""Load history from a daily near-work duty cycle (spec §7 "load history"; M5 plan, Task 5.6).

A subject spends `nearHours` of the waking day at the near state of data/calibration/
duty-cycle.json (a target 0.35 m away, 20° down) and the rest at the distance state (primary
gaze, no accommodation). The remodeling layer responds to the time-averaged loads
(approximation: growth averages over the day). The intensities are dimensionless multipliers
on the response library's load groups (`eyebiomech.remodel.library`):

- muscles at distance and at near: the fraction of waking time in each state × the muscle-tone
  calibration scale (the force table's forces at that state's gaze are the unit);
- lids at distance and at near: the fraction × the lid-pressure calibration scale;
- the ciliary ring: the time-averaged accommodation, D (the near fraction × the steady-state
  response to the near demand, clipped by the amplitude for the age, so presbyopia removes it);
  subjects are taken to wear their distance correction (demand from the target only;
  approximation);
- the homeostatic offset: always 1 (it is scaled by 1 − h in the library).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from numpy.typing import NDArray

from eyebiomech.accommodation import accommodation_response, amplitude_for_age, demand_from_distance
from eyebiomech.fem.data import _load

GROUPS = (
    "muscles@distance",
    "muscles@near",
    "lids@distance",
    "lids@near",
    "ciliary",
    "homeostatic",
)


def load_duty_cycle(path=None) -> dict:
    return _load(path, "calibration", "duty-cycle.json")


@dataclass(frozen=True)
class SubjectProfile:
    age_years: float
    near_hours: float
    sphere_d: float = 0.0
    cylinder_d: float = 0.0
    axis_deg: float = 180.0

    def __post_init__(self):
        for name in ("age_years", "near_hours", "sphere_d", "cylinder_d", "axis_deg"):
            if not np.isfinite(getattr(self, name)):
                raise ValueError(f"{name} must be finite")
        if self.near_hours < 0:
            raise ValueError(f"near_hours must be non-negative, got {self.near_hours}")


@dataclass(frozen=True)
class LoadIntensities:
    distance_fraction: float
    near_fraction: float
    muscles_distance: float
    muscles_near: float
    lids_distance: float
    lids_near: float
    ciliary_d: float
    homeostatic: float = 1.0

    def as_vector(self) -> NDArray:
        """In `GROUPS` order."""
        return np.array(
            [
                self.muscles_distance,
                self.muscles_near,
                self.lids_distance,
                self.lids_near,
                self.ciliary_d,
                self.homeostatic,
            ]
        )


def near_fraction(near_hours: float, duty: dict | None = None) -> float:
    duty = duty or load_duty_cycle()
    return float(min(max(near_hours / duty["wakingHours"]["value"], 0.0), 1.0))


def history_loads(
    profile: SubjectProfile,
    age_years: float | None = None,
    duty: dict | None = None,
    eom_tone_scale: float = 1.0,
    lid_pressure_scale: float = 1.0,
) -> LoadIntensities:
    """Time-averaged load intensities at `age_years` (default: the profile's age)."""
    duty = duty or load_duty_cycle()
    age = profile.age_years if age_years is None else age_years
    near = near_fraction(profile.near_hours, duty)
    far = 1.0 - near
    distance_m = duty["near"]["targetDistanceM"]
    ciliary = near * accommodation_response(
        demand_from_distance(distance_m), amplitude_for_age(age)
    )
    return LoadIntensities(
        distance_fraction=far,
        near_fraction=near,
        muscles_distance=far * eom_tone_scale,
        muscles_near=near * eom_tone_scale,
        lids_distance=far * lid_pressure_scale,
        lids_near=near * lid_pressure_scale,
        ciliary_d=ciliary,
    )


def time_averaged_force_sets(profile: SubjectProfile, force_table, duty: dict | None = None):
    """[(weight, gaze index)] of the force table's "distance" and "near" gazes, for averaging
    direct FEM solves over the day."""
    near = near_fraction(profile.near_hours, duty)
    return [(1.0 - near, force_table.find("distance")), (near, force_table.find("near"))]
