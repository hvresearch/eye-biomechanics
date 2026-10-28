# Corneoscleral material data

| File | Content | Status |
|---|---|---|
| `cornea-sclera.json` | Matrix and fiber constants per region (cornea, limbus, sclera), corneal limbal and scleral regional thickness, age stiffening, optic-nerve support radius, scleral-spur position, ciliary tension per diopter, a corneal inflation excerpt, and the ocular rigidity reference | partial transcription from search excerpts; `verified: false` |

## Model

Compressible neo-Hookean matrix plus Holzapfel–Gasser–Ogden fiber families with the
dispersed invariant `E = κ(I₁ − 3) + (1 − 3κ)(I₄ − 1)`, active in tension only (M4 plan,
Deviation 11). The Lamé constant follows from the Poisson ratio, `λ = 2μν/(1 − 2ν)`.

## What is transcribed and what is assumed

The M4 session (2026-10-28) could reach only search-engine excerpts: PMC, ARVO, doi.org,
Europe PMC, CORE, and vendor-hosted PDFs are denied by the session's network policy.

- Excerpt-confirmed (secondary in places): an HGO corneal row (c1 0.3312 MPa, k1 2.9211 MPa,
  k2 20.7395) attributed to Pandolfi in a 2025 parameter-variability paper; the 200 kPa scleral
  matrix shear modulus (Coudrillier 2015a, Girard 2009, via a 2022 preprint); scleral thickness
  by region (Vurgese 2012); the age stiffening between 50 and 95 years (Elsheikh 2007, via a
  secondary summary); the optic nerve sheath diameter; the scleral spur position; one donor
  inflation fit (units questioned by the excerpt itself; not used as an acceptance target); the in-vivo ocular rigidity coefficient (Pallikaris et al. 2005), the acceptance reference.
- Assumed: every Poisson ratio, the convention mu = 2 c1, fiber dispersion, fiber families and
  directions, the limbal and scleral fiber constants (the corneal ones are reused), the limbal
  corneal thickness (a weak source), the limbal band width, stiffening below 50 years (none),
  and the ciliary tension.

Every entry stays `verified: false` until a session with document access checks it against
the papers (Pandolfi & Holzapfel 2008, Whitford et al. 2015, Elsheikh et al. 2007 and 2010,
Grytz et al. 2014 for the sclera).

## Verification outcome (M4, 2026-10-28)

With these constants the whole-globe model's Friedenwald coefficient between 10 and 20 mmHg is
0.028 /µL at ages up to 50, 2.2 times the in-vivo mean of Pallikaris et al. 2005 (0.0126 /µL)
and near Friedenwald's enucleated-eye 0.021: the globe is somewhat too stiff, and so the
induced deformations are, to first order, about half of what a calibrated model would give.
The corneal inflation excerpt (6.6 µm for 15 → 15.5 mmHg) is 7–11 times the model's 0.6–1.0
µm and cannot be reconciled with the rigidity reference for a whole globe; it is kept for the
record, not as a target. Tissue stiffness is a calibration parameter of Milestone 5.
