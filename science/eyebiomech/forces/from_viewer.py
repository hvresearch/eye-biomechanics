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
    quaternions: NDArray  # (G, 4) [x, y, z, w], globe orientation of each gaze
    provenance: dict
    labels: tuple[str | None, ...] = ()  # per gaze, in gaze-list tables ("distance", "near")

    def at(self, x_deg: float, y_deg: float) -> int:
        """Index of the gaze exactly at (x_deg, y_deg); KeyError when it is not on the lattice."""
        hits = np.flatnonzero((self.gazes_deg[:, 0] == x_deg) & (self.gazes_deg[:, 1] == y_deg))
        if hits.size == 0:
            raise KeyError(f"gaze ({x_deg}, {y_deg}) is not in the force table")
        return int(hits[0])

    def find(self, spec: str) -> int:
        """Index of the gaze named `spec`: a label of the table, or "x,y" in degrees (matched
        within 1e-9°). KeyError when there is none."""
        if spec in self.labels:
            return self.labels.index(spec)
        try:
            x, y = (float(v) for v in spec.split(","))
        except ValueError:
            raise KeyError(f"gaze {spec!r} is neither a label of the force table nor x,y") from None
        hits = np.flatnonzero(np.all(np.abs(self.gazes_deg - [x, y]) <= 1e-9, axis=1))
        if hits.size == 0:
            raise KeyError(f"gaze ({x:g}, {y:g}) is not in the force table")
        return int(hits[0])

    def body_frame(self, g: int) -> dict[str, NDArray]:
        """Gaze g's vectors (insertion, insertion direction, pull direction, tangent point) taken
        back to the globe's own frame by the inverse of the gaze orientation, each (6, 3)."""
        R = rotation_matrix(self.quaternions[g])
        return {
            name: getattr(self, name)[g] @ R  # rows v ↦ Rᵀ v
            for name in ("insertion_mm", "insertion_dir", "pull_dir", "tangent_mm")
        }


def rotation_matrix(q: NDArray) -> NDArray:
    """Rotation matrix of the unit quaternion [x, y, z, w] (v' = q v q*)."""
    x, y, z, w = np.asarray(q, dtype=float) / np.linalg.norm(q)
    return np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )


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
    gazes, quats, labels = [], [], []
    for g, gaze in enumerate(doc["gazes"]):
        names = tuple(e.get("name") for e in gaze["entries"])
        if names != MUSCLE_NAMES:
            unknown = sorted(set(names) - set(MUSCLE_NAMES))
            raise ValueError(
                f"gaze {g}: muscles {list(names)} are not {list(MUSCLE_NAMES)}"
                + (f" (unknown: {unknown})" if unknown else "")
            )
        gazes.append((gaze["xDeg"], gaze["yDeg"]))
        labels.append(gaze.get("label"))
        if "quaternion" not in gaze:
            raise ValueError(f"gaze {g}: no quaternion (regenerate the table)")
        quats.append(gaze["quaternion"])
        for k, key in fields.items():
            columns[k].append([e[key] for e in gaze["entries"]])
    arrays = {k: np.asarray(v, dtype=float) for k, v in columns.items()}
    return ForceTable(
        muscles=MUSCLE_NAMES,
        gazes_deg=np.asarray(gazes, dtype=float),
        quaternions=np.asarray(quats, dtype=float),
        provenance=doc.get("provenance", {}),
        labels=tuple(labels),
        **arrays,
    )


# Tolerance for comparing a document's muscle numbers with the table's, mm or N/mm (numerical:
# JSON round trips of the same numbers).
_MUSCLE_TOL = 1e-9


def document_muscles(eom: dict | None = None) -> list[dict]:
    """The EOM table's six muscles in the EyeParameters `extraocularMuscles` shape (the Python
    mirror of `toDocumentMuscles` in web/packages/eye-model/src/eom/geometry.ts)."""
    eom = eom or load_eom_table()
    by_name = {m["name"]: m for m in eom["muscles"]}
    return [
        {
            "name": name,
            "originMm": list(by_name[name]["originMm"]),
            "pulleyMm": None
            if by_name[name]["pulleyMm"] is None
            else list(by_name[name]["pulleyMm"]),
            "insertionDistFromLimbusMm": by_name[name]["insertion"]["arcFromLimbusMm"],
            "insertionWidthMm": by_name[name]["insertion"]["widthMm"],
            "tendon": {
                "stiffnessNPerMm": by_name[name]["tendon"]["stiffnessNPerMm"],
                "slackLengthMm": by_name[name]["tendon"]["slackLengthMm"],
            },
        }
        for name in MUSCLE_NAMES
    ]


def check_document_muscles(doc: dict, eom: dict | None = None) -> None:
    """Raise `ValueError` when the document carries `extraocularMuscles` that differ from the
    table the force table was generated from: the forces would not belong to that geometry
    (M4 follow-up, review of edd021b). A document without muscles uses the table's."""
    muscles = doc.get("extraocularMuscles")
    if not muscles:
        return
    expected = {m["name"]: m for m in document_muscles(eom)}
    given = {m["name"]: m for m in muscles}
    if set(given) != set(expected):
        raise ValueError(
            f"extraocularMuscles names {sorted(given)} differ from the force table's "
            f"{sorted(expected)}; regenerate the force table from this document first"
        )

    def flat(m: dict) -> NDArray:
        pulley = m["pulleyMm"] if m["pulleyMm"] is not None else [np.nan] * 3
        values = [*m["originMm"], *pulley, m["insertionDistFromLimbusMm"]]
        values += [m["insertionWidthMm"], m["tendon"]["stiffnessNPerMm"]]
        return np.asarray(values + [m["tendon"]["slackLengthMm"]], dtype=float)

    differ = [
        name
        for name in MUSCLE_NAMES
        if not np.allclose(
            flat(given[name]), flat(expected[name]), atol=_MUSCLE_TOL, equal_nan=True
        )
    ]
    if differ:
        raise ValueError(
            "extraocularMuscles of " + ", ".join(differ) + " differ from data/eom/geometry-default"
            ".json, from which the force table is generated; regenerate the force table from "
            "this document first"
        )
