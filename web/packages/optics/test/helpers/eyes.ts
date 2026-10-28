import { paraxialPower } from "../../src/paraxial/abcd";
import type { Surface } from "../../src/surfaces/types";
import { navarroSurfaces } from "./navarro";

function bisect(f: (x: number) => number, target: number, lo: number, hi: number): number {
  const increasing = f(hi) > f(lo);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target === increasing) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The relaxed Navarro eye with its retina moved so the paraxial far point is `farPointD`. */
export function lengthenedNavarro(farPointD: number): Surface[] {
  const s = navarroSurfaces();
  const retina = s[s.length - 1]!;
  const at = (dz: number) => [...s.slice(0, -1), { ...retina, vertexZMm: retina.vertexZMm + dz }];
  const dz = bisect((x) => paraxialPower(at(x)).farPointD, farPointD, -3, 3);
  return at(dz);
}

/** The Navarro eye with a toric anterior cornea whose x section (0°) is flatter by `cylD` in the eye's far point. */
export function toricNavarro(cylD: number): Surface[] {
  const s = navarroSurfaces();
  const c = s[0];
  if (c?.kind !== "conic") throw new Error("expected a conic cornea");
  const withRx = (rx: number): Surface[] => [{ ...c, kind: "toric", rxMm: rx, ryMm: c.radiusMm, axisDeg: 0, conicX: c.conic, conicY: c.conic }, ...s.slice(1)];
  const target = paraxialPower(s).farPointD + cylD; // x section: less myopic (flatter) by cylD
  return withRx(bisect((rx) => paraxialPower(withRx(rx), 1, { meridianDeg: 0 }).farPointD, target, c.radiusMm, c.radiusMm + 2));
}
