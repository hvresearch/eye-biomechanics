"""Cubed-sphere hexahedral mesh of the corneoscleral shell (M4 plan, Task 4.4, Deviations 2, 8).

Frame: the EOM frame of data/eom/geometry-default.json, origin at the globe center, x temporal,
y superior, z posterior (toward the retina), mm. Directions are described by their polar angle
θ from the anterior pole (the −z axis), θ = 0 at the corneal apex.

Outer surface: the document's anterior cornea (a conic) inside the limbus, the scleral sphere
of the EOM table's globe radius outside it; the cornea is placed so it meets the sphere at the
table's limbus radius. Inner surface: the document's posterior cornea until the corneal
thickness reaches the tabled limbal thickness (held there beyond), the scleral sphere less the
tabled regional thickness outside the limbus, blended across the limbal band with a smoothstep.

Construction: each face of the cube [−1, 1]³ carries an n_face × n_face grid, stacked `layers`
deep in a "cube shell" between the cube and the cube scaled by 2; this linear mesh is promoted to
27-node quadratic hexahedra (`MeshHex2.from_mesh`), whose extra nodes sit at parametric
midpoints, and every node is then mapped exactly onto the geometry: the cube point gives the
direction through an equiangular (tangent) map, the shell depth gives the radial fraction
between the inner and outer surfaces.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray
from skfem import MeshHex, MeshHex2

from eyebiomech.fem.data import load_eom_table, load_materials

REGIONS = ("cornea", "limbus", "sclera")

# Cube faces as (outward normal n, in-face axes u, v) with u × v = n, so every hexahedron built
# from (u, v, depth) is right-handed.
_E = np.eye(3)
FACES = (
    (_E[2], _E[0], _E[1]),
    (-_E[2], _E[1], _E[0]),
    (_E[0], _E[1], _E[2]),
    (-_E[0], _E[2], _E[1]),
    (_E[1], _E[2], _E[0]),
    (-_E[1], _E[0], _E[2]),
)
# Reference-vertex order of skfem's hexahedron as (ξ, η, ζ) offsets. Reference ξ runs along
# the face axis v, η along u, and ζ along the depth, which makes skfem's mapping
# orientation-positive.
_HEX_VERTICES = (
    (0, 0, 0),
    (0, 0, 1),
    (0, 1, 0),
    (1, 0, 0),
    (0, 1, 1),
    (1, 0, 1),
    (1, 1, 0),
    (1, 1, 1),
)

# Newton limits for the ray–conic radial solve (numerical).
_NEWTON_TOL_MM = 1e-13
_NEWTON_MAX_ITER = 60


def conic_sag(radius_mm: float, conic: float, rho: NDArray) -> NDArray:
    """Sag of a conic at lateral distance rho (NaN beyond its edge)."""
    c = 0.0 if not np.isfinite(radius_mm) else 1.0 / radius_mm
    arg = 1.0 - (1.0 + conic) * c * c * rho * rho
    with np.errstate(invalid="ignore"):
        return np.where(arg >= 0, c * rho * rho / (1.0 + np.sqrt(np.maximum(arg, 0.0))), np.nan)


def conic_slope(radius_mm: float, conic: float, rho: NDArray) -> NDArray:
    """d(sag)/d(rho)."""
    c = 0.0 if not np.isfinite(radius_mm) else 1.0 / radius_mm
    arg = 1.0 - (1.0 + conic) * c * c * rho * rho
    with np.errstate(invalid="ignore", divide="ignore"):
        return np.where(arg > 0, c * rho / np.sqrt(np.maximum(arg, 1e-300)), np.nan)


def _ray_conic_radius(theta: NDArray, apex_z: float, radius_mm: float, conic: float) -> NDArray:
    """Distance r from the globe center along polar angle θ to a conic whose apex lies on the
    axis at z = apex_z (< 0), opening toward +z: solves −r cos θ = apex_z + sag(r sin θ). NaN
    where the ray misses the conic."""
    theta = np.asarray(theta, dtype=float)
    ct, st = np.cos(theta), np.sin(theta)
    with np.errstate(divide="ignore", invalid="ignore"):
        r = np.where(ct > 1e-12, -apex_z / np.maximum(ct, 1e-12), np.nan)
        for _ in range(_NEWTON_MAX_ITER):
            f = -r * ct - apex_z - conic_sag(radius_mm, conic, r * st)
            fp = -ct - conic_slope(radius_mm, conic, r * st) * st
            step = f / fp
            r = r - step
            if np.all(~np.isfinite(step) | (np.abs(step) < _NEWTON_TOL_MM)):
                break
    resid = -r * ct - apex_z - conic_sag(radius_mm, conic, r * st)
    return np.where(np.isfinite(resid) & (np.abs(resid) < 1e-8) & (r > 0), r, np.nan)


def _smoothstep(x: NDArray) -> NDArray:
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


@dataclass
class ShellGeometry:
    """Axisymmetric (about z) outer and inner radial profiles of the shell."""

    sclera_radius_mm: float
    limbus_polar_rad: float
    limbus_half_width_rad: float
    apex_z_mm: float
    anterior: tuple[float, float]  # (radius, conic) of the anterior cornea
    posterior: tuple[float, float] | None  # (radius, conic) of the posterior cornea
    posterior_apex_z_mm: float
    corneal_limbal_thickness_mm: float
    scleral_thickness: tuple[NDArray, NDArray]  # (θ nodes, thickness) for linear interpolation
    sphere: tuple[float, float] | None = None  # (inner, outer) for a plain spherical shell

    @staticmethod
    def polar(x: NDArray) -> NDArray:
        """Polar angle from the anterior pole (−z), radians, for points (3, ...)."""
        return np.arctan2(np.hypot(x[0], x[1]), -x[2])

    def r_out(self, theta: NDArray) -> NDArray:
        theta = np.asarray(theta, dtype=float)
        if self.sphere is not None:
            return np.full_like(theta, self.sphere[1])
        cornea = _ray_conic_radius(
            np.minimum(theta, self.limbus_polar_rad), self.apex_z_mm, *self.anterior
        )
        return np.where(theta < self.limbus_polar_rad, cornea, self.sclera_radius_mm)

    def _r_in_cornea(self, theta: NDArray) -> NDArray:
        outer = self.r_out(theta)
        t_cap = self.corneal_limbal_thickness_mm
        if self.posterior is None:
            return outer - t_cap
        post = _ray_conic_radius(theta, self.posterior_apex_z_mm, *self.posterior)
        t = np.where(np.isfinite(post), outer - post, np.inf)
        return outer - np.minimum(t, t_cap)

    def _r_in_sclera(self, theta: NDArray) -> NDArray:
        nodes, thick = self.scleral_thickness
        return self.sclera_radius_mm - np.interp(theta, nodes, thick)

    def r_in(self, theta: NDArray) -> NDArray:
        theta = np.asarray(theta, dtype=float)
        if self.sphere is not None:
            return np.full_like(theta, self.sphere[0])
        lo = self.limbus_polar_rad - self.limbus_half_width_rad
        w = _smoothstep((theta - lo) / (2 * self.limbus_half_width_rad))
        # Evaluate the corneal profile only where it is used (it is undefined far back).
        tc = np.minimum(theta, self.limbus_polar_rad + self.limbus_half_width_rad)
        return (1 - w) * self._r_in_cornea(tc) + w * self._r_in_sclera(theta)

    def region_index(self, theta: NDArray) -> NDArray:
        if self.sphere is not None:
            return np.full(np.shape(theta), 2, dtype=int)
        lo = self.limbus_polar_rad - self.limbus_half_width_rad
        hi = self.limbus_polar_rad + self.limbus_half_width_rad
        return np.where(theta < lo, 0, np.where(theta <= hi, 1, 2))

    def outer_normal(self, x: NDArray) -> NDArray:
        """Unit outward normal of the outer surface at the direction of each point (3, ...):
        the anterior conic's normal inside the limbus, radial outside, blended across the
        limbal band (used for in-plane fiber directions)."""
        radial = x / np.linalg.norm(x, axis=0)
        if self.sphere is not None:
            return radial
        theta = self.polar(x)
        r = self.r_out(np.minimum(theta, self.limbus_polar_rad))
        rho = r * np.sin(np.minimum(theta, self.limbus_polar_rad))
        slope = conic_slope(*self.anterior, rho)
        # Surface z = apex + sag(ρ); outward (anterior, −z side) normal ∝ (ρ̂ · sag', −1).
        lateral = np.hypot(x[0], x[1])
        with np.errstate(invalid="ignore", divide="ignore"):
            ex = np.where(lateral > 0, x[0] / lateral, 0.0)
            ey = np.where(lateral > 0, x[1] / lateral, 0.0)
        n_c = np.stack([ex * slope, ey * slope, -np.ones_like(slope)])
        n_c = n_c / np.linalg.norm(n_c, axis=0)
        lo = self.limbus_polar_rad - self.limbus_half_width_rad
        w = _smoothstep((theta - lo) / (2 * self.limbus_half_width_rad))
        n = (1 - w) * n_c + w * radial
        return n / np.linalg.norm(n, axis=0)


@dataclass
class ShellMesh:
    mesh: MeshHex2
    region: NDArray  # per element: 0 cornea, 1 limbus, 2 sclera
    outer_facets: NDArray
    inner_facets: NDArray
    apex_z_mm: float
    limbus_polar_rad: float
    sclera_radius_mm: float
    geometry: ShellGeometry
    n_face: int
    layers: int
    # Per element: (face, i, j, k) with i along u, j along v, k along the depth; the element's
    # reference coordinates are (ξ, η, ζ) = (along v, along u, along depth) in [0, 1]³.
    cell_index: NDArray = field(repr=False)


def _cube_shell_hex1(n_face: int, layers: int):
    a = np.linspace(-1.0, 1.0, n_face + 1)
    s = np.linspace(0.0, 1.0, layers + 1)
    points = []
    ids = np.empty((6, n_face + 1, n_face + 1, layers + 1), dtype=np.int64)
    for f, (n, u, v) in enumerate(FACES):
        for i, ai in enumerate(a):
            for j, bj in enumerate(a):
                c = n + ai * u + bj * v
                for k, sk in enumerate(s):
                    ids[f, i, j, k] = len(points)
                    points.append((1.0 + sk) * c)
    points = np.asarray(points)
    # Merge the copies of shared cube edges (numerical rounding key).
    _, first, inverse = np.unique(
        np.round(points, 9), axis=0, return_index=True, return_inverse=True
    )
    inverse = inverse.ravel()
    order = np.argsort(first)
    rank = np.empty_like(order)
    rank[order] = np.arange(order.size)
    p = points[np.sort(first)].T
    ids = rank[inverse[ids]]
    t, cells = [], []
    for f in range(6):
        for i in range(n_face):
            for j in range(n_face):
                for k in range(layers):
                    t.append([ids[f, i + dy, j + dx, k + dz] for dx, dy, dz in _HEX_VERTICES])
                    cells.append((f, i, j, k))
    return MeshHex(p, np.asarray(t, dtype=np.int64).T, sort_t=False), np.asarray(cells)


def _map_to_geometry(q: NDArray, geometry: ShellGeometry) -> NDArray:
    """Cube-shell point(s) (3, N) → physical positions on the shell (3, N)."""
    m = np.max(np.abs(q), axis=0)
    c = q / m
    depth = m - 1.0  # 0 on the inner surface, 1 on the outer
    axis = np.argmax(np.abs(c), axis=0)
    sign = np.sign(c[axis, np.arange(c.shape[1])])
    d = np.empty_like(c)
    for n, u, v in FACES:
        sel = (axis == int(np.argmax(np.abs(n)))) & (sign == n[np.argmax(np.abs(n))])
        if not np.any(sel):
            continue
        a = u @ c[:, sel]
        b = v @ c[:, sel]
        d[:, sel] = (
            n[:, None] + np.tan(np.pi * a / 4) * u[:, None] + np.tan(np.pi * b / 4) * v[:, None]
        )
    d /= np.linalg.norm(d, axis=0)
    theta = geometry.polar(d)
    r_in, r_out = geometry.r_in(theta), geometry.r_out(theta)
    return d * (r_in + np.clip(depth, 0.0, 1.0) * (r_out - r_in))


def _build(geometry: ShellGeometry, n_face: int, layers: int, apex_z: float) -> ShellMesh:
    if n_face < 2 or n_face % 2:
        raise ValueError(
            f"n_face must be even and at least 2 (the axis points are nodes), got {n_face}"
        )
    if layers < 1:
        raise ValueError(f"layers must be at least 1, got {layers}")
    m1, cells = _cube_shell_hex1(n_face, layers)
    m2 = MeshHex2.from_mesh(m1)
    doflocs = _map_to_geometry(m2.doflocs, geometry)
    if not np.all(np.isfinite(doflocs)):
        raise ValueError("the shell geometry is undefined at some nodes")
    mesh = MeshHex2(doflocs, m2.t, sort_t=False)
    depth = np.max(np.abs(m1.p), axis=0) - 1.0
    boundary = mesh.boundary_facets()
    fdepth = depth[mesh.facets[:, boundary]]
    outer = boundary[np.all(np.isclose(fdepth, 1.0), axis=0)]
    inner = boundary[np.all(np.isclose(fdepth, 0.0), axis=0)]
    centers = mesh.doflocs[:, mesh.t].mean(axis=1)
    region = geometry.region_index(geometry.polar(centers))
    return ShellMesh(
        mesh=mesh,
        region=np.asarray(region, dtype=int),
        outer_facets=outer,
        inner_facets=inner,
        apex_z_mm=apex_z,
        limbus_polar_rad=geometry.limbus_polar_rad,
        sclera_radius_mm=geometry.sclera_radius_mm,
        geometry=geometry,
        n_face=n_face,
        layers=layers,
        cell_index=cells,
    )


def eye_geometry(
    params: dict, materials: dict | None = None, eom: dict | None = None
) -> ShellGeometry:
    """The shell profiles for an EyeParameters document (Deviation 8)."""
    materials = materials or load_materials()
    eom = eom or load_eom_table()
    R = float(eom["globe"]["radiusMm"])
    rho_l = float(eom["globe"]["limbusRadiusMm"])
    ant, post = params["surfaces"][0], params["surfaces"][1]
    for s in (ant, post):
        if s["type"] != "conic":
            raise ValueError(f"surface {s['name']!r}: the FEM shell needs conic corneal surfaces")
    anterior = (float(ant["radiusMm"]), float(ant.get("conic", 0.0)))
    posterior = (float(post["radiusMm"]), float(post.get("conic", 0.0)))
    sag_l = conic_sag(*anterior, np.array(rho_l))
    if not np.isfinite(sag_l):
        raise ValueError("the anterior cornea does not reach the limbus radius")
    apex_z = -np.sqrt(R * R - rho_l * rho_l) - float(sag_l)
    theta_l = float(np.arcsin(rho_l / R))
    regions = materials["regions"]
    scl = regions["sclera"]["thicknessMm"]
    nodes = np.array([theta_l, np.pi / 2, 3 * np.pi / 4, np.pi])
    thick = np.array(
        [scl["limbus"], scl["equator"], scl["midpoint"], scl["posterior"]], dtype=float
    )
    return ShellGeometry(
        sclera_radius_mm=R,
        limbus_polar_rad=theta_l,
        limbus_half_width_rad=float(regions["limbus"]["halfWidthMm"]) / R,
        apex_z_mm=float(apex_z),
        anterior=anterior,
        posterior=posterior,
        posterior_apex_z_mm=float(apex_z + float(ant["thicknessToNextMm"])),
        corneal_limbal_thickness_mm=float(regions["cornea"]["thicknessMm"]["limbal"]),
        scleral_thickness=(nodes, thick),
    )


def make_shell_mesh(
    params: dict,
    layers: int = 3,
    n_face: int = 12,
    materials: dict | None = None,
    eom: dict | None = None,
) -> ShellMesh:
    """Closed corneoscleral shell for an EyeParameters document (cornea, limbus, sclera)."""
    geometry = eye_geometry(params, materials, eom)
    return _build(geometry, n_face, layers, geometry.apex_z_mm)


def make_sphere_shell(
    inner_mm: float, outer_mm: float, layers: int = 2, n_face: int = 6
) -> ShellMesh:
    """Thick spherical shell (all elements tagged sclera), for the analytic checks."""
    if not 0 < inner_mm < outer_mm:
        raise ValueError("need 0 < inner < outer")
    geometry = ShellGeometry(
        sclera_radius_mm=outer_mm,
        limbus_polar_rad=0.0,
        limbus_half_width_rad=0.0,
        apex_z_mm=-outer_mm,
        anterior=(np.inf, 0.0),
        posterior=None,
        posterior_apex_z_mm=-inner_mm,
        corneal_limbal_thickness_mm=outer_mm - inner_mm,
        scleral_thickness=(np.array([0.0, np.pi]), np.array([outer_mm - inner_mm] * 2)),
        sphere=(inner_mm, outer_mm),
    )
    return _build(geometry, n_face, layers, -outer_mm)
