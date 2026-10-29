"""Stress-free reference geometry by a fixed-point inverse solve (M5 plan, Task 5.3).

The measured geometry of an eye already carries its intraocular pressure. M4 treated it as
stress-free (M4 Deviation 3). Here the stress-free (unloaded) node positions X₀ are found such
that inflating X₀ by the IOP gives the measured positions X_m: the iteration

    X₀ ← X₀ − (X₀ + u(X₀) − X_m),

with u(X₀) the IOP displacement of the shell built at X₀, is the fixed-point method of Sellier
(2011, inverse elastostatics by forward iteration; named in the plan, not transcribed). For the
small strains of an eye under IOP it contracts quickly. A step that raises the residual is
retried at half length. The returned `offset = X₀ − X_m` and the IOP solution on the unloaded
shell let callers express both the pressurized and any loaded state as displacements of the
measured mesh, so the exporter's geometry lookups keep working on the measured shell.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from eyebiomech.fem.loads import Loads
from eyebiomech.fem.mesh import ShellMesh
from eyebiomech.fem.solve import NewtonDidNotConverge, Solution, make_context, solve

# Halvings of a fixed-point step that raised the residual before giving up (numerical).
MAX_STEP_HALVINGS = 4


@dataclass
class InverseResult:
    shell: ShellMesh  # the stress-free (unloaded) shell
    offset: NDArray  # (3, N) unloaded minus measured node positions, mm
    solution: Solution | None  # the IOP state on the unloaded shell (None at zero IOP)
    iterations: int
    residual_mm: float  # largest distance between the pressurized and measured nodes
    history: list[float] = field(default_factory=list)


def unloaded_shell(
    shell: ShellMesh,
    materials: dict,
    iop_mmhg: float,
    *,
    support: str = "optic_nerve",
    optic_nerve_radius_mm: float | None = None,
    tol_mm: float = 1e-5,
    max_iter: int = 20,
    steps: int = 2,
) -> InverseResult:
    """The shell whose IOP-pressurized shape is `shell`'s (the measured geometry), within
    `tol_mm` at every node. Raises `NewtonDidNotConverge` (with the residual history) when the
    iteration does not reach the tolerance in `max_iter` steps."""
    measured = shell.mesh.doflocs
    if iop_mmhg == 0:
        return InverseResult(shell, np.zeros_like(measured), None, 0, 0.0, [])
    loads = Loads().iop(iop_mmhg)

    def pressurize(X: NDArray):
        trial = shell.with_reference(X)
        sol = solve(
            trial,
            materials,
            loads,
            support=support,
            optic_nerve_radius_mm=optic_nerve_radius_mm,
            steps=steps,
            context=make_context(trial),
        )
        r = X + sol.nodal() - measured
        return trial, sol, r, float(np.max(np.abs(r)))

    X = measured.copy()
    trial, sol, r, res = pressurize(X)
    history = [res]
    iterations = 0
    while res > tol_mm:
        if iterations >= max_iter:
            raise NewtonDidNotConverge(
                f"the inverse solve did not reach {tol_mm:g} mm in {max_iter} iterations "
                f"(last {res:.3g} mm)",
                history,
            )
        step = 1.0
        for _ in range(MAX_STEP_HALVINGS + 1):
            candidate = X - step * r
            c_trial, c_sol, c_r, c_res = pressurize(candidate)
            if c_res < res:
                break
            step /= 2
        else:
            raise NewtonDidNotConverge(
                f"the inverse solve stopped contracting at {res:.3g} mm", history
            )
        X, trial, sol, r, res = candidate, c_trial, c_sol, c_r, c_res
        history.append(res)
        iterations += 1
    return InverseResult(trial, X - measured, sol, iterations, res, history)
