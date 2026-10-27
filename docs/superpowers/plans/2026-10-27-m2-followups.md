# Milestone 2 follow-ups

Items deferred while implementing Milestone 2 (2026-10-27). Each line names the
milestone that should absorb it. Resolve an item in the task that touches the
same file, and delete its line here in that commit.

## Data and provenance (needs a session with document access)

- `data/eom/geometry-default.json`: transcribe the rectus origins and the oblique
  origins and insertions from Volkmann 1869 (Eggers, Duane's Foundations vol. 1
  ch. 31, Table 2, or Helmholtz's *Physiological Optics*), replacing the common
  annulus point and the 51° construction; keep Volkmann's frame conversion in
  the README. (M3 or any session with document access)
- `data/eom/geometry-default.json`: rectus pulleys are `null`; transcribe fixed
  pulley coordinates from Clark, Miller & Demer, IOVS 41:3787-3797, 2000.
  Without pulleys and with one annulus point, the primary-position medial
  rectus path is 39.5 mm against 44.5 mm published (muscle + tendon) and the
  lateral rectus arc of contact is 15.4 mm against 10-12 mm; tighten the
  `path.test.ts` tolerance once pulleys land. (M3 or any session with document
  access)
- `data/eom/geometry-default.json`: superior and inferior rectus insertion widths
  and tendon lengths and the oblique widths are assumptions; transcribe the BCSC
  table. Tendon stiffness is a 0 placeholder; transcribe from Miller &
  Robinson's Orbit model or Quaia et al. before the M4 force export. (M4 at the
  latest)
