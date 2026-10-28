# Schematic eye tables

One JSON file per published schematic eye. `web/packages/eye-model/src/presets/load.ts` maps a table to an `EyeParameters` document and validates it against `schemas/eye-parameters.schema.json`.

## Format

```
{
  name, label, citation, doi,
  transcribed: bool          false means the file is a stub with no numbers (loader throws)
  verified: bool             true only after a test reproduces a published optical quantity
  verifiedDate: "YYYY-MM-DD" | null
  wavelengthNm               wavelength the indices refer to
  referenceAgeYears
  relaxed: Surface[]         schema Surface objects, object space to the last refracting surface
  retina: { radiusMm, conic }
  axialLengthMm
  pupil: { model, params }
  accommodation: { form, coefficients, unverified?: string[] }
  aging?: { form, coefficients }
}
```

Every number is transcribed from the cited paper at implementation time, never from memory. A coefficient that could not be confirmed against the paper is listed in `unverified` with a note, and the whole table stays `verified: false` until the acceptance test passes.

## Tables

| File | Role | Status |
|---|---|---|
| `navarro-1985.json` | regression fixture (paraxial power 60.42 D at 589 nm) | transcribed; paraxial power verified (Task 1.6) |
| `zapata-diaz-2019.json` | intended default preset | stub; full text unreachable from the cloud session, see the file's note |
