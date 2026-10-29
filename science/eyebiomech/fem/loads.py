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
  anterior half only. The lids are fixed in the orbit: at an eccentric gaze the globe turns
  under them, so the bands are placed in the orbit frame (M5, Task 5.2).
- Orbital support: the globe is held by the orbit (Tenon's capsule, orbital fat), not by the
  optic nerve; a traction a + ω × x on the orbit's posterior hemisphere of the outer surface,
  with a and ω solved so that the dead loads above have zero net force and moment about the
  globe center. It carries the passive orbital moment the muscles balance at an eccentric gaze
  (`eyebiomech.forces.equilibrium`) and any remaining net force (approximation: the reaction's
  distribution is assumed).

The FEM works in the globe's own frame; `gaze(q)` sets the orientation q of the globe in the
orbit (from primary position), so an orbit-frame point is R(q) x. Dead loads act in the
reference configuration.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from eyebiomech.fem import assembly as asm
from eyebiomech.fem.data import load_eom_forces, load_materials
from eyebiomech.fem.units import kpa_to_mpa, mmhg_to_mpa
from eyebiomech.forces.equilibrium import capacities_n, equilibrium_forces, passive_moment
from eyebiomech.forces.from_viewer import rotation_matrix

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
    # Identity of the current load set: replaced on every change, it keys the dead-load vector
    # cached on each solver context (`Context.load_cache`). The cache lives on the context, so
    # a new context never sees a vector assembled on another (M4 follow-up: keying by id(ctx)
    # could reuse the id of a collected context).
    _token: object = field(default_factory=object, repr=False)
    # Orientation of the globe in the orbit (orbit-frame point = R x); identity in primary gaze.
    _gaze: NDArray = field(default_factory=lambda: np.eye(3), repr=False)

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

    def gaze(self, quaternion) -> Loads:
        """Set the globe's orientation in the orbit ([x, y, z, w] from primary position): the lid
        bands and the orbital reaction, fixed in the orbit, move over the globe's surface."""
        q = np.asarray(quaternion, dtype=float)
        if q.shape != (4,) or not np.all(np.isfinite(q)) or np.linalg.norm(q) == 0:
            raise ValueError(f"gaze must be a finite nonzero quaternion [x, y, z, w], got {q}")
        if any(item["kind"] == "gaze" for item in self.items):
            raise ValueError("the gaze is already set")
        self._gaze = rotation_matrix(q)
        self.items.append({"kind": "gaze", "quaternion": _vec(q / np.linalg.norm(q))})
        return self._changed()

    def eyelid(
        self,
        upper_kpa: float,
        lower_kpa: float,
        aperture_mm: float,
        upper_height_mm: float,
        lower_height_mm: float,
        upper_margin_mm: float | None = None,
        lower_margin_mm: float | None = None,
    ) -> Loads:
        """Lid bands of the given heights at the lid margins (orbit-frame heights above the
        corneal center, mm; the upper band above its margin, the lower below its). Without
        margins they sit symmetrically at ±aperture / 2."""
        for name, v in (("upper_kpa", upper_kpa), ("lower_kpa", lower_kpa)):
            if not np.isfinite(v) or v < 0:
                raise ValueError(f"{name} must be a non-negative pressure, got {v}")
        if not aperture_mm > 0 or upper_height_mm < 0 or lower_height_mm < 0:
            raise ValueError("eyelid aperture must be positive and band heights non-negative")
        upper = aperture_mm / 2 if upper_margin_mm is None else float(upper_margin_mm)
        lower = -aperture_mm / 2 if lower_margin_mm is None else float(lower_margin_mm)
        if not upper > lower:
            raise ValueError(
                f"the upper lid margin ({upper} mm) must lie above the lower ({lower})"
            )
        self.items.append(
            {
                "kind": "eyelid",
                "upperKPa": float(upper_kpa),
                "lowerKPa": float(lower_kpa),
                "apertureMm": float(upper - lower),
                "upperMarginMm": upper,
                "lowerMarginMm": lower,
                "upperHeightMm": float(upper_height_mm),
                "lowerHeightMm": float(lower_height_mm),
            }
        )
        return self._changed()

    def from_force_table(
        self,
        table,
        gaze_index: int,
        eom: dict,
        balance_moments: bool = True,
        passive: dict | bool | None = None,
    ) -> Loads:
        """One insertion per muscle of the force table's gaze, in the globe's frame, and the
        gaze itself (`gaze`), so lid bands and the orbital reaction added afterwards follow it.

        With `balance_moments` (the default) the forces are first brought into static
        equilibrium with the passive orbit within the muscles' capacities
        (`eyebiomech.forces.equilibrium`; `passive` is the table, None for
        data/eom/passive-orbit.json, or False for M4's torque balance with no passive moment and
        the total tension kept): the length-proxy activations of spec §4.4 v1 do not balance
        torque, and an unbalanced moment would twist the globe about the optic-nerve support.
        Each insertion records its table force and the passive moment; muscles the equilibrium
        unloads although the table loads them are listed in an "equilibrium" item
        (approximation: least change from the proxy, not the v2 minimum-activation program)."""
        body = table.body_frame(gaze_index)
        tendons = {m["name"]: m["tendon"] for m in eom["muscles"]}
        table_forces = np.asarray(table.force_n[gaze_index], dtype=float)
        quaternion = table.quaternions[gaze_index]
        self.gaze(quaternion)
        forces, moment = table_forces, np.zeros(3)
        if balance_moments and passive is False:
            forces = _torque_balanced(table_forces, body["insertion_mm"], body["insertion_dir"])
        elif balance_moments:
            moment = passive_moment(quaternion, None if passive in (None, True) else passive)
            forces = equilibrium_forces(
                table_forces,
                body["insertion_mm"],
                body["insertion_dir"],
                moment,
                capacities=capacities_n(names=table.muscles),
            )
        if balance_moments:
            unloaded = [
                name
                for name, f0, f in zip(table.muscles, table_forces, forces, strict=True)
                if f0 > 0 and f == 0
            ]
            self.items.append(
                {
                    "kind": "equilibrium",
                    "balance": "torque-only" if passive is False else "passive-orbit",
                    "passiveMomentNmm": _vec(moment),
                    "unloaded": unloaded,
                    "gazeDeg": _vec(table.gazes_deg[gaze_index]),
                }
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
            self.items[-1]["passiveMomentNmm"] = _vec(moment)
        return self

    def unloaded_muscles(self) -> list[str]:
        """Muscles the equilibrium switched off although the force table loads them."""
        return [m for item in self.items if item["kind"] == "equilibrium" for m in item["unloaded"]]

    def orbital_support(self) -> Loads:
        """Balance the dead loads with a distributed orbital reaction (see the module notes).
        Applied once, after the loads it balances are added; IOP needs none (it is
        self-equilibrated)."""
        if any(item["kind"] == "orbitalSupport" for item in self.items):
            raise ValueError("orbital support is already applied")
        self.items.append({"kind": "orbitalSupport", "region": "outer surface, orbit-frame z > 0"})
        return self._changed()

    def summary(self) -> list[dict]:
        """JSON-serializable list of the loads (for provenance)."""
        return [dict(item) for item in self.items]

    def _changed(self) -> Loads:
        self._token = object()
        return self

    # -- assembly ------------------------------------------------------------------------------

    def assemble(self, ctx, u: NDArray, scale: float, dead_scale: float | None = None):
        """External force vector and load stiffness ∂f_ext/∂u (or None) at displacement u, with
        the IOP scaled by `scale` and the dead loads by `dead_scale` (default `scale`)."""
        f = (scale if dead_scale is None else dead_scale) * self.dead_vector(ctx)
        K = None
        for item in self.items:
            if item["kind"] == "iop":
                p = mmhg_to_mpa(item["pressureMmHg"]) * scale
                fi, Ki = _follower_pressure(ctx, ctx.fb_inner, u, p)
                f = f + fi
                if Ki is not None:
                    K = Ki if K is None else K + Ki
        return f, K

    def dead_vector(self, ctx) -> NDArray:
        """The dead loads' (not the IOP's) load vector at full value, cached on the context."""
        cache = ctx.load_cache
        if self._token not in cache:
            cache[self._token] = self._dead(ctx)
        return cache[self._token]

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
                total += _eyelid_traction(item, x, N, self._gaze)
        if any(item["kind"] == "orbitalSupport" for item in self.items):
            total += _orbital_reaction(total, x, dx, self._gaze)
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


def _orbit(x: NDArray, R: NDArray) -> NDArray:
    """Orbit-frame coordinates R x of globe-frame points x (3, ...)."""
    return np.einsum("ij,j...->i...", R, x)


def _eyelid_traction(item: dict, x: NDArray, N: NDArray, R: NDArray) -> NDArray:
    xo = _orbit(x, R)
    up, low = item.get("upperMarginMm"), item.get("lowerMarginMm")
    if up is None:  # documents of the M4 summary shape
        up, low = item["apertureMm"] / 2, -item["apertureMm"] / 2
    y, front = xo[1], xo[2] < 0
    upper = front & (y >= up) & (y <= up + item["upperHeightMm"])
    lower = front & (y <= low) & (y >= low - item["lowerHeightMm"])
    p = upper * kpa_to_mpa(item["upperKPa"]) + lower * kpa_to_mpa(item["lowerKPa"])
    return -p * N


def _torque_balanced(forces: NDArray, centers: NDArray, directions: NDArray) -> NDArray:
    """M4's torque balance: the equilibrium with no external moment (see
    `eyebiomech.forces.equilibrium.equilibrium_forces`)."""
    return equilibrium_forces(forces, centers, directions, np.zeros(3), keep_total=True)


def _orbital_reaction(t: NDArray, x: NDArray, dx: NDArray, R: NDArray) -> NDArray:
    """Traction a + ω × x on the orbit's posterior hemisphere (orbit-frame z > 0) whose net force
    and moment about the origin cancel those of the traction field t."""
    F = np.einsum("ieq,eq->i", t, dx)
    M = np.einsum("ieq,eq->i", np.cross(x, t, axis=0), dx)
    region = (_orbit(x, R)[2] > 0).astype(float)
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
