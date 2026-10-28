"""A small NumPy sequential ray tracer, written independently of the TypeScript one.

Every intersection (conic, toric, Zernike-perturbed) is found by Newton iteration from the
vertex plane, normals come from the sag gradient, and refraction uses the vector form of
Snell's law. Surfaces are dicts with an absolute ``vertexZMm`` (see ``cases.py``), optional
``decenterX``/``decenterY`` (mm) and ``tiltXDeg``/``tiltYDeg``. A tilted surface is rotated
about its vertex by R = Ry(tiltYDeg) Rx(tiltXDeg) (right-handed, about x first): rays are
moved into the surface's own frame, intersected there (aperture measured in the local x-y
plane), and the normal is rotated back.
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
    arg = 1 - (1 + k) * c * c * r2
    if arg < 0:
        return float("nan")  # beyond the conic's edge: no surface there
    return c * r2 / (1 + np.sqrt(arg))


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


def _rotation(s: dict) -> np.ndarray | None:
    """Local-to-global rotation of a tilted surface, None when untilted."""
    ax = np.radians(s.get("tiltXDeg", 0.0))
    ay = np.radians(s.get("tiltYDeg", 0.0))
    if ax == 0 and ay == 0:
        return None
    rx = np.array([[1, 0, 0], [0, np.cos(ax), -np.sin(ax)], [0, np.sin(ax), np.cos(ax)]])
    ry = np.array([[np.cos(ay), 0, np.sin(ay)], [0, 1, 0], [-np.sin(ay), 0, np.cos(ay)]])
    return ry @ rx


def _intersect_untilted(s: dict, p: np.ndarray, d: np.ndarray) -> tuple[np.ndarray | None, str]:
    t = (s["vertexZMm"] - p[2]) / d[2]
    for _ in range(_NEWTON_MAX):
        q = p + t * d
        f = q[2] - s["vertexZMm"] - sag(s, q[0], q[1])
        if not np.isfinite(f):
            return None, "miss"
        if abs(f) < _NEWTON_TOL:
            break
        gx, gy = _grad(s, q[0], q[1])
        t -= f / (d[2] - gx * d[0] - gy * d[1])
    else:
        return None, "miss"
    q = p + t * d
    if t <= 0:
        return None, "miss"
    if np.hypot(q[0] - s.get("decenterX", 0.0), q[1] - s.get("decenterY", 0.0)) > s[
        "apertureSemiDiamMm"
    ]:
        return None, "aperture"
    return q, "ok"


def _local(s: dict) -> dict:
    """The tilted surface in its own frame: vertex at the origin, no decenter or tilt."""
    out = dict(s, vertexZMm=0.0, decenterX=0.0, decenterY=0.0)
    out.pop("tiltXDeg", None)
    out.pop("tiltYDeg", None)
    return out


def _pivot(s: dict) -> np.ndarray:
    return np.array([s.get("decenterX", 0.0), s.get("decenterY", 0.0), s["vertexZMm"]])


def intersect_status(s: dict, p: np.ndarray, d: np.ndarray) -> tuple[np.ndarray | None, str]:
    """First intersection and "ok", or None with "miss" (no forward hit) or "aperture"."""
    rot = _rotation(s)
    if rot is None:
        return _intersect_untilted(s, p, d)
    q, status = _intersect_untilted(_local(s), rot.T @ (p - _pivot(s)), rot.T @ d)
    return (None, status) if q is None else (_pivot(s) + rot @ q, status)


def intersect(s: dict, p: np.ndarray, d: np.ndarray) -> np.ndarray | None:
    """First intersection by Newton iteration started on the vertex plane; None on failure."""
    return intersect_status(s, p, d)[0]


def normal_at(s: dict, q: np.ndarray) -> np.ndarray:
    """Unit surface normal at the global point q (either orientation)."""
    rot = _rotation(s)
    if rot is None:
        gx, gy = _grad(s, q[0], q[1])
        n = np.array([gx, gy, -1.0])
        return n / np.linalg.norm(n)
    ql = rot.T @ (q - _pivot(s))
    gx, gy = _grad(_local(s), ql[0], ql[1])
    n = rot @ np.array([gx, gy, -1.0])
    return n / np.linalg.norm(n)


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
    """Trace one ray. Returns the hit points, whether it was vignetted, the status ("ok",
    "miss", "aperture", or "tir") with the index of the failing surface, and the optical path
    Σ n·|segment| from the origin to the last hit."""
    p = np.asarray(origin, dtype=float)
    d = np.asarray(direction, dtype=float)
    d = d / np.linalg.norm(d)
    n = 1.0
    opl = 0.0
    hits: list[list[float]] = []

    def failed(status: str, i: int) -> dict:
        return {
            "hits": hits,
            "vignetted": True,
            "status": status,
            "surfaceIndex": i,
            "opticalPathMm": opl,
        }

    for i, s in enumerate(surfaces):
        q, status = intersect_status(s, p, d)
        if q is None:
            return failed(status, i)
        opl += n * float(np.linalg.norm(q - p))
        n2 = s["index"]
        out = refract(d, normal_at(s, q), n, n2)
        if out is None:
            return failed("tir", i)
        hits.append(q.tolist())
        p, d, n = q, out, n2
    return {
        "hits": hits,
        "vignetted": False,
        "status": "ok",
        "surfaceIndex": None,
        "opticalPathMm": opl,
        "direction": d.tolist(),
    }
