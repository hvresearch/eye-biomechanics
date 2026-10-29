"""The Python accommodation functions agree with the TypeScript eye model (M5, Task 5.6)."""

import json
import math

import pytest

from eyebiomech.accommodation import (
    accommodation_response,
    amplitude_for_age,
    demand_from_distance,
)
from eyebiomech.fem.data import DATA_DIR

VALUES = json.loads((DATA_DIR / "oracle" / "accommodation-values.json").read_text())


@pytest.mark.parametrize("row", VALUES["amplitude"])
def test_amplitude_matches_typescript(row):
    assert amplitude_for_age(row["ageYears"]) == pytest.approx(row["amplitudeD"], abs=1e-12)


@pytest.mark.parametrize("row", VALUES["demand"])
def test_demand_matches_typescript(row):
    d = math.inf if row["distanceM"] is None else row["distanceM"]
    assert demand_from_distance(d) == pytest.approx(row["demandD"], abs=1e-12)


@pytest.mark.parametrize("row", VALUES["response"])
def test_response_matches_typescript(row):
    got = accommodation_response(row["demandD"], row["amplitudeD"])
    assert got == pytest.approx(row["responseD"], abs=1e-12)


def test_bad_inputs_are_refused():
    with pytest.raises(ValueError):
        amplitude_for_age(float("nan"))
    with pytest.raises(ValueError):
        demand_from_distance(-1)
