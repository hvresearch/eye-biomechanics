# Refractive-error presets

`refractive-errors.json` lists the presets of the Subject panel (spec §6.3). Each changes one
part of the base schematic eye (`web/packages/eye-model/src/presets/refractive.ts`):

| Mechanism | What changes | Solved for |
|---|---|---|
| `axial` | `axialLengthMm` | paraxial far point = base + sphere |
| `corneal` | anterior corneal radius; toric when there is cylinder | far point in each principal meridian |
| `lenticular` | anterior lens surface, toric | far point in each principal meridian |
| `none` | nothing (the presbyope sets `age`) | — |

Sphere and cylinder are relative to the base eye's own far point, so a preset's mechanism adds
exactly its nominal refraction; the decomposition readout splits any document's refraction
into corneal, lenticular, and axial parts by swapping each part into the base eye. Axes are
TABO for the right eye; the left eye is the mirror image (its document has the same numbers in
its own local frame, and its TABO axis is 180° minus the right eye's).
