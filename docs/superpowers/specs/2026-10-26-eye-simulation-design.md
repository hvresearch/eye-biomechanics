# Eye Simulation: Design Specification

Date: 2026-10-26
Status: Approved 2026-10-26; amended with grilling decisions
Owner: Henry Volkmann (hvresearch)

## 1. Purpose

A research tool, for the author's own use, that visualizes the human eyes and the
muscles that move and focus them, simulates how the eyes accommodate as object
distance changes, simulates how spectacles correct refractive error with full wave
optics, and ultimately hosts a hybrid mechanistic/statistical model that predicts
when astigmatism and the need for corrective lenses arise from changes in muscle
and tendon loading on the globe.

Two requirements are first-class and are never traded against each other:

- **Fidelity and parameter control.** Every physical quantity is editable, every
  constant has a literature citation or is explicitly flagged as an assumption,
  and every computation is reproducible from a saved parameter file.
- **Polish.** The viewer is visually deliberate, anatomically correct, smooth at
  60 frames per second, and reads as one designed system across 3D stage, controls,
  and charts.

### 1.1 Anatomical note

The ciliary muscle changes lens shape for accommodation; it does not dilate the
pupil. Pupil size is controlled by the iris sphincter (constriction) and iris
dilator (dilation). This tool models the ciliary muscle, both iris muscles, and
the six extraocular muscles.

### 1.2 Scientific stance

The hypothesis that extraocular muscle and tendon forces deform the globe enough to
produce clinically meaningful astigmatism is plausible but not settled. Astigmatism
is predominantly corneal in origin. This project builds a model to *test* that
hypothesis, not to assume it. The spec, code comments, and UI will say so.

## 2. Scope and decomposition

Five subsystems, built in this order. Each gets its own implementation plan.

| # | Subsystem | Language | Runs |
|---|-----------|----------|------|
| 1 | Eye model core: anatomy, kinematics, state | TypeScript | browser |
| 2 | Optics engine: ray trace, wavefront, PSF, lenses | TypeScript | browser (web worker) |
| 3 | Interactive 3D viewer | TypeScript, React, Three.js | browser |
| 4 | Biomechanics: corneoscleral solid model | Python | offline batch |
| 5 | Prediction: calibration and onset forecasting | Python | offline batch |

Out of scope for now: photorealistic rendering, retinal neural processing,
binocular fusion/stereopsis modeling, contact lens fitting (the surface model
supports it later), gradient-index lens optics (homogeneous equivalent index used).

## 3. Architecture

### 3.1 Repository layout

```
eyes/                         (repository: hvresearch/eye-biomechanics)
  web/                        pnpm workspace (TypeScript)
    packages/eye-model/       pure TS, no DOM: anatomy, kinematics, state
    packages/optics/          pure TS: surfaces, ray tracer, wavefront, PSF, lenses
    apps/viewer/              React + react-three-fiber application
  science/                    Python package `eyebiomech`
    eyebiomech/fem/           cornea + sclera 3D solid model
    eyebiomech/calib/         population calibration
    eyebiomech/export/        writes EyeParameters JSON
    tests/
  schemas/                    JSON Schema: EyeParameters, SurfaceShape, Scenario
  data/                       small cited parameter tables (JSON/CSV)
  docs/
    superpowers/specs/        this document and successors
    superpowers/plans/        implementation plans
    literature/               notes and citations per parameter
  .github/workflows/          CI
  CLAUDE.md                   build/test/conventions for cloud sessions
```

### 3.2 The data contract: EyeParameters

A single versioned JSON document fully describes one eye. It is the only thing
that crosses the TypeScript/Python boundary.

```
EyeParameters {
  schemaVersion: string
  id, label
  provenance { source, citation, generatedBy, gitHash, date, verified }
                                 citation may be "assumption"
  surfaces: Surface[]            ordered from object space to retina
  lensAccommodationModel         accommodation coefficient set (see 4.2)
  pupil { model, params }
  axialLengthMm
  retina { radiusMm, conic }
  visualAxis { alphaDeg, kappaDeg }
  pupilDecenterMm { x, y }
  extraocularMuscles[6] { name, originMm[3], pulleyMm[3] | null,
                          insertionDistFromLimbusMm, insertionWidthMm,
                          tendon { stiffnessNPerMm, slackLengthMm } }
  eyelid { upperPressureKPa, lowerPressureKPa, apertureMm } | null
  age, interpupillaryDistanceMm
}

Each eye has its own EyeParameters document, so left and right eyes are
independent; the viewer's mirror shortcut copies one document to the other with
lateral parameters reflected. Lens tilt and decenter are carried by the
per-surface tilt and decenter fields below.

Surface {
  name                            e.g. "cornea.anterior"
  type: "conic" | "toric" | "zernike"
  radiusMm (or rxMm, ryMm, axisDeg for toric)
  conic (or conicX, conicY)
  zernikeHeight?: { normRadiusMm, coeffsMicrons: number[] (OSA/ANSI indexing) }
  tilt { xDeg, yDeg }, decenter { xMm, yMm }
  thicknessToNextMm               along axis
  mediumAfter { name, index555, dispersion? }
  apertureSemiDiamMm
}
```

`lensAccommodationModel`, `visualAxis`, `pupilDecenterMm`, `extraocularMuscles`,
and `eyelid` are optional; absent means not modeled. Surface `tilt`, `decenter`,
and `conic` default to zero when absent.

Both sides validate against `schemas/eye-parameters.schema.json`. The Python
biomechanics writes it; the viewer loads and saves it. A `Scenario` document
holds a scene state plus a list of EyeParameters and a timeline.

### 3.3 Dependency rules

- `eye-model` and `optics` have no DOM or React dependency and are testable in
  Node.
- `viewer` depends on both packages and owns all rendering and UI.
- `optics` does not import `eye-model`; the viewer composes them. The optics
  engine takes a `Surface[]` and a pupil; it does not know what a ciliary muscle
  is.
- `eyebiomech` depends only on NumPy, SciPy, scikit-fem, and the schema.

## 4. Subsystem 1: Eye model core (`web/packages/eye-model`)

### 4.1 Anatomy baseline

Default preset: the Zapata-Díaz, Radhakrishnan, Charman & López-Gil age- and
accommodation-dependent schematic eye (*J Optom* 12(1):3-13, 2019,
doi 10.1016/j.optom.2018.01.003). Alternative presets: the Navarro adaptive model
of the aging emmetropic eye with a gradient-index lens, used through its
homogeneous-equivalent index (*J Vis* 14(13):21, 2014), and the Polans, Jaeken,
McNabb, Artal & Izatt wide-field model with a tilted and decentered lens
(*Optica* 2(2):124-134, 2015). The 1985 Navarro, Santamaría & Bescós model
(*JOSA A* 2:1273) is kept only as a regression fixture whose paraxial power is
well documented; it is not a preset offered in the UI. Wavelength-dependent
media indices (the dispersion model, regardless of which schematic eye is the
default) come from Escudero-Sanz & Navarro (*J Opt Soc Am A* 16(8):1881-1891,
1999). Atchison & Thibos (*Clin Exp Optom* 99(2):99-106, 2016) is the review used for literature notes.

All numeric constants live in `data/schematic-eyes/*.json`, each with a
`citation` field and a `verified: true|false` flag. Values are transcribed from
the source papers at implementation time, never from memory. A test fails if any
default-preset value has `verified: false` at release.

The visual axis offset (angle alpha between the optical and visual axes) and
pupil decentration are modeled, with defaults from Polans 2015. Left and right
eyes carry independent parameters, with a mirror shortcut in the inspector.
Age range is 6 to 90 with tabled growth curves; there is no emmetropization
feedback. Refractive-error presets expose axial, corneal, and lenticular
mechanisms separately, with a decomposition readout.

### 4.2 Accommodation

Chain: ciliary activation c ∈ [0, 1] → accommodation A (diopters) → lens geometry.

- Amplitude by age from the Anderson, Hentz, Glasser, Stuebing & Manny sigmoid
  fit (*IOVS* 49:2919, 2008), clipped at zero. This yields presbyopia. The
  sigmoid fit parameters are transcribed into
  `data/accommodation/anderson-2008-amplitude.json`.
- A = c · amplitude(age).
- Lens geometry (surface radii, conics, thickness, aqueous depth, lens index)
  as a function of A comes from the accommodation coefficients of the selected
  preset, tabled in `data/schematic-eyes/*.json` and transcribed from its
  source paper.
- **Accommodation controller.** Given target distance d (m), demand = 1/d minus
  the eye's far-point vergence (so an uncorrected myope's demand is reduced and a
  hyperope's is increased). Response = min(demand − lag(demand), amplitude),
  with lag a configurable function defaulting to a published lag curve (roughly
  0.3–0.7 D at 3 D demand; cite at implementation). The controller is pure and
  stateless; the viewer animates toward its output with a first-order response
  (time constant ≈ 0.3 s, configurable).

### 4.3 Pupil

Diameter from the Watson & Yellott unified formula (*J. Vis.* 12(10):12, 2012)
as a function of field luminance, field area, age, and number of eyes, plus
near-triad miosis. Near miosis is driven by vergence demand, not by
accommodation, following Feil, Moser & Abegg (*Graefe's Arch* 2017), who find
convergence to be the main trigger. It is a configurable reduction per unit of
vergence demand, with the coefficient in a data file (cite at transcription),
floored at 2 mm.

### 4.4 Extraocular muscles and gaze

- Geometry: six muscles per eye. Origins at the annulus of Zinn for the four recti
  and superior oblique (via the trochlea as its functional origin); inferior
  oblique origin at the anterior orbital floor. Insertions on the globe from the
  spiral of Tillaux (distance from limbus, BCSC values: medial 5.5, inferior 6.5,
  lateral 6.9, superior 7.7 mm; cadaveric means are about 0.5 mm smaller, so
  both sets are tabled) and published oblique insertions. Each muscle attaches
  through a series-elastic tendon with stiffness and slack length, and has
  insertion position and width parameters. Pulleys as
  fixed orbital points per Demer's active pulley hypothesis (simplified to fixed
  pulleys in v1). Coordinates in `data/eom/*.json` with citations.
- Path: origin → pulley → wrap over the globe (great-circle on the sphere of the
  globe) → insertion. Muscle length and direction of pull are derived from this
  path each frame.
- Kinematics: gaze from target position. Hering's law for yoked movements,
  vergence from target and interpupillary distance (default 63 mm), torsion by
  Listing's law (rotation axes in Listing's plane). Output per eye: a quaternion.
- Dynamics: saccades follow the main sequence (Bahill, Clark & Stark 1975),
  vergence is slower (Rashbass & Westheimer 1961), and accommodation has a
  latency and time constant (Kasthurirangan & Glasser 2005). The age slider
  sets the subject; a transport control animates seconds.
- Activation (v1): a length-based proxy. Each muscle's activation is a
  monotone function of its shortening from primary position, with reciprocal
  innervation so the antagonist relaxes as the agonist shortens. This is an
  approximation and is labeled so in the UI.
- Activation (v2, deferred): a static equilibrium solved as a small quadratic
  program minimizing total activation subject to net torque balance, at the
  fidelity of Robinson 1975 and Miller & Robinson's Orbit model.

### 4.5 State model

```
SceneState  { target {x,y,z} m, luminanceCdM2, age, ipdMm,
              subjectPreset, spectacles: Prescription | null, time }
EyeState    { gaze: quaternion, accommodationD, pupilMm,
              ciliaryActivation, eomActivation[6], eomLengthMm[6] }
derive(scene, eyeParams): { left: EyeState, right: EyeState }   pure function
```

## 5. Subsystem 2: Optics engine (`web/packages/optics`)

### 5.1 Surfaces and media

Conic, toric (two principal radii and an axis), and Zernike-perturbed surfaces
with tilt and decenter, sequential along the optical axis. Media have index at
555 nm and an optional dispersion model for polychromatic mode.

### 5.2 Ray tracing

Exact 3D skew ray tracing: vector Snell's law at each surface, Newton iteration
for intersections with aspheric and Zernike surfaces, total internal reflection
and aperture clipping handled. Rays are launched from a point object (or a
direction for distant objects) through a grid sampling the entrance pupil
(default 64×64, configurable). The chief ray defines the image point on the
retina.

### 5.3 Wavefront

Optical path length of each ray to a reference sphere centered on the chief ray's
retinal intersection gives the optical path difference (OPD) map in the exit
pupil. A least-squares fit to Zernike polynomials (OSA/ANSI Z80.28 single-index
ordering) to radial order 8. Second-order coefficients convert to sphere,
cylinder, axis, and Thibos power vectors (M, J0, J45) per Thibos et al. 1997.
Higher-order RMS is reported separately.

### 5.4 Image quality

Generalized pupil function P = A·exp(i·2π·OPD/λ). PSF = |FFT(P)|², normalized so
the diffraction-limited PSF peak is 1 (Strehl ratio). MTF from the PSF.
Retinal image = convolution of a test target (Snellen E, text, grating) with the
PSF, in retinal angular units. Default monochromatic 555 nm; polychromatic mode
sums 5 wavelengths weighted by V(λ) using the dispersion model. FFT in pure
TypeScript first (radix-2, power-of-two grids); WebGL acceleration is a later
optimization if interaction stutters. All optics run in a web worker.

### 5.5 Spectacle lenses

A `Prescription { sphereD, cylinderD, axisDeg, vertexMm, baseCurveD, index }`
expands to two surfaces (front spherical, back toric) placed at the vertex
distance in front of the cornea. Thick-lens vertex power is honored. Because the
lens is just two more surfaces, correction and its off-axis imperfections fall out
of the same ray trace.

Auto-prescribe: minimize RMS wavefront error (option: maximize Strehl) over
sphere, cylinder, axis for a given object distance and pupil, by Nelder–Mead
from a paraxial seed. Result is displayed beside any manual prescription.

### 5.6 Validation suite (acceptance tests)

- Relaxed Navarro eye paraxial power matches the published value (60.42 D at
  the sodium d line, 589.3 nm) to 0.05 D; far point at infinity (image of
  infinity within 0.05 mm of the retina vertex). Reconciled 2026-10-26: the
  hand fixture had the corneal index mistranscribed as 1.367; with the paper's
  1.376 the ABCD trace gives 60.416 D and a back focal distance of 16.404 mm
  against the 16.40 mm vitreous. The table indices are d-line values stored in
  the schema's `index555` field; the ≈0.1 D wavelength difference is accepted
  for the regression fixture.
- Diffraction-limited circular pupil yields an Airy pattern with the correct first
  dark ring radius (1.22 λ/D).
- A pure defocus wavefront fits to a single C(2,0) coefficient with others below
  1e-9.
- Sphero-cylinder ↔ power-vector conversion round-trips.
- A 3 D myopic eye (axial length increased) is corrected to under 0.05 D residual
  by a −3 D (vertex-adjusted) lens.
- Toric cornea with known cylinder reproduces that cylinder in the fitted Zernikes.

## 6. Subsystem 3: Interactive viewer (`web/apps/viewer`)

### 6.1 Layout

Full-window 3D stage, persistent right inspector, bottom optics strip. Responsive
down to a laptop screen; not targeted at phones.

### 6.2 3D stage

- Two globes in an orbital frame with the bony orbit outline, annulus of Zinn, and
  optic nerve for reference.
- Six extraocular muscles per eye as tapered tubes following the computed path,
  colored by activation (the only hot color in the palette), with pulleys and
  insertions marked.
- A draggable target in the scene; both eyes track it with vergence, and rays from
  it are drawn through the actual traced surfaces to the retina.
- Cutaway mode: slice one eye along any plane to expose cornea, anterior chamber,
  iris, lens, zonules, ciliary body and muscle, vitreous, retina, sclera, each a
  named, hoverable mesh that regenerates from EyeParameters.
- Hover shows the structure's name, current dimensions, and defining parameters.
  Click pins a readout.
- Orbit/pan/zoom camera with snap-to clinical views (anterior, lateral, superior,
  sagittal section).

### 6.3 Inspector

Grouped panels, every value editable and live:
- Scene: target distance and direction, luminance.
- Subject: age, interpupillary distance, refractive-error presets (emmetrope,
  myope −3 D, hyperope +2 D, astigmat 1.5 D against-the-rule, presbyope age 55),
  and direct editing of any EyeParameters field.
- Accommodation and pupil: ciliary activation, accommodation (demand, response,
  lag), amplitude, pupil diameter.
- Muscles: table of six per eye with length, change from primary position, and
  activation.
- Spectacles: sphere, cylinder, axis, vertex, base curve, material; auto-prescribe
  button; corrected/uncorrected toggle.

### 6.4 Optics strip

Wavefront map, Zernike bar chart, PSF, MTF, and retinal image of the chosen
target, updating live. Corrected vs uncorrected comparison side by side.

### 6.5 Scenarios and export

Scenarios are saved parameter sets with a timeline (e.g. "near-to-far refocus",
"presbyopia 20→60", "uncorrected vs corrected astigmat", "biomechanics result
loaded"). Any state exports as a Scenario JSON plus a PNG of the stage. Scenario
files are the reproducibility unit for experiments.

### 6.6 Visual design

Deliberate typography, restrained clinical palette, anatomically correct
proportions, soft studio lighting, smooth state transitions. Charts and 3D share
one color and type system. The frontend-design and dataviz skills are used
during implementation. Performance targets: 60 fps on the stage; optics
recomputed in a worker with results arriving within 100 ms for a 64×64 pupil grid.

## 7. Subsystem 4: Biomechanics (`science/eyebiomech/fem`)

- Geometry: corneoscleral envelope built from EyeParameters (corneal surfaces,
  scleral radius, regional thickness from literature tables).
- Model: 3D solid hyperelastic elements in scikit-fem (pure Python,
  pip-installable, runs in a cloud session; it has no shell elements, so none
  are used). Start axisymmetric for verification, then full 3D to admit
  non-axisymmetric muscle loads. The elastic solver comes first.
- Remodeling: a separately labeled layer on top of the elastic solver, using
  stress-driven growth toward a homeostatic target (Rodriguez, Hoger &
  McCulloch 1994 form; Grytz & Meschke 2010; Grytz & Siegwart 2015). Results
  are always labeled as elastic or as remodeled.
- Material: hyperelastic cornea and sclera with literature stiffness and
  anisotropy where available (Elsheikh et al. 2007 for age stiffening; Pandolfi
  & Holzapfel 2008; Whitford et al. 2015); age-dependent stiffening as a
  parameterized function.
- Loads: intraocular pressure; six muscle insertions, each through a
  series-elastic tendon (stiffness and slack length) with insertion position
  and width parameters, with forces from the eye model's static solution for a
  given gaze or gaze history; ciliary tension at the scleral spur as a function
  of accommodation; and eyelid pressure on the cornea (Shaw, Collins, Davis &
  Carney 2008-2010 for defaults).
- Load history: a daily near-work duty cycle is converted to forces by the eye
  model.
- Output: deformed anterior and posterior corneal surfaces and scleral shape,
  fitted to Zernike height maps, written as a new EyeParameters document with
  provenance. Loading it in the viewer shows induced refractive change directly.
- Verification: an analytic pressurized spherical shell and a published corneal
  inflation test reproduced within stated tolerance.

## 8. Subsystem 5: Prediction model (`science/eyebiomech/calib`)

- The biomechanics model expresses corneal shape as a function of age, muscle tone
  history (habitual near-work hours as a proxy for sustained convergence and
  ciliary load), and tissue stiffness parameters.
- Synthetic subjects: population biometric variability comes from SyntEyes
  (Rozema, Rodriguez, Navarro & Tassignon, *IOVS* 57:683-691, 2016). Predictions
  are precomputed over a subject grid as JSON and the viewer interpolates; there
  is no server.
- Subject inputs: age, baseline refraction, near-work hours, and optional
  topography.
- Calibration target: the shift of the astigmatism axis from with-the-rule to
  against-the-rule with age. Prevalence and mean refraction trajectories by age
  are secondary targets (candidate sources: NHANES refraction data, published
  cohort studies; chosen and cited at implementation). Method: least squares
  first, Bayesian (e.g. emcee or PyMC) when uncertainty bands are needed.
- Output: for a subject profile, a predicted trajectory of sphere and cylinder
  with uncertainty, and the predicted onset of needing correction, reported by
  two thresholds: refraction (cylinder >= 0.75 D or |sphere| > 0.5 D) and acuity
  (the Watson & Ahumada 2008 metric computed from the wavefront is worse than
  logMAR 0.3, i.e. 20/40; default, configurable).
- The viewer shows this as a scrubbable timeline; the eye and optics update as
  the age cursor moves.

## 9. Testing

- TypeScript: Vitest. The section 5.6 cases are the acceptance suite for optics.
  Eye-model tests cover Listing's law, vergence geometry, Anderson amplitude,
  pupil formula, and muscle path length monotonicity.
- Python: pytest with the section 7 analytic pressurized-sphere check and schema round-trips.
- Schemas: both sides validate every document they read or write.
- Viewer: Playwright smoke test that loads the app, moves the target slider, and
  asserts the optics strip updates.
- CI: GitHub Actions runs all suites on every push and pull request.

## 10. Development workflow

- Repository `hvresearch/eye-biomechanics`, public, MIT license.
- Work in feature branches; pull requests into `main`. `main` is protected by
  required CI with no required reviewers. The viewer deploys to GitHub Pages.
- Development happens in Claude Code cloud sessions.
- `CLAUDE.md` documents install, build, test, and conventions so Claude Code cloud
  sessions are productive without exploration.
- Each subsystem gets an implementation plan in `docs/superpowers/plans/`.
- Build order: eye-model and optics (with tests) → viewer → biomechanics →
  calibration.

## 11. Open questions deferred to implementation plans

- Exact pulley coordinates and whether to adopt the full Orbit model in v2.
- Choice of lag-of-accommodation curve.
- Which population dataset(s) to use for calibration and their licensing.
- Whether WebGL FFT is needed; decided by measured worker latency.

## 12. Decisions settled after initial draft

- Repo `hvresearch/eye-biomechanics`, public, MIT. Main protected by required
  CI, no required reviewers.
- First milestone is a vertical slice (one eye cutaway, target slider,
  accommodation, traced rays, defocus readout), then muscles, then wavefront
  optics and spectacles, then biomechanics, then remodeling and calibration,
  then polish.
- Visual axis offset (angle alpha) and pupil decentration are modeled. Left and
  right eyes have independent parameters with a mirror shortcut.
- Refractive-error presets expose axial, corneal, and lenticular mechanisms with
  a decomposition readout.
- Age range 6 to 90 with tabled growth curves; no emmetropization feedback.
- Dynamics: saccade main sequence, slower vergence, accommodation latency and
  time constant. Age slider sets the subject; a transport animates seconds.
- Muscle activation by length proxy in v1; static equilibrium in v2.
- Tendons: series-elastic stiffness and slack length, plus insertion position
  and width.
- Biomechanics: 3D solid hyperelastic elements in scikit-fem (no shell
  elements exist there). Elastic solver first; remodeling as stress-driven
  growth toward a homeostatic target, a separate labeled layer. Eyelid pressure
  is a third load.
- Load history from a daily near-work duty cycle converted to forces by the eye
  model.
- Calibration target: with-the-rule to against-the-rule axis shift with age;
  prevalence and mean refraction trajectories secondary.
- Subject inputs: age, baseline refraction, near-work hours, optional
  topography. Onset reported by both a refraction threshold and an MTF-based
  acuity threshold (default 20/40).
- Predictions precomputed over a subject grid as JSON; viewer interpolates. No
  server.
- Deformation shown as a displacement heat map plus an exaggeration slider.
  Small results committed under `data/results/` with provenance.
- Optics oracle: Optiland for rotationally symmetric cases; a small Python
  reference tracer for toric and Zernike cases (Optiland lacks those surface
  types).
- Every transcribed number lands in a `data/**/*.json` file with a `citation`
  field and a `verified: true|false` flag; a test fails if any default-preset
  value has `verified: false` at release.
