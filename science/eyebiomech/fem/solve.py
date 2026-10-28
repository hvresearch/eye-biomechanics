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
# SuperLU settings (numerical): a minimum-degree ordering of the structurally symmetric
# pattern and a small diagonal pivot threshold. The stiffness is symmetric positive definite
# except for the small follower-pressure term; SuperLU's default (COLAMD, partial pivoting)
# is five to ten times slower on these shells.
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
    n: int
    vector_dofs: NDArray  # (3, nscalar): vector dof of component c at scalar dof k
    x_quad: NDArray  # (3, nel, nqp) quadrature points


def make_context(shell: ShellMesh) -> Context:
    e = ElementVector(ElementHex2())
    vb = Basis(shell.mesh, e, intorder=INTORDER)
    sb = Basis(shell.mesh, ElementHex2(), intorder=INTORDER)
    fb_inner = FacetBasis(shell.mesh, e, facets=shell.inner_facets, intorder=FACET_INTORDER)
    fb_outer = FacetBasis(shell.mesh, e, facets=shell.outer_facets, intorder=FACET_INTORDER)
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
    X = ctx.sb.doflocs
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
) -> Solution:
    """Displacement under `loads` with load stepping and Newton's method. Raises
    `NewtonDidNotConverge` (with the residual history) when an increment does not reach `tol`
    within `max_iter` iterations or produces non-finite values."""
    if steps < 1:
        raise ValueError("steps must be at least 1")
    ctx = context or make_context(shell)
    fixed = support_dofs(ctx, support, optic_nerve_radius_mm)
    free = np.setdiff1d(np.arange(ctx.n), fixed)
    u = np.zeros(ctx.n)
    f_full, _ = loads.assemble(ctx, u, 1.0)
    ref = max(np.linalg.norm(f_full[free]), 1e-300)
    history: list[float] = []
    for step in range(1, steps + 1):
        scale = step / steps
        for _ in range(max_iter):
            f_int, K_int = internal(ctx, materials, u)
            f_ext, K_ext = loads.assemble(ctx, u, scale)
            r = f_int - f_ext
            rel = float(np.linalg.norm(r[free]) / ref)
            history.append(rel)
            if not np.isfinite(rel):
                raise NewtonDidNotConverge(f"non-finite residual in load step {step}", history)
            if rel < tol:
                break
            K = K_int if K_ext is None else K_int - K_ext
            lu = splu(K[free][:, free].tocsc(), **LU_OPTIONS)
            du = lu.solve(-r[free])
            if not np.all(np.isfinite(du)):
                raise NewtonDidNotConverge(f"singular tangent in load step {step}", history)
            u[free] += du
        else:
            raise NewtonDidNotConverge(
                f"load step {step}/{steps} did not reach a relative residual of {tol:g} in "
                f"{max_iter} iterations (last {history[-1]:.3g})",
                history,
            )
    return Solution(
        u=u,
        context=ctx,
        residual_history=history,
        converged=True,
        load_steps=steps,
        fixed_dofs=fixed,
    )
