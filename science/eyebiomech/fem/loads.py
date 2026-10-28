"""Loads on the corneoscleral shell (M4 plan, Tasks 4.4 and 4.5).

`Loads` is a builder: each method records one load and returns the builder. `assemble`
returns the external force vector at the current displacement and, for follower loads, its
derivative (the load stiffness), each scaled by the load factor of the current step.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from eyebiomech.fem import assembly as asm
from eyebiomech.fem.units import mmhg_to_mpa


def _inv_det(F: NDArray) -> tuple[NDArray, NDArray]:
    Fm = np.moveaxis(F, (0, 1), (-2, -1))
    return np.moveaxis(np.linalg.inv(Fm), (-2, -1), (0, 1)), np.linalg.det(Fm)


@dataclass
class Loads:
    items: list[dict] = field(default_factory=list)

    def iop(self, pressure_mmhg: float) -> Loads:
        """Intraocular pressure: a follower pressure on the inner surface (it acts on the
        deformed area along the deformed normal)."""
        if not np.isfinite(pressure_mmhg) or pressure_mmhg < 0:
            raise ValueError(f"IOP must be a non-negative number of mmHg, got {pressure_mmhg}")
        self.items.append({"kind": "iop", "pressureMmHg": float(pressure_mmhg)})
        return self

    def summary(self) -> list[dict]:
        """JSON-serializable list of the loads (for provenance)."""
        return [dict(item) for item in self.items]

    # -- assembly ------------------------------------------------------------------------------

    def assemble(self, ctx, u: NDArray, scale: float):
        """External force vector and load stiffness ∂f_ext/∂u (or None) at displacement u."""
        f = np.zeros(ctx.n)
        K = None
        for item in self.items:
            if item["kind"] == "iop":
                p = mmhg_to_mpa(item["pressureMmHg"]) * scale
                fi, Ki = _follower_pressure(ctx, ctx.fb_inner, u, p)
                f += fi
                K = Ki if K is None else K + Ki
            else:  # pragma: no cover - guarded by the builder methods
                raise ValueError(f"unknown load kind {item['kind']!r}")
        return f, K


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
    N = fb.normals
    m = np.einsum("ij...,j...->i...", FiT, N)
    t = -p * J * m  # (3, nf, q)
    Phi = asm.basis_values(fb, elements)  # (nf, q, a, 3)
    G = asm.basis_gradients(fb, elements)  # (nf, q, a, 9)
    dx = fb.dx
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
