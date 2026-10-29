import copy
import json
from pathlib import Path

import pytest

from eyebiomech.schema import SchemaError, validate_eye_parameters

FIXTURE = Path(__file__).resolve().parents[2] / "data/fixtures/emmetrope-right.eye.json"


def load() -> dict:
    return json.loads(FIXTURE.read_text())


def test_fixture_validates():
    validate_eye_parameters(load())


def test_wrong_major_version():
    doc = load()
    doc["schemaVersion"] = "2.0.0"
    with pytest.raises(SchemaError) as excinfo:
        validate_eye_parameters(doc)
    assert "2.0.0" in str(excinfo.value)


@pytest.mark.parametrize("version", ["1", "1e0.0.0", " 1.0.0", "1.0", "1.0.0-beta", "１.0.0"])
def test_malformed_version(version):
    doc = load()
    doc["schemaVersion"] = version
    with pytest.raises(SchemaError) as excinfo:
        validate_eye_parameters(doc)
    assert "schemaVersion" in str(excinfo.value)


def test_missing_surfaces():
    doc = load()
    del doc["surfaces"]
    with pytest.raises(SchemaError):
        validate_eye_parameters(doc)


def test_unknown_top_level_key():
    doc = load()
    doc["bogus"] = 1
    with pytest.raises(SchemaError) as excinfo:
        validate_eye_parameters(doc)
    assert "bogus" in str(excinfo.value)


def test_toric_missing_axis():
    doc = copy.deepcopy(load())
    s = doc["surfaces"][0]
    del s["radiusMm"]
    s.update(type="toric", rxMm=7.7, ryMm=7.9)
    with pytest.raises(SchemaError) as excinfo:
        validate_eye_parameters(doc)
    assert "axisDeg" in str(excinfo.value)


def _sidecar() -> dict:
    root = Path(__file__).resolve().parents[2] / "data/results/fem"
    return json.loads(next(root.glob("*.deformation.json")).read_text())


def test_deformation_lengths_must_agree():
    """`vertices`, `displacementMm`, and `region` describe the same vertices (M4 follow-up,
    review of 8ac4f73, mirroring the TypeScript loader)."""
    from eyebiomech.schema import validate_deformation

    doc = _sidecar()
    validate_deformation(doc)
    short = copy.deepcopy(doc)
    short["displacementMm"] = short["displacementMm"][:-1]
    with pytest.raises(SchemaError, match="displacementMm"):
        validate_deformation(short)
    regions = copy.deepcopy(doc)
    regions["region"] = regions["region"][:-1]
    with pytest.raises(SchemaError, match="region"):
        validate_deformation(regions)


def test_deformation_triangles_must_index_vertices():
    from eyebiomech.schema import validate_deformation

    doc = _sidecar()
    doc["triangles"][0][1] = len(doc["vertices"])
    with pytest.raises(SchemaError, match="triangle"):
        validate_deformation(doc)
