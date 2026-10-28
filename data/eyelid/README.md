# Eyelid data

| File | Content | Status |
|---|---|---|
| `shaw-2010.json` | Upper and lower lid pressure (mmHg), contact band height (mm), palpebral aperture (mm) | upper lid from Shaw et al. 2010 by excerpt; lower lid assumed equal; aperture from three population studies by excerpt; `verified: false` |

The FEM applies each lid as a uniform normal pressure on the outer surface over a horizontal
band of the given height at the lid margin (M4 plan, Task 4.5). When a document carries its own
`eyelid` (kPa), the CLI uses it instead of this table (1 mmHg = 0.133322 kPa).
