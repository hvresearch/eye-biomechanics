"""`eyebiomech fem --eye EYE.json --gaze H,V [--iop MMHG] --out OUT.eye.json` (the parser and
`main` live in `eyebiomech.cli`).

Builds the shell from the document, solves the IOP-only reference state and the loaded state
(IOP, the six muscle insertions of the force table's gaze in static equilibrium with the
passive orbit, the eyelid bands at the lid margins in the orbit, the ciliary ring at the given
accommodation, and the orbital support that balances them), and writes the elastic result and
its displacement sidecar (M4 plan, Task 4.7; M5 Task 5.2). `--gaze` is a label of the force
table ("near" in data/results/forces/duty-cycle.json) or "x,y" in degrees. `--loads iop`
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

import numpy as np

from eyebiomech.fem.data import data_root, load_eom_table, load_eyelid, load_materials
from eyebiomech.fem.export import (
    build_deformation,
    build_result,
    write_result,
)
from eyebiomech.fem.inverse import unloaded_shell
from eyebiomech.fem.loads import Loads
from eyebiomech.fem.material import region_materials
from eyebiomech.fem.mesh import make_shell_mesh
from eyebiomech.fem.solve import make_context, solve
from eyebiomech.fem.units import MMHG_TO_KPA
from eyebiomech.forces.from_viewer import check_document_muscles, load_force_table
from eyebiomech.schema import validate_eye_parameters

# Production mesh (numerical): mesh refinement from 12 to 16 changed the induced corneal
# astigmatism by about 3-8% (data/results/README.md).
DEFAULT_N_FACE = 16
DEFAULT_LAYERS = 1
DEFAULT_STEPS = 2

CITATION = (
    "Elastic corneoscleral FEM (no remodeling; spec §7). The stress-free geometry is found by "
    "a fixed-point inverse solve so that the IOP-only state is the document's geometry, and the "
    "result is the change from that state (--reference measured instead takes the document as "
    "stress-free). Approximations: "
    "fixed optic-nerve support; muscle forces from length-proxy activation x capacity, "
    "brought into static equilibrium with a linear passive orbital moment by the least change, "
    "with the net force and the passive moment taken by an orbital reaction on the orbit's "
    "posterior hemisphere; lid bands fixed in the orbit at the lid margins; dead loads in the "
    "reference configuration; Zernike maps fitted within 4 mm of the axis; lens follows the "
    "scleral spur, the cornea is measured relative to the spur ring's lateral shift and tilt, "
    "and the retina follows the posterior pole. Materials, thickness, eyelid, and force data "
    "are unverified (see data/materials, data/eyelid, data/eom). Tests the hypothesis that "
    "muscle and lid loading shape the cornea; not an established result."
)


def _git_hash(cwd: Path | str | None = None) -> str:
    """HEAD's hash, with "-dirty" when the working tree differs from it (as the TypeScript
    exporter writes); empty outside a checkout."""
    try:
        head = subprocess.run(
            ["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True, cwd=cwd
        ).stdout.strip()
        dirty = subprocess.run(
            ["git", "status", "--porcelain"], capture_output=True, text=True, check=True, cwd=cwd
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return ""
    return f"{head}-dirty" if dirty else head


def default_iop_mmhg() -> float:
    """The materials table's default intraocular pressure, mmHg."""
    return float(load_materials()["intraocularPressure"]["meanMmHg"])


def add_arguments(f: argparse.ArgumentParser) -> None:
    f.add_argument("--eye", required=True, type=Path)
    f.add_argument(
        "--gaze",
        default="0,0",
        help='a gaze of the force table: "x,y" Fick degrees (x temporal, y up) or its label',
    )
    f.add_argument(
        "--iop",
        type=float,
        default=None,
        help="intraocular pressure, mmHg (default: intraocularPressure in "
        "data/materials/cornea-sclera.json)",
    )
    f.add_argument("--accommodation", type=float, default=0.0, help="diopters (ciliary load)")
    f.add_argument(
        "--forces", type=Path, default=None, help="default: data/results/forces/default.json"
    )
    f.add_argument("--no-eyelid", action="store_true")
    f.add_argument("--loads", choices=("all", "iop"), default="all")
    f.add_argument("--age", type=float, default=None, help="years (default: the document's)")
    f.add_argument("--n-face", type=int, default=DEFAULT_N_FACE)
    f.add_argument("--layers", type=int, default=DEFAULT_LAYERS)
    f.add_argument("--steps", type=int, default=DEFAULT_STEPS)
    f.add_argument(
        "--reference",
        choices=("unloaded", "measured"),
        default="unloaded",
        help="stress-free geometry: found by the inverse solve (default), or the document's",
    )
    f.add_argument("--out", required=True, type=Path)


def read_json(path: Path, what: str) -> dict:
    """A JSON file's contents; `ValueError` naming the file when it is missing or malformed."""
    try:
        return json.loads(Path(path).read_text())
    except OSError as exc:
        raise ValueError(f"{what} {path}: {exc.strerror or exc}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"{what} {path}: not valid JSON ({exc})") from exc


def eyelid_arguments(doc: dict) -> dict:
    """Keyword arguments of `Loads.eyelid` for a document: its own `eyelid` pressures when it has
    one, else the table's; the lid margins of the table (MRD1, MRD2), moved apart or together
    symmetrically when the document gives its own aperture."""
    table = load_eyelid()
    up, low = table["upperMarginMm"], table["lowerMarginMm"]
    lid = doc.get("eyelid")
    if lid:
        upper, lower = lid["upperPressureKPa"], lid["lowerPressureKPa"]
        widen = (lid["apertureMm"] - (up - low)) / 2
        up, low = up + widen, low - widen
    else:
        upper = table["upperPressureMmHg"] * MMHG_TO_KPA
        lower = table["lowerPressureMmHg"] * MMHG_TO_KPA
    return {
        "upper_kpa": upper,
        "lower_kpa": lower,
        "aperture_mm": up - low,
        "upper_height_mm": table["upperContactHeightMm"],
        "lower_height_mm": table["lowerContactHeightMm"],
        "upper_margin_mm": up,
        "lower_margin_mm": low,
    }


def run_fem(args: argparse.Namespace, argv: list[str]) -> int:
    started = time.time()
    doc = read_json(args.eye, "EyeParameters file")
    validate_eye_parameters(doc)
    check_document_muscles(doc)
    if args.iop is None:
        args.iop = default_iop_mmhg()
    materials, eom = load_materials(), load_eom_table()
    loads = Loads().iop(args.iop)
    if args.loads == "all":
        forces = args.forces or data_root() / "results" / "forces" / "default.json"
        read_json(forces, "force table")
        try:
            table = load_force_table(forces)
        except (KeyError, TypeError, IndexError, ValueError) as exc:
            raise ValueError(f"force table {forces}: {exc}") from exc
        try:
            gaze = table.find(args.gaze)
        except KeyError as exc:
            raise ValueError(f"gaze {args.gaze}: {exc.args[0]} ({forces})") from exc
        loads.from_force_table(table, gaze, eom)
        if loads.unloaded_muscles():
            print(
                "eyebiomech fem: the equilibrium unloads " + ", ".join(loads.unloaded_muscles()),
                file=sys.stderr,
            )
        if not args.no_eyelid:
            loads.eyelid(**eyelid_arguments(doc))
        loads.ciliary(materials["ciliaryTensionNPerMmPerD"]["value"], args.accommodation)
        loads.orbital_support()
    shell = make_shell_mesh(doc, layers=args.layers, n_face=args.n_face)
    age = doc["age"] if args.age is None else args.age
    mats = region_materials(materials, age, shell.geometry)
    on = materials["opticNerve"]["radiusMm"]
    if args.reference == "unloaded":
        # The stress-free shell whose IOP state is the document's geometry (M5, Task 5.3); all
        # states are then expressed as displacements of the measured mesh.
        inverse = unloaded_shell(shell, mats, args.iop, optic_nerve_radius_mm=on, steps=args.steps)
        solved_shell, offset, reference = inverse.shell, inverse.offset, inverse.solution
    else:
        solved_shell, offset, reference = shell, np.zeros_like(shell.mesh.doflocs), None
    ctx = reference.context if reference is not None else make_context(solved_shell)
    if reference is None:
        reference = solve(
            solved_shell,
            mats,
            Loads().iop(args.iop),
            optic_nerve_radius_mm=on,
            steps=args.steps,
            context=ctx,
        )
    if args.loads == "iop":
        # The inflation by IOP from the stress-free state (measured: the document's geometry).
        U_ref, loaded = offset, reference
    else:
        loaded = solve(
            solved_shell,
            mats,
            loads,
            optic_nerve_radius_mm=on,
            steps=args.steps,
            context=ctx,
            initial_u=reference.u,
            ramp="dead",
        )
        U_ref = offset + reference.nodal()
    U_load = offset + loaded.nodal()
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
    result, shifts = build_result(doc, shell, U_ref, U_load, provenance, suffix)
    sidecar = build_deformation(
        shell, U_ref, U_load, loads.summary(), doc, provenance, result["id"]
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
    """Compatibility entry point; the program lives in `eyebiomech.cli`."""
    from eyebiomech.cli import main as _main

    return _main(argv)
