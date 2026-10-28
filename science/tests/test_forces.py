"""Muscle force table exported by the TypeScript eye model (data/results/forces/default.json)."""

import copy
import json

import numpy as np
import pytest

from eyebiomech.fem.data import DATA_DIR, load_eom_table
from eyebiomech.forces.from_viewer import MUSCLE_NAMES, ForceTable, load_force_table

TABLE_PATH = DATA_DIR / "results" / "forces" / "default.json"


def test_loads_the_committed_table_with_array_shapes():
    t = load_force_table(TABLE_PATH)
    assert isinstance(t, ForceTable)
    assert t.muscles == MUSCLE_NAMES
    assert t.gazes_deg.shape == (25, 2)
    for arr in (t.insertion_mm, t.pull_dir, t.insertion_dir, t.tangent_mm):
        assert arr.shape == (25, 6, 3)
    for arr in (t.force_n, t.width_mm, t.arc_mm):
        assert arr.shape == (25, 6)
    assert np.allclose(np.linalg.norm(t.pull_dir, axis=-1), 1)
    # Antagonists relax to zero activation at the lattice corners; every muscle pulls in primary.
    assert np.all(t.force_n >= 0)
    assert np.all(t.force_n[t.at(0, 0)] > 0)


def test_lookup_by_gaze():
    t = load_force_table(TABLE_PATH)
    i = t.at(0, 0)
    assert tuple(t.gazes_deg[i]) == (0.0, 0.0)
    with pytest.raises(KeyError):
        t.at(1.0, 0.0)


def test_python_muscle_order_matches_the_eom_table_and_typescript():
    eom_names = {m["name"] for m in load_eom_table()["muscles"]}
    assert set(MUSCLE_NAMES) == eom_names
    raw = json.loads(TABLE_PATH.read_text())
    assert tuple(raw["muscles"]) == MUSCLE_NAMES


def _write(tmp_path, doc):
    p = tmp_path / "t.json"
    p.write_text(json.dumps(doc))
    return p


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda d: d.update(schema="eye-forces/2"), "schema"),
        (lambda d: d.update(frame="left eye, x nasal"), "frame"),
        (lambda d: d.update(muscles=d["muscles"][:5]), "muscles"),
        (lambda d: d["gazes"][3]["entries"].pop(), "gaze 3"),
        (lambda d: d["gazes"][0]["entries"][0].update(name="levator"), "levator"),
    ],
)
def test_rejects_malformed_tables(tmp_path, mutate, message):
    doc = copy.deepcopy(json.loads(TABLE_PATH.read_text()))
    mutate(doc)
    with pytest.raises(ValueError, match=message):
        load_force_table(_write(tmp_path, doc))
