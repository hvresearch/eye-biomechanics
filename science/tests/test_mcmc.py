"""Ensemble sampler (M5 plan, Task 5.10, Deviation 4)."""

import numpy as np
import pytest

from eyebiomech.calib.mcmc import ensemble_sample

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
