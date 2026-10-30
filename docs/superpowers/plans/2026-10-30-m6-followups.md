# Milestone 6 follow-ups

Items deferred while implementing Milestone 6 (2026-10-30). Each line names the
milestone or kind of session that should absorb it. Resolve an item in the task that
touches the same file, and delete its line here in that commit.

## Data and provenance (needs a session with document access)

The M6 session (2026-10-30, plan Task 6.0) found the literature hosts unreachable again
(curl to pmc.ncbi.nlm.nih.gov, doi.org, europepmc.org, www.ebi.ac.uk, digital.csic.es,
iovs.arvojournals.org, opg.optica.org, jov.arvojournals.org, and zaguan.unizar.es fails to connect) and ran one
web search per item; the excerpts gave bibliographic records and study designs, but none of
the numbers below. The M5 list of denied hosts (M5 follow-ups, 2026-10-29) still applies. A
session that can read the papers should transcribe each, set `verified: true` with
`verifiedDate` where the primary document was read, and re-run the affected tests and builds.

- `data/schematic-eyes/zapata-diaz-2019.json` is a stub. Transcribe Table 1 of Zapata-Díaz
  et al. 2019 (open access, doi 10.1016/j.optom.2018.01.003, PMC6318498), set
  `transcribed: true`, and switch the viewer's default preset (`DEFAULT_PRESET` in
  `web/apps/viewer/src/store/scene.ts`) to it. Blocks the release gate on `verified: true`
  for the default preset (M6 plan, Deviation 1). (any session with document access)
- `data/schematic-eyes/navarro-1985.json`: confirm the Table 4 conic-constant coefficients
  (−0.34 and −0.125 per ln(1+A)) against the paper (doi 10.1364/JOSAA.2.001273; a PDF at
  digital.csic.es/handle/10261/29930). (any session with document access)
- `data/eom/geometry-default.json`: transcribe the rectus origins and the oblique origins and
  insertions from Volkmann 1869 (Eggers, Duane's Foundations vol. 1 ch. 31, Table 2, or
  Helmholtz's *Physiological Optics*), replacing the common annulus point and the 51°
  construction. (any session with document access)
- `data/eom/geometry-default.json`: rectus pulleys are `null`; transcribe fixed pulley
  coordinates from Clark, Miller & Demer, IOVS 41:3787-3797, 2000, and tighten the
  `path.test.ts` tolerance once they land. (any session with document access)
- `data/eom/geometry-default.json`: superior and inferior rectus tendon lengths and the
  inferior oblique insertion width are assumptions, and the SR/IR widths come from an excerpt
  that does not name its authors; transcribe the BCSC Section 7 table (the M6 search found
  only the medial rectus 4.5 mm and inferior oblique 0–1 mm tendon lengths in a BCSC mirror).
  (any session with document access)
- `data/visual-axis/defaults.json`: transcribe Polans et al. 2015's angle alpha, lens tilt,
  and decentration (Optica 2(2):124-134, doi 10.1364/OPTICA.2.000124). (any session with
  document access)
- `data/eyelid/shaw-2010.json`: the lower-lid pressure and contact band are assumed equal to
  the upper lid's; no excerpt reports a lower-lid pressure (Shaw's QUT thesis says the lower
  lid's topographic effect exceeds the upper's in large downgaze). (any session with document
  access)
- `data/eom/forces.json`: the oblique capacities are assumptions (the M6 search found the
  Simonsz 1988 length-tension study of detached obliques, with no gram values in the excerpt),
  the vertical recti are derived from Shin et al. 2023's ratios, and tendon stiffness is a
  lower bound from a transverse modulus. (any session with document access)
- `data/synteyes/rozema-2016-params.json` is a stand-in: transcribe the SyntEyes two-component
  mixture (Rozema et al. 2016, IOVS 57:683-691, doi 10.1167/iovs.15-18067, and its
  supplement; an open PDF is listed at zaguan.unizar.es/record/48368) and re-run the
  calibration. (any session with document access)
- `data/acuity/watson-ahumada-2008.json` names an MTF-threshold stand-in: transcribe the Watson
  & Ahumada 2008 model or its simple metric (J Vis 8(4):17, doi 10.1167/8.4.17; also described
  in US patent 8408707), replace the stand-in and its lookup table, and regenerate the
  prediction grid. (any session with document access)

## Verification

- Spec §7 / master plan Task 4.2: reproduce a published corneal inflation curve (apex rise
  against IOP) within 15% with the calibrated stiffness. Deferred from M4 by the owner (#14);
  the M6 search (2026-10-30) again found only the designs of Elsheikh et al. 2007 (Curr Eye Res
  32:11-19; donors 50–95, laser apex monitoring to 60 mmHg, stiffening transition at 12–20
  mmHg) and 2010 (57 donors aged 30–99), with no apex-rise points. Needs the owner's decision
  to accept again, or a session with document access. (owner)
