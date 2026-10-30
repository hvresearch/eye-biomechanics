"""Synthetic baseline subjects (M5 plan, Task 5.9)."""

import numpy as np
import pytest

from eyebiomech.synth.synteyes import load_synteyes, mixture_moments, sample, sample_vectors


def test_sample_moments_match_the_table():
    t = load_synteyes()
    mean, cov = mixture_moments(t)
    v = sample_vectors(2000, t["referenceAgeYears"], seed=3)
    se = np.sqrt(np.diag(cov) / len(v))
    assert np.all(np.abs(v.mean(axis=0) - mean) < 2 * se + 1e-12)
    assert np.allclose(np.cov(v.T), cov, rtol=0.10, atol=0.01 * np.max(np.diag(cov)))


def test_sampling_is_reproducible_and_checks_the_age():
    t = load_synteyes()
    a = sample_vectors(50, None, seed=1)
    assert np.array_equal(a, sample_vectors(50, t["referenceAgeYears"], seed=1))
    assert not np.array_equal(a, sample_vectors(50, None, seed=2))
    with pytest.raises(ValueError, match="age"):
        sample_vectors(5, t["referenceAgeYears"] + 10, seed=1)


def test_subjects_carry_their_refraction():
    s = sample(3, seed=0)
    assert len(s) == 3 and set(s[0]["refraction"]) == {"M", "J0", "J45"}


def test_the_stand_in_is_marked_untranscribed():
    t = load_synteyes()
    assert t["transcribed"] is False and "supplement" in t["transcriptionNote"]
