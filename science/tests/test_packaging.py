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


def test_data_root_follows_the_override_and_the_environment(tmp_path, monkeypatch):
    from eyebiomech.fem import data

    assert (data.data_root() / "materials" / "cornea-sclera.json").is_file()
    monkeypatch.setenv("EYEBIOMECH_DATA", str(tmp_path))
    assert data.data_root() == tmp_path
    with data.data_root_override(ROOT / "data"):
        assert data.data_root() == ROOT / "data"
    assert data.data_root() == tmp_path


@pytest.mark.slow
def test_the_installed_wheel_finds_its_bundled_tables(tmp_path):
    """Outside a checkout the package reads the tables it ships (M4 follow-up: `DATA_DIR` pointed
    into the repository, so the installed wheel's `eyebiomech fem` could not find them)."""
    subprocess.run(
        ["uv", "build", "--wheel", "--out-dir", str(tmp_path)],
        cwd=ROOT / "science",
        check=True,
        capture_output=True,
    )
    wheel = next(tmp_path.glob("*.whl"))
    names = zipfile.ZipFile(wheel).namelist()
    for rel in (
        "materials/cornea-sclera.json",
        "eom/geometry-default.json",
        "results/forces/default.json",
    ):
        assert f"eyebiomech/data/{rel}" in names
    code = (
        "from eyebiomech.fem.data import data_root, load_materials; "
        "r = data_root(); print(r); assert 'site-packages' in str(r), r; load_materials()"
    )
    done = subprocess.run(
        ["uv", "run", "--isolated", "--no-project", "--with", str(wheel), "python", "-c", code],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        env={k: v for k, v in __import__("os").environ.items() if k != "EYEBIOMECH_DATA"},
    )
    assert done.returncode == 0, done.stderr
