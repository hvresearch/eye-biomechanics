"""Reduced-order response library (M5 plan, Task 5.8; Review Focus 2, 3, 4)."""

import json
from pathlib import Path

import numpy as np
import pytest

from eyebiomech.fem.cli import eyelid_arguments
from eyebiomech.fem.data import DATA_DIR, load_eom_table, load_materials
from eyebiomech.fem.export import build_result
from eyebiomech.fem.loads import Loads
from eyebiomech.fem.material import region_materials
from eyebiomech.fem.mesh import make_shell_mesh
from eyebiomech.fem.solve import make_context, solve
from eyebiomech.forces.from_viewer import load_force_table
from eyebiomech.optics.paraxial import induced_refraction
from eyebiomech.remodel.growth import (
    GrowthState,
    cauchy_stress,
    feedback_estimate,
    grow,
    growth_mask,
    load_growth_table,
)
from eyebiomech.remodel.history import GROUPS
from eyebiomech.remodel.library import LevelResponse, Library, build_library

DOC = json.loads((DATA_DIR / "fixtures" / "navarro-1985-preset.eye.json").read_text())
MATS = load_materials()
EOM = load_eom_table()
DUTY = load_force_table(DATA_DIR / "results" / "forces" / "duty-cycle.json")
ON = MATS["opticNerve"]["radiusMm"]
IOP = MATS["intraocularPressure"]["meanMmHg"]
AGE = MATS["ageStiffening"]["referenceAgeYears"]
COARSE = {"n_face": 6, "layers": 1, "reference": "measured"}
PROV = {
    "source": "t",
    "citation": "",
    "generatedBy": "",
    "gitHash": "",
    "date": "",
    "verified": False,
}
NEAR = [GROUPS.index(g) for g in ("muscles@near", "lids@near", "ciliary")]


@pytest.fixture(scope="module")
def library():
    return build_library(DOC, stiffness_scales=(1.0,), **COARSE)


@pytest.fixture(scope="module")
def pressurized():
    shell = make_shell_mesh(DOC, layers=1, n_face=6)
    ctx = make_context(shell)
    mats = region_materials(MATS, AGE, shell.geometry)
    ref = solve(shell, mats, Loads().iop(IOP), optic_nerve_radius_mm=ON, steps=2, context=ctx)
    return shell, ctx, mats, ref


def _near_loads():
    g = DUTY.find("near")
    tension = MATS["ciliaryTensionNPerMmPerD"]["value"]
    return (
        Loads()
        .iop(IOP)
        .from_force_table(DUTY, g, EOM)
        .eyelid(**eyelid_arguments(DOC))
        .ciliary(tension, 1.0)
        .orbital_support()
    )


def _half(loads: Loads) -> Loads:
    """The same loads at half their value (forces, lid pressures, accommodation)."""
    for item in loads.items:
        for key in ("forceN", "upperKPa", "lowerKPa", "accommodationD"):
            if isinstance(item.get(key), (int, float)):
                item[key] *= 0.5
    return loads


def _refraction(shell, U_ref, U):
    doc, _ = build_result(DOC, shell, U_ref, U, PROV)
    r = induced_refraction(DOC, doc)
    return np.array([r["M"], r["J0"], r["J45"]])


def test_superposed_groups_match_a_direct_nonlinear_solve(library, pressurized):
    """The near gaze's muscles, lids, and ciliary load at half their value, solved together
    without linearization, give half the summed library responses within 10% (Review Focus 2).
    At the full near-gaze load the direct solve has left the linear regime (on this mesh J0
    falls to about a third of the linear value): the globe, held only at the optic-nerve cap
    with a dead-load orbital reaction, softens under the muscles' squeeze, the support
    artifact for which the library and the CLI use the linear perturbation (Deviation 11).
    At half load the two agree within about 1%."""
    shell, ctx, mats, ref = pressurized
    loads = _half(_near_loads())
    loaded = solve(
        shell,
        mats,
        loads,
        optic_nerve_radius_mm=ON,
        steps=2,
        context=ctx,
        initial_u=ref.u,
        ramp="dead",
    )
    direct = _refraction(shell, ref.nodal(), loaded.nodal())
    summed = 0.5 * library.elastic(1.0)[NEAR].sum(axis=0)
    for i in (0, 1):  # M and J0
        assert summed[i] == pytest.approx(direct[i], rel=0.10, abs=2e-3)


def test_the_library_is_stable_and_labeled(library):
    F = library.feedback(1.0)
    assert np.all(np.linalg.eigvals(F).real < 0)  # growth restores the homeostatic stress
    doc = library.to_json()
    assert doc["elastic"] is True and doc["remodeled"] is True
    back = Library.from_json(json.loads(json.dumps(doc)))
    assert np.allclose(back.elastic(1.0), library.elastic(1.0))
    assert np.allclose(back.feedback(1.0), F)
    assert "linear superposition" in doc["citation"]


def test_no_loads_and_homeostasis_change_nothing(library):
    out = library.simulate(
        lambda age: np.zeros(len(GROUPS)),
        np.arange(6.0, 91.0),
        rate_per_year=0.01,
        ratio=1.0,
        stiffness=lambda age: 1.0,
    )
    assert np.all(out == 0)


def test_constant_loads_approach_the_remodeled_steady_state(library):
    """With constant intensities the growth amplitudes approach −F⁻¹ L (the exponential
    integrator is exact, so a coarse age grid gives the same answer as a fine one)."""
    L = np.zeros(len(GROUPS))
    L[GROUPS.index("lids@distance")] = 1.0
    kw = {"rate_per_year": 0.01, "ratio": 1.0, "stiffness": lambda age: 1.0}
    fine = library.simulate(lambda a: L, np.linspace(6, 90, 841), **kw)
    coarse = library.simulate(lambda a: L, np.linspace(6, 90, 8), **kw)
    assert np.allclose(fine[-1], coarse[-1], rtol=1e-9, atol=1e-12)
    a_inf = -np.linalg.solve(library.feedback(1.0), L)
    steady = L @ library.elastic(1.0) + a_inf @ library.growth_refraction(1.0)
    long = library.simulate(lambda a: L, np.array([0.0, 1e5]), **kw)
    assert np.allclose(long[-1, 1], steady, rtol=1e-6)


COARSE_JSON = Path(__file__).parent / "fixtures" / "library-coarse.json"


def _constant_loads(ages, history_years=0.0):
    """The coarse fixture library under constant distance-gaze muscle and lid loads."""
    lib = Library.from_json(json.loads(COARSE_JSON.read_text()))
    L = np.zeros(len(GROUPS))
    L[[GROUPS.index("lids@distance"), GROUPS.index("muscles@distance")]] = 1.0
    return lib.simulate(
        lambda a: L,
        ages,
        rate_per_year=0.05,
        ratio=1.0,
        stiffness=lambda a: 1.0,
        history_years=history_years,
    )


def test_a_growth_history_equals_an_earlier_start():
    """Growth over a history before the first age under the first age's intensities is the
    same as starting the trajectory that much earlier with constant intensities."""
    later = _constant_loads(np.arange(6.0, 13.0), history_years=6.0)
    earlier = _constant_loads(np.arange(0.0, 13.0))
    assert np.allclose(later, earlier[6:], rtol=1e-9, atol=1e-12)


def test_a_growth_history_removes_the_starting_transient():
    """With constant intensities, the astigmatic change over the first year after the first age
    shows no step from the starting state once growth has run since birth (M5 review, round 1):
    without the history the fast modes settle in that year."""
    zero = _constant_loads(np.arange(6.0, 8.0))[:, 1]
    hist = _constant_loads(np.arange(6.0, 8.0), history_years=6.0)[:, 1]
    for k in (1, 2):  # J0, J45
        assert abs(zero[1, k] - zero[0, k]) > 0.05
        assert abs(hist[1, k] - hist[0, k]) < 0.05 * abs(zero[1, k] - zero[0, k])


def test_a_negative_growth_history_is_refused():
    with pytest.raises(ValueError, match="history"):
        _constant_loads(np.arange(6.0, 8.0), history_years=-1.0)


def test_stiffness_interpolation_is_linear_in_log_scale():
    def level(s, value):
        n = len(GROUPS)
        return LevelResponse(s, np.full((n, 3), value), np.zeros((n, 3)), -np.eye(n),
                             np.eye(n), np.ones(n))  # fmt: skip

    lib = Library(GROUPS, [level(1.0, 1.0), level(4.0, 3.0)])
    assert lib.elastic(1.0)[0, 0] == 1.0 and lib.elastic(4.0)[0, 0] == 3.0
    assert lib.elastic(2.0)[0, 0] == pytest.approx(2.0)
    assert lib.elastic(8.0)[0, 0] == 3.0  # clamped to the table


@pytest.mark.slow
def test_a_stiffer_eye_responds_less():
    lib = build_library(DOC, stiffness_scales=(1.0, 2.0), **COARSE)
    i = GROUPS.index("lids@distance")
    assert abs(lib.levels[1].elastic[i, 1]) < abs(lib.levels[0].elastic[i, 1])


@pytest.mark.slow
def test_reduced_growth_follows_the_fem_growth(library, pressurized):
    """Explicit FEM growth steps under half the near-gaze loads against the reduced model with
    the same intensities (Review Focus 2). The growth increments are compared (the remodeled
    change minus the elastic one), not the totals, so the elastic response, which the
    superposition test checks, cannot hide a growth error. Each step is as long as the FEM
    allows (r dt lambda at 0.9 of `maxStepFraction`), so the increment is well above the
    solver's noise. Half load keeps the FEM in the linear regime the library describes (see
    the superposition test above)."""
    shell, ctx, mats, ref = pressurized
    loads = _half(_near_loads())
    loaded = solve(
        shell,
        mats,
        loads,
        optic_nerve_radius_mm=ON,
        steps=2,
        context=ctx,
        initial_u=ref.u,
        ramp="dead",
    )
    sigma_iop = cauchy_stress(ctx, mats, ref.u)
    mask = growth_mask(ctx, "optic_nerve", ON)
    lam = feedback_estimate(ctx, mats, loaded.u, sigma_iop, GrowthState.zero(ctx), mask)
    r, steps = 1.0, 4
    dt = 0.9 * load_growth_table()["maxStepFraction"]["value"] / (r * lam)
    state, u = GrowthState.zero(ctx), loaded.u
    for _ in range(steps):
        state, sol = grow(
            shell,
            mats,
            loads,
            state,
            sigma_iop,
            rate_per_year=r,
            ratio=1.0,
            dt_years=dt,
            context=ctx,
            optic_nerve_radius_mm=ON,
            initial_u=u,
        )
        u = sol.u
    fem = _refraction(shell, ref.nodal(), sol.nodal()) - _refraction(
        shell, ref.nodal(), loaded.nodal()
    )
    L = np.zeros(len(GROUPS))
    L[NEAR] = 0.5
    out = library.simulate(
        lambda a: L,
        np.array([0.0, steps * dt]),
        rate_per_year=r,
        ratio=1.0,
        stiffness=lambda a: 1.0,
    )[-1]
    reduced = out[1] - out[0]
    for i in (0, 1):  # M and J0
        assert abs(fem[i]) > 1e-3  # an increment the comparison can resolve
        assert reduced[i] == pytest.approx(fem[i], rel=0.25)
