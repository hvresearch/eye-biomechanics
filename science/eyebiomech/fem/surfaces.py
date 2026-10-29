"""Corneal surfaces of the (deformed) shell as conic + Zernike height maps (Task 4.6).

Optics frame (as `web/packages/optics`): x temporal, y superior, z along the optical axis toward
the retina, origin at the undeformed anterior corneal apex. The FEM frame differs only by the
axial offset of the apex (`ShellMesh.apex_z_mm`).

Sampling: the corneal cap lies on the cube face −z of the cubed-sphere mesh. Points are taken on
a regular grid of reference coordinates in each outer (or inner) element of that face and mapped
with the 27-node shape functions, so the sample density does not depend on the node count.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import numpy as np
from numpy.typing import NDArray
from scipy.optimize import least_squares
from skfem import Basis, ElementHex2

from eyebiomech.fem.mesh import FACES, ShellMesh, conic_sag
from eyebiomech.zernike import zernike_count, zernike_matrix

# Index of the cube face −z (the anterior pole) in FACES.
_ANTERIOR_FACE = next(i for i, (n, _, _) in enumerate(FACES) if n[2] == -1)
# Samples per element edge on the surface (numerical).
SAMPLES_PER_CELL = 10
# Shortfall allowed between the reference samples' reach and the disk plus the largest lateral
# motion in `surface_change`, mm: about one sample spacing at the default density (numerical).
COVERAGE_SLACK_MM = 0.05


@dataclass(frozen=True)
class ConicFit:
    radius_mm: float
    conic: float
    apex_z_mm: float
    rms_residual_um: float


@dataclass(frozen=True)
class SurfaceChange:
    """Height change of a surface at fixed lateral position, as an apex shift plus a Zernike map
    that is zero at the vertex (µm, OSA order, normalized to `norm_radius_mm`)."""

    apex_shift_mm: float
    coeffs_um: NDArray
    norm_radius_mm: float
    rms_residual_um: float

    def height_um(self, x: NDArray, y: NDArray) -> NDArray:
        order = _order_of(len(self.coeffs_um))
        Z = zernike_matrix(order, np.hypot(x, y) / self.norm_radius_mm, np.arctan2(y, x))
        return Z @ self.coeffs_um


@dataclass(frozen=True)
class CornealSurfaces:
    anterior: tuple[NDArray, ConicFit]
    posterior: tuple[NDArray, ConicFit]
    outer_points: NDArray
    inner_points: NDArray


def _order_of(count: int) -> int:
    order = 0
    while zernike_count(order) < count:
        order += 1
    if zernike_count(order) != count:
        raise ValueError(f"{count} is not a full Zernike set")
    return order


def fit_conic(points_xyz: NDArray) -> ConicFit:
    """Least-squares conic z = z₀ + sag(R, k; ρ) through the points (optics frame)."""
    p = np.asarray(points_xyz, dtype=float)
    rho2 = p[:, 0] ** 2 + p[:, 1] ** 2
    z0 = float(p[np.argmin(rho2), 2])
    # Linear start from the implicit form c ρ² + c (1 + k) w² − 2 w = 0, w = z − z₀.
    w = p[:, 2] - z0
    A = np.stack([rho2, w * w], axis=1)
    sol, *_ = np.linalg.lstsq(A, 2 * w, rcond=None)
    c0 = sol[0] if sol[0] != 0 else 1e-6
    k0 = sol[1] / c0 - 1

    def resid(q):
        R, k, z = q
        return z + conic_sag(R, k, np.sqrt(rho2)) - p[:, 2]

    fit = least_squares(resid, [1 / c0, k0, z0], method="lm", xtol=1e-15, ftol=1e-15, gtol=1e-15)
    R, k, z = fit.x
    return ConicFit(float(R), float(k), float(z), float(np.sqrt(np.mean(fit.fun**2)) * 1e3))


def fit_surface_zernike(
    points_xyz: NDArray, norm_radius_mm: float, max_order: int = 8, conic: ConicFit | None = None
) -> tuple[NDArray, ConicFit]:
    """Zernike coefficients (µm) of the height left after the best-fit conic, from the points
    within `norm_radius_mm` of the axis; refuses fewer than three samples per term."""
    p = np.asarray(points_xyz, dtype=float)
    rho = np.hypot(p[:, 0], p[:, 1])
    inside = rho <= norm_radius_mm
    n_terms = zernike_count(max_order)
    if np.count_nonzero(inside) < 3 * n_terms:
        raise ValueError(
            f"{np.count_nonzero(inside)} samples within {norm_radius_mm} mm; "
            f"need at least {3 * n_terms} for order {max_order}"
        )
    q = p[inside]
    conic = conic or fit_conic(q)
    h = q[:, 2] - conic.apex_z_mm - conic_sag(conic.radius_mm, conic.conic, rho[inside])
    Z = zernike_matrix(max_order, rho[inside] / norm_radius_mm, np.arctan2(q[:, 1], q[:, 0]))
    coeffs, *_ = np.linalg.lstsq(Z, h * 1e3, rcond=None)
    return coeffs, conic


def surface_change(
    reference_xyz: NDArray, loaded_xyz: NDArray, norm_radius_mm: float, max_order: int = 8
) -> SurfaceChange:
    """Height change at fixed lateral position between two samplings of the same material
    points (row i of both arrays is one point). A point at reference position ξ moves by w to
    lateral position x = ξ + w_xy; the height change there is

        Δz(x) = w_z − [sag(ξ + w_xy) − sag(ξ)],

    with sag the reference surface's conic fit. This is exact for any lateral motion of a conic
    (a rigid translation included), not only to first order in w; the conic difference stands
    in for the reference surface's own, so the fit residual cancels. The map is sampled at the
    loaded lateral positions within the disk, so the reference samples must extend beyond
    `norm_radius_mm` by the largest lateral motion. The value at the vertex becomes the apex
    shift; the map is fitted with Zernike polynomials and made zero at the vertex through its
    piston term."""
    ref = np.asarray(reference_xyz, dtype=float)
    w = np.asarray(loaded_xyz, dtype=float) - ref
    rho_ref = np.hypot(ref[:, 0], ref[:, 1])
    x, y = ref[:, 0] + w[:, 0], ref[:, 1] + w[:, 1]
    rho = np.hypot(x, y)
    lateral = float(np.max(np.hypot(w[:, 0], w[:, 1]))) if len(w) else 0.0
    if rho_ref.max() + COVERAGE_SLACK_MM < norm_radius_mm + lateral:
        raise ValueError(
            f"reference samples reach {rho_ref.max():.3f} mm; a lateral motion of "
            f"{lateral * 1e3:.0f} µm needs them to reach {norm_radius_mm + lateral:.3f} mm"
        )
    inside = rho <= norm_radius_mm
    n_terms = zernike_count(max_order)
    if np.count_nonzero(inside) < 3 * n_terms:
        raise ValueError(f"too few samples within {norm_radius_mm} mm for order {max_order}")
    conic = fit_conic(ref[rho_ref <= norm_radius_mm])
    R, k = conic.radius_mm, conic.conic
    dz = (w[:, 2] - (conic_sag(R, k, rho) - conic_sag(R, k, rho_ref)))[inside]
    if not np.all(np.isfinite(dz)):
        raise ValueError("samples lie beyond the edge of the reference conic")
    Z = zernike_matrix(max_order, rho[inside] / norm_radius_mm, np.arctan2(y[inside], x[inside]))
    coeffs, *_ = np.linalg.lstsq(Z, dz * 1e3, rcond=None)
    residual = float(np.sqrt(np.mean((Z @ coeffs - dz * 1e3) ** 2)))
    center = zernike_matrix(max_order, np.array([0.0]), np.array([0.0]))[0] @ coeffs
    coeffs = coeffs.copy()
    coeffs[0] -= center  # Z₀ = 1: the map is zero at the vertex
    return SurfaceChange(float(center) * 1e-3, coeffs, float(norm_radius_mm), residual)


@lru_cache(maxsize=8)
def _face_grids(per_cell: int) -> NDArray:
    """Shape functions (6 faces, 27, per_cell²) on a regular grid of each face of the reference
    cube (axis a fixed at 0 or 1). The element's orientation is not assumed: the sampler picks
    the face that lies on the requested surface."""
    s = (np.arange(per_cell) + 0.5) / per_cell
    u, v = (g.ravel() for g in np.meshgrid(s, s, indexing="ij"))
    elem = ElementHex2()
    out = []
    for axis in range(3):
        for value in (0.0, 1.0):
            X = np.empty((3, u.size))
            free = [a for a in range(3) if a != axis]
            X[axis] = value
            X[free[0]], X[free[1]] = u, v
            out.append(np.stack([elem.lbasis(X, i)[0] for i in range(27)]))
    return np.stack(out)


def _scalar_dofs(shell: ShellMesh) -> NDArray:
    cached = getattr(shell, "_scalar_element_dofs", None)
    if cached is None:
        cached = Basis(shell.mesh, ElementHex2(), intorder=1).element_dofs
        shell._scalar_element_dofs = cached
    return cached


def sample_surface(
    shell: ShellMesh,
    displacement: NDArray | None,
    which: str,
    radius_mm: float,
    per_cell: int = SAMPLES_PER_CELL,
) -> NDArray:
    """Points (N, 3) of the outer or inner surface over the anterior cap, in the optics frame,
    displaced by `displacement` (3, len(mesh.doflocs)) when given. Points are selected by their
    undeformed distance from the axis (≤ radius_mm), so two samplings of different states
    return the same material points in the same order."""
    if which not in ("outer", "inner"):
        raise ValueError("which must be 'outer' or 'inner'")
    k = shell.layers - 1 if which == "outer" else 0
    cells = shell.cell_index
    elements = np.flatnonzero((cells[:, 0] == _ANTERIOR_FACE) & (cells[:, 3] == k))
    phi = _face_grids(per_cell)  # (6, 27, n)
    dofs = _scalar_dofs(shell)[:, elements]  # (27, e)
    nodes = shell.mesh.doflocs[:, dofs]  # (3, 27, e)
    pos = np.einsum("fan,iae->fien", phi, nodes)  # (6, 3, e, n)
    radius = np.linalg.norm(pos, axis=1).mean(axis=2)  # (6, e)
    face = np.argmax(radius, axis=0) if which == "outer" else np.argmin(radius, axis=0)
    cols = np.arange(elements.size)
    X = pos[face, :, cols, :]  # (e, 3, n)
    X = np.moveaxis(X, 1, 0).reshape(3, -1)
    keep = np.hypot(X[0], X[1]) <= radius_mm
    if displacement is not None:
        Ue = np.asarray(displacement)[:, dofs]  # (3, 27, e)
        U = np.einsum("ean,iae->ien", phi[face], Ue).reshape(3, -1)
        X = X + U
    pts = X[:, keep].T.copy()
    pts[:, 2] -= shell.apex_z_mm
    return pts


def deformed_corneal_surfaces(
    shell: ShellMesh,
    displacement: NDArray | None,
    norm_radius_mm: float,
    max_order: int = 8,
    posterior_radius_mm: float | None = None,
) -> CornealSurfaces:
    """Conic + Zernike fits of the anterior (outer) and posterior (inner) corneal surfaces."""
    outer = sample_surface(shell, displacement, "outer", norm_radius_mm)
    r_post = posterior_radius_mm or norm_radius_mm
    inner = sample_surface(shell, displacement, "inner", r_post)
    return CornealSurfaces(
        anterior=fit_surface_zernike(outer, norm_radius_mm, max_order),
        posterior=fit_surface_zernike(inner, r_post, max_order),
        outer_points=outer,
        inner_points=inner,
    )
