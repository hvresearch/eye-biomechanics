"""Stress-driven growth toward a homeostatic target: the remodeling layer on the elastic FEM
(spec §7; M5 plan, Task 5.7, Deviation 3; data/remodeling/growth.json).

Kinematics (Rodriguez, Hoger & McCulloch 1994): F = Fe·Fg with a growth tensor Fg = I + εg at
every quadrature point of the fixed reference mesh; the grown tissue stores Jg·W(Fe) per
reference volume, so P = Jg·Pe(F Fg⁻¹)·Fg⁻ᵀ. The growth tensor is a field, not a moved mesh: its
incompatible part leaves residual stress, through which growth feeds back on stress.

Law: dεg/dt = r · Pt (σ − h·σIOP) Pt / s_IOP, the tangent-plane part of the Cauchy stress
deviation from the homeostatic target (h times the IOP-only stress of the reference eye),
normalized by the local IOP membrane stress s_IOP = tr(Pt σIOP Pt)/2; r per year. In-plane
tensorial growth with the tissue's in-plane fiber dispersion stands in for fiber-aligned growth
(Grytz & Meschke 2010; approximation); fiber directions do not reorient (small strains).
Thickness (M6 plan, Task 6.6): with in-plane growth alone the pressurized shell's spherical
mode self-amplifies (growth enlarges the shell, which raises its membrane stress). The option
`thickness="stress"` adds growth through the thickness, κ · tr(drive)/2 · n nᵀ, so the shell
thickens where its mean in-plane stress exceeds the target (wall-thickening growth as in the
stress-modulated growth of arteries; κ the ratio of thickness to in-plane growth rate, from
data/remodeling/growth.json); `thickness="isochoric"` instead keeps Jg = 1 to first order,
−tr(drive) n nᵀ (the shell thins as it grows in area). The table's default is "none": the
thickness law makes the reduced model's modes restoring but not the explicit FEM growth, which
still runs away at the clamped optic-nerve cap (M6 plan, Outcome notes, Task 6.6).
Integration is explicit Euler; a step whose r·dt·λ (λ the largest local feedback, in-plane
tangent modulus over s_IOP) exceeds the table's `maxStepFraction` is refused.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
from numpy.typing import NDArray

from eyebiomech.fem import assembly as asm
from eyebiomech.fem.data import _load
from eyebiomech.fem.mesh import REGIONS
from eyebiomech.fem.solve import Context, Solution, make_context, solve


def load_growth_table(path=None) -> dict:
    return _load(path, "remodeling", "growth.json")


def _inv_det(F: NDArray) -> tuple[NDArray, NDArray]:
    Fm = np.moveaxis(F, (0, 1), (-2, -1))
    return np.moveaxis(np.linalg.inv(Fm), (-2, -1), (0, 1)), np.linalg.det(Fm)


def _mm(A: NDArray, B: NDArray) -> NDArray:
    return np.einsum("ik...,kj...->ij...", A, B)


class GrownMaterial:
    """A material whose reference volume has grown by `fg` (3, 3, ...), broadcastable to the
    trailing shape of the deformation gradients it is evaluated at."""

    def __init__(self, base, fg: NDArray):
        self.base = base
        self.fg = np.asarray(fg, dtype=float)
        self.fg_inv, self.jg = _inv_det(self.fg)

    def _elastic(self, F: NDArray) -> NDArray:
        return _mm(F, self.fg_inv)

    def energy(self, F: NDArray, x: NDArray | None = None) -> NDArray:
        return self.jg * self.base.energy(self._elastic(F), x)

    def first_pk(self, F: NDArray, x: NDArray | None = None) -> NDArray:
        Pe = self.base.first_pk(self._elastic(F), x)
        return self.jg * np.einsum("ik...,jk...->ij...", Pe, self.fg_inv)

    def tangent_tensor(self, F: NDArray, x: NDArray | None = None) -> NDArray:
        Ae = self.base.tangent_tensor(self._elastic(F), x)
        G = self.fg_inv
        return self.jg * np.einsum("ipkq...,jp...,lq...->ijkl...", Ae, G, G)

    def tangent(self, F: NDArray, dF: NDArray, x: NDArray | None = None) -> NDArray:
        dFe = _mm(dF, self.fg_inv)
        dPe = self.base.tangent(self._elastic(F), dFe, x)
        return self.jg * np.einsum("ik...,jk...->ij...", dPe, self.fg_inv)


@dataclass
class GrowthState:
    eps: NDArray  # (3, 3, nel, nq) growth strain εg, symmetric
    age_years: float = 0.0

    @staticmethod
    def zero(ctx: Context, age_years: float = 0.0) -> GrowthState:
        nel, nq = ctx.x_quad.shape[1:]
        return GrowthState(np.zeros((3, 3, nel, nq)), age_years)

    def fg(self) -> NDArray:
        return np.eye(3)[:, :, None, None] + self.eps

    def material(self, base, elements: NDArray) -> GrownMaterial:
        return GrownMaterial(base, self.fg()[:, :, elements, :])


def _region_chunks(ctx: Context):
    nel = ctx.vb.element_dofs.shape[1]
    for start in range(0, nel, asm.CHUNK):
        chunk = np.arange(start, min(start + asm.CHUNK, nel))
        for r, name in enumerate(REGIONS):
            sel = chunk[ctx.shell.region[chunk] == r]
            if sel.size:
                yield name, sel


def cauchy_stress(
    ctx: Context, materials: dict, u: NDArray, growth: GrowthState | None = None
) -> NDArray:
    """Cauchy stress σ = P Fᵀ / J at the quadrature points (3, 3, nel, nq), MPa."""
    grad = ctx.vb.interpolate(u).grad
    nel, nq = ctx.x_quad.shape[1:]
    sigma = np.zeros((3, 3, nel, nq))
    for name, sel in _region_chunks(ctx):
        mat = materials[name] if growth is None else growth.material(materials[name], sel)
        F = np.eye(3)[:, :, None, None] + grad[:, :, sel, :]
        P = mat.first_pk(F, ctx.x_quad[:, sel, :])
        _, J = _inv_det(F)
        sigma[:, :, sel, :] = np.einsum("ik...,jk...->ij...", P, F) / J
    return sigma


def tangent_projector(ctx: Context) -> NDArray:
    """Pt = I − n nᵀ at the quadrature points (3, 3, nel, nq), n the outer surface's normal in
    the direction of each point (the shell's in-plane directions)."""
    n = ctx.shell.geometry.outer_normal(ctx.x_quad)
    return np.eye(3)[:, :, None, None] - np.einsum("i...,j...->ij...", n, n)


def _in_plane(sigma: NDArray, Pt: NDArray) -> NDArray:
    return np.einsum("ik...,kl...,lj...->ij...", Pt, sigma, Pt)


def growth_mask(
    ctx: Context, support: str = "optic_nerve", optic_nerve_radius_mm: float | None = None
) -> NDArray:
    """Quadrature points that grow (nel, nq): all but those inside the clamped optic-nerve cap,
    which the model holds rigid (its IOP stress is not a membrane stress; the lamina and nerve
    head are not modeled)."""
    x = ctx.x_quad
    if support != "optic_nerve":
        return np.ones(x.shape[1:], dtype=bool)
    return ~((np.hypot(x[0], x[1]) <= optic_nerve_radius_mm) & (x[2] > 0))


def membrane_stress(sigma_iop: NDArray, Pt: NDArray, mask: NDArray | None = None) -> NDArray:
    """s_IOP = tr(Pt σ Pt)/2 at the quadrature points (1 where `mask` is False); refuses a
    growing point that is not in tension."""
    s = 0.5 * np.einsum("ii...->...", _in_plane(sigma_iop, Pt))
    if mask is not None:
        s = np.where(mask, s, 1.0)
    if not np.all(s > 0):
        raise ValueError("the IOP-only stress is not tensile in-plane at every growing point")
    return s


Thickness = Literal["none", "isochoric", "stress"]


def growth_law(thickness: Thickness | None = None, kappa: float | None = None):
    """(thickness, kappa): the given law, or the growth table's when `thickness` is None."""
    if thickness is not None:
        return thickness, kappa
    law = load_growth_table()["thickness"]
    return law["form"], law.get("kappa")


def growth_strain(
    drive: NDArray, ctx: Context, thickness: Thickness = "none", kappa: float | None = None
) -> NDArray:
    """The growth strain (3, 3, nel, nq) per unit of an in-plane drive (Pt δσ Pt / s_IOP):
    the drive itself, plus −tr(drive) n nᵀ ("isochoric") or κ tr(drive)/2 n nᵀ ("stress"),
    n the outer surface's normal at each point (module notes)."""
    if thickness == "none":
        return drive
    n = ctx.shell.geometry.outer_normal(ctx.x_quad)
    nn = np.einsum("i...,j...->ij...", n, n)
    trace = np.einsum("ii...->...", drive)
    if thickness == "isochoric":
        return drive - trace * nn
    if thickness == "stress":
        if kappa is None or not kappa >= 0:
            raise ValueError(f"stress-driven thickness growth needs kappa >= 0, got {kappa}")
        return drive + 0.5 * kappa * trace * nn
    raise ValueError(f"unknown thickness {thickness!r}; expected 'none', 'isochoric', or 'stress'")


def growth_rate(
    sigma: NDArray,
    sigma_iop: NDArray,
    ctx: Context,
    *,
    rate_per_year: float,
    ratio: float,
    mask: NDArray | None = None,
    thickness: Thickness | None = None,
    kappa: float | None = None,
) -> NDArray:
    """dεg/dt (3, 3, nel, nq), per year; zero where `mask` is False. The thickness law is the
    growth table's unless given (`growth_law`)."""
    if not rate_per_year >= 0:
        raise ValueError(f"the growth rate must be non-negative, got {rate_per_year}")
    Pt = tangent_projector(ctx)
    deviation = _in_plane(sigma, Pt) - ratio * _in_plane(sigma_iop, Pt)
    drive = deviation / membrane_stress(sigma_iop, Pt, mask)
    rate = rate_per_year * growth_strain(drive, ctx, *growth_law(thickness, kappa))
    return rate if mask is None else np.where(mask, rate, 0.0)


def feedback_estimate(
    ctx: Context,
    materials: dict,
    u: NDArray,
    sigma_iop: NDArray,
    growth: GrowthState,
    mask: NDArray | None = None,
) -> float:
    """λ = max over the quadrature points of the in-plane tangent modulus (along the two
    principal in-plane directions of the projector, e·A:(e⊗e)·e) over s_IOP: the rate at which
    a unit growth rate is fed back as stress, per unit r."""
    grad = ctx.vb.interpolate(u).grad
    Pt = tangent_projector(ctx)
    s0 = membrane_stress(sigma_iop, Pt, mask)
    active = np.ones(s0.shape, dtype=bool) if mask is None else mask
    n = ctx.shell.geometry.outer_normal(ctx.x_quad)
    # Two in-plane unit directions: any vector not parallel to n, projected, and n × it.
    helper = np.where(np.abs(n[2]) < 0.9, 1.0, 0.0)
    a = np.stack([np.zeros_like(helper), np.zeros_like(helper), helper]) + np.stack(
        [1.0 - helper, np.zeros_like(helper), np.zeros_like(helper)]
    )
    e1 = a - np.sum(a * n, axis=0) * n
    e1 /= np.linalg.norm(e1, axis=0)
    e2 = np.cross(n, e1, axis=0)
    lam = 0.0
    for name, sel in _region_chunks(ctx):
        mat = growth.material(materials[name], sel)
        F = np.eye(3)[:, :, None, None] + grad[:, :, sel, :]
        for e in (e1, e2):
            es = e[:, sel, :]
            dP = mat.tangent(F, np.einsum("i...,j...->ij...", es, es), ctx.x_quad[:, sel, :])
            modulus = np.einsum("i...,ij...,j...->...", es, dP, es)
            ratio_sel = np.where(active[sel], modulus / s0[sel], 0.0)
            lam = max(lam, float(np.max(ratio_sel)))
    return lam


def grow(
    shell,
    materials: dict,
    loads,
    state: GrowthState,
    sigma_iop: NDArray,
    *,
    rate_per_year: float,
    ratio: float,
    dt_years: float,
    context: Context | None = None,
    optic_nerve_radius_mm: float | None = None,
    support: str = "optic_nerve",
    initial_u: NDArray | None = None,
    max_step_fraction: float | None = None,
    steps: int = 2,
    thickness: Thickness | None = None,
    kappa: float | None = None,
) -> tuple[GrowthState, Solution]:
    """One explicit growth step: the equilibrium under `loads` at the current growth (from
    `initial_u` when given, else ramped from zero), the growth rate there, the updated growth
    state, and the equilibrium at the new growth."""
    if not dt_years > 0:
        raise ValueError(f"the time step must be positive, got {dt_years}")
    ctx = context or make_context(shell)
    limit = (
        load_growth_table()["maxStepFraction"]["value"]
        if max_step_fraction is None
        else max_step_fraction
    )
    kw = {"support": support, "optic_nerve_radius_mm": optic_nerve_radius_mm, "context": ctx}
    if initial_u is None:
        now = solve(shell, materials, loads, steps=steps, growth=state, **kw)
    else:
        now = solve(
            shell, materials, loads, steps=1, initial_u=initial_u, ramp="none", growth=state, **kw
        )
    sigma = cauchy_stress(ctx, materials, now.u, state)
    mask = growth_mask(ctx, support, optic_nerve_radius_mm)
    rate = growth_rate(
        sigma,
        sigma_iop,
        ctx,
        rate_per_year=rate_per_year,
        ratio=ratio,
        mask=mask,
        thickness=thickness,
        kappa=kappa,
    )
    if np.isfinite(limit):
        lam = feedback_estimate(ctx, materials, now.u, sigma_iop, state, mask)
        if rate_per_year * dt_years * lam > limit:
            raise ValueError(
                f"growth step r dt lambda = {rate_per_year * dt_years * lam:.3g} exceeds "
                f"{limit:g}; take dt below {limit / (rate_per_year * lam):.3g} years"
            )
    new = GrowthState(state.eps + dt_years * rate, state.age_years + dt_years)
    after = solve(shell, materials, loads, steps=1, initial_u=now.u, ramp="none", growth=new, **kw)
    return new, after
