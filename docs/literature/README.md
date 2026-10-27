# Literature

One entry per source. Every transcribed number lands in a `data/**/*.json` file with a `citation` field and a `verified: true|false` flag.

## Zapata-Díaz et al. 2019

Zapata-Díaz JF, Radhakrishnan H, Charman WN, López-Gil N. *J Optom* 12(1):3-13, 2019.
DOI: 10.1016/j.optom.2018.01.003 (open access)
Used for: the default eye model (age and accommodation dependence). Not yet transcribed: `data/schematic-eyes/zapata-diaz-2019.json` is a stub because the full text (open access, PMC6318498) was unreachable from the cloud session; transcribe in a session with document access.

## Navarro 2014

Navarro R. Adaptive model of the aging emmetropic eye and its changes with accommodation. *J Vis* 14(13):21, 2014.
DOI: 10.1167/14.13.21
Used for: alternative preset, aging eye with GRIN lens via homogeneous-equivalent index.

## Polans et al. 2015

Polans J, Jaeken B, McNabb RP, Artal P, Izatt JA. Wide-field optical model of the human eye with asymmetrically tilted and decentered lens that reproduces measured ocular aberrations. *Optica* 2(2):124-134, 2015.
DOI: 10.1364/OPTICA.2.000124
Used for: wide-field model, angle alpha and lens tilt and decentration defaults.

## Rozema et al. 2016 (SyntEyes)

Rozema JJ, Rodriguez P, Navarro R, Tassignon MJ. *Invest Ophthalmol Vis Sci* 57:683-691, 2016.
DOI: to be added
Used for: population biometry variability, synthetic subjects for the prediction grid.

## Anderson et al. 2008

Anderson HA, Hentz G, Glasser A, Stuebing KK, Manny RE. Minus-lens-stimulated accommodative amplitude decreases sigmoidally with age: a study of objectively measured accommodative amplitudes from age 3. *Invest Ophthalmol Vis Sci* 49(7):2919-2926, 2008.
DOI: 10.1167/iovs.07-1492 (PMC2730890)
Used for: accommodative amplitude versus age (sigmoid fit), replacing Hofstetter. Transcribed in `data/accommodation/anderson-2008-amplitude.json`: A = 7.083 / (1 + exp(0.2031 (age − 36.2) − 0.6109)) D, fitted to the study's 3–40 year objective amplitudes pooled with earlier objective adult data to age 70.

## Escudero-Sanz & Navarro 1999

Escudero-Sanz I, Navarro R. Off-axis aberrations of a wide-angle schematic eye model. *J Opt Soc Am A* 16(8):1881-1891, 1999.
DOI: 10.1364/JOSAA.16.001881
Used for: wavelength-dependent refractive indices (dispersion model) for polychromatic mode.

## Watson & Yellott 2012

Watson AB, Yellott JI. A unified formula for light-adapted pupil size. *J Vis* 12(10):12, 2012.
DOI: 10.1167/12.10.12
Used for: pupil diameter (unified formula), unchanged from the original spec.

## Feil, Moser & Abegg 2017

Feil M, Moser B, Abegg M. *Graefe's Arch Clin Exp Ophthalmol*, 2017.
DOI: to be added
Used for: near pupil response; convergence is the main trigger, so miosis is coupled to vergence, not accommodation.

## Watson & Ahumada 2008

Watson AB, Ahumada AJ. Predicting visual acuity from wavefront aberrations. *J Vis* 8(4):17, 2008.
DOI: 10.1167/8.4.17
Used for: acuity from wavefront, the onset acuity threshold.

## Atchison & Thibos 2016

Atchison DA, Thibos LN. *Clin Exp Optom* 99(2):99-106, 2016.
DOI: to be added
Used for: review of eye models, literature notes.

## Rectus insertions (BCSC)

American Academy of Ophthalmology, Basic and Clinical Science Course, Section 6: Pediatric Ophthalmology and Strabismus (anatomy chapter), spiral of Tillaux: 5.5, 6.5, 6.9, 7.7 mm; cadaveric means are about 0.5 mm smaller.
DOI: none (book; cite the BCSC section and edition year at transcription)
Used for: rectus muscle insertion distances from the limbus, tabled with both values.

## Navarro, Santamaría & Bescós 1985

Navarro R, Santamaría J, Bescós J. Accommodation-dependent model of the human eye with aspherics. *J Opt Soc Am A* 2(8):1273-1281, 1985.
DOI: 10.1364/JOSAA.2.001273
Used for: regression fixture only, paraxial-power test; not a UI preset. Transcribed in `data/schematic-eyes/navarro-1985.json` (Table 1 relaxed surfaces and d-line indices, Table 4 accommodation equations; the two conic-constant coefficients of Table 4 remain unconfirmed, see the file).

## Corneal and scleral material

Elsheikh et al. 2007 (age stiffness); Pandolfi & Holzapfel 2008; Whitford et al. 2015.
DOI: to be added
Used for: FEM constitutive defaults for cornea and sclera.

## Remodeling framework

Rodriguez EK, Hoger A, McCulloch AD, 1994; Grytz R, Meschke G, 2010; Grytz R, Siegwart JT, 2015.
DOI: to be added
Used for: the growth law of the remodeling layer.

## Eyelid pressure on the cornea

Shaw AJ, Collins MJ, Davis BA, Carney LG, 2008-2010.
DOI: to be added
Used for: eyelid load defaults.

## Oculomotor dynamics

Bahill AT, Clark MR, Stark L, 1975 (main sequence); Rashbass C, Westheimer G, 1961 (vergence); Kasthurirangan S, Glasser A, 2005 (accommodation dynamics).
DOI: to be added
Used for: animation constants for saccades, vergence, and accommodation.
