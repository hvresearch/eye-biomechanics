# Dispersion of the ocular media

| File | Content | Status |
|---|---|---|
| `escudero-sanz-1999.json` | Indices of cornea, aqueous, lens, and vitreous at 458, 543, 589.3, 632.8 nm (Escudero-Sanz & Navarro 1999, Table 2) | transcribed from search excerpts; `verified: false` |

The four values per medium are fitted by a three-term Cauchy law, `n(λ) = A + B/λ² + C/λ⁴`
with λ in µm (`cauchyFit` in `web/packages/optics/src/color/dispersion.ts`; the fit is a
modeling choice and its residual is tested below 2e-4). Only the wavelength dependence is
used: a medium's index at λ is its document `index555` plus `n_fit(λ) − n_fit(555)`. The
offset form keeps each schematic eye's own index (Navarro 1985 stores d-line values under
`index555`, accepted in M1) and adds the measured dispersion on top.

The V(λ) weights for polychromatic images live in `data/color/cie-1924-photopic.json`.
