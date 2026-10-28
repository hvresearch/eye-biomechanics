"""Regenerate data/oracle/cases.json and expected.json.

Run ``uv run python -m eyebiomech.oracle.generate`` from ``science/``.
"""

from __future__ import annotations

import json
from pathlib import Path

from eyebiomech.oracle.cases import make_cases
from eyebiomech.oracle.reference_tracer import trace

ORACLE_DIR = Path(__file__).resolve().parents[3] / "data" / "oracle"


def _encode(value):
    """JSON cannot hold infinity; store it as the string "Infinity" (the TS test decodes it)."""
    if isinstance(value, float) and value == float("inf"):
        return "Infinity"
    if isinstance(value, float) and value == float("-inf"):
        return "-Infinity"
    if isinstance(value, dict):
        return {k: _encode(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_encode(v) for v in value]
    return value


def decode(value):
    """Inverse of ``_encode``."""
    if value == "Infinity":
        return float("inf")
    if value == "-Infinity":
        return float("-inf")
    if isinstance(value, dict):
        return {k: decode(v) for k, v in value.items()}
    if isinstance(value, list):
        return [decode(v) for v in value]
    return value


def expected_for(cases: dict) -> dict:
    """Per ray: the image hit and optical path (None when vignetted), the status ("ok", "miss",
    "aperture", "tir"), and the index of the failing surface (None when ok)."""
    out = []
    for case in cases["cases"]:
        hits, opl, status, index = [], [], [], []
        for ray in case["rays"]:
            r = trace(case["surfaces"], ray["origin"], ray["direction"])
            if r["vignetted"] and case["kind"] not in ("miss", "aperture"):
                raise RuntimeError(f"case {case['id']}: a ray vignetted in the reference tracer")
            hits.append(None if r["vignetted"] else r["hits"][-1])
            opl.append(None if r["vignetted"] else r["opticalPathMm"])
            status.append(r["status"])
            index.append(r["surfaceIndex"])
        out.append(
            {
                "id": case["id"],
                "imageHitsMm": hits,
                "opticalPathMm": opl,
                "status": status,
                "surfaceIndex": index,
            }
        )
    return {
        "description": "Image-plane hits, optical paths, and failure reasons from "
        "eyebiomech.oracle.reference_tracer.",
        "cases": out,
    }


def main() -> None:
    cases = make_cases()
    ORACLE_DIR.mkdir(parents=True, exist_ok=True)
    (ORACLE_DIR / "cases.json").write_text(json.dumps(_encode(cases), indent=1) + "\n")
    (ORACLE_DIR / "expected.json").write_text(json.dumps(expected_for(cases), indent=1) + "\n")


if __name__ == "__main__":
    main()
