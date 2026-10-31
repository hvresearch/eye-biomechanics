"""The command line's exit codes (M6 plan, Task 6.5)."""

import json
import shutil
from pathlib import Path

from eyebiomech.cli import main
from eyebiomech.fem.data import DATA_DIR


def test_fem_exits_2_on_an_infeasible_gaze_and_names_it(tmp_path, capsys):
    """M5 review round 2: no muscle forces within capacity balance an orbit 10⁴ times stiffer
    than the table's at 15° abduction; the command fails before meshing, naming the gaze."""
    root = tmp_path / "data"
    shutil.copytree(DATA_DIR, root)
    path = root / "eom" / "passive-orbit.json"
    table = json.loads(path.read_text())
    table["stiffnessGfPerDeg"] = {k: v * 1e4 for k, v in table["stiffnessGfPerDeg"].items()}
    path.write_text(json.dumps(table))
    out = tmp_path / "x.eye.json"
    argv = ["--data-root", str(root), "fem", "--eye",
            str(root / "fixtures" / "navarro-1985-preset.eye.json"), "--gaze", "15,0",
            "--out", str(out)]  # fmt: skip
    assert main(argv) == 2
    err = capsys.readouterr().err
    assert "gaze 15,0" in err and "within capacity" in err
    assert not out.exists()


def test_calibrate_records_the_tree_as_the_run_starts(tmp_path, monkeypatch):
    """M6 plan, Task 6.6: the provenance hash is read when the run starts, so outputs that other
    runs write meanwhile do not mark it dirty (and changes made meanwhile do not hide)."""
    import itertools

    import eyebiomech.calib.cli as calib_cli

    hashes = itertools.chain(["at-start"], itertools.repeat("later"))
    monkeypatch.setattr(calib_cli, "_git_hash", lambda: next(hashes))
    out = tmp_path / "posterior.json"
    library = Path(__file__).parent / "fixtures" / "library-coarse.json"
    code = main(["calibrate", "--method", "lsq", "--library", str(library), "--out", str(out)])
    assert code == 0
    doc = json.loads(out.read_text())
    assert doc["provenance"]["gitHash"] == "at-start"
    assert doc["fixed"] == {} and len(doc["starts"]) == 1 and doc["chainSegments"] is None
