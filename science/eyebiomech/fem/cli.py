"""Command line: `eyebiomech fem --eye EYE.json --gaze H,V --iop MMHG --out OUT.eye.json`.

Builds the shell from the document, solves the IOP-only reference state and the loaded state
(IOP, the six torque-balanced muscle insertions of the force table's gaze, the eyelid bands,
the ciliary ring at the given accommodation, and the orbital support that balances them), and
writes the elastic result and its displacement sidecar (M4 plan, Task 4.7). `--loads iop`
reports the inflation by IOP alone from the unloaded geometry instead.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

from eyebiomech.fem.data import DATA_DIR, load_eom_table, load_eyelid, load_materials
from eyebiomech.fem.export import (
    UnphysicalResultError,
    build_deformation,
    build_result,
    write_result,
)
from eyebiomech.fem.loads import Loads
from eyebiomech.fem.material import region_materials
from eyebiomech.fem.mesh import make_shell_mesh
from eyebiomech.fem.solve import NewtonDidNotConverge, make_context, solve
from eyebiomech.fem.units import MMHG_TO_KPA
from eyebiomech.forces.from_viewer import load_force_table
from eyebiomech.schema import SchemaError, validate_eye_parameters

# Production mesh (numerical): mesh refinement from 12 to 16 changed the induced corneal
# astigmatism by about 3-8% (data/results/README.md).
DEFAULT_N_FACE = 16
DEFAULT_LAYERS = 1
DEFAULT_STEPS = 2

CITATION = (
    "Elastic corneoscleral FEM (no remodeling; spec §7). Approximations: the document's "
    "geometry is taken as stress-free and the result is the change from the IOP-only state; "
    "fixed optic-nerve support; muscle forces from length-proxy activation x capacity, "
    "torque-balanced, with the net force taken by an orbital reaction on the posterior "
    "hemisphere; dead loads in the reference configuration; lens follows the scleral spur and "
    "the retina the posterior pole. Materials, thickness, eyelid, and force data are unverified "
    "(see data/materials, data/eyelid, data/eom). Tests the hypothesis that muscle and lid "
    "loading shape the cornea; not an established result."
)


def _git_hash() -> str:
    """HEAD's hash when the working tree is clean, else empty."""
    try:
        head = subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True
        ).stdout.strip()
        dirty = subprocess.run(
            ["git", "status", "--porcelain"], capture_output=True, text=True, check=True
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ""
    return "" if dirty else head


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="eyebiomech", description=__doc__.splitlines()[0])
    sub = p.add_subparsers(dest="command", required=True)
    f = sub.add_parser("fem", help="elastic corneoscleral FEM result for an EyeParameters file")
    f.add_argument("--eye", required=True, type=Path)
    f.add_argument("--gaze", default="0,0", help="Fick x,y in degrees; only 0,0 is supported")
    f.add_argument("--iop", type=float, default=15.0, help="intraocular pressure, mmHg")
    f.add_argument("--accommodation", type=float, default=0.0, help="diopters (ciliary load)")
    f.add_argument("--forces", type=Path, default=DATA_DIR / "results" / "forces" / "default.json")
    f.add_argument("--no-eyelid", action="store_true")
    f.add_argument("--loads", choices=("all", "iop"), default="all")
    f.add_argument("--age", type=float, default=None, help="years (default: the document's)")
    f.add_argument("--n-face", type=int, default=DEFAULT_N_FACE)
    f.add_argument("--layers", type=int, default=DEFAULT_LAYERS)
    f.add_argument("--steps", type=int, default=DEFAULT_STEPS)
    f.add_argument("--out", required=True, type=Path)
    return p


def _eyelid_kpa(doc: dict) -> tuple[float, float, float, float, float]:
    table = load_eyelid()
    lid = doc.get("eyelid")
    if lid:
        upper, lower, aperture = lid["upperPressureKPa"], lid["lowerPressureKPa"], lid["apertureMm"]
    else:
        upper = table["upperPressureMmHg"] * MMHG_TO_KPA
        lower = table["lowerPressureMmHg"] * MMHG_TO_KPA
        aperture = table["palpebralApertureMm"]
    return upper, lower, aperture, table["upperContactHeightMm"], table["lowerContactHeightMm"]


def run_fem(args: argparse.Namespace, argv: list[str]) -> int:
    started = time.time()
    doc = json.loads(args.eye.read_text())
    validate_eye_parameters(doc)
    gx, gy = (float(v) for v in args.gaze.split(","))
    materials, eom = load_materials(), load_eom_table()
    loads = Loads().iop(args.iop)
    if args.loads == "all":
        if (gx, gy) != (0.0, 0.0):
            raise ValueError(
                f"gaze {args.gaze}: only primary gaze (0,0) is supported; eccentric gazes need "
                "passive orbital torques and lid bands that follow the gaze (M5 follow-up)"
            )
        table = load_force_table(args.forces)
        try:
            gaze = table.at(gx, gy)
        except KeyError as exc:
            raise ValueError(f"gaze {args.gaze} is not on the force table's lattice") from exc
        loads.from_force_table(table, gaze, eom)
        if not args.no_eyelid:
            loads.eyelid(*_eyelid_kpa(doc))
        loads.ciliary(materials["ciliaryTensionNPerMmPerD"]["value"], args.accommodation)
        loads.orbital_support()
    shell = make_shell_mesh(doc, layers=args.layers, n_face=args.n_face)
    ctx = make_context(shell)
    age = doc["age"] if args.age is None else args.age
    mats = region_materials(materials, age, shell.geometry)
    on = materials["opticNerve"]["radiusMm"]
    reference = solve(
        shell, mats, Loads().iop(args.iop), optic_nerve_radius_mm=on, steps=args.steps, context=ctx
    )
    if args.loads == "iop":
        U_ref, loaded = 0 * reference.nodal(), reference
    else:
        loaded = solve(
            shell,
            mats,
            loads,
            optic_nerve_radius_mm=on,
            steps=args.steps,
            context=ctx,
            initial_u=reference.u,
            ramp="dead",
        )
        U_ref = reference.nodal()
    provenance = {
        "source": "eyebiomech fem",
        "citation": CITATION,
        "generatedBy": "eyebiomech " + " ".join(argv),
        "gitHash": _git_hash(),
        "date": date.today().isoformat(),
        "verified": False,
    }
    suffix = f"elastic FEM, gaze {args.gaze}, IOP {args.iop:g} mmHg" + (
        "" if args.loads == "all" else ", IOP only"
    )
    result, shifts = build_result(doc, shell, U_ref, loaded.nodal(), provenance, suffix)
    sidecar = build_deformation(
        shell, U_ref, loaded.nodal(), loads.summary(), doc, provenance, result["id"]
    )
    eye_path, side_path = write_result(result, sidecar, args.out)
    c = result["surfaces"][0]["zernikeHeight"]["coeffsMicrons"]
    print(
        f"wrote {eye_path} and {side_path} in {time.time() - started:.0f} s "
        f"(mesh n_face={args.n_face}, layers={args.layers}, {ctx.n} dofs; Newton iterations "
        f"{len(reference.residual_history)} + {len(loaded.residual_history)}); anterior "
        f"c(2,-2) {c[3]:.4f} c(2,0) {c[4]:.4f} c(2,2) {c[5]:.4f} um; shifts "
        + ", ".join(f"{k} {v * 1e3:.2f} um" for k, v in shifts.items())
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    args = _parser().parse_args(argv)
    try:
        if args.command == "fem":
            return run_fem(args, argv)
    except (SchemaError, UnphysicalResultError, NewtonDidNotConverge, ValueError) as exc:
        print(f"eyebiomech {args.command}: {exc}", file=sys.stderr)
        return 2
    return 1  # pragma: no cover - argparse rejects unknown commands


if __name__ == "__main__":
    sys.exit(main())
