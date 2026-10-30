"""Paraxial refraction of an EyeParameters document from its surfaces' vertex curvatures, and
the induced refraction between two documents (M5 plan, Task 5.8).

Each meridian θ (from +x, temporal for the right eye, toward +y) is traced with a 2 × 2 ABCD
matrix of refractions (power (n' − n)·c(θ), c the vertex curvature along that meridian) and
transfers (thickness / n), from air at the anterior cornea to the retina; the far-point vergence
is A/B (a diverging pencil has negative vergence V and slope n·u = −V·y, so the image height
(A − B·V)·y vanishes at V = A/B). As in the viewer (`buildSurfacesAt`), the retina lies at
`axialLengthMm` from the anterior vertex: the last surface's own thickness is not used. The
vertex curvature of a Zernike surface adds 2·(ρ² coefficient)·c_j/a² of its
m = 0, ±2 terms (as `zernikeMeridianCurvature` in web/packages/optics), a toric's is
cos²/rx + sin²/ry about its axis. Refractions are at the corneal vertex, 555 nm indices, on the
optical axis (tilt, decenter, and the visual axis ignored: approximation, as the viewer's
paraxial readouts). Power vectors are clinical (minus cylinder, TABO, right eye: J45 changes
sign from the model frame, whose angle runs from the temporal side toward superior).

Agreement with the viewer's induced refraction (wavefront, paraxial Zernike method) is checked
on data/oracle/induced-refraction.json.
"""

from __future__ import annotations

from math import factorial, sqrt

import numpy as np

from eyebiomech.zernike import zernike_index


def rho2_coefficient(j: int) -> float:
    """Coefficient of ρ² in N·R_n^|m|(ρ) (nonzero for m = 0, ±2 and even n ≥ 2)."""
    n, m = zernike_index(j)
    am = abs(m)
    if n < 2 or am not in (0, 2) or (n - am) % 2:
        return 0.0
    s = (n - 2) // 2
    c = (-1) ** s * factorial(n - s)
    c /= factorial(s) * factorial((n + am) // 2 - s) * factorial((n - am) // 2 - s)
    norm = sqrt(n + 1) if m == 0 else sqrt(2 * (n + 1))
    return norm * c


def _curvature(radius: float) -> float:
    return 0.0 if not np.isfinite(radius) or radius == 0 else 1.0 / radius


def meridian_curvature(surface: dict, theta_rad: float) -> float:
    """Vertex curvature of a surface along the meridian at `theta_rad`, per mm."""
    kind = surface["type"]
    if kind == "toric":
        d = theta_rad - np.radians(surface["axisDeg"])
        return (
            _curvature(surface["rxMm"]) * np.cos(d) ** 2
            + _curvature(surface["ryMm"]) * np.sin(d) ** 2
        )
    c = _curvature(surface["radiusMm"])
    if kind == "zernike":
        z = surface["zernikeHeight"]
        a2 = z["normRadiusMm"] ** 2
        for j, coef in enumerate(z["coeffsMicrons"]):
            r2 = rho2_coefficient(j)
            if r2 == 0 or coef == 0:
                continue
            m = zernike_index(j)[1]
            ang = 1.0 if m == 0 else np.cos(2 * theta_rad) if m > 0 else np.sin(2 * theta_rad)
            c += 2 * r2 * coef * 1e-3 * ang / a2
    elif kind != "conic":
        raise ValueError(f"unknown surface type {kind!r}")
    return float(c)


def meridian_refraction(doc: dict, theta_rad: float) -> float:
    """Far-point vergence at the corneal vertex in the meridian, D."""
    surfaces = doc["surfaces"]
    vitreous = doc["axialLengthMm"] - sum(s["thicknessToNextMm"] for s in surfaces[:-1])
    if not vitreous > 0:
        raise ValueError(f"axialLengthMm {doc['axialLengthMm']} leaves no room for the vitreous")
    n_before = 1.0
    A, B, C, D = 1.0, 0.0, 0.0, 1.0
    for i, s in enumerate(surfaces):
        n_after = s["mediumAfter"]["index555"]
        power = (n_after - n_before) * meridian_curvature(s, theta_rad)
        A, B, C, D = A, B, C - power * A, D - power * B  # refraction
        thickness = vitreous if i == len(surfaces) - 1 else s["thicknessToNextMm"]
        t = thickness / n_after
        A, B, C, D = A + t * C, B + t * D, C, D  # transfer
        n_before = n_after
    if B == 0:
        raise ValueError("the eye images every point at the retina (B = 0)")
    return float(A / B * 1000.0)


def refraction(doc: dict) -> dict[str, float]:
    """Clinical power vector (M, J0, J45) of the relaxed document, D."""
    r = {deg: meridian_refraction(doc, np.radians(deg)) for deg in (0, 45, 90, 135)}
    M = (r[0] + r[90]) / 2
    J0 = (r[0] - r[90]) / 2
    J45_model = (r[45] - r[135]) / 2
    return {"M": M, "J0": J0, "J45": -J45_model}  # TABO for the right eye


def induced_refraction(reference: dict, loaded: dict) -> dict[str, float]:
    """Loaded minus reference power vector, D."""
    a, b = refraction(loaded), refraction(reference)
    return {k: a[k] - b[k] for k in ("M", "J0", "J45")}


def refraction_from_vector(M: float, J0: float, J45: float) -> tuple[float, float, float]:
    """(sphere, cylinder ≤ 0, axis in (0, 180]) of a clinical power vector (Thibos 1997)."""
    C = -2 * float(np.hypot(J0, J45))
    S = M - C / 2
    axis = 90.0 if C == 0 else float(np.degrees(0.5 * np.arctan2(J45, J0)))
    axis = axis % 180.0
    return S, C, 180.0 if axis == 0 else axis
