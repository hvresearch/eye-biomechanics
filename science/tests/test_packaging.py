"""Schemas ship inside the package (M0 follow-up) and match the repository's copies."""

import subprocess
import zipfile
from importlib.resources import files
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]


@pytest.mark.parametrize("name", ["eye-parameters.schema.json", "deformation.schema.json"])
def test_package_schemas_equal_the_repository_schemas(name):
    packaged = files("eyebiomech").joinpath("schemas", name)
    assert packaged.is_file()
    assert packaged.read_bytes() == (ROOT / "schemas" / name).read_bytes()


@pytest.mark.slow
def test_the_wheel_contains_the_schemas(tmp_path):
    subprocess.run(
        ["uv", "build", "--wheel", "--out-dir", str(tmp_path)],
        cwd=ROOT / "science",
        check=True,
        capture_output=True,
    )
    wheel = next(tmp_path.glob("*.whl"))
    names = zipfile.ZipFile(wheel).namelist()
    for name in ("eye-parameters.schema.json", "deformation.schema.json"):
        assert f"eyebiomech/schemas/{name}" in names
