"""Least-squares and Bayesian calibration of the forward model (M5 plan, Task 5.10).

The parameters (`PARAM_NAMES`, bounds and priors in data/calibration/priors.json) are fitted in
a transformed space (log for positive scales and rates). The residuals are the targets'
standardized differences (model − data)/se plus the z-scores of the normal and log-normal
priors; uniform and log-uniform priors only bound the search, and the growth rate is further
bounded by the response library's validated growth exposure. `fit(..., method="lsq")` uses
SciPy's trust-region least squares and a Gauss–Newton covariance; `method="mcmc"` then samples
the posterior exp(−½ Σ r²) with the ensemble sampler (Deviation 4) from walkers around the
least-squares optimum.

M6 (plan Task 6.6): `starts` runs the least squares from several starting points and keeps every
optimum (the M5 likelihood was multimodal in the rate); the walkers start around the best one.
`growth=False` fits the nested model with the growth rate held at zero. `previous` continues a
chain from the last walkers of an earlier segment, so a chain longer than one session's
computation can be built in segments (each segment draws from its own seed, `seed + segments`).
"""

from __future__ import annotations

import copy
import math
from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray
from scipy.optimize import least_squares

from eyebiomech.calib.forward import PARAM_NAMES, load_priors, max_rate_per_year, predict_targets
from eyebiomech.calib.mcmc import autocorrelation_time, ensemble_sample

# Numerical: finite-difference step of the least-squares Jacobian in the transformed space, and
# the walkers' starting spread around the optimum (in units of its Gauss-Newton SD, capped).
JACOBIAN_STEP = 1e-3
WALKER_SPREAD = 0.1


@dataclass
class Posterior:
    names: tuple[str, ...]
    best: dict[str, float]
    samples: NDArray | None  # (draws, p) in natural units
    cov: NDArray  # transformed-space covariance at the optimum
    corr: NDArray
    cost: float  # ½ Σ r²
    dof: int
    method: str
    lsq_converged: bool  # SciPy's least-squares success flag, not a statement on the chain
    per_target: list[dict] = field(default_factory=list)
    acceptance: float | None = None
    autocorr_steps: NDArray | None = None  # per parameter, MCMC only
    chain_steps: int | None = None  # MCMC steps after the burn-in
    fixed: dict[str, float] = field(default_factory=dict)  # held out of the fit (nested model)
    starts: list[dict] = field(default_factory=list)  # every least-squares start and optimum
    chain_state: dict | None = None  # the whole chain, to continue it (`fit(previous=...)`)

    def sd_transformed(self) -> NDArray:
        return np.sqrt(np.diag(self.cov))


class Space:
    """Transforms between natural parameters and the fitted vector; `fixed` parameters are held
    at their values and added to every parameter set."""

    def __init__(self, priors: dict, names=PARAM_NAMES, fixed: dict | None = None):
        self.fixed = dict(fixed or {})
        self.names = tuple(n for n in names if n not in self.fixed)
        self.spec = [priors["parameters"][n] for n in self.names]

    def to_x(self, params: dict) -> NDArray:
        return np.array(
            [
                math.log(params[n]) if s["transform"] == "log" else params[n]
                for n, s in zip(self.names, self.spec, strict=True)
            ]
        )

    def to_params(self, x: NDArray) -> dict:
        fitted = {
            n: (math.exp(v) if s["transform"] == "log" else float(v))
            for n, s, v in zip(self.names, self.spec, x, strict=True)
        }
        return {**fitted, **self.fixed}

    def bounds(self, library=None) -> tuple[NDArray, NDArray]:
        """The priors' bounds in the fitted space; with a library, the growth rate's upper bound
        is also capped at the library's validated growth exposure (`max_rate_per_year`)."""
        lo, hi = [], []
        for n, s in zip(self.names, self.spec, strict=True):
            a, b = s["bounds"]
            if n == "rate_per_year" and library is not None:
                b = min(b, max_rate_per_year(library))
                if not b > a:
                    raise ValueError(
                        f"the library's validated growth exposure allows rates up to {b:.3g} "
                        f"per year, below the prior's lower bound {a:g}"
                    )
            if s["transform"] == "log":
                a, b = math.log(a), math.log(b)
            lo.append(a)
            hi.append(b)
        return np.array(lo), np.array(hi)

    def prior_residuals(self, x: NDArray) -> NDArray:
        out = []
        for s, v in zip(self.spec, x, strict=True):
            if s["prior"] == "normal":
                out.append((v - s["mean"]) / s["sd"])
            elif s["prior"] == "log-normal":
                out.append((v - math.log(s["median"])) / s["sigmaLn"])
        return np.array(out)


def with_rate_floor(priors: dict, floor: float) -> dict:
    """A copy of the priors with the growth rate's lower bound set to `floor` (a sensitivity fit:
    the posterior sits on the prior's floor, review round 3); nothing else changes."""
    if not floor > 0:
        raise ValueError(f"the rate floor must be positive (log transform), got {floor:g}")
    out = copy.deepcopy(priors)
    out["parameters"]["rate_per_year"]["bounds"][0] = float(floor)
    return out


def start_params(priors: dict) -> dict:
    out = {}
    for n in PARAM_NAMES:
        s = priors["parameters"][n]
        out[n] = s.get("start", s.get("median", s.get("mean")))
    return out


def rate_starts(priors: dict, library, count: int) -> list[dict]:
    """`count` starting points: the priors' starts with the growth rate log-spaced over its
    bounds (the upper capped by the library's validated exposure), ends included."""
    lo, hi = Space(priors).bounds(library)
    i = Space(priors).names.index("rate_per_year")
    base = start_params(priors)
    if count < 2:
        return [base]
    return [{**base, "rate_per_year": math.exp(v)} for v in np.linspace(lo[i], hi[i], count)]


def degrees_of_freedom(data: list[dict], n_params: int) -> int:
    """Targets minus parameters, not counting the one-sided envelopes ("spherebound"): an
    envelope the model stays inside costs nothing and carries no information (M6 Task 6.5)."""
    return sum(t["kind"] != "spherebound" for t in data) - n_params


def residuals(x: NDArray, space: Space, library, cohort, data, priors) -> NDArray:
    params = space.to_params(x)
    model = predict_targets(params, library, cohort, data, priors=priors)
    values = np.array([t["value"] for t in data])
    se = np.array([t["se"] for t in data])
    bound = np.array([t["kind"] == "spherebound" for t in data], dtype=bool)
    # An envelope costs only beyond it: |change| above the observed magnitude.
    r = np.where(bound, np.maximum(np.abs(model) - values, 0.0), model - values) / se
    r = np.where(np.isfinite(r), r, 1e3)  # a band with no astigmatic eye is a poor fit
    return np.concatenate([r, space.prior_residuals(x)])


def fit(
    params0: dict | None,
    data: list[dict],
    method: str = "lsq",
    *,
    library,
    cohort,
    priors: dict | None = None,
    seed: int = 0,
    n_walkers: int = 24,
    n_steps: int = 600,
    burn: int = 200,
    growth: bool = True,
    starts: list[dict] | None = None,
    previous: dict | None = None,
) -> Posterior:
    if method not in ("lsq", "mcmc"):
        raise ValueError(f"unknown method {method!r}; expected 'lsq' or 'mcmc'")
    priors = priors or load_priors()
    space = Space(priors, fixed=None if growth else {"rate_per_year": 0.0})
    lo, hi = space.bounds(library)

    def r(x):
        return residuals(x, space, library, cohort, data, priors)

    tried = []
    for start in starts or [params0 or start_params(priors)]:
        x0 = np.clip(space.to_x(start), lo + 1e-9, hi - 1e-9)
        sol_k = least_squares(r, x0, bounds=(lo, hi), diff_step=JACOBIAN_STEP, x_scale="jac")
        tried.append((start, sol_k))
    sol = min((s_k for _, s_k in tried), key=lambda s_k: s_k.cost)
    J = sol.jac
    cov = np.linalg.pinv(J.T @ J)
    sd = np.sqrt(np.clip(np.diag(cov), 0, None))
    corr = cov / np.outer(np.where(sd > 0, sd, 1), np.where(sd > 0, sd, 1))
    best = space.to_params(sol.x)
    model = predict_targets(best, library, cohort, data, priors=priors)
    hard = predict_targets(best, library, cohort, data, soft=False, priors=priors)
    per_target = [
        {
            "source": t["source"],
            "kind": t["kind"],
            "band": list(t["band"]),
            **({"class": t["class"]} if t["kind"] == "class" else {}),
            "data": t["value"],
            "se": t["se"],
            "model": float(m),
            "modelHardClasses": float(h),
        }
        for t, m, h in zip(data, model, hard, strict=True)
    ]
    post = Posterior(
        names=space.names,
        best=best,
        samples=None,
        cov=cov,
        corr=corr,
        cost=float(sol.cost),
        dof=degrees_of_freedom(data, len(space.names)),
        method="lsq",
        lsq_converged=bool(sol.success),
        per_target=per_target,
        fixed=dict(space.fixed),
        starts=[
            {
                "start": {n: float(start[n]) for n in space.names},
                "best": space.to_params(s_k.x),
                "cost": float(s_k.cost),
                "converged": bool(s_k.success),
            }
            for start, s_k in tried
        ],
    )
    if method == "lsq":
        return post

    def log_prob(x):
        if np.any(x < lo) or np.any(x > hi):
            return -np.inf
        return -0.5 * float(np.sum(r(x) ** 2))

    p = len(space.names)
    if previous is None:
        rng = np.random.default_rng(seed)
        spread = np.minimum(np.where(sd > 0, sd, 0.1), 0.5 * (hi - lo)) * WALKER_SPREAD
        p0 = sol.x + spread * rng.standard_normal((n_walkers, p))
        p0 = np.clip(p0, lo + 1e-9, hi - 1e-9)
        before, before_lp, accepted, segments = np.empty((0, n_walkers, p)), None, 0, 0
    else:
        before, before_lp = np.asarray(previous["chain"]), np.asarray(previous["lps"])
        if before.shape[1:] != (n_walkers, p):
            raise ValueError(
                f"the previous chain has {before.shape[1]} walkers and {before.shape[2]} "
                f"parameters, expected {n_walkers} and {p}"
            )
        p0, accepted, segments = before[-1], int(previous["accepted"]), int(previous["segments"])
    chain, lps, acc = ensemble_sample(log_prob, p0, n_steps, seed=seed + segments)
    accepted += round(acc * n_steps * n_walkers)
    chain = np.concatenate([before, chain])
    lps = lps if before_lp is None else np.concatenate([before_lp, lps])
    post.chain_state = {"chain": chain, "lps": lps, "accepted": accepted, "segments": segments + 1}
    if not chain.shape[0] > burn:
        raise ValueError(f"the chain has {chain.shape[0]} steps, not more than the burn-in {burn}")
    flat = chain[burn:].reshape(-1, p)
    post.samples = np.array([[space.to_params(x)[n] for n in space.names] for x in flat])
    post.method = "mcmc"
    post.acceptance = accepted / (chain.shape[0] * n_walkers)
    post.autocorr_steps = autocorrelation_time(chain[burn:])
    post.chain_steps = chain.shape[0] - burn
    tcov = np.cov(flat.T)
    tsd = np.sqrt(np.diag(tcov))
    post.cov, post.corr = tcov, tcov / np.outer(tsd, tsd)
    return post
