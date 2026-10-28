# Milestone 4 follow-ups

Items deferred while implementing Milestone 4 (2026-10-28). Each line names the
milestone that should absorb it. Resolve an item in the task that touches the
same file, and delete its line here in that commit.

## Closed in Task 4.0

- Python cap (M0): closed, no cap. `science/uv.lock` lists cp314 wheels for NumPy
  and SciPy, scikit-fem is pure Python, and `uv run --python 3.14 --isolated --with
  scikit-fem --with numpy --with scipy` imports scikit-fem 12.0.2, NumPy 2.5.4, and
  SciPy 1.18.1 on CPython 3.14.6 (2026-10-28). CI still tests 3.12 only.
- Superior oblique insertion width (M2): transcribed from an excerpt (10.32 mm,
  Korean cadaver study), `verified: false`.

## Data and provenance (needs a session with document access)

The M4 session (2026-10-28) searched once more for each item. The session's
network policy denies pmc.ncbi.nlm.nih.gov, iovs.arvojournals.org, doi.org,
www.ncbi.nlm.nih.gov, europepmc.org, www.ebi.ac.uk, and scholar.archive.org (curl
and WebFetch), and the search excerpts gave bibliographic records but not the
numbers. All move to M5.

- `data/schematic-eyes/zapata-diaz-2019.json` is a stub. Transcribe Table 1 of
  Zapata-Díaz et al. 2019 (open access, doi 10.1016/j.optom.2018.01.003,
  PMC6318498), set `transcribed: true`, and switch the viewer's default preset to
  it. Blocks the release gate on `verified: true` for the default preset. (M5, or
  any session with document access)
- `data/schematic-eyes/navarro-1985.json`: confirm the Table 4 conic-constant
  coefficients (−0.34 and −0.125 per ln(1+A)) against the paper (the CSIC
  repository, digital.csic.es/handle/10261/29930, has a PDF). (M5, or any session
  with document access)
- `data/eom/geometry-default.json`: transcribe the rectus origins and the oblique
  origins and insertions from Volkmann 1869 (Eggers, Duane's Foundations vol. 1
  ch. 31, Table 2, or Helmholtz's *Physiological Optics*; a 1985 Aston thesis by
  Clement also tables them), replacing the common annulus point and the 51°
  construction. (M5, or any session with document access)
- `data/eom/geometry-default.json`: rectus pulleys are `null`; transcribe fixed
  pulley coordinates from Clark, Miller & Demer, IOVS 41:3787-3797, 2000, and
  tighten the `path.test.ts` tolerance once they land. (M5, or any session with
  document access)
- `data/eom/geometry-default.json`: superior and inferior rectus insertion widths
  and tendon lengths and the inferior oblique width are still assumptions;
  transcribe the BCSC table. (M5, or any session with document access)
- `data/visual-axis/defaults.json`: transcribe Polans 2015's angle alpha, lens tilt,
  and decentration (doi 10.1364/OPTICA.2.000124). Tilted surfaces exist since M4
  Task 4.1, so this is transcription only. (M5, or any session with document access)

## Modeling

- `web/apps/viewer/src/store/scene.ts` / `worker/handle.ts`: accommodation demand uses
  the paraxial far point of the worn configuration, while auto-prescribe minimizes the
  RMS wavefront error; wearing the auto lens therefore adds about 0.2-0.36 D of
  accommodation and some defocus. Drive demand (or the far point it uses) by the same
  refraction measure as the prescription, or prescribe with the controller in the loop.
  Re-filed from M3 to M6: it is optics and viewer behavior with no biomechanics
  content, and M6 owns the other worker and readout follow-ups (M4 plan, Deviation 13).
  (M6)

## From implementation (2026-10-28)

- `data/materials/cornea-sclera.json`: calibrate tissue stiffness. The uncalibrated globe is
  2.2 times stiffer than the in-vivo ocular rigidity of Pallikaris et al. 2005, and the corneal
  inflation excerpt (6.6 µm for 15 → 15.5 mmHg) is 7–11 times the model's apex rise; transcribe
  Pandolfi & Holzapfel 2008, Whitford et al. 2015, Elsheikh et al. 2007/2010, and a scleral HGO
  set (Grytz et al. 2014) in a session with document access, then calibrate (the spec makes
  tissue stiffness a calibration parameter). (M5)
- `science/eyebiomech/fem/loads.py` (`from_force_table`): the length-proxy muscle forces are not
  torque-balanced, and in nasal gazes no non-negative balanced set exists without passive
  orbital torques (the CLI rejects those gazes). Before the duty cycle uses eccentric gazes,
  model passive orbital torques or the v2 static equilibrium (spec §4.4). (M5, blocking for the
  duty cycle)
- `science/eyebiomech/fem`: the document geometry is treated as stress-free (no prestress or
  inverse solve; Deviation 3). Add an inverse (fixed-point) solve for the unloaded geometry so the
  IOP's own deformation of the measured shape is accounted for. (M5)
- `data/eyelid/shaw-2010.json`: the lower-lid pressure and band are assumed equal to the upper's,
  and the bands are placed symmetrically about the corneal center; transcribe lower-lid values
  and the lid margin positions in primary gaze. (M5, or any session with document access)
- `data/eom/forces.json`: vertical rectus and oblique capacities are assumptions (Collins 1981
  measured the horizontal recti). Tendon stiffness is a lower bound from a transverse modulus.
  (M5, or any session with document access)
- `data/results/fem/`: the committed result is built from the regression fixture, which has no
  lens accommodation model, so the loaded eye cannot accommodate in the viewer; run the CLI on a
  preset document that carries one (the exporter keeps it). (M5)
- `science/eyebiomech/fem/cli.py`: mesh refinement 12 → 16 changed the induced astigmatism by
  about 5%; check 20 (and two layers) for the M5 prediction grid's tolerance. (M5)
- `web/apps/viewer/src/scene/DeformationMap.tsx`: the heat map is a full shell that hides the
  cutaway while shown; clip it to the cutaway's half or draw it translucent. (M6)
- `web/apps/viewer/test/bench.test.ts`: in this cloud container the worker benchmark varies
  between 50 and 140 ms per run (median near the 100 ms budget) with or without the M4 changes;
  watch CI and implement the planned performance work if it flakes. (M6)
