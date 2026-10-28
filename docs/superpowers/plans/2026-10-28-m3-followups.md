# Milestone 3 follow-ups

Items deferred while implementing Milestone 3 (2026-10-28). Each line names the
milestone that should absorb it. Resolve an item in the task that touches the
same file, and delete its line here in that commit.

## Data and provenance (needs a session with document access)

The M3 session (2026-10-28) searched again for each of these. Literature hosts
(PMC, ARVO/JOV, NASA Ames, eScholarship, doi.org, arXiv, publisher sites) are
denied by the session network policy and search excerpts did not give the
numbers, so they move to M4 unchanged.

- `data/schematic-eyes/zapata-diaz-2019.json` is a stub. Transcribe Table 1 of
  Zapata-Díaz et al. 2019 (open access, doi 10.1016/j.optom.2018.01.003,
  PMC6318498), set `transcribed: true`, and switch the viewer's default preset
  to it. Blocks the release gate on `verified: true` for the default preset.
  (M4, or any session with document access)
- `data/schematic-eyes/navarro-1985.json`: confirm the Table 4 conic-constant
  coefficients (−0.34 and −0.125 per ln(1+A)) against the paper; until then the
  defocus tooltip lists them as unverified. (M4, or any session with document
  access)
- `data/eom/geometry-default.json`: transcribe the rectus origins and the
  oblique origins and insertions from Volkmann 1869 (Eggers, Duane's Foundations
  vol. 1 ch. 31, Table 2, or Helmholtz's *Physiological Optics*), replacing the
  common annulus point and the 51° construction; keep Volkmann's frame
  conversion in the README. (M4, or any session with document access)
- `data/eom/geometry-default.json`: rectus pulleys are `null`; transcribe fixed
  pulley coordinates from Clark, Miller & Demer, IOVS 41:3787-3797, 2000.
  Without pulleys and with one annulus point, the primary-position medial
  rectus path is 39.5 mm against 44.5 mm published (muscle + tendon) and the
  lateral rectus arc of contact is 15.4 mm against 10-12 mm; tighten the
  `path.test.ts` tolerance once pulleys land. (M4, or any session with document
  access)
