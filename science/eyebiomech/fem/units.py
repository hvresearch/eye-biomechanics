"""Unit conversions for the FEM, which works in mm, N, and MPa (N/mm²).

1 mmHg = 101.325 kPa / 760 (the conventional millimeter of mercury, defined through the standard
atmosphere) = 0.1333224 kPa, and 1 kPa = 1e-3 MPa.
"""

KPA_TO_MPA = 1e-3
MMHG_TO_KPA = 101.325 / 760.0
MMHG_TO_MPA = MMHG_TO_KPA * KPA_TO_MPA


def mmhg_to_mpa(pressure_mmhg: float) -> float:
    return pressure_mmhg * MMHG_TO_MPA


def kpa_to_mpa(pressure_kpa: float) -> float:
    return pressure_kpa * KPA_TO_MPA
