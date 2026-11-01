"""Validation of EyeParameters, deformation, prediction, and scenario documents against the
shared schemas.

The schemas ship as package data (`eyebiomech/schemas/`, byte-identical copies of the
repository's `schemas/`, checked by tests/test_packaging.py), so the package validates
documents outside the repository checkout.
"""

import json
import re
from importlib.resources import files

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

_SUPPORTED_MAJOR = 1
BANDS = ("p05", "p50", "p95")


def _load(name: str) -> dict:
    return json.loads(files("eyebiomech").joinpath("schemas", name).read_text())


_EYE_SCHEMA = _load("eye-parameters.schema.json")
_DEFORMATION_SCHEMA = _load("deformation.schema.json")
_PREDICTIONS_SCHEMA = _load("predictions.schema.json")
_SCENARIO_SCHEMA = _load("scenario.schema.json")
_REGISTRY = Registry().with_resources(
    (s["$id"], Resource.from_contents(s))
    for s in (_EYE_SCHEMA, _DEFORMATION_SCHEMA, _SCENARIO_SCHEMA)
)
_VALIDATOR = Draft202012Validator(_EYE_SCHEMA, registry=_REGISTRY)
_DEFORMATION_VALIDATOR = Draft202012Validator(_DEFORMATION_SCHEMA, registry=_REGISTRY)
_PREDICTIONS_VALIDATOR = Draft202012Validator(_PREDICTIONS_SCHEMA)
_SCENARIO_VALIDATOR = Draft202012Validator(_SCENARIO_SCHEMA, registry=_REGISTRY)


class SchemaError(ValueError):
    """Raised when a document fails validation; ``errors`` lists human-readable messages."""

    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


def _check_major(doc: object) -> None:
    if not isinstance(doc, dict):
        return
    version = doc.get("schemaVersion")
    if not isinstance(version, str):
        return
    # Malformed versions fall through to the schema's pattern check.
    match = re.fullmatch(r"(\d+)\.\d+\.\d+", version, re.ASCII)
    if match and int(match.group(1)) != _SUPPORTED_MAJOR:
        raise SchemaError(
            [f"Unsupported schemaVersion {version!r}: supported major is {_SUPPORTED_MAJOR}"]
        )


def _validate(validator: Draft202012Validator, doc: dict) -> None:
    _check_major(doc)
    errors = [
        f"/{'/'.join(str(p) for p in e.absolute_path)} {e.message}"
        for e in sorted(validator.iter_errors(doc), key=lambda e: list(map(str, e.absolute_path)))
    ]
    if errors:
        raise SchemaError(errors)


def validate_eye_parameters(doc: dict) -> None:
    _validate(_VALIDATOR, doc)


def validate_deformation(doc: dict) -> None:
    """Validate a `*.deformation.json` sidecar (and its embedded reference EyeParameters), and
    check what the schema cannot: one displacement and one region per vertex, and triangle
    indices within the vertex list (as the TypeScript loader does)."""
    _validate(_DEFORMATION_VALIDATOR, doc)
    validate_eye_parameters(doc["reference"])
    n = len(doc["vertices"])
    errors = [
        f"/{key} has {len(doc[key])} entries for {n} vertices"
        for key in ("displacementMm", "region", "rawDisplacementMm")
        if key in doc and len(doc[key]) != n
    ]
    bad = [i for i, t in enumerate(doc["triangles"]) if max(t) >= n]
    if bad:
        errors.append(f"/triangles/{bad[0]} has a triangle index beyond the {n} vertices")
    if errors:
        raise SchemaError(errors)


def validate_scenario(doc: dict) -> None:
    """Validate a Scenario (schemas/scenario.schema.json, which references the EyeParameters
    schema through the registry), each embedded eye's major version, and what the schema
    cannot state: keyframe times in non-decreasing order (as the viewer's reader does)."""
    _validate(_SCENARIO_VALIDATOR, doc)
    errors = []
    for side in ("left", "right"):
        try:
            validate_eye_parameters(doc["eyes"][side])
        except SchemaError as e:
            errors += [f"/eyes/{side}{m if m.startswith('/') else ' ' + m}" for m in e.errors]
    times = [k["timeS"] for k in doc["timeline"]]
    errors += [
        f"/timeline/{i} timeS {t} is earlier than the previous keyframe's {times[i - 1]}"
        for i, t in enumerate(times)
        if i > 0 and t < times[i - 1]
    ]
    if errors:
        raise SchemaError(errors)


def _shape_error(x, shape: tuple[int, ...], path: str) -> str | None:
    """The first place where nested lists `x` differ from `shape` (every row is checked, so
    ragged and empty inner arrays are found), or None."""
    if not shape:
        return None
    if not isinstance(x, list):
        return f"{path} is not an array"
    if len(x) != shape[0]:
        return f"{path} has length {len(x)}, expected {shape[0]}"
    for i, row in enumerate(x):
        err = _shape_error(row, shape[1:], f"{path}/{i}")
        if err:
            return err
    return None


def validate_predictions(doc: dict) -> None:
    """Validate a prediction grid (schemas/predictions.schema.json) and the array shapes the
    schema cannot state: (nearHours, baselineSphereD, baselineCylinderD, ages), every row."""
    _validate(_PREDICTIONS_VALIDATOR, doc)
    ax = doc["axes"]
    shape = tuple(len(ax[k]) for k in ("nearHours", "baselineSphereD", "baselineCylinderD"))
    full = (*shape, len(ax["ages"]))
    checks = [(f"/{n}/{q}", doc[n][q], full) for n in ("sphere", "cylinder") for q in BANDS]
    checks.append(("/axisDeg/p50", doc["axisDeg"]["p50"], full))
    if "logMAR" in doc:
        checks.append(("/logMAR/p50", doc["logMAR"]["p50"], full))
    onset = doc["onset"]
    checks += [
        (f"/onset/{n}/{q}", onset[n][q], shape) for n in ("refraction", "acuity") for q in BANDS
    ]
    errors = [e for path, x, sh in checks if (e := _shape_error(x, sh, path))]
    if errors:
        raise SchemaError(errors)
