"""Hyperelastic materials for the corneoscleral shell (M4 plan, Task 4.4, Deviation 11).

Matrix: compressible neo-Hookean, W = μ/2 (I₁ − 3) − μ ln J + λ/2 (ln J)².
Fibers: Holzapfel–Gasser–Ogden families with the dispersed invariant
E = κ(I₁ − 3) + (1 − 3κ)(I₄ − 1) = H : C − 1, H = κ I + (1 − 3κ) a₀⊗a₀, and
W_f = k₁/(2k₂) (exp(k₂ E²) − 1), active only in tension (E > 0).

Arrays: deformation gradients are (3, 3, ...) with any trailing shape (skfem's (elements,
quadrature points)); fiber directions are unit reference vectors (3, ...) broadcastable to it.
`tangent(F, dF)` is the directional derivative dP[dF] of the first Piola–Kirchhoff stress.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence

import numpy as np
from numpy.typing import NDArray

from eyebiomech.fem.data import age_factor, lame_lambda

FiberSource = Sequence[NDArray] | Callable[[NDArray], Sequence[NDArray]]


def _mT(A: NDArray) -> NDArray:
    return np.swapaxes(A, 0, 1)


def _mm(A: NDArray, B: NDArray) -> NDArray:
    return np.einsum("ik...,kj...->ij...", A, B)


def _inv_det(F: NDArray) -> tuple[NDArray, NDArray]:
    Fm = np.moveaxis(F, (0, 1), (-2, -1))
    return np.moveaxis(np.linalg.inv(Fm), (-2, -1), (0, 1)), np.linalg.det(Fm)


class NeoHookean:
    def __init__(self, mu: float, lam: float):
        if mu <= 0 or lam <= 0:
            raise ValueError("mu and lambda must be positive")
        self.mu = float(mu)
        self.lam = float(lam)

    def _fiber_terms(self, F: NDArray, x: NDArray | None):  # no fibers
        return []

    def energy(self, F: NDArray, x: NDArray | None = None) -> NDArray:
        _, J = _inv_det(F)
        lnJ = np.log(J)
        I1 = np.einsum("ij...,ij...->...", F, F)
        w = 0.5 * self.mu * (I1 - 3) - self.mu * lnJ + 0.5 * self.lam * lnJ**2
        for E, _FH, _ in self._fiber_terms(F, x):
            w = w + self._psi(E)
        return w

    def first_pk(self, F: NDArray, x: NDArray | None = None) -> NDArray:
        Finv, J = _inv_det(F)
        FinvT = _mT(Finv)
        P = self.mu * F + (self.lam * np.log(J) - self.mu) * FinvT
        for E, FH, _ in self._fiber_terms(F, x):
            P = P + 2 * self._dpsi(E) * FH
        return P

    def tangent(self, F: NDArray, dF: NDArray, x: NDArray | None = None) -> NDArray:
        Finv, J = _inv_det(F)
        FinvT = _mT(Finv)
        tr = np.einsum("ij...,ji...->...", Finv, dF)  # tr(F⁻¹ dF)
        dP = (
            self.mu * dF
            + self.lam * tr * FinvT
            + (self.mu - self.lam * np.log(J)) * _mm(_mm(FinvT, _mT(dF)), FinvT)
        )
        for E, FH, Hm in self._fiber_terms(F, x):
            dE = 2 * np.einsum("ij...,ij...->...", FH, dF)
            dP = dP + 2 * self._dpsi(E) * _mm(dF, Hm) + 2 * self._d2psi(E) * dE * FH
        return dP

    def tangent_tensor(self, F: NDArray, x: NDArray | None = None) -> NDArray:
        """A = ∂P/∂F as (3, 3, 3, 3, ...), dP_ij = A_ijkl dF_kl."""
        Finv, J = _inv_det(F)
        FiT = _mT(Finv)
        lnJ = np.log(J)
        eye = np.eye(3).reshape((3, 3) + (1,) * (F.ndim - 2))
        A = (
            self.mu * np.einsum("ik...,jl...->ijkl...", eye, eye)
            + self.lam * np.einsum("ij...,kl...->ijkl...", FiT, FiT)
            + (self.mu - self.lam * lnJ) * np.einsum("il...,kj...->ijkl...", FiT, FiT)
        )
        for E, FH, Hm in self._fiber_terms(F, x):
            A = A + 2 * self._dpsi(E) * np.einsum("ik...,lj...->ijkl...", eye, Hm)
            A = A + 4 * self._d2psi(E) * np.einsum("ij...,kl...->ijkl...", FH, FH)
        return A

    # Fiber energy pieces; overridden by HGO.
    def _psi(self, E):
        return 0.0

    def _dpsi(self, E):
        return 0.0

    def _d2psi(self, E):
        return 0.0


class HGO(NeoHookean):
    def __init__(
        self, mu: float, lam: float, k1: float, k2: float, kappa: float, fibers: FiberSource
    ):
        super().__init__(mu, lam)
        if k1 <= 0 or k2 <= 0:
            raise ValueError("k1 and k2 must be positive")
        if not 0 <= kappa < 1 / 3:
            raise ValueError("kappa must lie in [0, 1/3)")
        self.k1 = float(k1)
        self.k2 = float(k2)
        self.kappa = float(kappa)
        self.fibers = fibers

    def _directions(self, x: NDArray | None) -> Sequence[NDArray]:
        if callable(self.fibers):
            if x is None:
                raise ValueError("these fibers depend on position; pass the points x")
            return self.fibers(x)
        return self.fibers

    def _fiber_terms(self, F: NDArray, x: NDArray | None):
        out = []
        eye = np.eye(3).reshape((3, 3) + (1,) * (F.ndim - 2))
        for a in self._directions(x):
            a = np.asarray(a, dtype=float)
            Hm = self.kappa * eye + (1 - 3 * self.kappa) * np.einsum("i...,j...->ij...", a, a)
            FH = _mm(F, Hm)
            E = np.einsum("ij...,ij...->...", FH, F) - 1.0  # H : C − 1
            out.append((E, FH, Hm))
        return out

    def _psi(self, E):
        Ep = np.maximum(E, 0.0)
        return self.k1 / (2 * self.k2) * np.expm1(self.k2 * Ep**2)

    def _dpsi(self, E):
        Ep = np.maximum(E, 0.0)
        return self.k1 * Ep * np.exp(self.k2 * Ep**2)

    def _d2psi(self, E):
        on = E > 0
        Ep = np.maximum(E, 0.0)
        return np.where(on, self.k1 * np.exp(self.k2 * Ep**2) * (1 + 2 * self.k2 * Ep**2), 0.0)


_FAMILIES = ("nasalTemporal", "superiorInferior", "circumferential", "meridional")


def _tangent_projection(v: NDArray, n: NDArray) -> NDArray:
    t = v - np.sum(v * n, axis=0) * n
    return t / np.linalg.norm(t, axis=0)


def fiber_directions(x: NDArray, family: str, geometry) -> NDArray:
    """Unit fiber direction of `family` at points x (3, ...), tangent to the outer surface's
    local plane (normal from `geometry.outer_normal`)."""
    shape = x.shape
    x2 = x.reshape(3, -1)
    n = geometry.outer_normal(x2)
    ones = np.ones(x2.shape[1])
    zeros = np.zeros(x2.shape[1])
    rho = np.hypot(x2[0], x2[1])
    # Azimuthal direction about the optical axis; at the poles any in-plane direction will do.
    safe = rho > 1e-9 * np.linalg.norm(x2, axis=0)
    e_phi = np.where(
        safe,
        np.stack([-x2[1], x2[0], zeros]) / np.where(safe, rho, 1.0),
        np.stack([zeros, ones, zeros]),
    )
    if family == "nasalTemporal":
        a = _tangent_projection(np.stack([ones, zeros, zeros]), n)
    elif family == "superiorInferior":
        a = _tangent_projection(np.stack([zeros, ones, zeros]), n)
    elif family == "circumferential":
        a = _tangent_projection(e_phi, n)
    elif family == "meridional":
        a = _tangent_projection(np.cross(n, e_phi, axis=0), n)
    else:
        raise ValueError(f"unknown fiber family {family!r}; expected one of {_FAMILIES}")
    return a.reshape(shape)


def region_materials(materials: dict, age_years: float, geometry=None) -> dict[str, HGO]:
    """One HGO material per region with the age factor applied to μ, λ, and k₁. With a
    geometry, fiber directions follow the shell at the quadrature points; without one, the
    materials carry no fiber callable (for inspection only)."""
    factor = age_factor(age_years, materials)
    out = {}
    for name, region in materials["regions"].items():
        mu = region["matrix"]["muMPa"] * factor
        lam = lame_lambda(mu, region["matrix"]["poissonRatio"])
        fib = region["fibers"]
        families = tuple(fib["families"])

        def directions(x, families=families):
            return [fiber_directions(x, f, geometry) for f in families]

        out[name] = HGO(
            mu=mu,
            lam=lam,
            k1=fib["k1MPa"] * factor,
            k2=fib["k2"],
            kappa=fib["kappa"],
            fibers=directions if geometry is not None else [],
        )
    return out
