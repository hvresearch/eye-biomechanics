"""Newton solve of the elastic corneoscleral shell (M4 plan, Task 4.4, Deviations 3, 4).

Unknown: the displacement u in 27-node quadratic vector hexahedra. Residual
R(u) = ∫ P(F) : ∇v dV − f_ext(u), tangent K = ∫ ∇v : A : ∇du dV − ∂f_ext/∂u. Loads are applied
in equal increments; each increment runs Newton's method to a relative residual `tol`, solving
the sparse linear systems by LU factorization. Supports remove the rigid-body modes.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray
from scipy import sparse
from scipy.sparse.linalg import splu
from skfem import Basis, ElementHex2, ElementVector, FacetBasis

from eyebiomech.fem import assembly as asm
from eyebiomech.fem.loads import Loads
from eyebiomech.fem.mesh import REGIONS, ShellMesh

# Quadrature orders for the 27-node element (numerical): 4 on volumes and facets.
INTORDER = 4
FACET_INTORDER = 4
# Facet quadrature for the dead surface loads (numerical): their bands have edges that cut
# through facets, so a finer rule (6 × 6 points) integrates the indicators more closely.
LOAD_INTORDER = 10
# SuperLU settings (numerical): a minimum-degree ordering of the structurally symmetric
# pattern and a small diagonal pivot threshold. The stiffness is symmetric positive definite
# except for the small follower-pressure term; SuperLU's default (COLAMD, partial pivoting)
# is five to ten times slower on these shells.
# Halvings of a failed load increment before giving up (numerical).
MAX_STEP_CUTS = 6
LU_OPTIONS = {
    "permc_spec": "MMD_AT_PLUS_A",
    "diag_pivot_thresh": 0.01,
    "options": {"SymmetricMode": True},
}


class NewtonDidNotConverge(RuntimeError):
    def __init__(self, message: str, residual_history: list[float]):
        super().__init__(message)
        self.residual_history = residual_history


@dataclass
class Context:
    shell: ShellMesh
    vb: Basis
    sb: Basis
    fb_inner: FacetBasis
    fb_outer: FacetBasis
    fb_outer_loads: FacetBasis
    n: int
    vector_dofs: NDArray  # (3, nscalar): vector dof of component c at scalar dof k
    x_quad: NDArray  # (3, nel, nqp) quadrature points
    # Dead-load vectors assembled on this context, keyed by the load set's identity token.
    load_cache: dict = field(default_factory=dict, repr=False)


def make_context(shell: ShellMesh) -> Context:
    e = ElementVector(ElementHex2())
    vb = Basis(shell.mesh, e, intorder=INTORDER)
    sb = Basis(shell.mesh, ElementHex2(), intorder=INTORDER)
    fb_inner = FacetBasis(shell.mesh, e, facets=shell.inner_facets, intorder=FACET_INTORDER)
    fb_outer = FacetBasis(shell.mesh, e, facets=shell.outer_facets, intorder=FACET_INTORDER)
    fb_outer_loads = FacetBasis(shell.mesh, e, facets=shell.outer_facets, intorder=LOAD_INTORDER)
    vector_dofs = np.empty((3, sb.N), dtype=np.int64)
    for kind in ("nodal_dofs", "edge_dofs", "facet_dofs", "interior_dofs"):
        scalar = getattr(sb, kind)[0]
        vector_dofs[:, scalar] = getattr(vb, kind)
    return Context(
        shell=shell,
        vb=vb,
        sb=sb,
        fb_inner=fb_inner,
        fb_outer=fb_outer,
        fb_outer_loads=fb_outer_loads,
        n=vb.N,
        vector_dofs=vector_dofs,
        x_quad=np.asarray(vb.global_coordinates()),
    )


@dataclass
class Solution:
    u: NDArray
    context: Context
    residual_history: list[float] = field(default_factory=list)
    converged: bool = False
    load_steps: int = 0
    fixed_dofs: NDArray = field(default_factory=lambda: np.zeros(0, dtype=np.int64))

    def nodal(self) -> NDArray:
        """Displacement (3, N) at the mesh's dof locations (`mesh.doflocs` order)."""
        return self.u[self.context.vector_dofs]


def internal(ctx: Context, materials: dict, u: NDArray, tangent: bool = True):
    """Internal force vector and (optionally) tangent stiffness."""
    vb = ctx.vb
    grad = vb.interpolate(u).grad
    f = np.zeros(ctx.n)
    rows, cols, vals = [], [], []
    nel = vb.element_dofs.shape[1]
    region = ctx.shell.region
    for start in range(0, nel, asm.CHUNK):
        chunk = np.arange(start, min(start + asm.CHUNK, nel))
        for r, name in enumerate(REGIONS):
            sel = chunk[region[chunk] == r]
            if sel.size == 0:
                continue
            mat = materials[name]
            F = np.eye(3)[:, :, None, None] + grad[:, :, sel, :]
            x = ctx.x_quad[:, sel, :]
            G = asm.basis_gradients(vb, sel)
            dx = vb.dx[sel]
            P = asm.tensor_to_quadrature_vector(mat.first_pk(F, x))
            fe = asm.element_vectors(G, P, dx)
            dofs = vb.element_dofs[:, sel]
            f += asm.scatter_vector(ctx.n, dofs, fe)
            if tangent:
                A = asm.tensor_to_quadrature_matrix(mat.tangent_tensor(F, x))
                Ke = asm.element_matrices(G, A, dx)
                a = dofs.shape[0]
                rows.append(np.repeat(dofs.T[:, :, None], a, axis=2).ravel())
                cols.append(np.repeat(dofs.T[:, None, :], a, axis=1).ravel())
                vals.append(Ke.ravel())
    if not tangent:
        return f, None
    K = sparse.coo_matrix(
        (np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(ctx.n, ctx.n)
    ).tocsr()
    return f, K


def support_dofs(ctx: Context, support: str, optic_nerve_radius_mm: float | None = None) -> NDArray:
    """Fixed vector dofs: "optic_nerve" fixes every node within the optic-nerve radius of the
    posterior axis (z > 0); "axis_points" fixes the two tangential components at the six
    outer-surface points on the coordinate axes (consistent with any radial solution)."""
    X = ctx.sb.doflocs if ctx.shell.support_doflocs is None else ctx.shell.support_doflocs
    if support == "optic_nerve":
        if optic_nerve_radius_mm is None or not optic_nerve_radius_mm > 0:
            raise ValueError("the optic_nerve support needs a positive optic_nerve_radius_mm")
        sel = (np.hypot(X[0], X[1]) <= optic_nerve_radius_mm) & (X[2] > 0)
        if not np.any(sel):
            raise ValueError("no node lies within the optic-nerve radius")
        return np.sort(ctx.vector_dofs[:, sel].ravel())
    if support == "axis_points":
        r = np.linalg.norm(X, axis=0)
        fixed = []
        for axis in range(3):
            for sign in (-1.0, 1.0):
                target = np.zeros(3)
                target[axis] = sign * r.max()
                k = int(np.argmin(np.linalg.norm(X - target[:, None], axis=0)))
                if np.linalg.norm(X[:, k] - target) > 1e-9 * r.max():
                    raise ValueError(
                        "the mesh has no node on a coordinate axis (use an even n_face)"
                    )
                fixed.extend(ctx.vector_dofs[[c for c in range(3) if c != axis], k])
        return np.sort(np.asarray(fixed, dtype=np.int64))
    raise ValueError(f"unknown support {support!r}; expected 'optic_nerve' or 'axis_points'")


def solve(
    shell: ShellMesh,
    materials: dict,
    loads: Loads,
    *,
    support: str = "optic_nerve",
    optic_nerve_radius_mm: float | None = None,
    steps: int = 4,
    tol: float = 1e-8,
    max_iter: int = 25,
    context: Context | None = None,
    initial_u: NDArray | None = None,
    ramp: str = "all",
    max_cuts: int = MAX_STEP_CUTS,
) -> Solution:
    """Displacement under `loads` by incremental loading and Newton's method.

    `ramp="all"` raises every load together from zero; `ramp="dead"` holds the IOP at its full
    value and raises only the dead loads, starting from `initial_u` (normally the IOP-only
    equilibrium, so the other loads act on the pressurized globe). An increment that fails
    (non-finite values, an inverted element, or no convergence in `max_iter`) is retried at half
    the size, at most `max_cuts` times in a row; then `NewtonDidNotConverge` is raised with the
    residual history."""
    if steps < 1:
        raise ValueError("steps must be at least 1")
    if ramp not in ("all", "dead"):
        raise ValueError(f"unknown ramp {ramp!r}; expected 'all' or 'dead'")
    ctx = context or make_context(shell)
    fixed = support_dofs(ctx, support, optic_nerve_radius_mm)
    free = np.setdiff1d(np.arange(ctx.n), fixed)
    u = np.zeros(ctx.n) if initial_u is None else np.array(initial_u, dtype=float)
    u[fixed] = 0.0
    f_full, _ = loads.assemble(ctx, np.zeros(ctx.n), 1.0)
    ref = max(np.linalg.norm(f_full[free]), 1e-300)
    history: list[float] = []

    def scales(lam: float) -> tuple[float, float]:
        return (lam, lam) if ramp == "all" else (1.0, lam)

    def increment(lam: float, u_start: NDArray) -> NDArray:
        s_iop, s_dead = scales(lam)
        v = u_start.copy()
        for _ in range(max_iter):
            try:
                with np.errstate(all="ignore"):
                    f_int, K_int = internal(ctx, materials, v)
                    f_ext, K_ext = loads.assemble(ctx, v, s_iop, s_dead)
            except np.linalg.LinAlgError:
                raise _IncrementFailed("a singular deformation gradient") from None
            r = f_int - f_ext
            rel = float(np.linalg.norm(r[free]) / ref)
            history.append(rel)
            if not np.isfinite(rel):
                raise _IncrementFailed("non-finite residual (an element inverted)")
            if rel < tol:
                return v
            K = K_int if K_ext is None else K_int - K_ext
            lu = splu(K[free][:, free].tocsc(), **LU_OPTIONS)
            du = lu.solve(-r[free])
            if not np.all(np.isfinite(du)):
                raise _IncrementFailed("singular tangent")
            v[free] += du
        raise _IncrementFailed(f"no convergence in {max_iter} iterations (last {history[-1]:.3g})")

    lam, dlam, cuts, done = 0.0, 1.0 / steps, 0, 0
    while lam < 1.0 - 1e-12:
        target = min(1.0, lam + dlam)
        try:
            u = increment(target, u)
        except _IncrementFailed as exc:
            cuts += 1
            if cuts > max_cuts:
                raise NewtonDidNotConverge(
                    f"load increment to {target:.4g} failed after {max_cuts} step cuts: {exc}",
                    history,
                ) from None
            dlam /= 2
            continue
        lam, cuts, done = target, 0, done + 1
    return Solution(
        u=u,
        context=ctx,
        residual_history=history,
        converged=True,
        load_steps=done,
        fixed_dofs=fixed,
    )


class _IncrementFailed(RuntimeError):
    pass


@dataclass
class Tangent:
    """The factorized tangent stiffness of a solved state, for linear responses about it."""

    context: Context
    free: NDArray
    lu: object

    def solve(self, f: NDArray) -> NDArray:
        """Displacement (all dofs; zero at the supports) under the load vector f."""
        u = np.zeros(self.context.n)
        u[self.free] = self.lu.solve(f[self.free])
        return u


def tangent_at(
    solution: Solution,
    materials: dict,
    loads: Loads,
    *,
    support: str = "optic_nerve",
    optic_nerve_radius_mm: float | None = None,
) -> Tangent:
    """Factorize K = ∂f_int/∂u − ∂f_ext/∂u at `solution` (`loads` supplies the follower terms,
    normally the IOP of that state)."""
    ctx = solution.context
    _, K_int = internal(ctx, materials, solution.u)
    _, K_ext = loads.assemble(ctx, solution.u, 1.0)
    K = K_int if K_ext is None else K_int - K_ext
    fixed = support_dofs(ctx, support, optic_nerve_radius_mm)
    free = np.setdiff1d(np.arange(ctx.n), fixed)
    return Tangent(ctx, free, splu(K[free][:, free].tocsc(), **LU_OPTIONS))

