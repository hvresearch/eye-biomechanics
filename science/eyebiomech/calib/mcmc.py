"""Affine-invariant ensemble sampler with the stretch move (Goodman & Weare 2010), the
algorithm `emcee` implements, written here because spec §3.3 limits the package's dependencies
to NumPy, SciPy, scikit-fem, and the schema (M5 plan, Deviation 4).

The walkers are split into two halves; each walker of one half moves along the line to a random
walker of the other half by a factor z drawn from g(z) ∝ 1/√z on [1/a, a], and the move is
accepted with probability min(1, z^(p−1) · p(Y)/p(X)).
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np
from numpy.typing import NDArray


def ensemble_sample(
    log_prob: Callable[[NDArray], float],
    p0: NDArray,
    n_steps: int,
    *,
    a: float = 2.0,
    seed: int = 0,
) -> tuple[NDArray, NDArray, float]:
    """Chain (n_steps, walkers, p), its log-probabilities (n_steps, walkers), and the overall
    acceptance fraction. `p0` (walkers, p) must hold at least 2p walkers, an even number, all
    with finite log-probability."""
    walkers = np.array(p0, dtype=float)
    n, p = walkers.shape
    if n < 2 * p or n % 2:
        raise ValueError(f"need an even number of walkers, at least {2 * p}, got {n}")
    if not a > 1:
        raise ValueError("the stretch scale a must exceed 1")
    rng = np.random.default_rng(seed)
    lp = np.array([log_prob(w) for w in walkers])
    if not np.all(np.isfinite(lp)):
        raise ValueError("every starting walker needs a finite log-probability")
    chain = np.empty((n_steps, n, p))
    lps = np.empty((n_steps, n))
    accepted = 0
    halves = (np.arange(0, n // 2), np.arange(n // 2, n))
    for step in range(n_steps):
        for k in (0, 1):
            active, other = halves[k], halves[1 - k]
            z = ((a - 1) * rng.random(active.size) + 1) ** 2 / a
            partners = walkers[rng.choice(other, size=active.size)]
            proposal = partners + z[:, None] * (walkers[active] - partners)
            new_lp = np.array([log_prob(y) for y in proposal])
            log_ratio = (p - 1) * np.log(z) + new_lp - lp[active]
            accept = np.log(rng.random(active.size)) < log_ratio
            walkers[active[accept]] = proposal[accept]
            lp[active[accept]] = new_lp[accept]
            accepted += int(accept.sum())
        chain[step] = walkers
        lps[step] = lp
    return chain, lps, accepted / (n_steps * n)


def autocorrelation_time(chain: NDArray, window: float = 5.0) -> NDArray:
    """Integrated autocorrelation time of each parameter, in steps, from the walker-averaged
    autocorrelation of a chain (steps, walkers, p), with Sokal's automatic window: the sum runs
    to the first lag M ≥ `window`·τ(M) (Goodman & Weare 2010; Foreman-Mackey et al. 2013,
    the estimator `emcee` uses). Unreliable when the chain is shorter than about 50 τ."""
    x = np.asarray(chain, dtype=float)
    steps = x.shape[0]
    out = np.empty(x.shape[2])
    nfft = 1 << (2 * steps - 1).bit_length()
    for j in range(x.shape[2]):
        y = x[:, :, j] - x[:, :, j].mean(axis=0)
        f = np.fft.rfft(y, n=nfft, axis=0)
        acf = np.fft.irfft(f * np.conj(f), n=nfft, axis=0)[:steps].mean(axis=1)
        if acf[0] <= 0:
            out[j] = np.nan
            continue
        rho = acf / acf[0]
        taus = 2.0 * np.cumsum(rho) - 1.0
        lags = np.arange(steps)
        m = np.flatnonzero(lags >= window * taus)
        out[j] = taus[m[0]] if m.size else taus[-1]
    return out
