# Milestone 5 follow-ups

Items deferred while implementing Milestone 5 (2026-10-29). Each line names the
milestone that should absorb it. Resolve an item in the task that touches the
same file, and delete its line here in that commit.

## Data and provenance (needs a session with document access)

The M5 session (2026-10-29, Task 5.0) searched once more for each item with web-search
excerpts. The session's network policy denies pmc.ncbi.nlm.nih.gov, doi.org, europepmc.org,
www.ebi.ac.uk, iovs.arvojournals.org, digital.csic.es, api.crossref.org, api.openalex.org,
api.semanticscholar.org, scholar.archive.org, core.ac.uk, arxiv.org, biorxiv.org, and the
repository copies the searches pointed to (zaguan.unizar.es, portalinvestigacion.um.es,
eprints.qut.edu.au, repository.uantwerpen.be, sensorprod.com, scholars.duke.edu); the excerpts
gave bibliographic records but not these numbers.

- `data/schematic-eyes/zapata-diaz-2019.json` is a stub. Transcribe Table 1 of
  Zapata-Díaz et al. 2019 (open access, doi 10.1016/j.optom.2018.01.003,
  PMC6318498), set `transcribed: true`, and switch the viewer's default preset to
  it. Blocks the release gate on `verified: true` for the default preset. (M6, or
  any session with document access)
- `data/schematic-eyes/navarro-1985.json`: confirm the Table 4 conic-constant
  coefficients (−0.34 and −0.125 per ln(1+A)) against the paper (the CSIC
  repository, digital.csic.es/handle/10261/29930, has a PDF). (M6, or any session
  with document access)
- `data/eom/geometry-default.json`: transcribe the rectus origins and the oblique
  origins and insertions from Volkmann 1869 (Eggers, Duane's Foundations vol. 1
  ch. 31, Table 2, or Helmholtz's *Physiological Optics*; a 1985 Aston thesis by
  Clement also tables them), replacing the common annulus point and the 51°
  construction. (M6, or any session with document access)
- `data/eom/geometry-default.json`: rectus pulleys are `null`; transcribe fixed
  pulley coordinates from Clark, Miller & Demer, IOVS 41:3787-3797, 2000, and
  tighten the `path.test.ts` tolerance once they land. (M6, or any session with
  document access)
- `data/eom/geometry-default.json`: superior and inferior rectus tendon lengths and the
  inferior oblique insertion width are still assumptions (the SR/IR widths were transcribed
  in M5 from a dissection-study excerpt whose authors the excerpt does not name; confirm
  them); transcribe the BCSC table. (M6, or any session with document access)
- `data/visual-axis/defaults.json`: transcribe Polans 2015's angle alpha, lens tilt,
  and decentration (doi 10.1364/OPTICA.2.000124). Tilted surfaces exist since M4
  Task 4.1, so this is transcription only. (M6, or any session with document access)
- `data/eyelid/shaw-2010.json`: the lower-lid pressure and contact band are still assumed
  equal to the upper lid's (no excerpt reports lower-lid pressure in mmHg; Shaw's 2009 QUT
  thesis found the lower lid's topographic effect larger in downgaze). (M6, or any session
  with document access)
- `data/eom/forces.json`: the oblique capacities are assumptions, and the vertical recti are
  derived from Shin et al. 2023's ratios applied to the Collins 1981 horizontal mean;
  tendon stiffness is a lower bound from a transverse modulus. (M6, or any session with
  document access)
- `data/synteyes/rozema-2016-params.json` is a stand-in (one Gaussian over M, J0, J45 with
  assumed values): transcribe the SyntEyes mixture (Rozema et al. 2016, IOVS 57:683-691, doi
  10.1167/iovs.15-18067, and its supplement) and re-run the calibration. (M6, or any session
  with document access)

## Verification

- Spec §7 / master plan Task 4.2: reproduce a published corneal inflation curve (apex rise
  against IOP) within 15% with the calibrated stiffness. Deferred from M4 by the owner (#14);
  the M5 search (2026-10-29) found the abstracts of Elsheikh et al. 2007 (Curr Eye Res 32:11-19)
  and 2010 (J R Soc Interface) but no apex-rise numbers, so the check still cannot be written.
  The stiffness is now calibrated to the in-vivo ocular rigidity instead (M5 Task 5.4). Needs
  the owner's decision to accept again, or a session with document access. (owner, M6)
