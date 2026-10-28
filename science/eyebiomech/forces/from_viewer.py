"""Reader for the force table written by ``pnpm --filter @eye/eye-model export-forces``.

The table holds, for each gaze of a lattice, each muscle's insertion point, line of action at the
insertion, net pull direction, tangent point, arc of contact, and force (see
``web/packages/eye-model/src/eom/forces.ts``). Everything is in the EOM frame of
``data/eom/geometry-default.json``: right eye, origin at the globe center, x temporal, y
superior, z posterior, mm.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from eyebiomech.fem.data import load_eom_table

SCHEMA = "eye-forces/1"
MUSCLE_NAMES = (
    "lateralRectus",
    "medialRectus",
    "superiorRectus",
    "inferiorRectus",
    "superiorOblique",
    "inferiorOblique",
)


@dataclass(frozen=True)
class ForceTable:
    muscles: tuple[str, ...]
    gazes_deg: NDArray  # (G, 2): Fick x (temporal +) and y (up +), degrees
    insertion_mm: NDArray  # (G, 6, 3)
    insertion_dir: NDArray  # (G, 6, 3) line of action at the insertion
    pull_dir: NDArray  # (G, 6, 3) net pull direction (free segment)
    tangent_mm: NDArray  # (G, 6, 3)
    arc_mm: NDArray  # (G, 6) arc of contact
    force_n: NDArray  # (G, 6)
    width_mm: NDArray  # (G, 6)
    tendon_elongation_mm: NDArray  # (G, 6)
    provenance: dict

    def at(self, x_deg: float, y_deg: float) -> int:
        """Index of the gaze exactly at (x_deg, y_deg); KeyError when it is not on the lattice."""
        hits = np.flatnonzero(
            (self.gazes_deg[:, 0] == x_deg) & (self.gazes_deg[:, 1] == y_deg)
        )
        if hits.size == 0:
            raise KeyError(f"gaze ({x_deg}, {y_deg}) is not in the force table")
        return int(hits[0])


def load_force_table(path: Path | str) -> ForceTable:
    doc = json.loads(Path(path).read_text())
    if doc.get("schema") != SCHEMA:
        raise ValueError(f"force table schema {doc.get('schema')!r} is not {SCHEMA!r}")
    frame = load_eom_table()["frame"]
    if doc.get("frame") != frame:
        raise ValueError(f"force table frame {doc.get('frame')!r} differs from the EOM table's")
    if tuple(doc.get("muscles", ())) != MUSCLE_NAMES:
        raise ValueError(f"force table muscles {doc.get('muscles')} are not {list(MUSCLE_NAMES)}")
    fields = {
        "insertion_mm": "insertionMm",
        "insertion_dir": "insertionDir",
        "pull_dir": "pullDir",
        "tangent_mm": "tangentPointMm",
        "arc_mm": "arcOfContactMm",
        "force_n": "forceN",
        "width_mm": "insertionWidthMm",
        "tendon_elongation_mm": "tendonElongationMm",
    }
    columns: dict[str, list] = {k: [] for k in fields}
    gazes = []
    for g, gaze in enumerate(doc["gazes"]):
        names = tuple(e.get("name") for e in gaze["entries"])
        if names != MUSCLE_NAMES:
            unknown = sorted(set(names) - set(MUSCLE_NAMES))
            raise ValueError(
                f"gaze {g}: muscles {list(names)} are not {list(MUSCLE_NAMES)}"
                + (f" (unknown: {unknown})" if unknown else "")
            )
        gazes.append((gaze["xDeg"], gaze["yDeg"]))
        for k, key in fields.items():
            columns[k].append([e[key] for e in gaze["entries"]])
    arrays = {k: np.asarray(v, dtype=float) for k, v in columns.items()}
    return ForceTable(
        muscles=MUSCLE_NAMES,
        gazes_deg=np.asarray(gazes, dtype=float),
        provenance=doc.get("provenance", {}),
        **arrays,
    )
