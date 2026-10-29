"""Visual acuity of a sphero-cylindrical refraction for the acuity onset (spec §8; M5 plan,
Task 5.11; data/acuity/watson-ahumada-2008.json).

The intended metric is Watson & Ahumada 2008, which could not be transcribed. The stand-in
(labeled "Approximation" wherever its acuity is shown): the pupil function of the refraction
error (defocus and astigmatism, OSA second-order Zernike terms) at the Watson & Yellott pupil,
its PSF and radially averaged MTF by FFT, and the letter size whose critical frequency is the
first frequency where the MTF falls below a threshold contrast, floored at a neural limit.
"""

from __future__ import annotations

import math
from functools import lru_cache

import numpy as np
from numpy.typing import NDArray

from eyebiomech.fem.data import _load, data_root

# Pupil-plane grid (numerical): at least GRID samples across the pupil and SAMPLES_PER_WAVE
# per wave of the largest wavefront slope (capped at MAX_GRID), padded by PAD: the OTF, the
# pupil's autocorrelation, spans twice the pupil, so the radial average reaches the cutoff.
# The MTF's frequency step is the sample spacing over the wavelength: 256 samples across a
# 3 mm pupil give 0.37 cycles/deg.
GRID = 256
MAX_GRID = 1024
SAMPLES_PER_WAVE = 4
PAD = 3


@lru_cache(maxsize=2)
def _table(root: str, *parts: str) -> dict:
    return _load(None, *parts)


def acuity_table() -> dict:
    return _table(str(data_root()), "acuity", "watson-ahumada-2008.json")


def pupil_table() -> dict:
    return _table(str(data_root()), "pupil", "watson-yellott-2012.json")


def pupil_diameter_mm(luminance_cd_m2: float, field_deg2: float, age_years: float, eyes: int = 2):
    """Watson & Yellott 2012 unified formula (mirror of `watsonYellottMm` in the eye model)."""
    t = pupil_table()
    sd = t["stanleyDavies"]
    m = t["monocular"]["oneEye"] if eyes == 1 else t["monocular"]["twoEyes"]
    x = ((luminance_cd_m2 * field_deg2 * m) / sd["fluxScale"]) ** sd["exponent"]
    d = sd["maxMm"] - sd["rangeMm"] * x / (x + sd["halfConstant"])
    lo, hi = t["age"]["domainYears"]
    a = min(hi, max(lo, age_years))
    g = t["age"]
    return d + (a - g["referenceYears"]) * (g["slopeIntercept"] + g["slopePerMm"] * d)


def radial_mtf(sphere_d: float, cylinder_d: float, axis_deg: float, pupil_mm: float,
               wavelength_nm: float = 555.0):  # fmt: skip
    """(frequencies in cycles/deg, radially averaged MTF) of the refraction error."""
    M = sphere_d + cylinder_d / 2
    J0 = -cylinder_d / 2 * math.cos(2 * math.radians(axis_deg))
    J45 = -cylinder_d / 2 * math.sin(2 * math.radians(axis_deg))
    r = pupil_mm / 2
    lam_um = wavelength_nm * 1e-3
    # Largest wavefront slope (µm per mm) at the pupil edge, in waves per sample.
    slope = (abs(M) + math.hypot(J0, J45)) * r / lam_um
    grid = int(min(MAX_GRID, max(GRID, math.ceil(SAMPLES_PER_WAVE * slope * 2 * r))))
    # Wavefront error over the pupil from the power vector: W = −(M (x²+y²) + J0 (x²−y²) +
    # 2 J45 x y) / 2, x, y in mm and powers in D (1/m), so W is in µm (1 D·mm² = 1 µm).
    n = grid * PAD
    x = (np.arange(n) - n / 2) * (2 * r / grid)
    X, Y = np.meshgrid(x, x, indexing="xy")
    inside = X**2 + Y**2 <= r * r
    W = -0.5 * (M * (X**2 + Y**2) + J0 * (X**2 - Y**2) + 2 * J45 * X * Y)
    P = inside * np.exp(2j * np.pi * W / lam_um)
    psf = np.abs(np.fft.fft2(P)) ** 2
    otf = np.fft.fft2(psf)
    mtf = np.abs(otf) / np.abs(otf[0, 0])
    mtf = np.fft.fftshift(mtf)
    # The OTF is the pupil function's autocorrelation: its sample k is a shift of k·dx in the
    # pupil, the spatial frequency k·dx/λ cycles per radian.
    dx = 2 * r / grid
    f_rad = dx * 1e-3 / (wavelength_nm * 1e-9)  # cycles/radian per OTF sample
    f_deg = f_rad * math.pi / 180
    k = np.arange(n) - n // 2
    K = np.hypot(*np.meshgrid(k, k, indexing="xy"))
    # Ring b holds the samples with b − 0.5 ≤ K < b + 0.5.
    ring = np.floor(K + 0.5).astype(np.int64).ravel()
    bins = np.arange(0, n // 2)
    sums = np.bincount(ring, weights=mtf.ravel(), minlength=n // 2)[: n // 2]
    counts = np.bincount(ring, minlength=n // 2)[: n // 2]
    return bins * f_deg, sums / counts


def logmar_from_refraction(
    sphere_d: float,
    cylinder_d: float,
    pupil_mm: float,
    *,
    axis_deg: float = 180.0,
    wavelength_nm: float | None = None,
) -> float:
    """logMAR of the stand-in metric (see the module notes)."""
    t = acuity_table()
    sd = t["standin"]
    f, m = radial_mtf(sphere_d, cylinder_d, axis_deg, pupil_mm, wavelength_nm or t["wavelengthNm"])
    below = np.flatnonzero(m < sd["thresholdContrast"])
    if below.size == 0:
        f_c = f[-1]
    else:
        i = int(below[0])  # the first crossing (spurious resolution beyond it is ignored)
        f0, f1, m0, m1 = f[i - 1], f[i], m[i - 1], m[i]
        f_c = f0 + (m0 - sd["thresholdContrast"]) * (f1 - f0) / (m0 - m1)
    return float(max(sd["floorLogMAR"], math.log10(30.0 / f_c)))


def acuity_pupil_mm(age_years: float) -> float:
    """The pupil of the acuity onset: Watson & Yellott at the table's luminance and field."""
    p = acuity_table()["pupil"]
    return pupil_diameter_mm(p["luminanceCdM2"], p["fieldDeg2"], age_years, p["eyes"])


# The lookup table of the stand-in (data/acuity/standin-table.json): logMAR on a grid of
# residual spherical blur |M|, astigmatic blur |J|, and pupil diameter, interpolated
# trilinearly (numerical: steps chosen so interpolation differs from direct evaluation by
# under 0.02 logMAR near the 0.3 threshold, checked in tests/test_acuity.py; up to about 0.06
# where the metric leaves its floor, near logMAR 0, which no onset uses). The pupil axis
# spans 2-4 mm: the acuity pupil (`acuity_pupil_mm`) is 2.5-2.9 mm over ages 6-90.
TABLE_M = np.round(np.arange(0.0, 4.0001, 0.125), 6)
TABLE_J = np.round(np.arange(0.0, 1.5001, 0.125), 6)
TABLE_PUPIL = np.round(np.arange(2.0, 4.0001, 0.25), 6)


def build_standin_table() -> dict:
    """Evaluate the stand-in on the table grid (|M| as myopic defocus, J as J0)."""
    values = np.array(
        [[[logmar_from_refraction(-m + j, -2 * j, p) for p in TABLE_PUPIL] for j in TABLE_J]
         for m in TABLE_M]
    )  # fmt: skip
    return {
        "description": "logMAR of the acuity stand-in (eyebiomech.predict.acuity) on a grid of "
        "residual spherical blur |M| (D), astigmatic blur |J| = |C|/2 (D), and pupil diameter "
        "(mm); generated by `uv run python -m eyebiomech.predict.acuity`.",
        "absM": TABLE_M.tolist(),
        "absJ": TABLE_J.tolist(),
        "pupilMm": TABLE_PUPIL.tolist(),
        "logMAR": np.round(values, 5).tolist(),
    }


@lru_cache(maxsize=2)
def _interpolator(root: str):
    from scipy.interpolate import RegularGridInterpolator

    t = _load(None, "acuity", "standin-table.json")
    grid = (np.array(t["absM"]), np.array(t["absJ"]), np.array(t["pupilMm"]))
    return RegularGridInterpolator(grid, np.array(t["logMAR"]), bounds_error=False, fill_value=None)


def logmar_lookup(abs_m, abs_j, pupil_mm) -> NDArray:
    """Interpolated stand-in logMAR; inputs are clipped to the table's ranges."""
    m = np.clip(np.asarray(abs_m, dtype=float), TABLE_M[0], TABLE_M[-1])
    j = np.clip(np.asarray(abs_j, dtype=float), TABLE_J[0], TABLE_J[-1])
    p = np.clip(np.asarray(pupil_mm, dtype=float), TABLE_PUPIL[0], TABLE_PUPIL[-1])
    m, j, p = np.broadcast_arrays(m, j, p)
    pts = np.stack([m.ravel(), j.ravel(), p.ravel()], axis=1)
    return _interpolator(str(data_root()))(pts).reshape(m.shape)


if __name__ == "__main__":
    import json

    out = data_root() / "acuity" / "standin-table.json"
    out.write_text(json.dumps(build_standin_table(), separators=(",", ":")) + "\n")
    print(f"wrote {out}")
