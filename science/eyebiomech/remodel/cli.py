"""`eyebiomech library --eye EYE.json --out LIBRARY.json`: build the reduced-order response
library from the FEM (M5 plan, Task 5.8)."""

from __future__ import annotations

import argparse
import json
import time
from datetime import date
from pathlib import Path

from eyebiomech.fem.cli import _git_hash, read_json
from eyebiomech.forces.from_viewer import check_document_muscles
from eyebiomech.remodel.library import build_library
from eyebiomech.schema import validate_eye_parameters


def add_arguments(p: argparse.ArgumentParser) -> None:
    p.add_argument("--eye", required=True, type=Path)
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--n-face", type=int, default=16)
    p.add_argument("--layers", type=int, default=1)
    p.add_argument(
        "--scales",
        default="0.5,1,2,4",
        help="stiffness scales relative to the calibrated stiffness (comma-separated)",
    )
    p.add_argument("--reference", choices=("unloaded", "measured"), default="unloaded")


def run(args: argparse.Namespace, argv: list[str]) -> int:
    started = time.time()
    doc = read_json(args.eye, "EyeParameters file")
    validate_eye_parameters(doc)
    check_document_muscles(doc)
    scales = tuple(float(s) for s in args.scales.split(","))
    provenance = {
        "generatedBy": "eyebiomech " + " ".join(argv),
        "gitHash": _git_hash(),
        "date": date.today().isoformat(),
    }
    lib = build_library(
        doc,
        n_face=args.n_face,
        layers=args.layers,
        stiffness_scales=scales,
        reference=args.reference,
        provenance=provenance,
        progress=lambda m: print(f"  {m} ({time.time() - started:.0f} s)", flush=True),
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(lib.to_json(), indent=1) + "\n")
    print(f"wrote {args.out} in {time.time() - started:.0f} s")
    return 0
