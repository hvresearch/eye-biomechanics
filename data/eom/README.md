# Extraocular muscle data

| File | Content | Status |
|---|---|---|
| `geometry-default.json` | Right-eye origins, insertions, tendons, globe radius | partial transcription from search excerpts; `verified: false` |
| `activation.json` | Length-proxy activation constants (baseline, gain) | approximation by design (spec §4.4 v1); `verified: false` |
| `dynamics.json` | Saccade main sequence, vergence and accommodation latencies and time constants | partly confirmed by excerpt (main sequence, vergence latency); the time constants are the master plan's values; `verified: false` |

## Frame

Right eye, origin at the globe center (taken as the center of rotation, an approximation), x temporal, y superior, z posterior (toward the retina), millimeters. The left eye uses the same numbers in its own mirrored frame, where x is also temporal.

## Format of `geometry-default.json`

```
{
  globe: { radiusMm, limbusRadiusMm },
  insertionConvention,                 how meridianDeg + arcFromLimbusMm map to a point
  obliqueOriginConstruction,           how the oblique origins were placed
  muscles: [ {
    name, antagonist, originMm, pulleyMm | null,
    insertion: { meridianDeg, arcFromLimbusMm, alt, widthMm },
    tendon: { stiffnessNPerMm, slackLengthMm },
    muscleLengthMm, arcOfContactMm, ...citation and verified fields
  } ],
  alt: { volkmannMedialRectus }
}
```

## What is transcribed and what is assumed

The cloud session that wrote this table could reach only search-engine excerpts, not the papers (see Deviation 1 of `docs/superpowers/plans/2026-10-27-m2-muscles-gaze-dynamics.md`).

- Excerpt-confirmed: rectus insertion distances from the limbus (BCSC); the superior oblique insertion width (Korean cadaver study, M4 search); medial and lateral rectus widths, muscle and tendon lengths, and arcs of contact; the 12 mm globe and the common annulus origin of Trujillo Suárez 2018; the 51° trochlear angle; Volkmann's medial rectus row.
- Assumed: the limbus radius, insertion meridians, superior and inferior rectus widths and tendon lengths, oblique insertions and origins (by construction), every tendon stiffness, and the absence of pulleys.

Every entry stays `verified: false` until a session with document access checks it against the papers (Volkmann 1869 via Eggers' Table 2 or Helmholtz; Clark, Miller & Demer 2000 for pulleys; Miller & Robinson's Orbit for tendon stiffness).
