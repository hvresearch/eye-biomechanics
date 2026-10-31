"""Reduced-order response library: the FEM linearized about the pressurized eye, for the
population forward model (M5 plan, Task 5.8, Deviation 2).

One production FEM solve takes minutes; the calibration evaluates a cohort over 85 years of age
thousands of times. The library is therefore built once from the FEM and the forward model only
superposes it:

1. The stress-free shell is found by the inverse solve and pressurized to the reference IOP
   (state u₀); the tangent stiffness K there (with the follower-pressure term) is factorized.
2. Each load group k of `eyebiomech.remodel.history.GROUPS` (the muscles in equilibrium at the
   duty cycle's distance and near gazes, the lid bands at each gaze, the ciliary ring per
   diopter at the near gaze; each with the orbital reaction that balances it) gives the linear
   response u_k = K⁻¹ f_k, its induced refraction e_k (exporter + paraxial optics), and its
   stress change δσ_k, whose growth drive is g_k = Pt δσ_k Pt / s_IOP (growth per unit rate and
   intensity; the "homeostatic" group's drive is Pt σ_IOP Pt / s_IOP, per unit 1 − h, with no
   elastic response).
3. A unit growth of each drive pattern, εg = g_l, gives the eigenstrain response u_gl =
   −K⁻¹ ∂f_int/∂εg · g_l, its refraction γ_l, and the drive of its stress change d_l (the
   feedback, normally restoring).
4. The basis is enriched with a Krylov sequence (`KRYLOV_DEPTH` rounds): the feedback drives
   d_l of the newest patterns, orthogonalized against the basis and normalized, become further
   patterns with their own γ and d (no load drives them directly). The load patterns alone miss
   the shapes that growth itself produces: their span restores an astigmatic mode that the FEM
   grows (M5 plan, Task 5.14, Step 4).
5. The growth dynamics are reduced to the span of the basis (Galerkin): with εg = Σ a_l g_l,
   da/dt = r (L(t) + F a), F = G⁺ H, G_kl = ⟨g_k, g_l⟩, H_kl = ⟨g_k, d_l⟩ (volume-weighted
   tensor inner products over the growing points; L is zero on the Krylov patterns). The
   refraction change at time t is Σ_k L_k e_k (elastic) + Σ_l a_l γ_l (growth); "remodeled" is
   their sum. The reduction is validated up to a growth exposure r·t of `VALID_RATE_TIME`, and
   `simulate` refuses longer exposures: the slow growth modes, among them a spherical mode that
   grows at the calibrated stiffness, do not converge with the Krylov depth, and the explicit
   FEM growth the bound is checked against runs away at the edge of the clamped optic-nerve
   cap shortly beyond it. The growth table's thickness option (M6) makes every mode restoring
   but does not move the FEM's runaway, so the in-plane law stays the default.

Responses are tabled at several stiffness scales (relative to the calibrated stiffness) and
interpolated linearly in ln s (an approximation: the Krylov patterns differ between levels, and
blending them agrees with interpolating per-level results within about 3% inside the validated
exposure); a stiffness outside the table raises `StiffnessOutOfTable` unless the caller asks to
clamp it to the nearest level. Approximations, labeled wherever the library is used: linear
superposition about the pressurized eye; the growth dynamics reduced to the span of the load
patterns and their Krylov sequence, for growth exposures up to `VALID_RATE_TIME`; the
reference eye's responses for every subject; the growth patterns and feedback of the stiffness
at which they are evaluated (the reference geometry does not evolve between ages).
"""

from __future__ import annotations

import copy
import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Literal

import numpy as np
from numpy.typing import NDArray

from eyebiomech.fem.data import data_root, load_eom_table, load_materials
from eyebiomech.fem.export import build_result
from eyebiomech.fem.inverse import unloaded_shell
from eyebiomech.fem.loads import Loads
from eyebiomech.fem.material import region_materials
from eyebiomech.fem.mesh import make_shell_mesh
from eyebiomech.fem.solve import internal, make_context, solve, tangent_at
from eyebiomech.forces.from_viewer import load_force_table
from eyebiomech.optics.paraxial import induced_refraction
from eyebiomech.remodel.growth import (
    GrowthState,
    Thickness,
    cauchy_stress,
    growth_law,
    growth_mask,
    growth_strain,
    membrane_stress,
    tangent_projector,
)
from eyebiomech.remodel.history import GROUPS

SCHEMA = "eye-response/1"
# Relative size of the growth perturbation for the finite differences of the eigenstrain load
# and its stress (numerical: well inside the linear range, far above round-off).
GROWTH_PROBE = 1e-4
# Largest displacement at which a linear response's refraction is evaluated, mm (numerical:
# the corneal maps are fitted from the exporter's samples, which allow 250 µm of lateral motion).
REFRACTION_PROBE_MM = 1e-3
# Singular values of G below this fraction of the largest are dropped from the projection
# (numerical: near-collinear load patterns).
PROJECTION_RCOND = 1e-8
# Krylov depth of the growth basis: rounds of feedback drives added to the load patterns
# (numerical: on the coarse mesh at 0.5, 1, and 2 times the calibrated stiffness, depths 4 and 6
# agree within 6% in M and J0 up to r·t = 0.01, and depth 6 follows explicit FEM growth there;
# depth 0, the load patterns alone, misses the FEM's J0 growth by a factor of 3 at r·t = 2e-3;
# M5 plan, Task 5.14, Step 4).
KRYLOV_DEPTH = 6
# A Krylov pattern whose part orthogonal to the basis is below this fraction of the feedback
# drive it came from is refused (numerical: the basis already spans that drive, and dropping it
# would give the stiffness levels different bases).
KRYLOV_RTOL = 1e-6
# Largest growth exposure r·t (rate times the time since growth started) at which the reduced
# model is validated (numerical: beyond it the Krylov depths stop agreeing, because the slow
# growth modes, including an unstable spherical one, are not converged in the basis; the slow
# test `test_reduced_growth_follows_the_fem_growth` checks it against explicit FEM growth, which
# inverts an element at the edge of the clamped optic-nerve cap at r·t = 0.011 with the in-plane
# and the thickness law alike, so the bound stands; M6 plan, Task 6.6).
VALID_RATE_TIME = 0.01
COMPONENTS = ("M", "J0", "J45")


def _drive(sigma: NDArray, Pt: NDArray, s_iop: NDArray, mask: NDArray) -> NDArray:
    d = np.einsum("ik...,kl...,lj...->ij...", Pt, sigma, Pt) / s_iop
    return np.where(mask, d, 0.0)


def _inner(a: NDArray, b: NDArray, weights: NDArray) -> float:
    return float(np.sum(np.einsum("ij...,ij...->...", a, b) * weights))


def group_loads(group: str, doc: dict, duty_table, eom: dict, materials: dict) -> Loads | None:
    """The unit-intensity dead loads of a library group (None for "homeostatic")."""
    from eyebiomech.fem.cli import eyelid_arguments

    if group == "homeostatic":
        return None
    state = "near" if group.endswith("@near") or group == "ciliary" else "distance"
    g = duty_table.find(state)
    if group.startswith("muscles"):
        loads = Loads().from_force_table(duty_table, g, eom)
    elif group.startswith("lids"):
        loads = Loads().gaze(duty_table.quaternions[g]).eyelid(**eyelid_arguments(doc))
    elif group == "ciliary":
        tension = materials["ciliaryTensionNPerMmPerD"]["value"]
        loads = Loads().gaze(duty_table.quaternions[g]).ciliary(tension, 1.0)
    else:
        raise ValueError(f"unknown library group {group!r}")
    return loads.orbital_support()


@dataclass
class LevelResponse:
    """The library at one stiffness scale."""

    scale: float
    elastic: NDArray  # (groups, 3) M, J0, J45 per unit intensity, D
    growth: NDArray  # (basis, 3) per unit growth amplitude, D; the groups, then Krylov patterns
    feedback: NDArray  # (basis, basis) F of da/dt = r (L + F a)
    gram: NDArray  # (basis, basis) G, for inspection
    drive_norm: NDArray  # (basis,) sqrt(⟨g_k, g_k⟩ / volume)


def build_level(
    doc: dict,
    scale: float,
    *,
    n_face: int,
    layers: int,
    materials: dict,
    eom: dict,
    duty_table,
    age_years: float,
    iop_mmhg: float,
    reference: str = "unloaded",
    steps: int = 2,
    krylov: int = KRYLOV_DEPTH,
    thickness: Thickness | None = None,
    kappa: float | None = None,
) -> LevelResponse:
    """Steps 1-5 of the module notes at one stiffness scale, with `krylov` rounds of the
    Krylov enrichment; a drive pattern g grows as `growth_strain(g, thickness, kappa)`, the
    growth table's law unless given."""
    thickness, kappa = growth_law(thickness, kappa)
    shell = make_shell_mesh(doc, layers=layers, n_face=n_face)
    mats = region_materials(materials, age_years, shell.geometry, scale=scale)
    on = materials["opticNerve"]["radiusMm"]
    iop = Loads().iop(iop_mmhg)
    if reference == "unloaded":
        inv = unloaded_shell(shell, mats, iop_mmhg, optic_nerve_radius_mm=on, steps=steps)
        solved, offset, sol = inv.shell, inv.offset, inv.solution
        ctx = sol.context
    elif reference == "measured":
        solved, offset = shell, np.zeros_like(shell.mesh.doflocs)
        ctx = make_context(solved)
        sol = solve(solved, mats, iop, optic_nerve_radius_mm=on, steps=steps, context=ctx)
    else:
        raise ValueError(f"unknown reference {reference!r}")
    u0 = sol.u
    linear = tangent_at(sol, mats, iop, optic_nerve_radius_mm=on).solve

    U_ref = offset + sol.nodal()
    provenance = {"source": "library", "citation": "", "generatedBy": "", "gitHash": "",
                  "date": "", "verified": False}  # fmt: skip

    def refraction_of(du: NDArray) -> NDArray:
        """Refraction per unit of a linear response, evaluated at a displacement scaled to
        REFRACTION_PROBE_MM at its largest (the exporter's surface fits need small motion)."""
        size = float(np.max(np.abs(du)))
        if size == 0:
            return np.zeros(3)
        c = REFRACTION_PROBE_MM / size
        loaded, _ = build_result(doc, shell, U_ref, U_ref + c * du[ctx.vector_dofs], provenance)
        r = induced_refraction(doc, loaded)
        return np.array([r[k] for k in COMPONENTS]) / c

    Pt = tangent_projector(ctx)
    mask = growth_mask(ctx, "optic_nerve", on)
    sigma0 = cauchy_stress(ctx, mats, u0)
    s_iop = membrane_stress(sigma0, Pt, mask)
    weights = np.asarray(ctx.vb.dx) * mask
    volume = float(weights.sum())

    n = len(GROUPS)
    elastic = np.zeros((n, 3))
    drives = []
    for k, group in enumerate(GROUPS):
        loads = group_loads(group, doc, duty_table, eom, materials)
        if loads is None:  # homeostatic: drive per unit (1 − h)
            drives.append(_drive(sigma0, Pt, s_iop, mask))
            continue
        u_k = linear(loads.dead_vector(ctx))
        elastic[k] = refraction_of(u_k)
        dsigma = 0.5 * (cauchy_stress(ctx, mats, u0 + u_k) - cauchy_stress(ctx, mats, u0 - u_k))
        drives.append(_drive(dsigma, Pt, s_iop, mask))

    def grown(g: NDArray) -> tuple[NDArray, NDArray]:
        """The refraction and the drive of the stress change of a unit growth εg = g."""
        size = float(np.max(np.abs(g)))
        if size == 0:
            return np.zeros(3), np.zeros_like(g)
        eta = GROWTH_PROBE / size
        eps = growth_strain(g, ctx, thickness, kappa)
        plus, minus = GrowthState(eta * eps), GrowthState(-eta * eps)
        f_plus, _ = internal(ctx, mats, u0, tangent=False, growth=plus)
        f_minus, _ = internal(ctx, mats, u0, tangent=False, growth=minus)
        growth_u = linear(-(f_plus - f_minus) / (2 * eta))
        dsigma = (
            cauchy_stress(ctx, mats, u0 + eta * growth_u, plus)
            - cauchy_stress(ctx, mats, u0 - eta * growth_u, minus)
        ) / (2 * eta)
        return refraction_of(growth_u), _drive(dsigma, Pt, s_iop, mask)

    patterns = list(drives)
    responses = [grown(g) for g in patterns]
    # Krylov enrichment: the feedback drives of the newest patterns, orthogonalized against the
    # basis, become further patterns, so growth may take shapes the loads alone do not drive.
    newest = list(range(n))
    for _ in range(krylov):
        added = []
        for j in newest:
            q = responses[j][1].copy()
            for _sweep in range(2):  # Gram-Schmidt, twice for orthogonality
                for p in patterns:
                    q -= _inner(p, q, weights) / _inner(p, p, weights) * p
            if _inner(q, q, weights) <= KRYLOV_RTOL**2 * _inner(
                responses[j][1], responses[j][1], weights
            ):
                raise ValueError(
                    f"Krylov pattern {len(patterns)} is in the span of the basis; "
                    f"use a depth below {krylov}"
                )
            q /= np.sqrt(_inner(q, q, weights) / volume)
            patterns.append(q)
            responses.append(grown(q))
            added.append(len(patterns) - 1)
        newest = added

    growth = np.array([r for r, _ in responses])
    G = np.array([[_inner(a, b, weights) for b in patterns] for a in patterns])
    H = np.array([[_inner(a, d, weights) for _, d in responses] for a in patterns])
    F = np.linalg.lstsq(G, H, rcond=PROJECTION_RCOND)[0]
    return LevelResponse(
        scale=float(scale),
        elastic=elastic,
        growth=growth,
        feedback=F,
        gram=G,
        drive_norm=np.sqrt(np.diag(G) / volume),
    )


OnEdge = Literal["raise", "clamp"]
# Relative slack on the table's edges (numerical: a scale computed as exactly a tabled value may
# differ from it by round-off).
EDGE_TOLERANCE = 1e-9


class StiffnessOutOfTable(ValueError):
    """A stiffness scale outside the response library's tabled range."""


@dataclass
class Library:
    """Responses at several stiffness scales; see the module notes."""

    groups: tuple[str, ...]
    levels: list[LevelResponse]
    meta: dict = field(default_factory=dict)

    @property
    def stiffness_range(self) -> tuple[float, float]:
        """The lowest and highest tabled stiffness scale."""
        scales = [lv.scale for lv in self.levels]
        return float(min(scales)), float(max(scales))

    def _interp(self, attr: str, scale: float, on_edge: OnEdge = "raise") -> NDArray:
        """Linear interpolation in ln s (approximation: the tabled levels' patterns and feedback
        are blended, not rebuilt at the scale). Outside the table, `on_edge` "raise" refuses with
        `StiffnessOutOfTable` and "clamp" takes the nearest tabled level."""
        if on_edge not in ("raise", "clamp"):
            raise ValueError(f"on_edge must be 'raise' or 'clamp', got {on_edge!r}")
        lo, hi = self.stiffness_range
        inside = lo * (1 - EDGE_TOLERANCE) <= scale <= hi * (1 + EDGE_TOLERANCE)
        if on_edge == "raise" and not inside:
            raise StiffnessOutOfTable(
                f"stiffness scale {scale:.4g} is outside the response library's table "
                f"({lo:g}-{hi:g}); pass on_edge='clamp' to use the nearest tabled level"
            )
        s = np.log([lv.scale for lv in self.levels])
        x = float(np.clip(np.log(scale), s[0], s[-1]))
        values = np.stack([getattr(lv, attr) for lv in self.levels])
        if len(s) == 1:
            return values[0]
        i = int(np.clip(np.searchsorted(s, x) - 1, 0, len(s) - 2))
        w = (x - s[i]) / (s[i + 1] - s[i])
        return (1 - w) * values[i] + w * values[i + 1]

    def elastic(self, scale: float, on_edge: OnEdge = "raise") -> NDArray:
        return self._interp("elastic", scale, on_edge)

    def growth_refraction(self, scale: float, on_edge: OnEdge = "raise") -> NDArray:
        return self._interp("growth", scale, on_edge)

    def feedback(self, scale: float, on_edge: OnEdge = "raise") -> NDArray:
        return self._interp("feedback", scale, on_edge)

    @property
    def valid_rate_time(self) -> float:
        """The largest growth exposure r·t the library is validated for (unbounded for a
        library that does not record one, such as the depth-0 test fixture)."""
        return float(self.meta.get("validRateTime", np.inf))

    def simulate(
        self,
        intensities: Callable[[float], NDArray],
        ages: NDArray,
        *,
        rate_per_year: float,
        ratio: float,
        stiffness: Callable[[float], float],
        history_years: float = 0.0,
        on_edge: OnEdge = "raise",
    ) -> NDArray:
        """Elastic and remodeled (M, J0, J45) changes at each age, (ages, 2, 3), D. The growth
        amplitudes start at zero `history_years` before the first age, grow over that history
        under the first age's intensities and stiffness (approximation: the loads before the
        first age are not modeled in detail), and then follow da/dt = r (L + F a), integrated
        exactly over each interval with the mid-interval L, F (through F's eigendecomposition,
        so no step-size instability; Review Focus 3). With no history the amplitudes start at
        zero at the first age, and fast modes settle in the first interval from that state, not
        from the loads. The homeostatic intensity is multiplied by 1 − h. A growth exposure
        r·(history + age span) beyond `valid_rate_time` is refused, and so is a stiffness outside
        the table unless `on_edge` is "clamp"."""
        if not history_years >= 0:
            raise ValueError(f"the growth history must be non-negative, got {history_years}")
        ages = np.asarray(ages, dtype=float)
        exposure = rate_per_year * (history_years + float(ages[-1] - ages[0]))
        if exposure > self.valid_rate_time * (1 + 1e-9):
            raise ValueError(
                f"growth exposure r·t = {exposure:.3g} exceeds the {self.valid_rate_time:g} "
                "the reduced growth model is validated for"
            )
        n = len(self.groups)
        h_index = self.groups.index("homeostatic")

        m = self.levels[0].feedback.shape[0]  # the growth basis: the groups, then Krylov

        def L(age: float) -> NDArray:
            v = np.zeros(m)
            v[:n] = intensities(age)
            v[h_index] *= 1.0 - ratio
            return v

        a = np.zeros(m)
        out = np.zeros((ages.size, 2, 3))
        eig_cache: dict[float, tuple[NDArray, NDArray, NDArray]] = {}
        if history_years > 0:
            a = self._step(
                a, L(ages[0]), rate_per_year * history_years, stiffness(ages[0]), eig_cache, on_edge
            )
        for i, age in enumerate(ages):
            if i > 0:
                mid = 0.5 * (ages[i - 1] + age)
                rdt = rate_per_year * (age - ages[i - 1])
                a = self._step(a, L(mid), rdt, stiffness(mid), eig_cache, on_edge)
            s = stiffness(age)
            el = L(age)[:n] @ self.elastic(s, on_edge)
            out[i, 0] = el
            out[i, 1] = el + a @ self.growth_refraction(s, on_edge)
        return out

    def _step(
        self, a: NDArray, L: NDArray, rdt: float, scale: float, cache: dict, on_edge: OnEdge
    ) -> NDArray:
        """Exact solution over one interval of da/dτ = L + F a (τ = r t, Δτ = r dt), with
        F = V Λ V⁻¹: a ← V [e^{ΛΔτ} V⁻¹a + Δτ φ(ΛΔτ) V⁻¹L], φ(z) = (e^z − 1)/z, φ(0) = 1."""
        if scale not in cache:
            lam, V = np.linalg.eig(self.feedback(scale, on_edge))
            cache[scale] = (lam, V, np.linalg.inv(V))
        lam, V, Vi = cache[scale]
        z = lam * rdt
        small = np.abs(z) < 1e-8
        phi = np.where(small, 1.0 + z / 2, np.expm1(z) / np.where(small, 1.0, z))
        b = np.exp(z) * (Vi @ a) + phi * rdt * (Vi @ L)
        return np.real(V @ b)

    def to_json(self) -> dict:
        return {
            "schema": SCHEMA,
            "elastic": True,
            "remodeled": True,
            "groups": list(self.groups),
            "components": list(COMPONENTS),
            "stiffnessScales": [lv.scale for lv in self.levels],
            "elasticMJ0J45": [lv.elastic.tolist() for lv in self.levels],
            "growthMJ0J45": [lv.growth.tolist() for lv in self.levels],
            "feedback": [lv.feedback.tolist() for lv in self.levels],
            "gram": [lv.gram.tolist() for lv in self.levels],
            "driveNorm": [lv.drive_norm.tolist() for lv in self.levels],
            **self.meta,
        }

    @staticmethod
    def from_json(doc: dict) -> Library:
        if doc.get("schema") != SCHEMA:
            raise ValueError(f"response library schema {doc.get('schema')!r} is not {SCHEMA!r}")
        groups = tuple(doc["groups"])
        if groups != GROUPS:
            raise ValueError(f"response library groups {list(groups)} are not {list(GROUPS)}")
        levels = [
            LevelResponse(
                scale=s,
                elastic=np.asarray(e, dtype=float),
                growth=np.asarray(g, dtype=float),
                feedback=np.asarray(f, dtype=float),
                gram=np.asarray(gm, dtype=float),
                drive_norm=np.asarray(dn, dtype=float),
            )
            for s, e, g, f, gm, dn in zip(
                doc["stiffnessScales"],
                doc["elasticMJ0J45"],
                doc["growthMJ0J45"],
                doc["feedback"],
                doc["gram"],
                doc["driveNorm"],
                strict=True,
            )
        ]
        meta = {k: v for k, v in doc.items() if k not in _LEVEL_KEYS}
        return Library(groups, levels, meta)


_LEVEL_KEYS = {
    "schema",
    "elastic",
    "remodeled",
    "groups",
    "components",
    "stiffnessScales",
    "elasticMJ0J45",
    "growthMJ0J45",
    "feedback",
    "gram",
    "driveNorm",
}


def load_library(path: Path | str | None = None) -> Library:
    p = Path(path or data_root() / "results" / "response" / "library-v1.json")
    return Library.from_json(json.loads(p.read_text()))


def build_library(
    doc: dict,
    *,
    n_face: int,
    layers: int,
    stiffness_scales: tuple[float, ...] = (0.5, 1.0, 2.0, 4.0),
    materials: dict | None = None,
    eom: dict | None = None,
    forces_path: Path | str | None = None,
    reference: str = "unloaded",
    age_years: float | None = None,
    krylov: int = KRYLOV_DEPTH,
    provenance: dict | None = None,
    progress: Callable[[str], None] | None = None,
    thickness: Thickness | None = None,
    kappa: float | None = None,
) -> Library:
    """The library of `doc` at the given stiffness scales (relative to the calibrated stiffness
    of the materials table; the calibration's age and IOP unless given)."""
    materials = copy.deepcopy(materials or load_materials())
    eom = eom or load_eom_table()
    thickness, kappa = growth_law(thickness, kappa)
    calibrated = materials.get("calibration", {}).get("stiffnessScale", 1.0)
    age = materials["ageStiffening"]["referenceAgeYears"] if age_years is None else age_years
    iop = materials["intraocularPressure"]["meanMmHg"]
    table = load_force_table(forces_path or data_root() / "results" / "forces" / "duty-cycle.json")
    levels = []
    for s in sorted(stiffness_scales):
        if progress:
            progress(f"stiffness scale {s:g}")
        levels.append(
            build_level(
                doc,
                s * calibrated,
                n_face=n_face,
                layers=layers,
                materials=materials,
                eom=eom,
                duty_table=table,
                age_years=age,
                iop_mmhg=iop,
                reference=reference,
                krylov=krylov,
                thickness=thickness,
                kappa=kappa,
            )
        )
    for lv, s in zip(levels, sorted(stiffness_scales), strict=True):
        lv.scale = float(s)  # tabled relative to the calibrated stiffness
    meta = {
        "provenance": provenance
        or {"generatedBy": "build_library", "date": date.today().isoformat()},
        "mesh": {"nFace": n_face, "layers": layers, "reference": reference},
        "krylovDepth": krylov,
        "growthLaw": {"thickness": thickness, "kappa": kappa},
        "validRateTime": VALID_RATE_TIME,
        "ageYears": age,
        "iopMmHg": iop,
        "eyeId": doc["id"],
        "stiffnessRelativeTo": f"calibration.stiffnessScale = {calibrated:g}",
        "citation": (
            "Reduced-order response library of the corneoscleral FEM (M5 plan, Task 5.8). "
            "Approximations: linear superposition about the pressurized eye; growth dynamics "
            "reduced to the span of the load patterns enriched by a Krylov sequence (Galerkin), "
            "validated up to a growth exposure r·t of validRateTime; the reference eye's "
            "responses for every subject; patterns and feedback at the tabled stiffness, "
            "interpolated in ln s (approximation: the Krylov patterns differ between levels; "
            "outside the tabled scales the library refuses unless asked to clamp). "
            "elastic: per unit load intensity; growth: per unit growth "
            "amplitude (the groups, then the Krylov patterns)."
        ),
    }
    return Library(GROUPS, levels, meta)
