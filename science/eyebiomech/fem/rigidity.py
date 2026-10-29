"""Ocular rigidity of the FEM globe and the calibration of tissue stiffness to it (M5 plan,
Task 5.4, Deviation 10).

The Friedenwald coefficient K = ln(P₂/P₁) / ΔV (ΔV in µL = mm³) between two pressures is the
whole-globe stiffness measure of Pallikaris et al. 2005 (in vivo, `ocularRigidityReference` in
data/materials/cornea-sclera.json). The model's ΔV is the change of the volume the inner surface
encloses between the two pressurized states of the stress-free globe (found by the inverse solve
of `eyebiomech.fem.inverse` at the document's IOP, so the measured geometry is the eye at that
pressure). `calibrate_stiffness` finds the one scale on every stiffness (μ and k₁ of every
region) that gives a target K, by secant steps on ln K against ln scale.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from eyebiomech.fem.inverse import unloaded_shell
from eyebiomech.fem.loads import Loads
from eyebiomech.fem.material import region_materials
from eyebiomech.fem.mesh import make_shell_mesh
from eyebiomech.fem.solve import make_context, solve

# Numerical: load steps per pressure solve and the secant iteration limit.
STEPS = 2
MAX_SECANT_STEPS = 8


def cavity_volume_change(sol) -> float:
    """First-order change of the enclosed volume (mm³ = µL): ∫ u · (−N) dA over the inner
    surface, N the solid's outward normal there (pointing toward the center)."""
    fb = sol.context.fb_inner
    u = np.asarray(fb.interpolate(sol.u))
    return float(np.sum(np.sum(u * -fb.normals, axis=0) * fb.dx))


def ocular_rigidity(
    params: dict,
    materials: dict,
    *,
    n_face: int,
    layers: int,
    scale: float | None = None,
    age_years: float | None = None,
    p1_mmhg: float | None = None,
    p2_mmhg: float | None = None,
    reference_iop_mmhg: float | None = None,
    reference: str = "unloaded",
) -> float:
    """Friedenwald coefficient of the model globe, per µL. Pressures default to the reference
    measurement's range ends used in M4 (10 and 20 mmHg, inside its 10-35 mmHg data), the
    reference IOP to the materials table's default, the age to the calibration's, and the scale
    to the calibrated one. `reference="measured"` skips the inverse solve and inflates the
    document's geometry as if stress-free (M4's convention; faster, for tests)."""
    ref = materials["ocularRigidityReference"]
    cal = materials.get("calibration", {})
    p1 = 10.0 if p1_mmhg is None else p1_mmhg
    p2 = 20.0 if p2_mmhg is None else p2_mmhg
    if not 0 <= p1 < p2:
        raise ValueError(f"pressures must satisfy 0 <= p1 < p2, got {p1}, {p2}")
    lo, hi = ref["iopRangeMmHg"]
    if not lo <= p1 < p2 <= hi:
        raise ValueError(f"{p1}-{p2} mmHg lies outside the reference data's {lo}-{hi} mmHg")
    age = cal.get("ageYears", params["age"]) if age_years is None else age_years
    iop = (
        materials["intraocularPressure"]["meanMmHg"]
        if reference_iop_mmhg is None
        else reference_iop_mmhg
    )
    shell = make_shell_mesh(params, layers=layers, n_face=n_face)
    mats = region_materials(materials, age, shell.geometry, scale=scale)
    on = materials["opticNerve"]["radiusMm"]
    if reference == "unloaded":
        unloaded = unloaded_shell(shell, mats, iop, optic_nerve_radius_mm=on, steps=STEPS).shell
    elif reference == "measured":
        unloaded = shell
    else:
        raise ValueError(f"unknown reference {reference!r}; expected 'unloaded' or 'measured'")
    ctx = make_context(unloaded)
    volume = []
    for p in (p1, p2):
        sol = solve(
            unloaded, mats, Loads().iop(p), optic_nerve_radius_mm=on, steps=STEPS, context=ctx
        )
        volume.append(cavity_volume_change(sol))
    return float(np.log(p2 / p1) / (volume[1] - volume[0]))


@dataclass
class StiffnessCalibration:
    scale: float
    rigidity_per_ul: float
    target_per_ul: float
    history: list[tuple[float, float]] = field(default_factory=list)  # (scale, K)


def calibrate_stiffness(
    params: dict,
    materials: dict,
    target_per_ul: float,
    *,
    n_face: int,
    layers: int,
    tol: float = 0.02,
    age_years: float | None = None,
    start_scale: float = 1.0,
    reference: str = "unloaded",
) -> StiffnessCalibration:
    """The stiffness scale whose ocular rigidity is `target_per_ul` within the relative `tol`
    (secant on ln K against ln scale, starting from the proportional guess)."""
    if not target_per_ul > 0:
        raise ValueError("the target rigidity must be positive")

    def k_of(s: float) -> float:
        return ocular_rigidity(
            params,
            materials,
            n_face=n_face,
            layers=layers,
            scale=s,
            age_years=age_years,
            reference=reference,
        )

    s0, k0 = start_scale, k_of(start_scale)
    history = [(s0, k0)]
    s1 = s0 * target_per_ul / k0  # K is about proportional to stiffness
    for _ in range(MAX_SECANT_STEPS):
        k1 = k_of(s1)
        history.append((s1, k1))
        if abs(k1 / target_per_ul - 1) <= tol:
            return StiffnessCalibration(s1, k1, target_per_ul, history)
        slope = (np.log(k1) - np.log(k0)) / (np.log(s1) - np.log(s0))
        s0, k0 = s1, k1
        s1 = float(np.exp(np.log(s1) + (np.log(target_per_ul) - np.log(k1)) / slope))
    raise ValueError(
        f"the stiffness calibration did not reach {target_per_ul:g} /uL within {tol:.0%} "
        f"in {MAX_SECANT_STEPS} steps: {history}"
    )
