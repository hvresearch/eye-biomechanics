"""`eyebiomech predict --profile age=12,nearHours=4,sphere=0,cyl=0 --out PATH` and
`eyebiomech grid --out PATH` (M5 plan, Task 5.11)."""

from __future__ import annotations

import argparse
import json
import time
from datetime import date
from pathlib import Path

from eyebiomech.fem.cli import _git_hash, read_json
from eyebiomech.fem.data import data_root
from eyebiomech.predict.acuity import acuity_table
from eyebiomech.predict.grid import predict_grid, predict_profile
from eyebiomech.remodel.history import SubjectProfile
from eyebiomech.remodel.library import load_library
from eyebiomech.schema import validate_predictions

PROFILE_KEYS = {
    "age": "age_years",
    "nearHours": "near_hours",
    "sphere": "sphere_d",
    "cyl": "cylinder_d",
}
CITATION = (
    "Remodeled corneoscleral model (elastic response plus stress-driven growth) under a daily "
    "near-work duty cycle, calibrated to population astigmatism data (M5). Approximations: the "
    "reference eye's responses for every subject, linear superposition about the pressurized "
    "eye, reduced growth dynamics, the acuity stand-in for Watson & Ahumada 2008; bands are "
    "parameter uncertainty only. Tests the hypothesis that muscle and lid loading shape the "
    "cornea; not a clinical prediction."
)


def parse_profile(text: str, axis: float) -> SubjectProfile:
    values = {}
    for part in text.split(","):
        key, _, value = part.partition("=")
        if key.strip() not in PROFILE_KEYS:
            raise ValueError(f"--profile: unknown key {key!r}; expected {sorted(PROFILE_KEYS)}")
        try:
            values[PROFILE_KEYS[key.strip()]] = float(value)
        except ValueError:
            raise ValueError(f"--profile: {key}={value!r} is not a number") from None
    missing = set(PROFILE_KEYS.values()) - set(values)
    if missing:
        raise ValueError(f"--profile: missing {sorted(missing)}")
    if not 6 <= values["age_years"] <= 90:
        raise ValueError(f"--profile: age {values['age_years']} is outside 6-90")
    return SubjectProfile(axis_deg=axis, **values)


def _inputs(args):
    post_path = args.posterior or data_root() / "results" / "calibration" / "posterior-v1.json"
    posterior = read_json(post_path, "posterior")
    return posterior, load_library(args.library)


def _provenance(argv) -> dict:
    return {
        "source": "eyebiomech",
        "generatedBy": "eyebiomech " + " ".join(argv),
        "gitHash": _git_hash(),
        "date": date.today().isoformat(),
        "verified": False,
    }


def add_predict_arguments(p: argparse.ArgumentParser) -> None:
    p.add_argument("--profile", required=True, help="age=Y,nearHours=H,sphere=D,cyl=D")
    p.add_argument("--axis", type=float, default=180.0, help="cylinder axis, degrees (TABO)")
    p.add_argument("--posterior", type=Path, default=None)
    p.add_argument("--library", type=Path, default=None)
    p.add_argument("--draws", type=int, default=200)
    p.add_argument("--out", required=True, type=Path)


def add_grid_arguments(p: argparse.ArgumentParser) -> None:
    p.add_argument("--posterior", type=Path, default=None)
    p.add_argument("--library", type=Path, default=None)
    p.add_argument("--draws", type=int, default=200)
    p.add_argument("--out", required=True, type=Path)


def run_predict(args: argparse.Namespace, argv: list[str]) -> int:
    profile = parse_profile(args.profile, args.axis)
    posterior, library = _inputs(args)
    out = predict_profile(profile, posterior, library, draws=args.draws)
    out.update(
        remodeled=True,
        thresholds=acuity_table()["thresholds"],
        provenance=_provenance(argv),
        citation=CITATION,
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=1) + "\n")
    o = out["onset"]
    print(
        f"wrote {args.out}: onset by refraction {o['refraction']['p50']}, by acuity "
        f"{o['acuity']['p50']} (median trajectory)"
    )
    return 0


def run_grid(args: argparse.Namespace, argv: list[str]) -> int:
    started = time.time()
    posterior, library = _inputs(args)
    grid = predict_grid(posterior, library, draws=args.draws, provenance=_provenance(argv))
    grid["thresholds"] = acuity_table()["thresholds"]
    grid["citation"] = CITATION
    validate_predictions(grid)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(grid, separators=(",", ":")) + "\n")
    size_kb = args.out.stat().st_size / 1e3
    print(f"wrote {args.out} ({size_kb:.0f} kB) in {time.time() - started:.0f} s")
    return 0
