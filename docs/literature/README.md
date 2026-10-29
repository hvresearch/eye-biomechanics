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

Rozema JJ, Rodriguez P, Navarro R, Tassignon MJ. SyntEyes: a higher-order statistical eye model for healthy eyes. *Invest Ophthalmol Vis Sci* 57(2):683-691, 2016.
DOI: 10.1167/iovs.15-18067 (search excerpt of the Zaguan repository record, 2026-10-29)
Used for: population biometry variability, synthetic subjects for the prediction grid. In M5 the mixture parameters were not in any excerpt, so `data/synteyes/rozema-2016-params.json` is a labeled stand-in (one Gaussian over M, J0, J45 at age 6; `transcribed: false`), its J0 mean and astigmatic spread fitted as calibration nuisance parameters.

## Anderson et al. 2008

Anderson HA, Hentz G, Glasser A, Stuebing KK, Manny RE. Minus-lens-stimulated accommodative amplitude decreases sigmoidally with age: a study of objectively measured accommodative amplitudes from age 3. *Invest Ophthalmol Vis Sci* 49(7):2919-2926, 2008.
DOI: 10.1167/iovs.07-1492 (PMC2730890)
Used for: accommodative amplitude versus age (sigmoid fit), replacing Hofstetter. Transcribed in `data/accommodation/anderson-2008-amplitude.json`: A = 7.083 / (1 + exp(0.2031 (age − 36.2) − 0.6109)) D, fitted to the study's 3–40 year objective amplitudes pooled with earlier objective adult data to age 70.

## Escudero-Sanz & Navarro 1999

Escudero-Sanz I, Navarro R. Off-axis aberrations of a wide-angle schematic eye model. *J Opt Soc Am A* 16(8):1881-1891, 1999.
DOI: 10.1364/JOSAA.16.001881
Used for: wavelength-dependent refractive indices (dispersion model) for polychromatic mode. Table 2 (458, 543, 589.3, 632.8 nm) transcribed in `data/dispersion/escudero-sanz-1999.json` from two agreeing search excerpts (M3, 2026-10-28; `verified: false` until compared with the paper).

## Watson & Yellott 2012

Watson AB, Yellott JI. A unified formula for light-adapted pupil size. *J Vis* 12(10):12, 2012.
DOI: 10.1167/12.10.12
Used for: pupil diameter (unified formula), unchanged from the original spec. Transcribed in `data/pupil/watson-yellott-2012.json` (M3): the Stanley & Davies base, the 28.58-year reference age, and the 20–83 year domain from excerpts; the age-slope constants and monocular factor from luxpy 1.12.5's implementation (secondary). `verified: false`.

## Feil, Moser & Abegg 2017

Feil M, Moser B, Abegg M. The interaction of pupil response with the vergence system. *Graefe's Arch Clin Exp Ophthalmol* 255:2247-2253, 2017.
DOI: to be added (an excerpt gave a garbled DOI; confirm from the journal page)
Used for: near pupil response; convergence is the main trigger, so miosis is coupled to vergence, not accommodation. No coefficient could be transcribed (M3); see Gislén et al. 2008 below.

## Gislén, Gustafsson & Kröger 2008

Gislén A, Gustafsson J, Kröger RHH, 2008 (pupil near response in children and adults), as quoted by a review excerpt.
DOI: to be added
Used for: the magnitude of near miosis in `data/pupil/near-response.json` (1.83 mm for a 6 D near demand in adults → 0.305 mm per meter angle). `verified: false`.

## Watson & Ahumada 2008

Watson AB, Ahumada AJ. Predicting visual acuity from wavefront aberrations. *J Vis* 8(4):17, 2008.
DOI: 10.1167/8.4.17
Used for: acuity from wavefront, the onset acuity threshold. Not transcribed in M5: the excerpts (2026-10-29) described the simulated observer and the simple metric the authors derived from it but gave neither the model's constants nor the metric's formula, and the hosts holding the paper and its patent (US 8,408,707) were unreachable. `data/acuity/watson-ahumada-2008.json` names an MTF-threshold stand-in instead (assumptions, labeled "Approximation").

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

Pandolfi A, Holzapfel GA. (cornea model with distributed collagen fibril orientations). *J Biomech Eng* 130(6):061006, 2008.
DOI: 10.1115/1.2982251
Whitford C, Studer H, Boote C, Meek KM, Elsheikh A. Biomechanical model of the human cornea: considering shear stiffness and regional variation of collagen anisotropy and density. *J Mech Behav Biomed Mater* 42:76-87, 2015.
DOI: 10.1016/j.jmbbm.2014.11.006
Elsheikh A, Wang D, Pye D. Determination of the modulus of elasticity of the human cornea. *J Refract Surg* 2007 (PubMed 17985801); Elsheikh et al., Assessment of corneal biomechanical properties and their variation with age, *Curr Eye Res* 2007, DOI 10.1080/02713680601077145.
González-Cabrero J, Gómez C, Paredes M, Cavas F. Addressing parameter variability in corneal biomechanical models. *Biomimetics* 10(10):683, 2025. DOI: 10.3390/biomimetics10100683 (secondary source of the HGO corneal row used).
Scleral thickness in human eyes. *PLoS One* 2012 (PMC3253100; Vurgese et al.).
Used for: FEM constitutive defaults, regional thickness, and age stiffening in `data/materials/cornea-sclera.json` (M4). Transcribed from search excerpts, partly secondary; `verified: false`. The DOIs of Pandolfi & Holzapfel and Whitford et al. come from search excerpts.

## Ocular rigidity

Pallikaris IG, Kymionis GD, Ginis HS, Kounis GA, Tsilimbaris MK. Ocular rigidity in living human eyes. *Invest Ophthalmol Vis Sci* 46(2):409-414, 2005 (PubMed 15671262).
DOI: 10.1167/iovs.04-0162 (search excerpt of a reference list, 2026-10-29)
Used for: the whole-globe acceptance check of the elastic FEM (M4): mean Friedenwald coefficient 0.0126 /µL (95% CI 0.0112–0.0149) in 79 living eyes, stored in `data/materials/cornea-sclera.json` (`ocularRigidityReference`). `verified: false`. Since M5 the calibration target of the tissue stiffness (`calibration`).

## Remodeling framework

Rodriguez EK, Hoger A, McCulloch AD. Stress-dependent finite growth in soft elastic tissues. *J Biomech* 27:455-467, 1994 (search excerpt, 2026-10-29; DOI not in the excerpt). Grytz R, Meschke G, 2010; Grytz R, Siegwart JT, 2015 (no excerpt found, 2026-10-29).
DOI: to be added
Used for: the growth law of the remodeling layer: the multiplicative decomposition of the deformation gradient into a growth part and an elastic part (Rodriguez 1994), M5 plan Deviation 3.

## Eyelid pressure on the cornea

Shaw AJ, Collins MJ, Davis BA, Carney LG. Eyelid pressure and contact with the ocular surface. *Invest Ophthalmol Vis Sci* 2010 (PubMed 19834035). Shaw AJ, Eyelid pressure on the cornea, PhD thesis, Queensland University of Technology, 2009.
DOI: to be added (not in the excerpts)
Used for: eyelid load defaults in `data/eyelid/shaw-2010.json` (M4): upper-lid pressure 8.0 mmHg and contact band 0.60 mm by excerpt; lower lid assumed equal. `verified: false`. The lid margin positions (MRD1, MRD2) come from two population studies named in that file (M5).

## Oculomotor dynamics

Bahill AT, Clark MR, Stark L, 1975 (main sequence); Rashbass C, Westheimer G, 1961 (vergence); Kasthurirangan S, Glasser A, 2005 (accommodation dynamics).
DOI: to be added
Used for: animation constants for saccades, vergence, and accommodation.

## Population astigmatism and refraction by age

Read SA, Collins MJ, Carney LG. A review of astigmatism and its possible genesis. *Clin Exp Optom* 90:5-19, 2007 (as summarized in Beesley & Elliott 2024, doi 10.1111/opo.13234); Hoffmann PC, Hütz WW. Analysis of biometry and prevalence data for corneal astigmatism in 23,239 eyes. *J Cataract Refract Surg* 36:1479-1485, 2010; the Zibo City school-children study (PMC12657078), the northern-China cataract study (PMC7542495), the corneal-geometry study PMC6221551, a Hong Kong Polytechnic University study (handle 10397/25994), the Guangzhou six-year study, and NHANES 1999–2004 (PMC2772054). All by search excerpt, 2026-10-29.
DOI: as in each file entry where the excerpt gave one
Used for: the calibration targets of M5 (`data/population/`): the with-the-rule, against-the-rule, and oblique proportions among astigmatic eyes by age band, and the mean J0 slope of −0.014 to −0.015 D per year between 30 and 80; the cataract-population corneal bands and the spherical-equivalent changes are kept for comparison only. `verified: false`.
