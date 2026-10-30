"""The command line's exit codes (M6 plan, Task 6.5)."""

import json
import shutil

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
