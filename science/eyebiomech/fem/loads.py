"""Loads on the corneoscleral shell (M4 plan, Task 4.5, Deviations 5, 12, 14).

`Loads` is a builder: each method records one load and returns the builder. `assemble`
returns the external force vector at the current displacement, scaled by the load factor of
the current step, and the load stiffness of the follower loads (or None).

- IOP: follower pressure on the inner surface.
- Insertion: a muscle's force F spread uniformly over a footprint on the outer surface centered
  on the insertion (width × length, in geodesic coordinates about the line of action), acting
  along the line of action at the insertion; for a muscle that wraps the globe, a contact
  pressure F / (R w) presses the band between the insertion and the tangent point inward (a
  frictionless band on a sphere), so the net load is F along the free segment (Deviation 14).
  The tendon carries the muscle's force unchanged (Deviation 5); it is validated and recorded.
- Ciliary: a line load at the scleral spur along the meridian, toward the posterior pole,
  `tension × accommodation` per mm of circumference (Deviation 12).
- Eyelid: normal pressure on the outer surface over a horizontal band at each lid margin,
  anterior half only.
- Orbital support: the globe is held by the orbit (Tenon's capsule, orbital fat), not by the
  optic nerve; a traction a + ω × x on the posterior hemisphere of the outer surface, with a and
  ω solved so that the dead loads above have zero net force and moment about the globe center.
  Without it, the unbalanced pull of the length-proxy muscles pivots the globe about the small
  optic-nerve support (approximation: the reaction's distribution is assumed).

Dead loads act in the reference configuration.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from eyebiomech.fem import assembly as asm
from eyebiomech.fem.data import load_eom_forces, load_materials
from eyebiomech.fem.units import kpa_to_mpa, mmhg_to_mpa

# Half-width of the band that carries the ciliary line load, mm (numerical: a line load needs a
# finite band on a continuum surface; it is spread over this arc and normalized to the line).
CILIARY_BAND_MM = 0.5


def _inv_det(F: NDArray) -> tuple[NDArray, NDArray]:
    Fm = np.moveaxis(F, (0, 1), (-2, -1))
    return np.moveaxis(np.linalg.inv(Fm), (-2, -1), (0, 1)), np.linalg.det(Fm)


def _unit(v) -> NDArray:
    v = np.asarray(v, dtype=float)
    return v / np.linalg.norm(v)


def _vec(v) -> list[float]:
    return [float(c) for c in np.asarray(v, dtype=float)]


@dataclass
class Loads:
    items: list[dict] = field(default_factory=list)
    _cache: dict = field(default_factory=dict, repr=False)

    # -- builders ------------------------------------------------------------------------------

    def iop(self, pressure_mmhg: float) -> Loads:
        """Intraocular pressure: a follower pressure on the inner surface (it acts on the
        deformed area along the deformed normal)."""
        if not np.isfinite(pressure_mmhg) or pressure_mmhg < 0:
            raise ValueError(f"IOP must be a non-negative number of mmHg, got {pressure_mmhg}")
        self.items.append({"kind": "iop", "pressureMmHg": float(pressure_mmhg)})
        return self._changed()

    def insertion(
        self,
        muscle: str,
        force_n: float,
        pull_dir,
        center_mm,
        footprint_width_mm: float,
        tendon: dict,
        footprint_length_mm: float | None = None,
        insertion_dir=None,
        tangent_point_mm=None,
    ) -> Loads:
        if not np.isfinite(force_n) or force_n < 0:
            raise ValueError(f"{muscle}: force must be a non-negative number, got {force_n}")
        stiffness = tendon.get("stiffnessNPerMm")
        if not (isinstance(stiffness, int | float) and stiffness > 0):
            raise ValueError(f"{muscle}: tendon stiffness must be positive, got {stiffness}")
        if not footprint_width_mm > 0:
            raise ValueError(f"{muscle}: footprint width must be positive")
        if footprint_length_mm is None:
            footprint_length_mm = load_eom_forces()["insertionFootprintLengthMm"]["value"]
        item = {
            "kind": "insertion",
            "muscle": muscle,
            "forceN": float(force_n),
            "pullDir": _vec(_unit(pull_dir)),
            "insertionDir": _vec(_unit(pull_dir if insertion_dir is None else insertion_dir)),
            "centerMm": _vec(center_mm),
            "footprintWidthMm": float(footprint_width_mm),
            "footprintLengthMm": float(footprint_length_mm),
            "tendon": {
                "stiffnessNPerMm": float(stiffness),
                "slackLengthMm": float(tendon.get("slackLengthMm", float("nan"))),
                "elongationMm": float(force_n) / float(stiffness),
            },
            "tangentPointMm": None if tangent_point_mm is None else _vec(tangent_point_mm),
        }
        self.items.append(item)
        return self._changed()

    def ciliary(self, tension_n_per_mm: float, accommodation_d: float) -> Loads:
        if not np.isfinite(tension_n_per_mm) or not np.isfinite(accommodation_d):
            raise ValueError("ciliary tension and accommodation must be finite")
        if accommodation_d < 0:
            raise ValueError("accommodation must be non-negative")
        self.items.append(
            {
                "kind": "ciliary",
                "tensionNPerMmPerD": float(tension_n_per_mm),
                "accommodationD": float(accommodation_d),
                "arcFromLimbusMm": float(load_materials()["scleralSpur"]["arcFromLimbusMm"]),
            }
        )
        return self._changed()

    def eyelid(
        self,
        upper_kpa: float,
        lower_kpa: float,
        aperture_mm: float,
        upper_height_mm: float,
        lower_height_mm: float,
    ) -> Loads:
        for name, v in (("upper_kpa", upper_kpa), ("lower_kpa", lower_kpa)):
            if not np.isfinite(v) or v < 0:
                raise ValueError(f"{name} must be a non-negative pressure, got {v}")
        if not aperture_mm > 0 or upper_height_mm < 0 or lower_height_mm < 0:
            raise ValueError("eyelid aperture must be positive and band heights non-negative")
        self.items.append(
            {
                "kind": "eyelid",
                "upperKPa": float(upper_kpa),
                "lowerKPa": float(lower_kpa),
                "apertureMm": float(aperture_mm),
                "upperHeightMm": float(upper_height_mm),
                "lowerHeightMm": float(lower_height_mm),
            }
        )
        return self._changed()

    def from_force_table(
        self, table, gaze_index: int, eom: dict, balance_moments: bool = True
    ) -> Loads:
        """One insertion per muscle of the force table's gaze, in the globe's frame.

        With `balance_moments` (the default) the forces are first changed by the smallest
        relative amount that makes the six muscle moments about the globe center sum to zero:
        the length-proxy activations of spec §4.4 v1 do not balance torque, and an unbalanced
        moment would twist the globe about the optic-nerve support. This stands in for the v2
        static equilibrium (approximation); each insertion records its table force. The change
        is not small: in primary gaze it moves the lateral rectus from 0.116 to 0.182 N and the
        medial rectus from 0.147 to 0.078 N. A balanced set that switches off a muscle the table
        loads (the agonist in vertical and far temporal gazes) is rejected."""
        body = table.body_frame(gaze_index)
        tendons = {m["name"]: m["tendon"] for m in eom["muscles"]}
        table_forces = np.asarray(table.force_n[gaze_index], dtype=float)
        forces = table_forces
        if balance_moments:
            forces = _torque_balanced(forces, body["insertion_mm"], body["insertion_dir"])
            unloaded = [
                name
                for name, f0, f in zip(table.muscles, table_forces, forces, strict=True)
                if f0 > 0 and f == 0
            ]
            if unloaded:
                raise ValueError(
                    "torque balancing unloads " + ", ".join(unloaded) + ", which the force "
                    "table loads at this gaze; eccentric gazes need passive orbital torques "
                    "(M5 follow-up)"
                )
        for i, name in enumerate(table.muscles):
            wraps = table.arc_mm[gaze_index, i] > 0
            self.insertion(
                muscle=name,
                force_n=float(forces[i]),
                pull_dir=body["pull_dir"][i],
                center_mm=body["insertion_mm"][i],
                footprint_width_mm=float(table.width_mm[gaze_index, i]),
                tendon=tendons[name],
                insertion_dir=body["insertion_dir"][i],
                tangent_point_mm=body["tangent_mm"][i] if wraps else None,
            )
            self.items[-1]["tableForceN"] = float(table.force_n[gaze_index, i])
        return self

    def orbital_support(self) -> Loads:
        """Balance the dead loads with a distributed orbital reaction (see the module notes).
        Applied once, after the loads it balances are added; IOP needs none (it is
        self-equilibrated)."""
        if any(item["kind"] == "orbitalSupport" for item in self.items):
            raise ValueError("orbital support is already applied")
        self.items.append({"kind": "orbitalSupport", "region": "outer surface, z > 0"})
        return self._changed()

    def summary(self) -> list[dict]:
        """JSON-serializable list of the loads (for provenance)."""
        return [dict(item) for item in self.items]

    def _changed(self) -> Loads:
        self._cache.clear()
        return self

    # -- assembly ------------------------------------------------------------------------------

    def assemble(self, ctx, u: NDArray, scale: float, dead_scale: float | None = None):
        """External force vector and load stiffness ∂f_ext/∂u (or None) at displacement u, with
        the IOP scaled by `scale` and the dead loads by `dead_scale` (default `scale`)."""
        key = id(ctx)
        if key not in self._cache:
            self._cache[key] = self._dead(ctx)
        f = (scale if dead_scale is None else dead_scale) * self._cache[key]
        K = None
        for item in self.items:
            if item["kind"] == "iop":
                p = mmhg_to_mpa(item["pressureMmHg"]) * scale
                fi, Ki = _follower_pressure(ctx, ctx.fb_inner, u, p)
                f = f + fi
                if Ki is not None:
                    K = Ki if K is None else K + Ki
        return f, K

    def _dead(self, ctx) -> NDArray:
        fb = ctx.fb_outer_loads
        x = np.asarray(fb.global_coordinates())
        N = np.asarray(fb.normals)
        dx = np.asarray(fb.dx)
        total = np.zeros((3,) + dx.shape)
        for item in self.items:
            kind = item["kind"]
            if kind == "insertion":
                total += _insertion_traction(item, x, dx)
            elif kind == "ciliary":
                total += _ciliary_traction(item, ctx.shell, x, dx)
            elif kind == "eyelid":
                total += _eyelid_traction(item, x, N)
        if any(item["kind"] == "orbitalSupport" for item in self.items):
            total += _orbital_reaction(total, x, dx)
        return _surface_vector(ctx, fb, total)


def _surface_vector(ctx, fb, t: NDArray) -> NDArray:
    """∫ φ · t dA over the facets of fb for a traction t (3, nf, q), facets with t ≠ 0 only."""
    active = np.flatnonzero(np.any(t != 0, axis=(0, 2)))
    if active.size == 0:
        return np.zeros(ctx.n)
    Phi = asm.basis_values(fb, active)
    fe = np.einsum("eqai,ieq,eq->ea", Phi, t[:, active], np.asarray(fb.dx)[active], optimize=True)
    return asm.scatter_vector(ctx.n, fb.element_dofs[:, active], fe)


def _geodesic_frame(center, direction):
    """Unit center ĉ, tangent t̂ along `direction`, and ŵ = ĉ × t̂ across it."""
    c = _unit(center)
    d = np.asarray(direction, dtype=float)
    t = _unit(d - np.dot(d, c) * c)
    return c, t, np.cross(c, t)


def _insertion_traction(item: dict, x: NDArray, dx: NDArray) -> NDArray:
    F = item["forceN"]
    out = np.zeros_like(x)
    if F == 0:
        return out
    center = np.asarray(item["centerMm"])
    R = np.linalg.norm(center)
    c, t, w = _geodesic_frame(center, item["insertionDir"])
    xh = x / np.linalg.norm(x, axis=0)
    dot = lambda v: np.einsum("i,i...->...", v, xh)  # noqa: E731
    along = R * np.arctan2(dot(t), dot(c))
    across = R * np.arcsin(np.clip(dot(w), -1, 1))
    foot = (
        (np.abs(along) <= item["footprintLengthMm"] / 2)
        & (np.abs(across) <= item["footprintWidthMm"] / 2)
        & (dot(c) > 0)
    )
    area = float(np.sum(foot * dx))
    if area <= 0:
        raise ValueError(f"{item['muscle']}: the footprint covers no quadrature point")
    ins = np.asarray(item["insertionDir"])
    out += foot * (F / area) * ins[:, None, None]
    if item["tangentPointMm"] is not None:
        target = F * (np.asarray(item["pullDir"]) - ins)
        Tp = _unit(item["tangentPointMm"])
        alpha = np.arccos(np.clip(np.dot(Tp, c), -1, 1))
        beta = np.arctan2(dot(t), dot(c))
        band = (beta >= 0) & (beta <= alpha) & (np.abs(across) <= item["footprintWidthMm"] / 2)
        contact = -(F / (R * item["footprintWidthMm"])) * band * xh
        res = np.einsum("iea,ea->i", contact, dx)
        if np.dot(res, res) > 0 and np.linalg.norm(target) > 0:
            # Normalize to the exact frictionless-band resultant along its direction (the band's
            # edges cut through facets, so the quadrature of the indicator is approximate).
            contact *= np.dot(target, res) / np.dot(res, res)
        out += contact
    return out


def _ciliary_traction(item: dict, shell, x: NDArray, dx: NDArray) -> NDArray:
    q = item["tensionNPerMmPerD"] * item["accommodationD"]
    out = np.zeros_like(x)
    if q == 0:
        return out
    R = shell.sclera_radius_mm
    theta_s = shell.limbus_polar_rad + item["arcFromLimbusMm"] / R
    theta = shell.geometry.polar(x)
    band = np.abs(R * (theta - theta_s)) <= CILIARY_BAND_MM
    if not np.any(band):
        raise ValueError("the ciliary band covers no quadrature point")
    phi = np.arctan2(x[1], x[0])
    e_theta = np.stack([np.cos(theta) * np.cos(phi), np.cos(theta) * np.sin(phi), np.sin(theta)])
    width = float(np.sum(band * dx)) / (2 * np.pi * R * np.sin(theta_s))
    return band * (q / width) * e_theta


def _eyelid_traction(item: dict, x: NDArray, N: NDArray) -> NDArray:
    half = item["apertureMm"] / 2
    y, front = x[1], x[2] < 0
    upper = front & (y >= half) & (y <= half + item["upperHeightMm"])
    lower = front & (y <= -half) & (y >= -half - item["lowerHeightMm"])
    p = upper * kpa_to_mpa(item["upperKPa"]) + lower * kpa_to_mpa(item["lowerKPa"])
    return -p * N


def _torque_balanced(forces: NDArray, centers: NDArray, directions: NDArray) -> NDArray:
    """Non-negative forces f' with Σ f'_i (c_i × d_i) = 0 and Σ f'_i = Σ f_i (the overall tension
    is kept, so the trivial all-zero set is excluded) closest to f in the weighted norm
    Σ ((f'_i − f_i) / s_i)², s_i = max(f_i, mean f / 4) (a small quadratic program; the floor on
    s_i lets a relaxed muscle take up tension when the others cannot balance alone). Raises
    when no non-negative balanced set exists.

    The program is convex with six unknowns, so it is solved exactly by enumerating which
    muscles are held at zero: each choice is an equality-constrained least-squares problem with
    a closed-form solution, and the optimum is the cheapest one that is non-negative. Unlike an
    iterative solver this gives the same answer, to round-off, on every CPU."""
    arms = np.cross(centers, directions)  # (6, 3): moment per newton
    A = arms.T  # (3, 6)
    if np.linalg.norm(A @ forces) == 0:
        return forces.copy()
    n = len(forces)
    s = np.maximum(forces, max(forces.mean(), 1e-12) / 4)
    B = np.vstack([A, np.ones((1, n))])  # (4, 6)
    b = np.concatenate([np.zeros(3), [forces.sum()]])
    scale = np.linalg.norm(arms, axis=1).max() * forces.max()
    tol = 1e-10 * scale
    best, best_cost = None, np.inf
    for mask in range(1, 2**n):
        free = np.array([(mask >> i) & 1 == 1 for i in range(n)])
        # With the zeroed muscles fixed, f = f0 + s g on the free ones and g is the least-norm
        # solution of (B s) g = b − B f0 (an SVD solve, so the moment is zero to round-off).
        f = np.zeros(n)
        Bs = B[:, free] * s[free]
        g = np.linalg.lstsq(Bs, b - B[:, free] @ forces[free], rcond=None)[0]
        f[free] = forces[free] + s[free] * g
        if np.linalg.norm(B @ f - b) > tol or f.min() < -1e-12 * forces.max():
            continue
        f = np.maximum(f, 0.0)
        cost = np.sum(((f - forces) / s) ** 2)
        if cost < best_cost:
            best, best_cost = f, cost
    if best is None:
        raise ValueError("no non-negative torque-balanced muscle forces")
    return np.where(best < 1e-12 * forces.max(), 0.0, best)


def _orbital_reaction(t: NDArray, x: NDArray, dx: NDArray) -> NDArray:
    """Traction a + ω × x on the posterior hemisphere (z > 0) whose net force and moment about
    the origin cancel those of the traction field t."""
    F = np.einsum("ieq,eq->i", t, dx)
    M = np.einsum("ieq,eq->i", np.cross(x, t, axis=0), dx)
    region = (x[2] > 0).astype(float)
    if not np.any(region):
        raise ValueError("no posterior surface to carry the orbital reaction")
    cols = []
    for k in range(6):
        basis = np.zeros(3)
        basis[k % 3] = 1.0
        if k < 3:
            field_k = region * basis[:, None, None]
        else:
            field_k = region * np.cross(basis[:, None, None], x, axis=0)
        cols.append(
            np.concatenate(
                [
                    np.einsum("ieq,eq->i", field_k, dx),
                    np.einsum("ieq,eq->i", np.cross(x, field_k, axis=0), dx),
                ]
            )
        )
    coef = np.linalg.solve(np.stack(cols, axis=1), -np.concatenate([F, M]))
    a, w = coef[:3], coef[3:]
    return region * (a[:, None, None] + np.cross(w[:, None, None], x, axis=0))


def _follower_pressure(ctx, fb, u: NDArray, p: float):
    """Pressure p (MPa) on the facets of `fb`, pushing against their outward normal N:
    traction −p J F⁻ᵀ N per reference area, and its derivative
    dt_i = −p J (m_i F⁻ᵀ_kl − F⁻ᵀ_il m_k) dF_kl with m = F⁻ᵀ N."""
    elements = np.arange(fb.element_dofs.shape[1])
    if p == 0.0 or elements.size == 0:
        return np.zeros(ctx.n), None
    F = np.eye(3)[:, :, None, None] + fb.interpolate(u).grad
    Finv, J = _inv_det(F)
    FiT = np.swapaxes(Finv, 0, 1)
    N = np.asarray(fb.normals)
    m = np.einsum("ij...,j...->i...", FiT, N)
    t = -p * J * m  # (3, nf, q)
    Phi = asm.basis_values(fb, elements)  # (nf, q, a, 3)
    G = asm.basis_gradients(fb, elements)  # (nf, q, a, 9)
    dx = np.asarray(fb.dx)
    fe = np.einsum("eqai,ieq,eq->ea", Phi, t, dx, optimize=True)
    B = (
        -p * J * (np.einsum("i...,kl...->ikl...", m, FiT) - np.einsum("il...,k...->ikl...", FiT, m))
    )  # (3, 3, 3, nf, q)
    Bq = np.moveaxis(B.reshape(3, 9, *B.shape[3:]), (2, 3), (0, 1))  # (nf, q, 3, 9)
    T = np.matmul(G, np.swapaxes(Bq, 2, 3)) * dx[:, :, None, None]  # (nf, q, b, i)
    e, q, a, _ = Phi.shape
    Ke = np.matmul(
        np.swapaxes(Phi, 1, 2).reshape(e, a, q * 3),
        np.swapaxes(np.swapaxes(T, 1, 2).reshape(e, a, q * 3), 1, 2),
    )
    dofs = fb.element_dofs
    return asm.scatter_vector(ctx.n, dofs, fe), asm.scatter_matrix(ctx.n, dofs, Ke)
