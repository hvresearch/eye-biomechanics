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
  decenterX?: number;
  decenterY?: number;
  tiltXDeg?: number;
  tiltYDeg?: number;
}
interface OracleCase {
  id: string;
  surfaces: OracleSurface[];
  rays: Array<{ origin: [number, number, number]; direction: [number, number, number] }>;
}

const dir = resolve(import.meta.dirname, "../../../../data/oracle");
const cases = (JSON.parse(readFileSync(resolve(dir, "cases.json"), "utf8")) as { cases: OracleCase[] }).cases;
interface Expected {
  id: string;
  imageHitsMm: Array<number[] | null>;
  opticalPathMm: Array<number | null>;
  status: Array<"ok" | "miss" | "aperture" | "tir">;
  surfaceIndex: Array<number | null>;
}
const expected = new Map(
  (JSON.parse(readFileSync(resolve(dir, "expected.json"), "utf8")) as { cases: Expected[] }).cases.map((c) => [c.id, c]),
);

const num = (v: Num | undefined): number => (v === "Infinity" ? Number.POSITIVE_INFINITY : v === "-Infinity" ? Number.NEGATIVE_INFINITY : (v ?? Number.NaN));

function toSurface(s: OracleSurface, i: number): Surface {
  const common = {
    name: `s${i}`,
    vertexZMm: s.vertexZMm,
    apertureSemiDiamMm: s.apertureSemiDiamMm,
    tilt: { xDeg: s.tiltXDeg ?? 0, yDeg: s.tiltYDeg ?? 0 },
    decenter: { xMm: s.decenterX ?? 0, yMm: s.decenterY ?? 0 },
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
  it("has the cases of the plans (M3: 20 conic, 10 toric, 10 Zernike; M4: 4 decentered, 4 tilted, failures)", () => {
    const kinds = cases.map((c) => c.id.split("-")[0]);
    expect(kinds.filter((k) => k === "conic")).toHaveLength(20);
    expect(kinds.filter((k) => k === "toric")).toHaveLength(10);
    expect(kinds.filter((k) => k === "zernike")).toHaveLength(10);
    expect(kinds.filter((k) => k === "decentered")).toHaveLength(4);
    expect(kinds.filter((k) => k === "tilted")).toHaveLength(4);
    expect(kinds.filter((k) => k === "miss").length).toBeGreaterThanOrEqual(2);
    expect(kinds.filter((k) => k === "aperture").length).toBeGreaterThanOrEqual(2);
  });

  for (const c of cases) {
    it(`${c.id}: traceRay matches the reference hits, optical paths, and failure reasons`, () => {
      const surfaces = c.surfaces.map(toSurface);
      const want = expected.get(c.id);
      if (!want) throw new Error(`no expected record for ${c.id}`);
      c.rays.forEach((ray, k) => {
        const r = traceRay({ origin: ray.origin, dir: ray.direction, wavelengthNm: 555 }, surfaces, 1);
        const status = want.status[k];
        if (status !== "ok") {
          expect(r.vignetted, `ray ${k}`).toBe(true);
          expect(r.reason, `ray ${k}`).toBe(status);
          expect(r.vignettedAt, `ray ${k}`).toBe(`s${want.surfaceIndex[k]}`);
          return;
        }
        expect(r.vignetted, `ray ${k}`).toBe(false);
        const hit = r.hits[r.hits.length - 1]?.point;
        const w = want.imageHitsMm[k];
        const opl = want.opticalPathMm[k];
        if (!hit || !w || opl === null || opl === undefined) throw new Error("missing hit");
        for (let i = 0; i < 3; i++) expect(Math.abs(hit[i]! - w[i]!), `ray ${k} axis ${i}`).toBeLessThan(1e-6);
        expect(Math.abs(r.opticalPathMm - opl), `ray ${k} optical path`).toBeLessThan(1e-6);
      });
    });
  }
});
