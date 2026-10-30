"""Scleral height maps: the radial change of the outer scleral surface fitted in Zernike
polynomials (spec §7 "scleral shape, fitted to Zernike height maps"; M4 Deviation 17; M5 plan,
Task 5.5).

The posterior hemisphere of the outer surface is mapped to a disk by the stereographic
projection about the posterior pole, from the anterior pole: a point at angle α from the
posterior pole lies at ρ = 2R tan(α/2) (R the scleral radius), so the equator falls at
ρ = 2R, the normalization radius. The azimuth is atan2(y, x) in the FEM frame (x temporal,
y superior). The fitted quantity is the radial displacement of the outer-surface nodes (µm),
loaded minus reference, in the lens-relative field the exporter uses for the cornea.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

from eyebiomech.fem.mesh import ShellMesh
from eyebiomech.zernike import zernike_count, zernike_value

# Order of the scleral fit (numerical: 28 terms resolve the patterns of six insertions and
# the orbital reaction; the fit refuses fewer than three samples per term).
SCLERAL_MAX_ORDER = 6
PROJECTION = (
    "stereographic about the posterior pole from the anterior pole, rho = 2R tan(alpha/2), "
    "alpha the angle from the posterior pole, equator at rho = 2R; azimuth atan2(y, x) in the "
    "FEM frame (x temporal, y superior)"
)


def projected_coordinates(X: NDArray, sclera_radius_mm: float) -> tuple[NDArray, NDArray, NDArray]:
    """Normalized stereographic radius ρ/(2R), azimuth, and the posterior-hemisphere mask of
    points X (3, N)."""
    d = X / np.linalg.norm(X, axis=0)
    alpha = np.arccos(np.clip(d[2], -1.0, 1.0))  # from the posterior pole (+z)
    rho = np.tan(alpha / 2)  # 2R tan(α/2) / (2R)
    return rho, np.arctan2(X[1], X[0]), d[2] >= 0


def _outer_nodes(shell: ShellMesh) -> NDArray:
    X = shell.mesh.doflocs
    theta = shell.geometry.polar(X)
    return np.abs(np.linalg.norm(X, axis=0) - shell.geometry.r_out(theta)) < 1e-9


def scleral_maps(
    shell: ShellMesh, U_ref: NDArray, U_load: NDArray, max_order: int = SCLERAL_MAX_ORDER
) -> dict:
    """The fit, as the sidecar's `scleralMaps` block."""
    X = shell.mesh.doflocs
    rho, phi, posterior = projected_coordinates(X, shell.sclera_radius_mm)
    sel = _outer_nodes(shell) & posterior
    n_terms = zernike_count(max_order)
    if np.count_nonzero(sel) < 3 * n_terms:
        raise ValueError(
            f"{np.count_nonzero(sel)} posterior outer-surface nodes; need {3 * n_terms} for "
            f"order {max_order}"
        )
    dU = (np.asarray(U_load) - np.asarray(U_ref))[:, sel]
    radial = np.sum(dU * X[:, sel], axis=0) / np.linalg.norm(X[:, sel], axis=0) * 1e3  # µm
    Z = np.stack([zernike_value(j, rho[sel], phi[sel]) for j in range(n_terms)], axis=1)
    coeffs, *_ = np.linalg.lstsq(Z, radial, rcond=None)
    residual = float(np.sqrt(np.mean((Z @ coeffs - radial) ** 2)))
    return {
        "projection": PROJECTION,
        "normRadiusMm": float(2 * shell.sclera_radius_mm),
        "maxOrder": int(max_order),
        "coeffsMicrons": [float(c) for c in coeffs],
        "rmsResidualUm": residual,
        "samples": int(np.count_nonzero(sel)),
    }
