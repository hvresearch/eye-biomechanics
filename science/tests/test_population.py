"""Population calibration targets (M5 plan, Task 5.9)."""

import json

import pytest

from eyebiomech.calib.data import CLASSES, load_axis_shift, load_j0_slopes
from eyebiomech.calib.download_nhanes import summarize
from eyebiomech.fem.data import DATA_DIR


def test_axis_shift_sources_load_and_are_proportions():
    sources = load_axis_shift()
    assert any(s.use_in_fit for s in sources)
    for s in sources:
        for b in s.bands:
            assert sum(b.proportions.values()) == pytest.approx(1.0, abs=0.02)
            assert 0 <= b.age_from < b.age_to <= 100
        assert set(s.fit_classes) <= set(CLASSES)


def test_the_fitted_bands_shift_from_wtr_to_atr_with_age():
    """The data the calibration targets show the shift it is about (spec §8)."""
    bands = sorted(
        (b for s in load_axis_shift() if s.use_in_fit for b in s.bands), key=lambda b: b.age_from
    )
    assert bands[0].proportions["wtr"] > bands[0].proportions["atr"]
    assert bands[-1].proportions["atr"] > bands[-1].proportions["wtr"]


def test_j0_slopes_are_negative():
    slopes = [s for s in load_j0_slopes() if s.use_in_fit]
    assert slopes and all(s.slope_d_per_year < 0 < s.se_d_per_year for s in slopes)


def test_every_source_names_its_citation_and_status():
    for name in ("axis-shift-by-age.json", "refraction-by-age.json"):
        t = json.loads((DATA_DIR / "population" / name).read_text())
        for s in t["sources"]:
            assert s["citation"] and s["verified"] is False and "useInFit" in s


def test_a_malformed_band_is_refused(tmp_path):
    t = json.loads((DATA_DIR / "population" / "axis-shift-by-age.json").read_text())
    t["sources"][0]["bands"][0]["wtr"] = 0.9
    p = tmp_path / "bad.json"
    p.write_text(json.dumps(t))
    with pytest.raises(ValueError, match="sums to"):
        load_axis_shift(p)


def test_nhanes_summary_of_a_synthetic_file():
    """20 rows: 10 aged 25 (WTR, one plus-cylinder row transposed), 10 aged 65 (ATR), one row
    with a missing value."""
    rows = [{"age": 25, "sph": 0.0, "cyl": -1.0, "axis": 180} for _ in range(9)]
    rows.append({"age": 25, "sph": -1.0, "cyl": 1.0, "axis": 90})  # = 0.0 −1.0 × 180
    rows += [{"age": 65, "sph": 0.5, "cyl": -1.0, "axis": 90} for _ in range(9)]
    rows.append({"age": 65, "sph": "", "cyl": -1.0, "axis": 90})
    out = summarize(rows, age="age", sphere="sph", cylinder="cyl", axis="axis")
    young, old = out["20-30"], out["60-70"]
    assert young["n"] == 10 and young["wtr"] == 1.0 and young["meanJ0"] == pytest.approx(0.5)
    assert old["n"] == 9 and old["atr"] == 1.0 and old["meanJ0"] == pytest.approx(-0.5)
    assert old["meanM"] == pytest.approx(0.0)
