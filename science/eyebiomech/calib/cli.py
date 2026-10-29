"""`eyebiomech calibrate --out POSTERIOR.json`: fit the forward model to the population targets
(M5 plan, Task 5.10)."""

from __future__ import annotations

import argparse
import json
import time
from datetime import date
from pathlib import Path

import numpy as np

from eyebiomech.calib.fit import fit
from eyebiomech.calib.forward import load_priors, make_cohort, targets
from eyebiomech.fem.cli import _git_hash
from eyebiomech.fem.data import data_root
from eyebiomech.remodel.library import load_library

SCHEMA = "eye-posterior/1"


def add_arguments(p: argparse.ArgumentParser) -> None:
    p.add_argument("--out", required=True, type=Path)
    p.add_argument("--library", type=Path, default=None)
    p.add_argument("--method", choices=("lsq", "mcmc"), default="mcmc")
    p.add_argument("--walkers", type=int, default=24)
    p.add_argument("--steps", type=int, default=1500)
    p.add_argument("--burn", type=int, default=500)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument(
        "--bound-sphere",
        action="store_true",
        help="also bound the adult spherical-equivalent change by the observed one (envelope)",
    )


def posterior_document(post, data, library_path: Path, provenance: dict) -> dict:
    return {
        "schema": SCHEMA,
        "remodeled": True,
        "names": list(post.names),
        "best": post.best,
        "samples": None if post.samples is None else np.round(post.samples, 8).tolist(),
        "cov": post.cov.tolist(),
        "corr": np.round(post.corr, 4).tolist(),
        "method": post.method,
        "lsqConverged": post.lsq_converged,
        "acceptance": post.acceptance,
        "autocorrelationSteps": None
        if post.autocorr_steps is None
        else dict(zip(post.names, np.round(post.autocorr_steps, 2).tolist(), strict=True)),
        "chainStepsAfterBurn": post.chain_steps,
        "fit": {"cost": post.cost, "dof": post.dof, "perTarget": post.per_target},
        "data": sorted({t["source"] for t in data}),
        "library": str(library_path),
        "provenance": provenance,
        "citation": (
            "Calibration of the remodeled corneoscleral model (M5 plan, Task 5.10): parameters "
            "of data/calibration/priors.json fitted to the axis-class and J0-slope targets of "
            "data/population (excerpt transcriptions, unverified) through the reduced-order "
            "response library. Uncertainty is parameter uncertainty only."
        ),
    }


def run(args: argparse.Namespace, argv: list[str]) -> int:
    started = time.time()
    lib_path = args.library or data_root() / "results" / "response" / "library-v1.json"
    library = load_library(lib_path)
    priors = load_priors()
    data = targets(priors, bound_sphere=args.bound_sphere)
    post = fit(
        None,
        data,
        args.method,
        library=library,
        cohort=make_cohort(priors),
        priors=priors,
        seed=args.seed,
        n_walkers=args.walkers,
        n_steps=args.steps,
        burn=args.burn,
    )
    provenance = {
        "generatedBy": "eyebiomech " + " ".join(argv),
        "gitHash": _git_hash(),
        "date": date.today().isoformat(),
    }
    rel = lib_path.relative_to(data_root()) if lib_path.is_relative_to(data_root()) else lib_path
    doc = posterior_document(post, data, Path("data") / rel, provenance)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(doc, indent=1) + "\n")
    print(
        f"wrote {args.out} in {time.time() - started:.0f} s; best {post.best}; cost {post.cost:.3g}"
    )
    return 0
