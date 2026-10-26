"""Validation of EyeParameters JSON documents against the shared schema."""

import json
import re
from pathlib import Path

from jsonschema import Draft202012Validator

_SCHEMA_PATH = Path(__file__).resolve().parents[2] / "schemas" / "eye-parameters.schema.json"
_SUPPORTED_MAJOR = 1
_VALIDATOR = Draft202012Validator(json.loads(_SCHEMA_PATH.read_text()))


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


def validate_eye_parameters(doc: dict) -> None:
    _check_major(doc)
    errors = [
        f"/{'/'.join(str(p) for p in e.absolute_path)} {e.message}"
        for e in sorted(_VALIDATOR.iter_errors(doc), key=lambda e: list(map(str, e.absolute_path)))
    ]
    if errors:
        raise SchemaError(errors)
