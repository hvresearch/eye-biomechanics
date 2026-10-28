import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Surface } from "../src/surfaces/types";
import { traceRay } from "../src/trace/sequential";

type Num = number | "Infinity" | "-Infinity";
interface OracleSurface {
  kind: "conic" | "toric" | "zernike";
  vertexZMm: number;
  index: number;
  apertureSemiDiamMm: number;
  image?: boolean;
  radiusMm?: Num;
  conic?: number;
  rxMm?: Num;
  ryMm?: Num;
  axisDeg?: number;
  conicX?: number;
  conicY?: number;
  normRadiusMm?: number;
  coeffsMicrons?: number[];
}
interface OracleCase {
  id: string;
  surfaces: OracleSurface[];
  rays: Array<{ origin: [number, number, number]; direction: [number, number, number] }>;
}

const dir = resolve(import.meta.dirname, "../../../../data/oracle");
const cases = (JSON.parse(readFileSync(resolve(dir, "cases.json"), "utf8")) as { cases: OracleCase[] }).cases;
const expected = new Map(
  (JSON.parse(readFileSync(resolve(dir, "expected.json"), "utf8")) as { cases: Array<{ id: string; imageHitsMm: number[][] }> }).cases.map(
    (c) => [c.id, c.imageHitsMm],
  ),
);

const num = (v: Num | undefined): number => (v === "Infinity" ? Number.POSITIVE_INFINITY : v === "-Infinity" ? Number.NEGATIVE_INFINITY : (v ?? Number.NaN));

function toSurface(s: OracleSurface, i: number): Surface {
  const common = {
    name: `s${i}`,
    vertexZMm: s.vertexZMm,
    apertureSemiDiamMm: s.apertureSemiDiamMm,
    tilt: { xDeg: 0, yDeg: 0 },
    decenter: { xMm: 0, yMm: 0 },
    mediumAfter: { name: `n${i}`, index555: s.index },
    ...(s.image ? { image: true } : {}),
  };
  if (s.kind === "toric") {
    return { ...common, kind: "toric", rxMm: num(s.rxMm), ryMm: num(s.ryMm), axisDeg: s.axisDeg ?? 0, conicX: s.conicX ?? 0, conicY: s.conicY ?? 0 };
  }
  if (s.kind === "zernike") {
    return { ...common, kind: "zernike", radiusMm: num(s.radiusMm), conic: s.conic ?? 0, normRadiusMm: s.normRadiusMm ?? 1, coeffsMicrons: s.coeffsMicrons ?? [] };
  }
  return { ...common, kind: "conic", radiusMm: num(s.radiusMm), conic: s.conic ?? 0 };
}

describe("cross-check against the Python reference tracer (data/oracle)", () => {
  it("has the 40 cases of the plan (20 conic, 10 toric, 10 Zernike)", () => {
    const kinds = cases.map((c) => c.id.split("-")[0]);
    expect(kinds.filter((k) => k === "conic")).toHaveLength(20);
    expect(kinds.filter((k) => k === "toric")).toHaveLength(10);
    expect(kinds.filter((k) => k === "zernike")).toHaveLength(10);
  });

  for (const c of cases) {
    it(`${c.id}: traceRay lands within 1e-6 mm of the reference image hits`, () => {
      const surfaces = c.surfaces.map(toSurface);
      const want = expected.get(c.id);
      if (!want) throw new Error(`no expected hits for ${c.id}`);
      c.rays.forEach((ray, k) => {
        const r = traceRay({ origin: ray.origin, dir: ray.direction, wavelengthNm: 555 }, surfaces, 1);
        expect(r.vignetted, `ray ${k}`).toBe(false);
        const hit = r.hits[r.hits.length - 1]?.point;
        const w = want[k];
        if (!hit || !w) throw new Error("missing hit");
        for (let i = 0; i < 3; i++) expect(Math.abs(hit[i]! - w[i]!), `ray ${k} axis ${i}`).toBeLessThan(1e-6);
      });
    });
  }
});
