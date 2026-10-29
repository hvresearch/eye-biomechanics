"""OSA/ANSI Z80.28 Zernike polynomials, as in web/packages/optics/src/math/zernike.ts.

Single index j = (n(n + 2) + m) / 2, unit-RMS normalization on the unit disk,
Z = N R_n^|m|(ρ) cos(mθ) for m ≥ 0 and N R_n^|m|(ρ) sin(|m|θ) for m < 0, θ from +x toward +y.
"""

from __future__ import annotations

from math import factorial

import numpy as np
from numpy.typing import NDArray


def zernike_index(j: int) -> tuple[int, int]:
    if j < 0:
        raise ValueError(f"Zernike index must be non-negative, got {j}")
    n = 0
    while (n + 1) * (n + 2) // 2 <= j:
        n += 1
    return n, 2 * j - n * (n + 2)


def zernike_count(max_order: int) -> int:
    return (max_order + 1) * (max_order + 2) // 2


def _radial(n: int, m: int, rho: NDArray) -> NDArray:
    m = abs(m)
    out = np.zeros_like(rho, dtype=float)
    for s in range((n - m) // 2 + 1):
        c = (-1) ** s * factorial(n - s)
        c /= factorial(s) * factorial((n + m) // 2 - s) * factorial((n - m) // 2 - s)
        out = out + c * rho ** (n - 2 * s)
    return out


def zernike_value(j: int, rho, theta) -> NDArray:
    rho = np.asarray(rho, dtype=float)
    theta = np.asarray(theta, dtype=float)
    n, m = zernike_index(j)
    norm = np.sqrt(n + 1) if m == 0 else np.sqrt(2 * (n + 1))
    r = _radial(n, m, rho)
    if m > 0:
        return norm * r * np.cos(m * theta)
    if m < 0:
        return norm * r * np.sin(-m * theta)
    return norm * r


def zernike_matrix(max_order: int, rho, theta) -> NDArray:
    """Design matrix (N points, zernike_count(max_order) terms)."""
    return np.stack(
        [zernike_value(j, rho, theta) for j in range(zernike_count(max_order))], axis=-1
    )
