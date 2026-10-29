"""The `eyebiomech` program: one entry point with a subcommand per stage.

- `fem`: elastic corneoscleral FEM result for an EyeParameters file (M4, `eyebiomech.fem.cli`).
- `library`: the reduced-order response library from the FEM (M5, `eyebiomech.remodel.cli`).
- `calibrate`: fit the forward model to the population targets (M5, `eyebiomech.calib.cli`).

Every subcommand exits 0 on success, 2 with a one-line message naming the problem for invalid
input (schema errors, missing or malformed files, unphysical or non-converged results).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from eyebiomech.calib import cli as calib_cli
from eyebiomech.fem import cli as fem_cli
from eyebiomech.fem.data import data_root_override
from eyebiomech.fem.export import UnphysicalResultError
from eyebiomech.fem.solve import NewtonDidNotConverge
from eyebiomech.remodel import cli as remodel_cli
from eyebiomech.schema import SchemaError


def _parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="eyebiomech", description=__doc__.splitlines()[0])
    p.add_argument(
        "--data-root",
        type=Path,
        default=None,
        help="directory holding the data tables (default: $EYEBIOMECH_DATA, the repository's "
        "data/, or the copy the package ships)",
    )
    sub = p.add_subparsers(dest="command", required=True)
    fem_cli.add_arguments(
        sub.add_parser("fem", help="elastic corneoscleral FEM result for an EyeParameters file")
    )
    remodel_cli.add_arguments(sub.add_parser("library", help="response library from the FEM"))
    calib_cli.add_arguments(sub.add_parser("calibrate", help="fit the population targets"))
    return p


_RUNNERS = {
    "fem": fem_cli.run_fem,
    "library": remodel_cli.run,
    "calibrate": calib_cli.run,
}


def main(argv: list[str] | None = None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    args = _parser().parse_args(argv)
    try:
        if args.data_root is not None:
            with data_root_override(args.data_root):
                return _RUNNERS[args.command](args, argv)
        return _RUNNERS[args.command](args, argv)
    except (SchemaError, UnphysicalResultError, NewtonDidNotConverge, ValueError) as exc:
        print(f"eyebiomech {args.command}: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
