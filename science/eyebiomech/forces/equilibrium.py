"""Static equilibrium of the extraocular muscle forces against the passive orbit (M5 plan,
Task 5.2, Deviation 5).

The orbit's passive tissues (and the muscles' passive elasticity) pull an eccentric eye back
toward primary position with a moment `M = −K θ` (`data/eom/passive-orbit.json`; θ the gaze
rotation vector in degrees, K diagonal about the orbit's x, y, z axes). The agonist must exceed
its antagonist by that moment. `equilibrium_forces` changes the length-proxy forces by the
smallest weighted amount that makes the muscle moments about the globe center cancel the
passive moment, with every force between zero and the muscle's capacity.

M4's torque balance (`eyebiomech.fem.loads._torque_balanced`, `keep_total=True` with no
external moment) also held the total tension fixed, to exclude the all-zero set. With the
passive moment that constraint does harm (decided in M5 Task 5.2): the proxy's agonist moment
is about twice the passive moment (7.9 against 3.5 N·mm at 30° adduction), and keeping the
total forced the excess tension into the other muscles, which in adduction meant switching the
medial rectus off and loading the vertical recti and obliques that also adduct there. Without
it, the least change removes the excess from the agonist and keeps every muscle the table
loads, at every gaze of the ±30° lattice; the all-zero set is not a candidate because the
proxy anchors the solution.

This is spec §4.4's v2 static equilibrium in its simplest form: least change from the proxy
rather than least total activation (which would zero the primary-position tone); approximation.
"""

from __future__ import annotations

import itertools

import numpy as np
from numpy.typing import ArrayLike, NDArray

from eyebiomech.fem.data import _load
from eyebiomech.forces.from_viewer import rotation_matrix


def load_passive_orbit(path=None) -> dict:
    return _load(path, "eom", "passive-orbit.json")


def stiffness_nmm_per_deg(table: dict) -> NDArray:
    """Diagonal of K about the orbit's x (vertical rotations), y (horizontal), and z (torsion)
    axes, N·mm per degree."""
    if table.get("form") != "linear":
        raise ValueError(f"unknown passive-orbit form {table.get('form')!r}")
    k = table["stiffnessGfPerDeg"]
    scale = table["gramForceToN"] * table["leverArmMm"]
    return scale * np.array([k["vertical"], k["horizontal"], k["torsional"]], dtype=float)


def passive_moment(quaternion: ArrayLike, table: dict | None = None) -> NDArray:
    """The orbit's moment on the globe at the gaze `quaternion` ([x, y, z, w], the orientation
    from primary position), N·mm, in the globe's own (body) frame."""
    table = table or load_passive_orbit()
    q = np.asarray(quaternion, dtype=float)
    q = q / np.linalg.norm(q)
    if q[3] < 0:
        q = -q
    s = np.linalg.norm(q[:3])
    theta = np.zeros(3) if s == 0 else 2 * np.arctan2(s, q[3]) * q[:3] / s  # radians, orbit frame
    m_orbit = -stiffness_nmm_per_deg(table) * np.degrees(theta)
    return rotation_matrix(q).T @ m_orbit


def capacities_n(forces_table: dict | None = None, names=None) -> NDArray:
    """Each muscle's force capacity, N (data/eom/forces.json), in `MUSCLE_NAMES` order."""
    from eyebiomech.fem.data import load_eom_forces
    from eyebiomech.forces.from_viewer import MUSCLE_NAMES

    t = forces_table or load_eom_forces()
    return np.array(
        [t["muscles"][m]["maxForceGf"] * t["gramForceToN"] for m in (names or MUSCLE_NAMES)]
    )


def equilibrium_forces(
    proxy_forces: ArrayLike,
    centers: ArrayLike,
    directions: ArrayLike,
    external_moment: ArrayLike,
    capacities: ArrayLike | None = None,
    keep_total: bool = False,
) -> NDArray:
    """Forces f with Σ fᵢ (cᵢ × dᵢ) = −external_moment and 0 ≤ fᵢ ≤ capacityᵢ (no upper bound
    without capacities), closest to the proxy forces in the weighted norm Σ ((fᵢ − proxyᵢ) /
    sᵢ)², sᵢ = max(proxyᵢ, mean / 4); with `keep_total` also Σ fᵢ = Σ proxyᵢ (M4's balance).

    A small convex quadratic program, solved exactly by enumerating which muscles sit at a
    bound: each choice is an equality-constrained least-squares problem with a closed-form
    (least-norm) solution, and the optimum is the cheapest one inside the bounds. Unlike an
    iterative solver this gives the same answer, to round-off, on every CPU. Raises `ValueError`
    when no force set within the bounds balances the moment."""
    f0 = np.asarray(proxy_forces, dtype=float)
    c = np.asarray(centers, dtype=float)
    d = np.asarray(directions, dtype=float)
    M = np.asarray(external_moment, dtype=float)
    n = len(f0)
    cap = np.full(n, np.inf) if capacities is None else np.asarray(capacities, dtype=float)
    A = np.cross(c, d).T  # (3, 6): moment per newton
    if np.linalg.norm(A @ f0 + M) == 0 and not keep_total:
        return f0.copy()
    s = np.maximum(f0, max(f0.mean(), 1e-12) / 4)
    B, b = A, -M
    if keep_total:
        B = np.vstack([A, np.ones((1, n))])
        b = np.concatenate([-M, [f0.sum()]])
    scale = np.linalg.norm(A, axis=0).max() * max(f0.max(), np.linalg.norm(M) / 12.0)
    tol = 1e-10 * scale
    best, best_cost = None, np.inf
    for states in itertools.product((0, 1, 2), repeat=n):  # free, at zero, at capacity
        state = np.array(states)
        if np.any((state == 2) & ~np.isfinite(cap)):
            continue
        free = state == 0
        f = np.where(state == 2, cap, 0.0)
        if np.any(free):
            Bs = B[:, free] * s[free]
            g = np.linalg.lstsq(Bs, b - B[:, ~free] @ f[~free] - B[:, free] @ f0[free], rcond=None)[
                0
            ]
            f[free] = f0[free] + s[free] * g
        if np.linalg.norm(B @ f - b) > tol:
            continue
        slack = 1e-12 * max(f0.max(), 1e-12)
        if f.min() < -slack or np.any(f > cap + slack):
            continue
        f = np.clip(f, 0.0, cap)
        cost = np.sum(((f - f0) / s) ** 2)
        if cost < best_cost:
            best, best_cost = f, cost
    if best is None:
        raise ValueError(
            f"no non-negative muscle forces within capacity balance the moment "
            f"{np.round(M, 4).tolist()} N·mm"
        )
    return np.where(best < 1e-12 * f0.max(), 0.0, best)
