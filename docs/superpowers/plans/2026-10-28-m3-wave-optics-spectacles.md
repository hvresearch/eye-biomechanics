# Milestone 3: Wave optics, pupil, visual axis, spectacles

Date: 2026-10-28
Status: in progress (draft PR "Milestone 3: Wave optics, pupil, visual axis, spectacles")
Master plan: `docs/superpowers/plans/2026-10-26-master-plan.md` (Milestone 3 section)

**Goal:** The right eye's optics strip shows the wavefront map, a Zernike bar chart, the PSF, the MTF with its diffraction limit, Strehl, and the retinal image of a Snellen E, for the uncorrected and the spectacle-corrected eye side by side. A spectacles panel edits sphere, cylinder, axis, vertex, base curve, and index, and an auto-prescribe button finds the prescription that minimizes RMS wavefront error. Refractive-error presets expose axial, corneal, and lenticular mechanisms with a decomposition readout. The pupil follows luminance, age, and vergence. The fovea sits at angle alpha off the optical axis. The Milestone 0–2 follow-ups assigned to M3 are closed or re-filed with a reason.

**Architecture:** `optics` (pure TS) gains toric and Zernike-perturbed surfaces with Newton intersection, an explicit image-surface flag, per-wavelength media indices, pupil-plane bundles with ray aiming through surfaces in front of the pupil, the OPD map and Zernike fit, refraction and power vectors, a radix-2 FFT with PSF, MTF, and retinal image, spectacle lens surfaces, and Nelder–Mead auto-prescription. `eye-model` gains the Watson & Yellott pupil with near miosis, the visual-axis view, refractive presets with a paraxial decomposition, clinical (TABO) axis conversion, and the mirror shortcut; it still imports optics for types only, and every optics computation it needs (far points) is injected. The viewer's worker runs the wave pipeline for the right eye (uncorrected and corrected) with at most one request in flight. A Python reference tracer, cross-checked against Optiland on conic systems, writes the expected hit points that a TypeScript test compares against.

**Tech Stack:** TypeScript strict, Vitest, Vite 8, React 19, Zustand, three + react-three-fiber + drei, custom SVG and canvas charts, Playwright 1.63.0. Python 3.12 with uv, NumPy, Optiland (dev only), pytest.

**Spec:** `docs/superpowers/specs/2026-10-26-eye-simulation-design.md` §3.2 (Surface types, visualAxis, pupilDecenterMm), §4.1 (visual axis, refractive presets), §4.3 (pupil), §5 (all), §6.3 (Accommodation and pupil, Spectacles, Subject), §6.4 (optics strip), §9, §12 (optics oracle).

## Deviations from the master plan (decided at planning time)

1. **Literature values are partly transcribed from excerpts and secondary sources.** The session's network policy denies every literature host (PMC, ARVO, NASA Ames, eScholarship, doi.org, arXiv, publisher sites); search-engine excerpts and PyPI packages are reachable. CLAUDE.md forbids transcribing from memory. What could be confirmed, and how each value is flagged:
   - **Watson & Yellott 2012 pupil.** Excerpts confirm the Stanley & Davies base function `D_SD = 7.75 − 5.75·(F/846)^0.41 / ((F/846)^0.41 + 2)`, the effective corneal flux `F = L·a·M(e)`, the reference age 28.58 years, and the 20–83 year validity range. The age slope `S = 0.021323 − 0.0095623·D_SD` and the monocular factor `M(1) = 0.1`, `M(2) = 1` come from the open-source implementation `get_pupil_diameter_watson2012` in luxpy 1.12.5 (PyPI), a secondary source. All are `verified: false` with the source named per coefficient. The paper's three tabulated points could not be reached, so the Task 3.7 test compares against three points computed with luxpy's implementation (an independent implementation of the same formula), not against the paper.
   - **Near miosis.** Feil, Moser & Abegg 2017 (convergence is the main trigger) is confirmed by excerpt, but no excerpt gives a coefficient. The coefficient is derived from Gislén, Gustafsson & Kröger 2008 as quoted by a review excerpt (adults constrict 1.83 mm for a 6 D near demand), converted to meter angles with the normal 1 MA per diopter AC/A relation: 0.305 mm per MA. `verified: false`.
   - **Angle alpha.** Polans 2015's values could not be reached. Excerpts give about 5° nasal as the typical angle alpha (a 3–5° range in teaching summaries). The default is `alphaDeg: 5`, horizontal only, `kappaDeg: 5` (taken equal to alpha, which the schema requires and nothing in M3 reads), `pupilDecenterMm: {x: 0, y: 0}`, all `verified: false`, file `data/visual-axis/defaults.json` (not `polans-2015.json`, since nothing in it comes from Polans).
   - **Dispersion.** Escudero-Sanz & Navarro 1999 Table 2 (indices at 458, 543, 589.3, 632.8 nm for cornea, aqueous, lens, vitreous) is confirmed by two search excerpts that agree on the 543 nm column. Stored in `data/dispersion/escudero-sanz-1999.json` with `verified: false` until compared with the paper; a Cauchy fit per medium is the modeling choice.
   - **V(λ).** CIE 1924 photopic luminous efficiency at 450, 500, 555, 600, 650 nm (0.038, 0.323, 1.000, 0.631, 0.107), read from the CVRL CIE 1931 2° ȳ table as packaged in luxpy. `verified: true` (a standard table read directly).
   - **Zapata-Díaz 2019, Navarro 1985 Table 4 conic coefficients, Volkmann origins, Demer pulleys, BCSC widths.** Searched again; still unreachable. Task 3.0 re-files them for M4 with the reason.
2. **Document lateral quantities are in the eye's local frame (x temporal).** Toric `axisDeg`, decenters, Zernike angles, and `visualAxis.alphaDeg` (nasal positive) mean the same thing in a right-eye and a left-eye document, as the M2 EOM table already does. The mirror shortcut therefore copies a document unchanged except for its id and label, and the test asserts the mirror symmetry in clinical terms: the left eye's TABO axis is `180 − ` the right eye's, and both foveas lie temporal. The master plan's "flips `alphaDeg` sign" assumed head-frame documents.
3. **Clinical axes use TABO.** Prescriptions and refraction readouts use the TABO convention (degrees counterclockwise from the examiner's right, looking at the patient). The optics package measures angles from its +x toward +y. In the eye's local frame (x temporal), `TABO = 180 − φ` for the right eye and `TABO = φ` for the left (each mapped into (0, 180]). `eye-model` owns the conversion; `optics` never sees TABO.
4. **The "astigmat 1.5 D against-the-rule" preset has its minus-cylinder axis at 90°.** Against-the-rule astigmatism means the horizontal meridian is steepest, so the minus-cylinder axis is vertical. The master plan's end-to-end check ("cylinder −1.5 at axis 180") describes with-the-rule astigmatism and contradicts the spec's preset name; the spec wins. The Task 3.4 toric-cornea unit test keeps the master plan's axis 180 case, which is a separate optics test.
5. **The pupil is a plane 1 mm in front of the cornea.** As in M1, bundles fill a disk in the plane `z = firstEyeVertex − DEFAULT_LAUNCH_OFFSET_MM`, not the iris. The wavefront and refraction are reported in that plane (essentially the corneal plane). With spectacles in front, rays are aimed through the lens so they still fill the same disk. Labeled "Approximation:" in the tooltips.
6. **The OPD reference sphere** is centered on the chief ray's intersection with the retina and passes through the chief ray's last refracting hit (the posterior lens). The exit pupil is not located explicitly; the OPD of a well-corrected eye is insensitive to the sphere's radius at the 1e-4 µm level, which the Task 3.3 stigmatic test checks.
7. **The pure-defocus acceptance test is split.** The spec's "pure defocus wavefront fits to a single C(2,0) with others below 1e-9" is tested on a synthetic map built from Z(2,0) (it tests the fitter). Shifting the reference sphere of a traced stigmatic system by Δz gives a defocus wavefront with a small physical C(4,0) from the exact sphere difference, so that test asserts the other coefficients are below 1% of C(2,0).
8. **PSF from the fitted wavefront.** The pupil function is built from the order-8 Zernike fit sampled on the PSF grid, not from the raw ray map, so each wavelength can be resampled onto a common angular grid for polychromatic sums. The angular pixel is `λ_min / (2D)` (Nyquist for the shortest wavelength in use). Vignetting is captured by the pupil disk only.
9. **Two refraction methods.** `refractionFromZernike` implements the Thibos 1997 minimum-RMS (second-order) conversion, which the readouts show, and a "paraxial" variant that adds the ρ² terms of the higher radial orders (derived from the OSA polynomials, not transcribed). The preset accuracy test uses the paraxial variant so the comparison with the paraxial nominal is not biased by spherical aberration.
10. **Wave optics for the right eye only.** The left eye keeps the M2 defocus pipeline; the strip and spectacles readouts are for the right eye, which is the cutaway eye. The spectacles apply to both eyes (each eye's own prescription, right copied mirrored to left by default).
11. **Vergence demand in meter angles.** `nearMiosisMm` takes the vergence demand in meter angles (the reciprocal of the fixation distance in meters, computed from the vergence angle and IPD), not degrees; meter angles are what the coefficient's source reports.

## Global Constraints

- Units: millimeters, diopters, degrees in data files and UI; radians internal to math modules. Right-handed, z along the optical axis toward the retina, x temporal for the right eye, y superior. Each eye's local frame has x temporal (mirrored for the left eye), as in M2.
- Sign conventions (optics package): OPD `W = OPL_chief − OPL_ray` in µm, so a phase-advanced ray is positive and a myopic eye has `c(2,0) > 0`. OSA/ANSI Z80.28 single index `j = (n(n+2) + m)/2`, unit-RMS normalization, `Z = N·R_n^|m|(ρ)·cos(mθ)` for `m ≥ 0` and `N·R_n^|m|(ρ)·sin(|m|θ)` for `m < 0`, θ from +x toward +y. Thibos: `M = −4√3·c(2,0)/r²`, `J0 = −2√6·c(2,2)/r²`, `J45 = −2√6·c(2,−2)/r²` (c in µm, r in mm, result in D). Minus cylinder; axes in (0, 180].
- TypeScript `strict: true`, no `any` in `eye-model` or `optics`. These two packages import nothing from the DOM or React. `optics` does not import `eye-model`; `eye-model` imports `optics` as a type-only dependency.
- Every numeric constant lives in `data/` with a citation; code never hard-codes a physiological value. Numerical choices (tolerances, grid sizes, iteration limits) are named constants with a comment saying they are numerical.
- All optics computation runs in a web worker; the main thread never blocks more than 16 ms per frame. Worker results for the 64×64 pupil grid and 256 PSF grid arrive within 100 ms.
- `EyeParameters.schemaVersion` stays `"1.0.0"`; no breaking schema change (the schema already has toric and Zernike surfaces, `visualAxis`, `pupilDecenterMm`, and free-form `dispersion`).
- Approximations (homogeneous lens index, pupil plane in front of the cornea, PSF from an order-8 fit, length-proxy activation, absent pulleys, center of rotation at the globe center) are labeled "Approximation:" in the UI tooltip of the affected readout.
- Full gate before every commit: `(cd web && pnpm -r lint && pnpm -r test && pnpm --filter @eye/viewer build) && (cd science && uv run ruff check . && uv run pytest)`, plus `(cd web && pnpm --filter @eye/viewer e2e)` because `web/apps/viewer/e2e/` exists.
- Commit messages end with `Co-Authored-By: Claude <model name> <noreply@anthropic.com>` naming the model that wrote them. One task per commit; push after every commit.

## Review Focus

Failure modes this milestone owns, each tied to the task that tests it:

1. **Rays that miss or undergo TIR** are flagged, excluded from the OPD map and fit; the fit throws `InsufficientRaysError` below 60% valid samples; a miss with no forward intersection reports `"miss"`, an aperture clip `"aperture"`. → Task 3.1, Task 3.3.
2. **Newton intersection on toric and Zernike surfaces** converges for a 30° oblique ray and returns null (not a wrong point) when it does not converge or lands outside the aperture. → Task 3.1.
3. **Axis wrap-around.** Refraction axes stay in (0, 180]; the power-vector round trip holds near 0°/180°; auto-prescribe works in power-vector space so it never fights the wrap. → Task 3.4, Task 3.6.
4. **Age outside the pupil formula's 20–83 range and outside 6–90** clamps, never extrapolates; the pupil never drops below the 2 mm floor. → Task 3.7.
5. **Large defocus in the PSF.** The PSF grid aliases when the blur exceeds its field; the PSF result reports `fieldArcmin` and `aliased: true` when the geometric blur diameter `|M|·D` exceeds it, and the viewer says so. → Task 3.5, Task 3.11.
6. **Stale optics while playing.** At most one worker request is in flight; the latest state is sent when the response arrives; responses for superseded states are dropped. → Task 3.10.
7. **Right/left clinical axes.** A mirrored document gives TABO axes that sum to 180 across the two eyes; the readout's axis for the right eye is TABO, not the optics frame. → Task 3.4, Task 3.8.
8. **Image surface identity.** The retina is identified by its `image` flag, so an index-matched surface (a future stop) never ends the trace early. → Task 3.1.

## File structure

```
data/pupil/watson-yellott-2012.json        unified formula coefficients and defaults (Task 3.7)
data/pupil/near-response.json              miosis per meter angle, floor (Task 3.7)
data/visual-axis/defaults.json             alpha, kappa, pupil decentration (Task 3.8)
data/presets/refractive-errors.json        preset list with mechanisms and nominal refractions (Task 3.8)
data/dispersion/escudero-sanz-1999.json    media indices at four wavelengths (Task 3.2)
data/color/cie-1924-photopic.json          V(λ) at the five polychromatic wavelengths (Task 3.2)
data/spectacles/defaults.json              vertex, base curve, index, thickness defaults (Task 3.6)
data/acuity/optotypes.json                 Snellen letter geometry (Task 3.5)
data/oracle/cases.json, expected.json      cross-check cases and reference hit points (Task 3.9)
web/packages/optics/src/
  math/zernike.ts             OSA index maps, radial polynomials, Z_j(ρ, θ) and its ρ² coefficients
  surfaces/types.ts           (modify) Surface union: conic | toric | zernike; image flag; Medium.dispersion
  surfaces/toric.ts           biconic sag, normal
  surfaces/zernikeSag.ts      conic base + Zernike height perturbation
  surfaces/geometry.ts        sag, normalAt, intersect dispatch; Newton intersection
  surfaces/conic.ts           (modify) closed-form conic kept, exported for geometry.ts
  surfaces/sequential.ts      (modify) toric and Zernike sequential surfaces
  color/dispersion.ts         indexAt(medium, λ), cauchyFit, polychromatic weights
  trace/sequential.ts         (modify) dispatch, per-wavelength index, "miss" reason, image flag
  trace/aim.ts                pupil-plane bundles, ray aiming through front surfaces
  paraxial/abcd.ts            (modify) meridian curvature, image flag
  metrics/defocus.ts          (modify) image flag in splitImageSurface
  wavefront/opd.ts            OPD map vs reference sphere
  wavefront/fit.ts            least-squares Zernike fit
  wavefront/refraction.ts     Zernike → (S, C, axis) and (M, J0, J45); power-vector conversions
  wavefront/analyze.ts        one call: bundle → OPD → fit → refraction
  image/fft.ts                radix-2 complex 2D FFT
  image/psf.ts                pupil function → PSF, Strehl; polychromatic sum
  image/mtf.ts                radial MTF, diffraction-limited MTF
  image/targets.ts            Snellen E and gratings as bitmaps
  image/retinal.ts            target ⊗ PSF
  lenses/prescription.ts      Prescription → two surfaces at the vertex distance
  lenses/nelderMead.ts        generic Nelder–Mead
  lenses/autoprescribe.ts     minimize RMS (or maximize Strehl) over the lens power vector
web/packages/eye-model/src/
  pupil/watsonYellott.ts, pupil/nearResponse.ts, pupil/model.ts
  optics/clinical.ts          TABO ↔ local axis, clinical prescriptions
  optics/view.ts              visual-axis view (field angle, pupil center)
  optics/dispersion.ts        attach media dispersion by name
  presets/refractive.ts       applyRefractivePreset, decomposeRefraction, mirrorEye
  build/surfaces.ts           (modify) toric/Zernike surfaces, retina image flag, dispersion
  state/derive.ts             (modify) pupil from the model, vergence demand
science/eyebiomech/oracle/    reference tracer, Optiland cross-check, generator
web/apps/viewer/src/
  worker/messages.ts, handle.ts, client.ts   (modify) wave results, spectacles, backpressure
  store/scene.ts              (modify) luminance, presets, spectacles, auto-prescribe, wave selection
  ui/optics/OpticsStrip.tsx, WavefrontMap.tsx, ZernikeBars.tsx, PsfView.tsx, MtfChart.tsx, RetinalImage.tsx, colormap.ts
  ui/Spectacles.tsx, ui/Decomposition.tsx
  ui/Inspector.tsx, Readout.tsx, tooltips.ts (modify)
web/apps/viewer/e2e/optics.spec.ts
```

---

### Task 3.0: Follow-ups that need no new optics

Closes the M1/M2 follow-ups assigned to M3 that touch only data, docs, or small viewer fixes, and re-files the transcriptions that still need document access.

**Files:**
- Modify: `data/eom/README.md`, `data/schematic-eyes/navarro-1985.json`, `data/schematic-eyes/README.md`, `web/apps/viewer/src/scene/Muscle.tsx`, `web/apps/viewer/src/scene/Target.tsx` (or `src/store/scene.ts` `setTarget`), `web/apps/viewer/src/ui/Readout.tsx`, `web/apps/viewer/src/ui/tooltips.ts`
- Create: `docs/superpowers/plans/2026-10-28-m3-followups.md`
- Test: `web/apps/viewer/test/tooltips.test.ts`, `web/apps/viewer/test/store.test.ts`, `web/packages/eye-model/test/provenance.test.ts`

**Interfaces:**
- Produces: `gazeTooltip(): string` and `readoutTooltips(...).defocus` mentions the unverified Table 4 conic coefficients by key; `clampDirectionDeg(deg: {x, y}): {x, y}` exported from the store module, applied in `setTarget` and `setTargetDirection` (bound `MAX_DIRECTION_DEG = 40`, moved from `Inspector.tsx` to the store and imported by the inspector).

- [ ] **Step 1:** Failing tests:
  - `tooltips.test.ts`: `gazeTooltip()` starts with "Approximation:" and mentions the globe center; the defocus tooltip names `anteriorConicPerLn` and `posteriorConicPerLn` as unverified (read from the preset table's `accommodation.unverified`, not hard-coded).
  - `store.test.ts`: `setTarget({ distanceM: 1, directionDeg: { x: 70, y: -55 } })` stores `{ x: 40, y: -40 }`.
  - `provenance.test.ts`: the Navarro table has an `apertureNote` saying the aperture semi-diameters are modeling choices.
- [ ] **Step 2:** Run `cd web && pnpm -r test`; expect FAIL.
- [ ] **Step 3:** Implement:
  - `Muscle.tsx`: look up the tendon length by muscle `name`, not by index in `MUSCLE_NAMES` order (M2 follow-up).
  - `Target.tsx`/store: clamp drags to ±40° (M2 follow-up).
  - `Readout.tsx`: Gaze readout gets `gazeTooltip()` (M2 follow-up).
  - `tooltips.ts`: defocus tooltip lists the unverified Table 4 coefficients (M1 follow-up).
  - `navarro-1985.json`: add `apertureNote` ("aperture semi-diameters are modeling choices large enough to pass any pupil up to 8 mm; the paper gives none"). The pupil `diameterMm: 4.0` follow-up is closed in Task 3.7, which replaces the fixed pupil.
  - `data/eom/README.md`: add `activation.json` (approximation by design) and `dynamics.json` (partly confirmed) to the status table (M2 follow-up).
  - Re-search, once each, for the values that need document access (Zapata-Díaz 2019 Table 1; Navarro 1985 Table 4 conic coefficients; Volkmann 1869 origins; Clark, Miller & Demer 2000 pulleys). The M3 planning search found none; if still unreachable, write `2026-10-28-m3-followups.md` with these items naming M4 ("needs a session with document access"), with the date and hosts tried.
- [ ] **Step 4:** Run; PASS. Full gate. Commit: `chore: M1/M2 follow-ups (tooltips, target clamp, provenance notes)`.

### Task 3.1: Toric and Zernike surfaces, image flag, miss reason

**Files:**
- Create: `web/packages/optics/src/math/zernike.ts`, `src/surfaces/toric.ts`, `src/surfaces/zernikeSag.ts`, `src/surfaces/geometry.ts`, `test/zernike-poly.test.ts`, `test/surfaces.test.ts`
- Modify: `src/surfaces/types.ts`, `src/surfaces/conic.ts`, `src/surfaces/sequential.ts`, `src/trace/sequential.ts`, `src/paraxial/abcd.ts`, `src/metrics/defocus.ts`, `src/index.ts`, `test/helpers/navarro.ts`, `test/trace.test.ts`, `test/paraxial.test.ts`
- Modify: `web/packages/eye-model/src/build/surfaces.ts`, `web/packages/eye-model/test/build.test.ts`

**Interfaces:**
- Produces (optics):
  - `interface SurfaceBase { name; apertureSemiDiamMm; vertexZMm; tilt; decenter; mediumAfter: Medium; image?: boolean }`; `ConicSurface = SurfaceBase & { kind: "conic"; radiusMm; conic }`; `ToricSurface = SurfaceBase & { kind: "toric"; rxMm; ryMm; axisDeg; conicX; conicY }` (`rx` is the radius of the section along the direction `axisDeg`, `ry` along `axisDeg + 90`; `Infinity` allowed); `ZernikeSurface = SurfaceBase & { kind: "zernike"; radiusMm; conic; normRadiusMm; coeffsMicrons: number[] }`; `type Surface = ConicSurface | ToricSurface | ZernikeSurface`.
  - `SequentialSurface` becomes the matching union with `thicknessToNextMm` instead of `vertexZMm` (`kind` optional, default `"conic"`).
  - `math/zernike.ts`: `zernikeIndex(j): { n; m }`, `zernikeJ(n, m): number`, `zernikeCount(maxOrder): number`, `zernikeRadial(n, m, rho): number`, `zernikeValue(j, rho, theta): number`, `zernikeNorm(n, m): number`, `zernikeRho2Coefficient(j): number` (the coefficient of ρ² in the radial polynomial times N, used by Task 3.4).
  - `surfaces/geometry.ts`: `sag(s, x, y)`, `normalAt(s, x, y)`, `intersect(s, origin, dir): { point; t } | null | "miss"` (null = outside the aperture, `"miss"` = no forward intersection); `meridianCurvature(s: Surface, meridianRad: number): number` (vertex curvature in the section along the meridian, per mm; Zernike adds its second-order terms).
  - `traceRay` uses `indexAt(medium, ray.wavelengthNm)` (Task 3.2 makes it dispersive; in this task it returns `index555`), stops before a surface with `image: true` only when called through `splitImageSurface`, and reports `reason: "miss"` for `"miss"`.
  - `paraxialPower(surfaces, indexBefore = 1, opts: { meridianDeg?: number } = {})`: the image surface is the first with `image: true` (no index-equality rule); without one, `farPointD` is NaN.
  - `splitImageSurface` uses the flag; throws "No image surface: mark the retina with image: true" otherwise.
- Produces (eye-model): `buildSurfacesAt` maps schema toric surfaces (`rxMm, ryMm, axisDeg, conicX, conicY`) and Zernike surfaces (`radiusMm, conic, zernikeHeight`) and marks the retina `image: true`.

Constants (numerical): Newton tolerance 1e-9 mm in z, at most 20 iterations, seeded by the base conic's closed-form root (for toric, the conic of the mean curvature); derivative of the Zernike height by central difference with h = 1e-6 mm. Toric sag: `z = (cx u² + cy v²) / (1 + √(1 − (1+kx)cx²u² − (1+ky)cy²v²))` with `(u, v)` the decentered coordinates rotated by `axisDeg`.

- [ ] **Step 1:** Failing tests:
  - `zernike-poly.test.ts`: index round trip for j < 45; `Z(2,0) = √3(2ρ²−1)`; orthonormality on the unit disk by numerical integration (polar Gauss–Legendre × uniform θ, order ≤ 4, tolerance 1e-3, master plan Task 3.2 test placed here because the polynomials live here); `zernikeRho2Coefficient` for j = 4 is `2√3` and for j = 12 (Z(4,0)) is `−6√5`.
  - `surfaces.test.ts`: toric with `rx = ry` equals the conic sag at 50 random points (1e-12); toric sag along the axis meridian equals the conic sag of `rx` and along the perpendicular of `ry`; rotating `axisDeg` by 90° swaps them; a Zernike surface with all zeros equals its base; `C(2,0) = 1 µm` at `normRadius = 3 mm` changes sag at r = 3 mm by `√3·(2−1)` µm (1e-12 mm); Newton converges for a 30° oblique ray on both kinds (residual `|z − sag| < 1e-9`); a ray parallel to and outside a toric surface returns `"miss"`; normals are unit and face −z; `meridianCurvature` of a toric at `axisDeg` is `1/rx`, at `axisDeg + 90°` is `1/ry`, and of a Zernike surface with `c(2,0)` equals `1/R + 4√3·c·1e-3/a²`.
  - `trace.test.ts`: a ray whose path never reaches a surface reports `reason: "miss"`; a ray clipped by the aperture reports `"aperture"`.
  - `paraxial.test.ts`: an index-matched non-image surface before the retina does not end the system (the Navarro power is unchanged when a plane `index`-matched surface is inserted in the aqueous); a toric cornea's per-meridian power differs by `(n−1)(1/rx − 1/ry)·1000` D to first order.
  - `build.test.ts`: the built retina has `image: true`; a document with a toric anterior cornea builds a `"toric"` surface with the document's radii and axis.
- [ ] **Step 2:** Run `cd web && pnpm --filter @eye/optics test && pnpm --filter @eye/eye-model test`; expect FAIL.
- [ ] **Step 3:** Implement the union, `zernike.ts`, `toric.ts`, `zernikeSag.ts`, `geometry.ts` (conic keeps its closed form), update the trace, paraxial, defocus, sequential conversion, the Navarro test helper (`image: true` on the retina), and eye-model's builder.
- [ ] **Step 4:** Run; PASS. Full gate (the viewer's worker uses the flag through eye-model). Commit: `feat(optics): toric and Zernike surfaces, image flag, miss reason`.

### Task 3.2: Media dispersion and photopic weights

**Files:**
- Create: `data/dispersion/escudero-sanz-1999.json`, `data/dispersion/README.md`, `data/color/cie-1924-photopic.json`, `web/packages/optics/src/color/dispersion.ts`, `web/packages/optics/test/dispersion.test.ts`, `web/packages/eye-model/src/optics/dispersion.ts`, `web/packages/eye-model/test/dispersion.test.ts`
- Modify: `web/packages/optics/src/surfaces/types.ts` (`Medium.dispersion`), `src/trace/sequential.ts`, `src/index.ts`, `web/packages/eye-model/src/build/surfaces.ts`, `web/packages/eye-model/src/index.ts`

**Data:** `escudero-sanz-1999.json`: `{ name, citation, doi: "10.1364/JOSAA.16.001881", verified: false, note, wavelengthsNm: [458, 543, 589.3, 632.8], media: { cornea: [1.3828, 1.3777, 1.376, 1.3747], aqueous: [1.3445, 1.3391, 1.3374, 1.336], lens: [1.4292, 1.4222, 1.42, 1.4183], vitreous: [1.3428, 1.3377, 1.336, 1.3347] } }`. `cie-1924-photopic.json`: `{ citation, source, verified: true, wavelengthsNm: [450, 500, 555, 600, 650], V: [0.038, 0.323, 1.0, 0.631, 0.107] }`.

**Interfaces:**
- Produces (optics): `interface CauchyDispersion { form: "cauchy"; bUm2: number; cUm4: number }` (A is not stored: only differences from 555 nm are used); `Medium.dispersion?: CauchyDispersion`; `indexAt(m: Medium, wavelengthNm: number): number = index555 + B(λ⁻² − 0.555⁻²) + C(λ⁻⁴ − 0.555⁻⁴)` (λ in µm; no dispersion → `index555`); `cauchyFit(wavelengthsNm: number[], indices: number[]): { a; bUm2; cUm4; maxResidual }` (least squares, three terms).
- Produces (eye-model): `MEDIA_DISPERSION: Record<"cornea" | "aqueous" | "lens" | "vitreous", CauchyDispersion>` fitted at load from the table; `withDispersion(surfaces: Surface[]): Surface[]` attaches it by `mediumAfter.name` unless the medium already has one; `PHOTOPIC: { wavelengthsNm: number[]; weights: number[] }` (V(λ), normalized to sum 1). `buildSurfacesAt` calls `withDispersion`. The document's `index555` stays the 555 nm value by definition (for Navarro, the stored d-line values, as accepted in M1).

- [ ] **Step 1:** Failing tests: `cauchyFit` of the four cornea values has `maxResidual < 2e-4`; `indexAt` at 555 nm equals `index555` exactly; the lens index at 458 nm exceeds that at 632.8 nm by the table's difference within 2e-4; a traced ray at 450 nm through the Navarro eye focuses in front of the 650 nm ray (longitudinal chromatic aberration between 450 and 650 nm in the range 0.8–1.6 D, by `objectVergence` of each wavelength's best focus — a plausibility band, not a published fit); `PHOTOPIC.weights` sum to 1 and peak at 555.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement; write `data/dispersion/README.md` (source, excerpt status, fit choice).
- [ ] **Step 4:** Run; PASS. Full gate. Commit: `feat(optics): media dispersion and photopic weights`.

### Task 3.3: Pupil-plane bundles, OPD map, Zernike fit

**Files:**
- Create: `web/packages/optics/src/trace/aim.ts`, `src/wavefront/opd.ts`, `src/wavefront/fit.ts`, `test/aim.test.ts`, `test/opd.test.ts`, `test/fit.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Produces:
  - `interface ViewSpec { objectDistanceM: number; fieldDeg: { x: number; y: number }; referenceZMm: number; pupilPlaneZMm: number; pupilCenterMm: { x: number; y: number }; pupilRadiusMm: number }`. The object lies along the field direction through the pupil center, `objectDistanceM` from `referenceZMm` axially; `Infinity` is a collimated beam.
  - `interface PupilBundle { rays: Ray[]; pupilXYMm: Float64Array /* 2 per ray, relative to the center */; gridIndex: Uint32Array /* row * gridN + col */; gridN: number; chief: Ray; collimated: boolean; view: ViewSpec }`.
  - `pupilBundle(view: ViewSpec, gridN: number, wavelengthNm: number, front: readonly Surface[] = []): PupilBundle`: samples on a gridN × gridN grid clipped to the disk; with `front` surfaces (those whose vertex lies before the pupil plane, e.g. spectacles) each ray is aimed by Newton iteration with a finite-difference Jacobian (≤ 8 iterations, tolerance 1e-9 mm) so that after `front` it crosses the pupil plane at its sample. Collimated rays start on the plane perpendicular to the direction, so their starting optical paths are equal.
  - `interface OpdMap { gridN; pupilRadiusMm; xs: Float64Array; ys: Float64Array; opdMicrons: Float64Array; valid: Uint8Array; gridIndex: Uint32Array; imagePoint: Vec3; validFraction: number }`.
  - `opdMap(surfaces: readonly Surface[], bundle: PupilBundle): OpdMap` (reference sphere per Deviation 6; throws if the chief ray is vignetted).
  - `interface ZernikeFit { coeffsMicrons: number[]; maxOrder: number; rmsMicrons: number /* excluding piston and tilt */; hoRmsMicrons: number /* n ≥ 3 */; residualRmsMicrons: number; pupilRadiusMm: number }`.
  - `fitZernike(map: OpdMap, maxRadialOrder = 8): ZernikeFit` (normal equations with Cholesky; throws `InsufficientRaysError` below 60% valid).
  - `zernikeWavefront(coeffsMicrons, x, y, pupilRadiusMm): number` (reconstruction).
- [ ] **Step 1:** Failing tests:
  - `aim.test.ts`: without front surfaces each ray passes through its pupil sample; with a −3 D thin spectacle (two spherical surfaces) in front, every aimed ray crosses the pupil plane within 1e-8 mm of its sample; the chief ray of an on-axis view is the axis.
  - `opd.test.ts`: a stigmatic single refracting ellipsoid (`k = −1/n²`, object at infinity, flat image plane at the far focus `nR/(n−1)`) gives RMS < 1e-4 µm; moving its image plane by Δz = +0.05 mm gives `c(2,0)` with the sign of a myopic eye (positive) and every other coefficient below 1% of it (Deviation 7); a vignetted chief ray throws.
  - `fit.test.ts`: a synthetic map built from `0.7·Z(2,0)` µm fits to `c4 = 0.7` with all others below 1e-9 (spec §5.6); a map with 50% valid samples throws `InsufficientRaysError`; random coefficient vectors up to order 6 are recovered within 1e-9; `rmsMicrons` equals `√Σ_{j≥3} c_j²`.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run; PASS. Full gate. Commit: `feat(optics): OPD map and Zernike fit`.

### Task 3.4: Refraction and power vectors from the wavefront

**Files:**
- Create: `web/packages/optics/src/wavefront/refraction.ts`, `src/wavefront/analyze.ts`, `test/refraction.test.ts`, `web/packages/eye-model/src/optics/clinical.ts`, `web/packages/eye-model/test/clinical.test.ts`
- Modify: `web/packages/optics/src/index.ts`, `web/packages/eye-model/src/index.ts`

**Interfaces:**
- Produces (optics):
  - `interface Refraction { sphereD; cylinderD; axisDeg; M; J0; J45 }` (axis in the optics frame, (0, 180]).
  - `powerVectors(sphereD, cylinderD, axisDeg): { M; J0; J45 }`; `sphereCylFromPowerVectors(M, J0, J45): { sphereD; cylinderD; axisDeg }` (minus cylinder; axis 180 when cylinder is 0).
  - `refractionFromZernike(coeffsMicrons, pupilRadiusMm, method: "minimumRms" | "paraxial" = "minimumRms"): Refraction` (Deviation 9).
  - `analyzeWavefront(surfaces, view: ViewSpec, opts: { gridN?: number; wavelengthNm?: number; maxRadialOrder?: number } = {}): { map: OpdMap; fit: ZernikeFit; refraction: Refraction }` (front surfaces are those with `vertexZMm < view.pupilPlaneZMm`).
- Produces (eye-model): `clinicalAxisDeg(localDeg: number, side: "left" | "right"): number` and `localAxisDeg(taboDeg, side)` (Deviation 3, (0, 180]); `type ClinicalPrescription = { sphereD; cylinderD; axisDeg /* TABO */ }`; `toClinicalRefraction(r: Refraction, side): Refraction` (axis converted).
- [ ] **Step 1:** Failing tests:
  - round trip `(S, C, axis) → (M, J0, J45) → (S, C, axis)` for 50 random prescriptions (seeded) within 1e-9 D and 1e-6°, including axes 0.5° and 179.5°;
  - a pure `c(2,0) = 1 µm` at r = 2 mm gives `M = −√3` D and zero cylinder; `c(2,2)` gives cylinder with axis 90 or 180 by sign; `c(2,−2)` gives axis 45 or 135;
  - the paraxial method adds `12√5·c(4,0)/r²` to M for a pure `c(4,0)` (derived from `zernikeRho2Coefficient`);
  - the Navarro eye with a toric anterior cornea carrying 1.5 D of corneal cylinder with its flat meridian along the optics-frame x axis yields `cylinderD = −1.5 ± 0.1` and `axisDeg = 180 ± 2` (master plan Task 3.3) at a 3 mm pupil;
  - `clinicalAxisDeg(30, "right") = 150`, `clinicalAxisDeg(30, "left") = 30`, round trips for both sides, values in (0, 180].
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run; PASS. Full gate. Commit: `feat(optics): refraction and power vectors from wavefront`.

### Task 3.5: FFT, PSF, MTF, retinal image

**Files:**
- Create: `data/acuity/optotypes.json`, `web/packages/optics/src/image/fft.ts`, `src/image/psf.ts`, `src/image/mtf.ts`, `src/image/targets.ts`, `src/image/retinal.ts`, `test/fft.test.ts`, `test/psf.test.ts`, `test/mtf.test.ts`, `test/retinal.test.ts`
- Modify: `src/index.ts`

**Data:** `optotypes.json`: Snellen/Sloan letter geometry (letter height five stroke widths; a 20/20 letter subtends 5 arcmin at the eye) with citation ISO 8596 and `verified: false` (definition, not checked against the standard's text in this session).

**Interfaces:**
- Produces:
  - `fft2(re: Float64Array, im: Float64Array, n: number, inverse = false): void` (in place, n a power of two; the inverse is scaled by 1/n²); `fftShift(a: Float64Array | Float32Array, n): void`.
  - `interface Psf { intensity: Float32Array /* row-major n×n, centered, peak of the diffraction-limited PSF = 1 so max = Strehl */; n; pixelArcmin; fieldArcmin; strehl; wavelengthsNm: number[]; aliased: boolean }`.
  - `interface WavefrontInput { coeffsMicrons: number[]; pupilRadiusMm: number; wavelengthNm: number; weight?: number }`.
  - `psf(input: WavefrontInput, opts: { gridN?: number /* 256 */; pixelArcmin?: number }): Psf` and `polychromaticPsf(inputs: WavefrontInput[], opts): Psf` (Deviation 8; default pixel `λ_min/(2D)`; `aliased` when the geometric blur diameter estimated from M and J of the fit exceeds half the field).
  - `interface Mtf { freqCpd: Float32Array; radial: Float32Array; diffraction: Float32Array }`; `mtf(p: Psf): Mtf` (radially averaged |OTF| normalized at 0, frequency step `1/(n·pixelDeg)` cpd); `diffractionMtf(pupilRadiusMm, wavelengthNm, freqCpd): number` (analytic).
  - `interface Bitmap { width: number; height: number; data: Float32Array /* 0 dark … 1 bright */; pixelArcmin: number }`; `snellenE(n, pixelArcmin, letterArcmin, orientation: "right" | "left" | "up" | "down" = "right"): Bitmap` (dark letter on a bright field); `grating(n, pixelArcmin, cpd, orientationDeg): Bitmap`.
  - `retinalImage(target: Bitmap, p: Psf): Bitmap` (FFT convolution with the PSF normalized to unit sum; requires matching size and pixel).
- [ ] **Step 1:** Failing tests: `fft2` of a delta is flat; forward then inverse round trip error < 1e-10 on random 64×64; Parseval within 1e-9; agreement with a naive DFT on 8×8; the diffraction-limited PSF's first dark ring lies at `1.22 λ/D` within 5% (λ = 555 nm, D = 4 mm); Strehl of a zero wavefront is 1 ± 1e-3; 0.5 D of defocus (`c(2,0)` from Thibos) at a 4 mm pupil, 555 nm, gives Strehl below 0.2; MTF at 0 cpd is 1; the zero-aberration MTF matches `diffractionMtf` within 0.02 up to 80% of cutoff; a 3 D defocus at an 8 mm pupil reports `aliased: true`; the polychromatic PSF of a zero wavefront has Strehl 1 ± 1e-3; retinal image of a delta PSF equals the target within 1e-6; a uniform target stays uniform; total energy is conserved within 1e-6; a 20/20 E is 5 arcmin tall in pixels.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run; PASS. Full gate. Commit: `feat(optics): FFT, PSF, MTF, retinal image simulation`.

### Task 3.6: Spectacle lens surfaces and auto-prescribe

**Files:**
- Create: `data/spectacles/defaults.json`, `web/packages/optics/src/lenses/prescription.ts`, `src/lenses/nelderMead.ts`, `src/lenses/autoprescribe.ts`, `test/prescription.test.ts`, `test/nelderMead.test.ts`, `test/autoprescribe.test.ts`
- Modify: `src/index.ts`

**Data:** `spectacles/defaults.json`: `vertexMm 12`, `baseCurveD 6`, `index 1.5`, `centerThicknessMm 2`, `semiDiameterMm 25`, each a design default named in the master plan, with the note that they are not physiological and that the lens material is non-dispersive (approximation).

**Interfaces:**
- Produces:
  - `interface Prescription { sphereD; cylinderD; axisDeg /* optics frame */; vertexMm; baseCurveD; index; centerThicknessMm }`; `SPECTACLE_DEFAULTS`.
  - `lensSurfaces(p: Prescription, corneaVertexZMm = 0): Surface[]`: front spherical surface of power `baseCurveD` (`R1 = 1000(n−1)/F1`) at `z = cornea − vertex − ct`, back toric at `z = cornea − vertex` whose meridian powers make the thick-lens back-vertex power `S` along `axisDeg` and `S + C` along `axisDeg + 90` (`F2 = BVP − F1/(1 − (t/n)F1)`, `R2 = 1000(1−n)/F2`).
  - `nelderMead(f: (x: number[]) => number, x0: number[], opts: { step: number[]; tolerance?: number; maxEvaluations?: number }): { x: number[]; fx: number; evaluations: number }`.
  - `interface AutoPrescribeOptions { metric?: "rms" | "strehl"; vertexMm?; baseCurveD?; index?; centerThicknessMm?; gridN?: number /* 24 while searching */; wavelengthNm?: number }`.
  - `autoPrescribe(eyeSurfaces: Surface[], view: ViewSpec, opts?: AutoPrescribeOptions): { prescription: Prescription; residualRmsMicrons: number; evaluations: number; seed: Prescription }`: seeds from the uncorrected wavefront refraction vertex-shifted per principal meridian (`F = R/(1 + d·R)`), searches the lens power vector `(M, J0, J45)` (Review Focus 3), and reports the residual at the full grid (64).
- [ ] **Step 1:** Failing tests:
  - `lensSurfaces` back-vertex power equals the prescription in both principal meridians within 0.01 D via `paraxialPower(..., { meridianDeg })` for five prescriptions, including an oblique axis;
  - `nelderMead` minimizes the Rosenbrock function to within 1e-6;
  - a Navarro eye lengthened to a −3 D far point (axial length solved by bisection in the test) is corrected by `autoPrescribe` to `|M| < 0.05` D of residual traced refraction, and the prescription's sphere is about −3 D vertex-adjusted (−3.1 ± 0.15 at 12 mm);
  - a Navarro eye with 1.5 D of corneal toricity yields `|C|` within 0.1 D of the eye's traced cylinder and axis within 3°;
  - moving the corrected lens from 12 to 14 mm leaves the corrected −3 D myope under-corrected (residual M more negative), the correct direction for a minus lens;
  - with `metric: "strehl"` the result's Strehl is at least that of the RMS result minus 0.01.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run; PASS. Full gate. Commit: `feat(optics): spectacle lenses and auto-prescribe`.

### Task 3.7: Pupil model and near response

**Files:**
- Create: `data/pupil/watson-yellott-2012.json`, `data/pupil/near-response.json`, `data/pupil/README.md`, `web/packages/eye-model/src/pupil/watsonYellott.ts`, `src/pupil/nearResponse.ts`, `src/pupil/model.ts`, `test/pupil.test.ts`
- Modify: `web/packages/eye-model/src/state/derive.ts` (`pupilDiameterMm` moves to `pupil/model.ts`), `src/state/types.ts`, `src/presets/load.ts`, `src/index.ts`, `data/schematic-eyes/navarro-1985.json` (pupil removed, note added), `data/schematic-eyes/README.md`, `web/packages/eye-model/test/derive.test.ts`, `test/presets.test.ts`

**Data:** `watson-yellott-2012.json`: `{ citation, doi: "10.1167/12.10.12", verified: false, stanleyDavies: { maxMm: 7.75, rangeMm: 5.75, fluxScale: 846, exponent: 0.41, halfConstant: 2, source }, age: { referenceYears: 28.58, slopeIntercept: 0.021323, slopePerMm: -0.0095623, domainYears: [20, 83], source }, monocular: { oneEye: 0.1, twoEyes: 1, source }, defaults: { fieldAreaDeg2: 3600, eyes: 2, note } }` with per-coefficient sources (Deviation 1). `near-response.json`: `{ miosisMmPerMA: 0.305, floorMm: 2, citation, verified: false, derivation }` (Deviation 1, 11; the 2 mm floor is spec §4.3).

**Interfaces:**
- Produces:
  - `WATSON_YELLOTT` (typed JSON); `stanleyDaviesMm(luminanceCdM2, fieldAreaDeg2, eyes: 1 | 2): number`; `watsonYellottMm(luminanceCdM2, fieldAreaDeg2, ageYears, eyes: 1 | 2): number` (age clamped to the domain).
  - `NEAR_RESPONSE`; `vergenceDemandMA(vergenceDeg, ipdMm): number` (`2·tan(v/2)/(ipd/1000)`); `nearMiosisMm(vergenceMA): number` (non-negative; 0 at 0 MA).
  - `interface PupilInputs { luminanceCdM2: number; ageYears: number; vergenceMA: number }`; `pupilDiameterMm(params: EyeParameters, inputs: PupilInputs): number`: model `"fixed"` (params.diameterMm) or `"watsonYellott2012"` (params `fieldAreaDeg2`, `eyes`), minus near miosis, floored at `floorMm`; throws for other models.
  - `DEFAULT_PUPIL = { model: "watsonYellott2012", params: WATSON_YELLOTT.defaults }`; `loadPreset` uses the table's `pupil` when present, otherwise `DEFAULT_PUPIL`.
  - `EyeState.pupilMm` follows the model with the scene's luminance and age and the static (or dynamic) vergence; `EyeState.pupilBaseMm` (before miosis) is added for the readout.
- [ ] **Step 1:** Failing tests: three points computed with luxpy's implementation (L = 1, 100, 1000 cd/m², 3600 deg², 2 eyes, age 30; values written into the test with the luxpy version and the script used, run once in the scratchpad) are reproduced within 0.01 mm (Deviation 1); diameter decreases with age at fixed luminance; `watsonYellottMm` at age 200 equals age 90 equals age 83 (clamp), and age 6 equals age 20; one eye gives a larger pupil than two eyes; zero vergence gives zero miosis; a 3 MA near target reduces the pupil by `3 × 0.305` mm unless the floor binds; the floor holds at very high luminance with a near target; the Navarro preset now has the default pupil model and the fixture with `"fixed"` still reads 4 mm.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement; fill the Watson & Yellott, Feil 2017, Gislén 2008, and Escudero-Sanz rows of `docs/literature/README.md` with what was confirmed (M0 follow-up on DOIs, for the sources this milestone transcribes); remove `pupil` from `navarro-1985.json` with a `pupilNote` ("the 1985 paper specifies no pupil; presets use data/pupil defaults", closing the M1 follow-up), and update the README.
- [ ] **Step 4:** Run; PASS. Full gate (the viewer's e2e defocus thresholds are checked with the new pupil). Commit: `feat(eye-model): pupil diameter and near response`.

### Task 3.8: Visual axis and refractive presets with decomposition

**Files:**
- Create: `data/visual-axis/defaults.json`, `data/presets/refractive-errors.json`, `data/presets/README.md`, `web/packages/eye-model/src/optics/view.ts`, `src/presets/refractive.ts`, `test/view.test.ts`, `test/refractive.test.ts`
- Modify: `src/presets/load.ts` (attach `visualAxis` and `pupilDecenterMm` defaults), `src/index.ts` (eye-model already depends on `@eye/optics`; its tests may call optics, its source keeps type-only imports)

**Data:** `refractive-errors.json`: presets `emmetrope`, `myope-3-axial`, `myope-3-corneal`, `hyperope+2-axial`, `astigmat-1.5-atr-corneal`, `astigmat-1.5-lenticular`, `presbyope-55`, each `{ name, label, mechanism: "none" | "axial" | "corneal" | "lenticular", sphereD, cylinderD, axisDegTabo, ageYears? }` with the spec §6.3 citation. Astigmats: `sphereD 0`, `cylinderD −1.5`, `axisDegTabo 90` (Deviation 4); the lenticular one uses the same axis so the two mechanisms are comparable.

**Interfaces:**
- Produces:
  - `VISUAL_AXIS_DEFAULTS`; `eyeView(params, objectDistanceM: number): ViewSpec` (field `{ x: +alphaDeg, y: 0 }` in the local frame, the object nasal of the optical axis; pupil center from `pupilDecenterMm`; pupil plane per Deviation 5; reference z 0). The type `ViewSpec` is imported from optics as a type.
  - `type FarPointFn = (surfaces: Surface[], meridianDeg?: number) => number` (paraxial far point, injected).
  - `REFRACTIVE_PRESETS`; `type RefractivePresetName`; `applyRefractivePreset(base: EyeParameters, name: RefractivePresetName, farPointOf: FarPointFn): EyeParameters`: axial → bisection on `axialLengthMm`; corneal sphere → anterior corneal radius; corneal or lenticular cylinder → that surface becomes toric with one principal meridian solved (the other keeps the base radius), the axis converted from TABO to local for the right eye; `presbyope-55` sets `age: 55`. The result validates.
  - `decomposeRefraction(params, base: EyeParameters, farPointOf: FarPointFn): { totalD; cornealD; lenticularD; axialD; residualD; cylinderTotalD; cylinderCornealD; cylinderLenticularD }`: spherical equivalents from the principal-meridian paraxial far points; each component is the change from the base eye when only that part (cornea surfaces, lens surfaces, axial length) is taken from `params`; `residualD` is what remains.
  - `mirrorEye(params: EyeParameters, side: "left" | "right"): EyeParameters` (Deviation 2: new id and label, numbers unchanged).
- [ ] **Step 1:** Failing tests (`refractive.test.ts` uses optics' `paraxialPower` and `analyzeWavefront`, which eye-model tests may import):
  - each preset's traced refraction (`analyzeWavefront`, paraxial method, 3 mm pupil, on axis) minus the emmetrope's matches its nominal within 0.15 D in sphere and cylinder and 3° in TABO axis;
  - decomposition components sum to the total within 0.05 D for every preset; the axial myope's refraction is all axial, the corneal astigmat's cylinder all corneal;
  - `mirrorEye` of the corneal astigmat gives TABO axes for the two eyes that sum to 180 (with an oblique-axis variant at local 30°), and both views put the object nasal (the fovea temporal);
  - `eyeView` of the default preset has field x = 5° and the chief ray reaches the retina temporal of the optical axis.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement; write `data/presets/README.md` and the visual-axis note.
- [ ] **Step 4:** Run; PASS. Full gate. Commit: `feat(eye-model): visual axis and refractive-error presets with decomposition`.

### Task 3.9: Python oracle cross-check

**Files:**
- Create: `science/eyebiomech/oracle/__init__.py`, `science/eyebiomech/oracle/reference_tracer.py`, `science/eyebiomech/oracle/cases.py`, `science/eyebiomech/oracle/generate.py`, `science/tests/test_oracle.py`, `data/oracle/cases.json`, `data/oracle/expected.json`, `data/oracle/README.md`, `web/packages/optics/test/oracle.test.ts`

**Interfaces:**
- Produces (Python): `trace(surfaces: list[dict], origin, direction, wavelength_nm=555) -> dict` (hit points per surface, vignetting) in an independently written NumPy tracer (conic closed form, toric and Zernike by Newton, vector Snell); `make_cases(seed=20261028) -> dict` (20 conic, 10 toric, 10 Zernike systems with five rays each, written to `cases.json`); `python -m eyebiomech.oracle.generate` writes `expected.json` (final image-plane hits).
- [ ] **Step 1:** Failing tests: Python — reference tracer and Optiland agree within 1e-6 mm on every conic case; the committed `expected.json` equals a fresh reference run within 1e-9 (so drift is caught); TS — `traceRay` agrees with `expected.json` within 1e-6 mm for all 40 cases.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement; generate and commit the two JSON files; README explains regeneration. Evaluate the M0 follow-up "Optiland as an optional extra": record the measured `uv sync` time and keep it in the dev group unless install time is a problem.
- [ ] **Step 4:** Run; PASS. Full gate. Commit: `test(optics): cross-check against Optiland and a Python reference tracer`.

### Task 3.10: Worker wave pipeline, spectacles, backpressure

**Files:**
- Modify: `web/apps/viewer/src/worker/messages.ts`, `src/worker/handle.ts`, `src/worker/client.ts`, `src/store/scene.ts`, `test/worker.test.ts`, `test/store.test.ts`
- Create: `web/apps/viewer/test/bench.test.ts`

**Interfaces:**
- Produces:
  - `EyeOpticsRequest` gains `spectacles: ClinicalLens | null` (`ClinicalPrescription & { vertexMm; baseCurveD; index; centerThicknessMm }`), `corrected: boolean` (which configuration drives defocus and the far point), `wave: WaveRequest | null` (`{ gridN: number; psfN: number; polychromatic: boolean; letterArcmin: number; autoPrescribe: boolean }`), and the pupil from the main thread as now.
  - `EyeOptics` gains `wave: { uncorrected: WaveResult; corrected: WaveResult | null; autoRx: (ClinicalLens & { residualRmsMicrons: number }) | null } | null`, with `WaveResult = { refraction /* TABO */; coeffsMicrons: number[]; rmsMicrons; hoRmsMicrons; strehl; psf: Float32Array; psfN; pixelArcmin; fieldArcmin; aliased; mtf: { freqCpd: Float32Array; radial: Float32Array; diffraction: Float32Array }; retinal: Float32Array; opdGrid: Float32Array /* gridN², NaN outside the pupil */; gridN; pupilRadiusMm; validFraction }`. The relaxed far point is of the active configuration (eye alone or eye plus lens).
  - Typed arrays are transferred (`postMessage(out, transferables)`).
  - `OpticsClient` keeps at most one request in flight: `request()` while one is pending stores the body as `queued` and resolves the earlier caller with `StaleRequestError`; the queued body is sent when the response arrives (M2 follow-up).
- [ ] **Step 1:** Failing tests:
  - `worker.test.ts`: a right-eye request with `wave` returns PSF, MTF, retinal image, and a refraction near 0 for the emmetrope at 6 m; a −3 D axial myope with a −3.1 D spectacle at 12 mm has corrected `|M| < 0.1` and corrected RMS below 20% of uncorrected; `autoPrescribe: true` returns an `autoRx` whose corrected RMS is below the manual one; the aim-plane assertion fix (M2 follow-up): an off-axis fan ray crosses `firstVertexZ − DEFAULT_LAUNCH_OFFSET_MM` at its pupil height.
  - `worker.test.ts`, `OpticsClient` with a fake `Worker` object: three requests while the first is in flight send exactly two messages (the first and the last); a response to a superseded id is ignored.
  - `bench.test.ts`: `handle()` for both eyes with right-eye wave optics (64 grid, 256 PSF, monochromatic, corrected and uncorrected) has a median under 100 ms over five runs after one warm-up.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run; PASS. Full gate. Commit: `feat(viewer): wave optics, spectacles, and backpressure in the worker`.

### Task 3.11: Optics strip, spectacles panel, presets, pupil in the viewer

Load the dataviz skill before writing chart code (spec §6.6).

**Files:**
- Create: `web/apps/viewer/src/ui/optics/OpticsStrip.tsx`, `WavefrontMap.tsx`, `ZernikeBars.tsx`, `PsfView.tsx`, `MtfChart.tsx`, `RetinalImage.tsx`, `colormap.ts`, `web/apps/viewer/src/ui/Spectacles.tsx`, `src/ui/Decomposition.tsx`, `web/apps/viewer/test/colormap.test.ts`, `web/apps/viewer/e2e/optics.spec.ts`
- Modify: `src/App.tsx`, `src/theme.css`, `src/ui/Inspector.tsx`, `src/ui/Readout.tsx`, `src/ui/tooltips.ts`, `src/store/scene.ts`, `test/store.test.ts`, `test/tooltips.test.ts`, `e2e/slice.spec.ts` (only if the pupil change moves its thresholds)

**Interfaces:**
- Produces (store): `setLuminance(cdM2)`, `setRefractivePreset(name)` (both eyes; the left mirrored; presbyope sets the scene age), `mirrorRightToLeft()`, `spectacles: { right: ClinicalLens; left: ClinicalLens } | null`, `setSpectacles(side, lens | null)`, `corrected: boolean`, `setCorrected(on)`, `requestAutoPrescribe()`, `useAutoRx()`, `psfScale: "linear" | "log"`, `polychromatic: boolean`, `decomposition` (derived on the main thread from eye-model with `paraxialPower` injected; paraxial only, well under 1 ms).
- Produces (UI): `divergingColor(t: number): [r, g, b]` and `sequentialColor(t)` in `colormap.ts` (diverging centered at 0 for the wavefront, sequential for the PSF), symmetric limits from the larger |min|, |max|.
- [ ] **Step 1:** Failing tests: `colormap.test.ts` (the diverging map is neutral at 0, monotone in lightness away from it, and symmetric); `store.test.ts` (`setRefractivePreset("astigmat-1.5-atr-corneal")` makes the right anterior cornea toric and the left its mirror; `setLuminance` changes `binocular.right.pupilMm`; `useAutoRx` copies the auto prescription into the manual one); `tooltips.test.ts` (refraction, RMS, Strehl, PSF, MTF, and pupil tooltips start with "Approximation:" and name the pupil plane, the order-8 fit, the homogeneous lens index, and the pupil formula's unverified coefficients); `e2e/optics.spec.ts`: the strip shows a wavefront map, Zernike bars, PSF, MTF, and retinal image; selecting `astigmat-1.5-atr-corneal` shows cylinder −1.5 ± 0.15 and axis 90 ± 3 in the readout; enabling spectacles and pressing "Auto-prescribe" then "Use" reduces the displayed corrected RMS by more than 80% relative to uncorrected; raising luminance shrinks the pupil readout.
- [ ] **Step 2:** Run; FAIL.
- [ ] **Step 3:** Implement:
  - Optics strip along the bottom of the stage column, two rows (uncorrected, corrected) or one when no spectacles: wavefront heat map (diverging, centered at 0, µm scale bar), Zernike bars (OSA index labels j = 3…44, n ≥ 2 grouped by order), PSF (log/linear toggle, arcmin scale, "aliased" note), MTF (radial curve with the diffraction limit overlay, cpd axis to 60), retinal image of a Snellen E sized for 20/20 at the target distance (5 arcmin), Strehl and RMS figures. Monochromatic 555 nm by default; a polychromatic toggle (five wavelengths weighted by V(λ)).
  - Spectacles panel: S, C, axis (TABO), vertex, base curve, index inputs; Corrected toggle; Auto-prescribe button with the result shown beside the manual prescription and a "Use" button; mirror note for the left eye.
  - Subject panel: refractive preset select, mirror right → left button, decomposition readout (corneal, lenticular, axial, residual, cylinder parts).
  - Scene panel: editable luminance (closes the M2 follow-up's read-only field with a better one).
  - Readout: refraction (S/C×axis TABO, M/J0/J45 in the tooltip), RMS and HO RMS, Strehl, pupil with its base and miosis in the tooltip.
- [ ] **Step 4:** Run; PASS. Full gate including e2e. Check the stage, strip, and panels in a headless screenshot at 1440×900 and 1280×800 (no overlap, readable type). Commit: `feat(viewer): wave optics strip, pupil, visual axis, spectacles`.

### Task 3.12: Finish

- [ ] Update this plan's Status and add Outcome notes (measured worker time, the pupil and alpha provenance, what stays unverified).
- [ ] Move any skipped Minor items into `docs/superpowers/plans/2026-10-28-m3-followups.md`.
- [ ] Update the PR body with the summary and verification; mark the PR ready.

## Follow-ups absorbed from earlier milestones

Each line below was removed from its follow-ups file in the commit that added this plan; the task that owns it is named.

- M0 — Zapata-Díaz 2019 transcription and default preset switch → Task 3.0 (re-search; re-filed for M4 if unreachable).
- M0 — Navarro Table 4 conic coefficients confirmation → Task 3.0 (same).
- M0 — Optiland as an optional extra → Task 3.9.
- M1 — retina identified by flag, not index equality → Task 3.1.
- M1 — `"miss"` vignetting reason never produced → Task 3.1.
- M1 — Navarro pupil `diameterMm` and aperture provenance → Task 3.0 (apertures), Task 3.7 (pupil).
- M1 — unverified Table 4 conic coefficients mentioned in the defocus tooltip → Task 3.0.
- M2 — Volkmann origins, Demer pulleys (M3 or any session with document access) → Task 3.0 (re-search; re-filed for M4 if unreachable).
- M2 — worker backpressure → Task 3.10.
- M2 — worker test aim-plane assertion → Task 3.10.
- M2 — `Muscle.tsx` tendon lookup by name → Task 3.0.
- M2 — `Target.tsx` drag clamp → Task 3.0.
- M2 — luminance field with the pupil model → Task 3.11.
- M2 — Gaze readout approximation tooltip → Task 3.0.
- M2 — `data/eom/README.md` status table → Task 3.0.
