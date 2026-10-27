import { describe, expect, it } from "vitest";
import { loadPreset } from "../src/presets/load";
import { validateEyeParameters } from "../src/schema/validate";
import {
  EOM_TABLE,
  GLOBE_RADIUS_MM,
  MUSCLE_NAMES,
  defaultMuscles,
  insertionPoint,
  musclesFromDocument,
  obliqueOrigin,
  toDocumentMuscles,
} from "../src/eom/geometry";
import { dot, norm, normalize, sub } from "../src/math/vec";

const byName = () => new Map(defaultMuscles().map((m) => [m.name, m] as const));

describe("EOM geometry table", () => {
  it("has the six muscles in canonical order", () => {
    expect(defaultMuscles().map((m) => m.name)).toEqual([
      "lateralRectus",
      "medialRectus",
      "superiorRectus",
      "inferiorRectus",
      "superiorOblique",
      "inferiorOblique",
    ]);
    expect([...MUSCLE_NAMES]).toEqual(defaultMuscles().map((m) => m.name));
  });

  it("puts every insertion on the globe sphere", () => {
    for (const m of defaultMuscles()) expect(norm(m.insertionMm)).toBeCloseTo(GLOBE_RADIUS_MM, 6);
  });

  it("places the medial rectus insertion 5.5 mm of arc behind the limbus on the nasal meridian", () => {
    const mr = byName().get("medialRectus")!;
    const polar = Math.acos(-mr.insertionMm[2] / GLOBE_RADIUS_MM);
    expect(polar).toBeCloseTo(Math.asin(5.75 / 12) + 5.5 / 12, 12);
    expect(mr.insertionMm[0]).toBeLessThan(0); // nasal
    expect(Math.abs(mr.insertionMm[1])).toBeLessThan(1e-12);
  });

  it("orders the rectus insertions along the spiral of Tillaux (medial nearest the limbus)", () => {
    const m = byName();
    const polar = (n: (typeof MUSCLE_NAMES)[number]) => Math.acos(-m.get(n)!.insertionMm[2] / GLOBE_RADIUS_MM);
    expect(polar("medialRectus")).toBeLessThan(polar("inferiorRectus"));
    expect(polar("inferiorRectus")).toBeLessThan(polar("lateralRectus"));
    expect(polar("lateralRectus")).toBeLessThan(polar("superiorRectus"));
  });

  it("pairs antagonists symmetrically", () => {
    const m = byName();
    for (const muscle of m.values()) expect(m.get(muscle.antagonist)!.antagonist).toBe(muscle.name);
    expect(m.get("lateralRectus")!.antagonist).toBe("medialRectus");
    expect(m.get("superiorRectus")!.antagonist).toBe("inferiorRectus");
    expect(m.get("superiorOblique")!.antagonist).toBe("inferiorOblique");
  });

  it("stores the oblique origins that the documented construction produces", () => {
    const { horizontalDeg, lengthMm } = EOM_TABLE.obliqueOriginConstruction;
    for (const raw of EOM_TABLE.muscles) {
      if (!raw.obliqueConstruction) continue;
      const ins = insertionPoint(raw.insertion.meridianDeg, raw.insertion.arcFromLimbusMm);
      const built = obliqueOrigin(ins, horizontalDeg, raw.obliqueConstruction.elevationDeg, lengthMm);
      for (let i = 0; i < 3; i++) expect(raw.originMm[i]).toBeCloseTo(built.originMm[i]!, 5);
    }
  });

  it("leaves the superior oblique tangentially at 51 degrees to the line of sight in horizontal projection", () => {
    const so = byName().get("superiorOblique")!;
    const built = obliqueOrigin(so.insertionMm, 51, 20, 18);
    // The tangent point is on the sphere and perpendicular to the pull direction.
    expect(norm(built.tangentMm)).toBeCloseTo(GLOBE_RADIUS_MM, 9);
    const u = normalize(sub(so.originMm, built.tangentMm));
    expect(dot(u, normalize(built.tangentMm))).toBeCloseTo(0, 6);
    const horizontal = (Math.atan2(-u[0], -u[2]) * 180) / Math.PI;
    expect(horizontal).toBeCloseTo(51, 4);
    expect(so.originMm[1]).toBeGreaterThan(0); // superior
    expect(so.originMm[0]).toBeLessThan(0); // nasal
    expect(so.originMm[2]).toBeLessThan(0); // anterior to the globe center
  });

  it("places the inferior oblique origin anterior, nasal, and inferior", () => {
    const io = byName().get("inferiorOblique")!;
    expect(io.originMm[0]).toBeLessThan(0);
    expect(io.originMm[1]).toBeLessThan(0);
    expect(io.originMm[2]).toBeLessThan(0);
  });

  it("round-trips through the EyeParameters muscle shape and validates", () => {
    const doc = { ...loadPreset("navarro-1985"), extraocularMuscles: toDocumentMuscles() };
    const r = validateEyeParameters(doc);
    expect(r.ok).toBe(true);
    const back = musclesFromDocument(doc);
    const ref = defaultMuscles();
    for (let i = 0; i < 6; i++) {
      expect(back[i]!.name).toBe(ref[i]!.name);
      for (let k = 0; k < 3; k++) {
        expect(back[i]!.insertionMm[k]).toBeCloseTo(ref[i]!.insertionMm[k]!, 12);
        expect(back[i]!.originMm[k]).toBe(ref[i]!.originMm[k]);
      }
    }
  });

  it("falls back to the default table for a document without muscles", () => {
    const doc = loadPreset("navarro-1985");
    const { extraocularMuscles: _omit, ...rest } = doc;
    void _omit;
    expect(musclesFromDocument(rest)).toEqual(defaultMuscles());
  });

  it("rejects an unknown muscle name in a document", () => {
    const muscles = toDocumentMuscles();
    muscles[0] = { ...muscles[0]!, name: "levatorPalpebrae" };
    const doc = { ...loadPreset("navarro-1985"), extraocularMuscles: muscles };
    expect(() => musclesFromDocument(doc)).toThrow(/levatorPalpebrae/);
  });
});
