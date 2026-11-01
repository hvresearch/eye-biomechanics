"""Scenario documents (schemas/scenario.schema.json) and the committed scenarios under
data/scenarios/: the schema's `$ref` to EyeParameters resolves through the registry (M0
follow-up), and the reader rejects what the viewer rejects."""

import copy
import json
from pathlib import Path

import pytest

from eyebiomech.schema import SchemaError, validate_scenario

ROOT = Path(__file__).resolve().parents[2]
SCENARIOS = sorted((ROOT / "data/scenarios").glob("*.json"))
EYE = json.loads((ROOT / "data/fixtures/emmetrope-right.eye.json").read_text())


def minimal() -> dict:
    return {
        "schemaVersion": "1.0.0",
        "name": "minimal",
        "description": "",
        "scene": {
            "targetDistanceM": None,
            "targetDirectionDeg": {"x": 0, "y": 0},
            "luminanceCdM2": 100,
            "ageYears": 30,
            "ipdMm": 63,
            "preset": "navarro-1985",
        },
        "eyes": {"left": copy.deepcopy(EYE), "right": copy.deepcopy(EYE)},
        "prescription": None,
        "corrected": False,
        "result": None,
        "timeline": [],
    }


def test_the_four_scenarios_are_committed():
    names = {p.stem for p in SCENARIOS}
    assert names == {
        "near-to-far-refocus",
        "presbyopia-20-to-60",
        "astigmat-corrected-vs-uncorrected",
        "fem-result-loaded",
    }


@pytest.mark.parametrize("path", SCENARIOS, ids=lambda p: p.stem)
def test_committed_scenarios_validate(path):
    validate_scenario(json.loads(path.read_text()))


def test_a_minimal_scenario_validates():
    validate_scenario(minimal())


def test_unknown_major_version_is_named():
    doc = minimal()
    doc["schemaVersion"] = "2.0.0"
    with pytest.raises(SchemaError) as excinfo:
        validate_scenario(doc)
    assert "2.0.0" in str(excinfo.value)


def test_extra_key_is_rejected():
    doc = minimal()
    doc["scene"]["zoom"] = 2
    with pytest.raises(SchemaError) as excinfo:
        validate_scenario(doc)
    assert "/scene" in str(excinfo.value)
    assert "zoom" in str(excinfo.value)


def test_a_bad_embedded_eye_names_its_path():
    doc = minimal()
    del doc["eyes"]["left"]["axialLengthMm"]
    with pytest.raises(SchemaError) as excinfo:
        validate_scenario(doc)
    assert "/eyes/left" in str(excinfo.value)


def test_an_embedded_eye_of_another_major_version_is_named():
    doc = minimal()
    doc["eyes"]["right"]["schemaVersion"] = "2.0.0"
    with pytest.raises(SchemaError) as excinfo:
        validate_scenario(doc)
    assert "2.0.0" in str(excinfo.value)


def test_unsorted_keyframes_are_rejected():
    doc = minimal()
    doc["timeline"] = [{"timeS": 2}, {"timeS": 1}]
    with pytest.raises(SchemaError) as excinfo:
        validate_scenario(doc)
    assert "/timeline/1" in str(excinfo.value)
