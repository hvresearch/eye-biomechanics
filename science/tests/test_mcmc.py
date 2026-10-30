"""Ensemble sampler (M5 plan, Task 5.10, Deviation 4)."""

import numpy as np
import pytest

from eyebiomech.calib.mcmc import autocorrelation_time, ensemble_sample

MEAN = np.array([1.0, -2.0])
COV = np.array([[1.0, 0.8], [0.8, 2.0]])
PREC = np.linalg.inv(COV)


def log_prob(x):
    d = x - MEAN
    return -0.5 * d @ PREC @ d


def test_a_correlated_gaussian_is_sampled():
    rng = np.random.default_rng(0)
    p0 = MEAN + 0.1 * rng.standard_normal((16, 2))
    chain, lps, acc = ensemble_sample(log_prob, p0, 3000, seed=5)
    flat = chain[500:].reshape(-1, 2)
    assert np.allclose(flat.mean(axis=0), MEAN, atol=0.1 * np.sqrt(np.diag(COV)).max())
    assert np.allclose(np.cov(flat.T), COV, rtol=0.10, atol=0.05)
    assert 0.2 <= acc <= 0.8  # the stretch move accepts about 0.7 in two dimensions
    assert lps.shape == chain.shape[:2]


def test_bad_ensembles_are_refused():
    with pytest.raises(ValueError, match="walkers"):
        ensemble_sample(log_prob, np.zeros((3, 2)), 10)
    with pytest.raises(ValueError, match="finite"):
        ensemble_sample(lambda x: -np.inf, np.zeros((4, 2)) + np.arange(4)[:, None], 10)


def test_the_autocorrelation_time_of_an_ar1_chain():
    """AR(1) with coefficient phi has the integrated autocorrelation time (1 + phi)/(1 - phi);
    independent draws have 1 (M5 review round 1, Minor 4)."""
    rng = np.random.default_rng(3)
    steps, walkers, phi = 20000, 8, 0.9
    x = np.zeros((steps, walkers, 2))
    noise = rng.standard_normal((steps, walkers, 2))
    x[:, :, 1] = noise[:, :, 1]
    for t in range(1, steps):
        x[t, :, 0] = phi * x[t - 1, :, 0] + noise[t, :, 0]
    tau = autocorrelation_time(x)
    assert tau[0] == pytest.approx((1 + phi) / (1 - phi), rel=0.15)
    assert tau[1] == pytest.approx(1.0, abs=0.15)
