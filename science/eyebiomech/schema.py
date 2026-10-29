"""Validation of EyeParameters and deformation documents against the shared schemas.

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


def _load(name: str) -> dict:
    return json.loads(files("eyebiomech").joinpath("schemas", name).read_text())


_EYE_SCHEMA = _load("eye-parameters.schema.json")
_DEFORMATION_SCHEMA = _load("deformation.schema.json")
_REGISTRY = Registry().with_resources(
    (s["$id"], Resource.from_contents(s)) for s in (_EYE_SCHEMA, _DEFORMATION_SCHEMA)
)
_VALIDATOR = Draft202012Validator(_EYE_SCHEMA, registry=_REGISTRY)
_DEFORMATION_VALIDATOR = Draft202012Validator(_DEFORMATION_SCHEMA, registry=_REGISTRY)


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
