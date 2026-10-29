"""Download the NHANES vision-examination files and summarize refractions by age (M5 plan,
Task 5.9). Not run in the cloud session (cdc.gov is unreachable there); the files land in
data/large/nhanes/, which is gitignored.

    uv run python -m eyebiomech.calib.download_nhanes data/large/nhanes

The file names follow NHANES's cycle naming and are unverified (the session could not list
them). Reading the SAS transport (.XPT) files needs pandas, which is not a dependency of the
package: install it in the environment you run this in. `summarize` works on plain rows, so
the conversion is separate from the statistics and testable without pandas.
"""

from __future__ import annotations

import sys
import urllib.request
from collections.abc import Iterable, Mapping
from pathlib import Path

import numpy as np

BASE = "https://wwwn.cdc.gov/Nchs/Nhanes"
# Cycle → file name (unverified; see the module notes).
FILES = {
    "1999-2000": "VIX.XPT",
    "2001-2002": "VIX_B.XPT",
    "2003-2004": "VIX_C.XPT",
    "2005-2006": "VIX_D.XPT",
    "2007-2008": "VIX_E.XPT",
}
# Age bands of the summary, years (a reporting choice).
BANDS = ((20, 30), (30, 40), (40, 50), (50, 60), (60, 70), (70, 86))


def download(out_dir: Path | str) -> list[Path]:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    paths = []
    for cycle, name in FILES.items():
        target = out / f"{cycle}-{name}"
        if not target.exists():
            urllib.request.urlretrieve(f"{BASE}/{cycle}/{name}", target)  # noqa: S310
        paths.append(target)
    return paths


def summarize(
    rows: Iterable[Mapping],
    *,
    age: str,
    sphere: str,
    cylinder: str,
    axis: str,
    threshold_d: float = 0.5,
) -> dict:
    """Per age band: n, mean M, mean J0, and the WTR/ATR/oblique proportions among eyes with
    |cylinder| ≥ threshold (classes by minus-cylinder axis within 30° of 180 or 90). Rows
    missing a value are skipped; positive cylinders are transposed to minus form."""
    data = []
    for r in rows:
        try:
            a, s, c, x = (float(r[k]) for k in (age, sphere, cylinder, axis))
        except (KeyError, TypeError, ValueError):
            continue
        if not all(np.isfinite([a, s, c, x])):
            continue
        if c > 0:  # plus to minus cylinder
            s, c, x = s + c, -c, (x + 90) % 180
        data.append((a, s, c, x % 180))
    out = {}
    for lo, hi in BANDS:
        band = [d for d in data if lo <= d[0] < hi]
        if not band:
            continue
        a, s, c, x = (np.array(v) for v in zip(*band, strict=True))
        theta = np.radians(x)
        M = s + c / 2
        J0 = -c / 2 * np.cos(2 * theta)
        astig = np.abs(c) >= threshold_d
        ax = x[astig]
        wtr = np.sum((ax <= 30) | (ax >= 150))
        atr = np.sum((ax >= 60) & (ax <= 120))
        k = max(int(astig.sum()), 1)
        out[f"{lo}-{hi}"] = {
            "n": len(band),
            "meanM": float(M.mean()),
            "meanJ0": float(J0.mean()),
            "astigmatic": int(astig.sum()),
            "wtr": float(wtr / k),
            "atr": float(atr / k),
            "oblique": float((astig.sum() - wtr - atr) / k),
        }
    return out


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    out = Path(argv[0]) if argv else Path("data/large/nhanes")
    for p in download(out):
        print(p)
    return 0


if __name__ == "__main__":
    sys.exit(main())
