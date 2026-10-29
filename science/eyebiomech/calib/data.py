"""Loaders for the population calibration targets (data/population; M5 plan, Task 5.9)."""

from __future__ import annotations

from dataclasses import dataclass

from eyebiomech.fem.data import _load

CLASSES = ("wtr", "atr", "oblique")
# Proportions of a band may miss 1 by rounding (numerical tolerance on the transcription).
SUM_TOLERANCE = 0.02


@dataclass(frozen=True)
class AxisBand:
    age_from: float
    age_to: float
    n: int | None
    proportions: dict[str, float]


@dataclass(frozen=True)
class AxisShiftSource:
    id: str
    measure: str
    use_in_fit: bool
    fit_classes: tuple[str, ...]
    bands: tuple[AxisBand, ...]
    threshold_d: float


@dataclass(frozen=True)
class J0SlopeSource:
    id: str
    slope_d_per_year: float
    se_d_per_year: float
    age_from: float
    age_to: float
    use_in_fit: bool


def load_axis_shift(path=None) -> list[AxisShiftSource]:
    t = _load(path, "population", "axis-shift-by-age.json")
    threshold = float(t["definition"]["cylinderThresholdD"])
    out = []
    for s in t["sources"]:
        bands = []
        for b in s["bands"]:
            p = {c: float(b[c]) for c in CLASSES}
            if abs(sum(p.values()) - 1.0) > SUM_TOLERANCE:
                raise ValueError(
                    f"{s['id']}: band {b['ageFrom']}-{b['ageTo']} sums to {sum(p.values())}"
                )
            if not (0 <= b["ageFrom"] < b["ageTo"] <= 100):
                raise ValueError(f"{s['id']}: band ages {b['ageFrom']}-{b['ageTo']} are invalid")
            bands.append(AxisBand(float(b["ageFrom"]), float(b["ageTo"]), b.get("n"), p))
        ages = [b.age_from for b in bands]
        if ages != sorted(ages):
            raise ValueError(f"{s['id']}: bands must be in increasing age")
        out.append(
            AxisShiftSource(
                id=s["id"],
                measure=s["measure"],
                use_in_fit=bool(s["useInFit"]),
                fit_classes=tuple(s.get("fitClasses", CLASSES)),
                bands=tuple(bands),
                threshold_d=threshold,
            )
        )
    return out


@dataclass(frozen=True)
class SphereBound:
    """An envelope on the six-year (or `interval_years`) change of the cohort's mean spherical
    equivalent for subjects of baseline ages `age_from`..`age_to` (Task 5.14 Step 6)."""

    id: str
    age_from: float
    age_to: float
    interval_years: float
    bound_d: float
    se_d: float


def load_sphere_bounds(path=None) -> list[SphereBound]:
    t = _load(path, "population", "refraction-by-age.json")
    return [
        SphereBound(
            id=s["id"],
            age_from=float(b["ageFrom"]),
            age_to=float(b["ageTo"]),
            interval_years=float(s["intervalYears"]),
            bound_d=abs(float(b["changeD"])),
            se_d=float(s["boundStandardErrorD"]),
        )
        for s in t["sources"]
        if s["quantity"] == "meanSphericalEquivalentChange" and s.get("useAsBound")
        for b in s["bands"]
    ]


def load_j0_slopes(path=None) -> list[J0SlopeSource]:
    t = _load(path, "population", "refraction-by-age.json")
    return [
        J0SlopeSource(
            id=s["id"],
            slope_d_per_year=float(s["value"]),
            se_d_per_year=float(s["standardErrorDPerYear"]),
            age_from=float(s["ageFrom"]),
            age_to=float(s["ageTo"]),
            use_in_fit=bool(s["useInFit"]),
        )
        for s in t["sources"]
        if s["quantity"] == "meanJ0SlopeDPerYear"
    ]
