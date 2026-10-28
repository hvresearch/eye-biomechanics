"""A small NumPy sequential ray tracer, written independently of the TypeScript one.

Every intersection (conic, toric, Zernike-perturbed) is found by Newton iteration from the
vertex plane, normals come from the sag gradient, and refraction uses the vector form of
Snell's law. Surfaces are dicts with an absolute ``vertexZMm`` (see ``cases.py``).
"""

from __future__ import annotations

from math import factorial

import numpy as np

_NEWTON_TOL = 1e-12
_NEWTON_MAX = 50
_FD_STEP = 1e-6


def _osa_nm(j: int) -> tuple[int, int]:
    n = 0
    while (n + 1) * (n + 2) // 2 <= j:
        n += 1
    m = 2 * j - n * (n + 2)
    return n, m


def zernike(j: int, rho: float, theta: float) -> float:
    """OSA/ANSI normalized Zernike polynomial Z_j(rho, theta)."""
    n, m = _osa_nm(j)
    am = abs(m)
    radial = sum(
        (-1) ** s
        * factorial(n - s)
        / (factorial(s) * factorial((n + am) // 2 - s) * factorial((n - am) // 2 - s))
        * rho ** (n - 2 * s)
        for s in range((n - am) // 2 + 1)
    )
    norm = np.sqrt(2 * (n + 1) / (2 if m == 0 else 1))
    if m > 0:
        return norm * radial * np.cos(m * theta)
    if m < 0:
        return norm * radial * np.sin(am * theta)
    return norm * radial


def _conic_sag(c: float, k: float, r2: float) -> float:
    if c == 0:
        return 0.0
    return c * r2 / (1 + np.sqrt(1 - (1 + k) * c * c * r2))


def _curv(radius: float) -> float:
    return 0.0 if np.isinf(radius) else 1.0 / radius


def sag(s: dict, x: float, y: float) -> float:
    dx = x - s.get("decenterX", 0.0)
    dy = y - s.get("decenterY", 0.0)
    kind = s["kind"]
    if kind == "conic":
        return _conic_sag(_curv(s["radiusMm"]), s["conic"], dx * dx + dy * dy)
    if kind == "toric":
        a = np.radians(s["axisDeg"])
        u = dx * np.cos(a) + dy * np.sin(a)
        v = -dx * np.sin(a) + dy * np.cos(a)
        cx, cy = _curv(s["rxMm"]), _curv(s["ryMm"])
        arg = 1 - (1 + s["conicX"]) * cx * cx * u * u - (1 + s["conicY"]) * cy * cy * v * v
        return (cx * u * u + cy * v * v) / (1 + np.sqrt(arg))
    if kind == "zernike":
        base = _conic_sag(_curv(s["radiusMm"]), s["conic"], dx * dx + dy * dy)
        rho = np.hypot(dx, dy) / s["normRadiusMm"]
        theta = np.arctan2(dy, dx)
        h = sum(c * zernike(j, rho, theta) for j, c in enumerate(s["coeffsMicrons"]))
        return base + 1e-3 * h
    raise ValueError(f"unknown surface kind {kind}")


def _grad(s: dict, x: float, y: float) -> tuple[float, float]:
    h = _FD_STEP
    return (
        (sag(s, x + h, y) - sag(s, x - h, y)) / (2 * h),
        (sag(s, x, y + h) - sag(s, x, y - h)) / (2 * h),
    )


def intersect(s: dict, p: np.ndarray, d: np.ndarray) -> np.ndarray | None:
    """First intersection by Newton iteration started on the vertex plane; None on failure."""
    t = (s["vertexZMm"] - p[2]) / d[2]
    for _ in range(_NEWTON_MAX):
        q = p + t * d
        f = q[2] - s["vertexZMm"] - sag(s, q[0], q[1])
        if not np.isfinite(f):
            return None
        if abs(f) < _NEWTON_TOL:
            break
        gx, gy = _grad(s, q[0], q[1])
        t -= f / (d[2] - gx * d[0] - gy * d[1])
    else:
        return None
    q = p + t * d
    if t <= 0 or np.hypot(q[0] - s.get("decenterX", 0.0), q[1] - s.get("decenterY", 0.0)) > s[
        "apertureSemiDiamMm"
    ]:
        return None
    return q


def refract(d: np.ndarray, n_surf: np.ndarray, n1: float, n2: float) -> np.ndarray | None:
    """Vector Snell's law; the normal may face either way. None on total internal reflection."""
    cos_i = -float(np.dot(d, n_surf))
    if cos_i < 0:
        n_surf, cos_i = -n_surf, -cos_i
    eta = n1 / n2
    k = 1 - eta * eta * (1 - cos_i * cos_i)
    if k < 0:
        return None
    out = eta * d + (eta * cos_i - np.sqrt(k)) * n_surf
    return out / np.linalg.norm(out)


def trace(surfaces: list[dict], origin, direction) -> dict:
    """Trace one ray; returns the hit points and whether it was vignetted."""
    p = np.asarray(origin, dtype=float)
    d = np.asarray(direction, dtype=float)
    d = d / np.linalg.norm(d)
    n = 1.0
    hits: list[list[float]] = []
    for s in surfaces:
        q = intersect(s, p, d)
        if q is None:
            return {"hits": hits, "vignetted": True}
        gx, gy = _grad(s, q[0], q[1])
        normal = np.array([gx, gy, -1.0])
        normal /= np.linalg.norm(normal)
        n2 = s["index"]
        out = refract(d, normal, n, n2)
        if out is None:
            return {"hits": hits, "vignetted": True}
        hits.append(q.tolist())
        p, d, n = q, out, n2
    return {"hits": hits, "vignetted": False, "direction": d.tolist()}
