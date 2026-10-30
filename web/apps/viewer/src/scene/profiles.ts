import { sag, type Surface } from "@eye/optics";
import anatomy from "../../../../../data/anatomy/globe-cutaway.json";

/** A point of a meridional profile: radial distance r (mm) and axial position z (mm). */
export type ProfilePoint = readonly [r: number, z: number];

export interface GlobeProfiles {
  cornea: ProfilePoint[];
  aqueous: ProfilePoint[];
  iris: ProfilePoint[];
  lens: ProfilePoint[];
  ciliaryBody: ProfilePoint[];
  zonules: ProfilePoint[];
  vitreous: ProfilePoint[];
  retina: ProfilePoint[];
  sclera: ProfilePoint[];
}

export const ANATOMY = anatomy;

function curve(s: Surface, rMax: number, n: number): ProfilePoint[] {
  const pts: ProfilePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const r = (rMax * i) / n;
    pts.push([r, s.vertexZMm + sag(s, r, 0)]);
  }
  return pts;
}

function reversed<T>(a: readonly T[]): T[] {
  return [...a].reverse();
}

/**
 * Closed meridional profiles for each cutaway structure, in (r, z) with the anterior
 * corneal vertex at z = 0. The optical surfaces are exact (sag of the traced surfaces);
 * the globe, retina, sclera, iris, and ciliary body are drawing approximations
 * parametrized by data/anatomy/globe-cutaway.json.
 */
export function globeProfiles(
  surfaces: readonly Surface[],
  axialLengthMm: number,
  retinaRadiusMm: number,
  pupilDiameterMm: number,
): GlobeProfiles {
  const byName = new Map(surfaces.map((s) => [s.name, s] as const));
  const ca = byName.get("cornea.anterior");
  const cp = byName.get("cornea.posterior");
  const la = byName.get("lens.anterior");
  const lp = byName.get("lens.posterior");
  if (!ca || !cp || !la || !lp) throw new Error("globeProfiles needs cornea and lens surfaces");
  const n = ANATOMY.profileSamples;

  const R = Math.abs(retinaRadiusMm);
  const zc = axialLengthMm - R; // globe center (retina vertex at axialLength)
  const limbusR = Math.min(ca.apertureSemiDiamMm, R - 0.5);
  const innerR = (z: number) => Math.sqrt(Math.max(0, R * R - (z - zc) * (z - zc)));
  const sphere = (radius: number, phiFrom: number, phiTo: number, m: number): ProfilePoint[] => {
    const pts: ProfilePoint[] = [];
    for (let i = 0; i <= m; i++) {
      const phi = phiFrom + ((phiTo - phiFrom) * i) / m;
      pts.push([radius * Math.sin(phi), zc + radius * Math.cos(phi)]);
    }
    return pts;
  };

  const corneaAnt = curve(ca, limbusR, n);
  const corneaPost = curve(cp, limbusR, n);
  const lensAnt = curve(la, la.apertureSemiDiamMm, n);
  const lensPost = curve(lp, lp.apertureSemiDiamMm, n);
  const lensEdgeR = la.apertureSemiDiamMm;
  const zLaEdge = lensAnt[lensAnt.length - 1]?.[1] ?? la.vertexZMm;
  const zLpEdge = lensPost[lensPost.length - 1]?.[1] ?? lp.vertexZMm;
  const zAntEdge = corneaAnt[corneaAnt.length - 1]?.[1] ?? 0;
  const zPostEdge = corneaPost[corneaPost.length - 1]?.[1] ?? 0;

  // Ciliary body: a wedge on the inner sclera from the scleral spur to the ora region,
  // projecting inward toward (but not reaching) the lens equator; the zonules bridge the gap.
  const zSpur = ANATOMY.scleralSpurZMm;
  const zCiliaryEnd = zSpur + ANATOMY.ciliaryBodyLengthMm;
  const apexZ = (zSpur + zCiliaryEnd) / 2;
  const apexR = Math.max(lensEdgeR + ANATOMY.zonuleGapMm, innerR(apexZ) - ANATOMY.ciliaryBodyDepthMm);
  const ciliaryBody: ProfilePoint[] = [
    [innerR(zSpur), zSpur],
    [apexR, apexZ],
    [innerR(zCiliaryEnd), zCiliaryEnd],
  ];

  // Zonules: a thin band from the lens equator to the apex of the ciliary body.
  const zEquator = (zLaEdge + zLpEdge) / 2;
  const hz = ANATOMY.zonuleBandMm / 2;
  const zonules: ProfilePoint[] = [
    [lensEdgeR, zEquator - hz],
    [apexR, apexZ - hz],
    [apexR, apexZ + hz],
    [lensEdgeR, zEquator + hz],
  ];

  const irisZ = zLaEdge - ANATOMY.irisThicknessMm - 0.1;
  const pupilR = pupilDiameterMm / 2; // the document's pupil (pupilDiameterMm of its pupil model)
  const iris: ProfilePoint[] = [
    [pupilR, irisZ],
    [apexR, irisZ],
    [apexR, irisZ + ANATOMY.irisThicknessMm],
    [pupilR, irisZ + ANATOMY.irisThicknessMm],
  ];

  const aqueous: ProfilePoint[] = [...corneaPost, [limbusR, zSpur], [innerR(zSpur), zSpur], [apexR, apexZ], ...reversed(lensAnt)];

  const phiOra = Math.acos((ANATOMY.oraSerrataZMm - zc) / R);
  const phiLimbusInner = Math.PI - Math.asin(limbusR / R);
  const Rs = R + ANATOMY.scleraThicknessMm;
  const phiLimbusOuter = Math.PI - Math.asin(limbusR / Rs);
  const Rr = R - ANATOMY.retinaThicknessMm;

  const Rv = Rr - 0.08; // just inside the retina so the two shells do not z-fight
  const vitreous: ProfilePoint[] = [
    ...lensPost,
    [apexR, apexZ],
    [innerR(zCiliaryEnd), zCiliaryEnd],
    ...reversed(sphere(Rv, 0, Math.acos((zCiliaryEnd - zc) / Rv), n)),
  ];
  const retina: ProfilePoint[] = [...sphere(Rr, 0, phiOra, n), ...reversed(sphere(R, 0, phiOra, n))];
  const sclera: ProfilePoint[] = [
    ...sphere(Rs, 0, phiLimbusOuter, n),
    [limbusR, zAntEdge],
    [limbusR, zPostEdge],
    ...reversed(sphere(R, 0, phiLimbusInner, n)),
  ];

  return {
    cornea: [...corneaAnt, ...reversed(corneaPost)],
    aqueous,
    iris,
    lens: [...lensAnt, ...reversed(lensPost)],
    ciliaryBody,
    zonules,
    vitreous,
    retina,
    sclera,
  };
}
