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
4. The growth dynamics are reduced to the span of the patterns (Galerkin): with εg = Σ a_l g_l,
   da/dt = r (L(t) + F a), F = G⁺ H, G_kl = ⟨g_k, g_l⟩, H_kl = ⟨g_k, d_l⟩ (volume-weighted
   tensor inner products over the growing points). The refraction change at time t is
   Σ_k L_k e_k (elastic) + Σ_l a_l γ_l (growth); "remodeled" is their sum.

Responses are tabled at several stiffness scales (relative to the calibrated stiffness) and
interpolated linearly in ln s. Approximations, labeled wherever the library is used: linear
superposition about the pressurized eye; the growth dynamics reduced to the load patterns'
span; the reference eye's responses for every subject; the growth patterns and feedback of the
stiffness at which they are evaluated (the reference geometry does not evolve between ages).
"""

from __future__ import annotations

import copy
import json
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

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
    cauchy_stress,
    growth_mask,
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
    growth: NDArray  # (groups, 3) per unit growth amplitude, D
    feedback: NDArray  # (groups, groups) F of da/dt = r (L + F a)
    gram: NDArray  # (groups, groups) G, for inspection
    drive_norm: NDArray  # (groups,) sqrt(⟨g_k, g_k⟩ / volume)


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
) -> LevelResponse:
    """Steps 1-4 of the module notes at one stiffness scale."""
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

    growth = np.zeros((n, 3))
    feedback_drives = []
    for g in drives:
        size = float(np.max(np.abs(g)))
        if size == 0:
            growth_u = np.zeros(ctx.n)
            feedback_drives.append(np.zeros_like(g))
            continue
        eta = GROWTH_PROBE / size
        plus, minus = GrowthState(eta * g), GrowthState(-eta * g)
        f_plus, _ = internal(ctx, mats, u0, tangent=False, growth=plus)
        f_minus, _ = internal(ctx, mats, u0, tangent=False, growth=minus)
        growth_u = linear(-(f_plus - f_minus) / (2 * eta))
        growth[len(feedback_drives)] = refraction_of(growth_u)
        dsigma = (
            cauchy_stress(ctx, mats, u0 + eta * growth_u, plus)
            - cauchy_stress(ctx, mats, u0 - eta * growth_u, minus)
        ) / (2 * eta)
        feedback_drives.append(_drive(dsigma, Pt, s_iop, mask))

    G = np.array([[_inner(a, b, weights) for b in drives] for a in drives])
    H = np.array([[_inner(a, d, weights) for d in feedback_drives] for a in drives])
    F = np.linalg.lstsq(G, H, rcond=PROJECTION_RCOND)[0]
    return LevelResponse(
        scale=float(scale),
        elastic=elastic,
        growth=growth,
        feedback=F,
        gram=G,
        drive_norm=np.sqrt(np.diag(G) / volume),
    )


@dataclass
class Library:
    """Responses at several stiffness scales; see the module notes."""

    groups: tuple[str, ...]
    levels: list[LevelResponse]
    meta: dict = field(default_factory=dict)

    def _interp(self, attr: str, scale: float) -> NDArray:
        s = np.log([lv.scale for lv in self.levels])
        x = float(np.clip(np.log(scale), s[0], s[-1]))
        values = np.stack([getattr(lv, attr) for lv in self.levels])
        i = int(np.clip(np.searchsorted(s, x) - 1, 0, len(s) - 2)) if len(s) > 1 else 0
        if len(s) == 1:
            return values[0]
        w = (x - s[i]) / (s[i + 1] - s[i])
        return (1 - w) * values[i] + w * values[i + 1]

    def elastic(self, scale: float) -> NDArray:
        return self._interp("elastic", scale)

    def growth_refraction(self, scale: float) -> NDArray:
        return self._interp("growth", scale)

    def feedback(self, scale: float) -> NDArray:
        return self._interp("feedback", scale)

    def simulate(
        self,
        intensities: Callable[[float], NDArray],
        ages: NDArray,
        *,
        rate_per_year: float,
        ratio: float,
        stiffness: Callable[[float], float],
        history_years: float = 0.0,
    ) -> NDArray:
        """Elastic and remodeled (M, J0, J45) changes at each age, (ages, 2, 3), D. The growth
        amplitudes start at zero `history_years` before the first age, grow over that history
        under the first age's intensities and stiffness (approximation: the loads before the
        first age are not modeled in detail), and then follow da/dt = r (L + F a), integrated
        exactly over each interval with the mid-interval L, F (through F's eigendecomposition,
        so no step-size instability; Review Focus 3). With no history the amplitudes start at
        zero at the first age, and fast modes settle in the first interval from that state, not
        from the loads. The homeostatic intensity is multiplied by 1 − h."""
        if not history_years >= 0:
            raise ValueError(f"the growth history must be non-negative, got {history_years}")
        ages = np.asarray(ages, dtype=float)
        n = len(self.groups)
        h_index = self.groups.index("homeostatic")

        def L(age: float) -> NDArray:
            v = np.array(intensities(age), dtype=float)
            v[h_index] *= 1.0 - ratio
            return v

        a = np.zeros(n)
        out = np.zeros((ages.size, 2, 3))
        eig_cache: dict[float, tuple[NDArray, NDArray, NDArray]] = {}
        if history_years > 0:
            a = self._step(
                a, L(ages[0]), rate_per_year * history_years, stiffness(ages[0]), eig_cache
            )
        for i, age in enumerate(ages):
            if i > 0:
                mid = 0.5 * (ages[i - 1] + age)
                rdt = rate_per_year * (age - ages[i - 1])
                a = self._step(a, L(mid), rdt, stiffness(mid), eig_cache)
            s = stiffness(age)
            el = L(age) @ self.elastic(s)
            out[i, 0] = el
            out[i, 1] = el + a @ self.growth_refraction(s)
        return out

    def _step(self, a: NDArray, L: NDArray, rdt: float, scale: float, cache: dict) -> NDArray:
        """Exact solution over one interval of da/dτ = L + F a (τ = r t, Δτ = r dt), with
        F = V Λ V⁻¹: a ← V [e^{ΛΔτ} V⁻¹a + Δτ φ(ΛΔτ) V⁻¹L], φ(z) = (e^z − 1)/z, φ(0) = 1."""
        if scale not in cache:
            lam, V = np.linalg.eig(self.feedback(scale))
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
    provenance: dict | None = None,
    progress: Callable[[str], None] | None = None,
) -> Library:
    """The library of `doc` at the given stiffness scales (relative to the calibrated stiffness
    of the materials table; the calibration's age and IOP unless given)."""
    materials = copy.deepcopy(materials or load_materials())
    eom = eom or load_eom_table()
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
            )
        )
    for lv, s in zip(levels, sorted(stiffness_scales), strict=True):
        lv.scale = float(s)  # tabled relative to the calibrated stiffness
    meta = {
        "provenance": provenance
        or {"generatedBy": "build_library", "date": date.today().isoformat()},
        "mesh": {"nFace": n_face, "layers": layers, "reference": reference},
        "ageYears": age,
        "iopMmHg": iop,
        "eyeId": doc["id"],
        "stiffnessRelativeTo": f"calibration.stiffnessScale = {calibrated:g}",
        "citation": (
            "Reduced-order response library of the corneoscleral FEM (M5 plan, Task 5.8). "
            "Approximations: linear superposition about the pressurized eye; growth dynamics "
            "reduced to the span of the load patterns (Galerkin); the reference eye's responses "
            "for every subject; patterns and feedback at the tabled stiffness, interpolated in "
            "ln s. elastic: per unit load intensity; growth: per unit growth amplitude."
        ),
    }
    return Library(GROUPS, levels, meta)
