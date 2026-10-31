import { describe, expect, it } from "vitest";
import { RESULTS } from "../src/results/catalog";
import { LoadError, parseDeformation, parseEyeDocument, parseFiles } from "../src/results/load";

const ID = "emmetrope-right-primary-15mmHg";

describe("biomechanics results catalog", () => {
  it("lists the committed result with its sidecar", async () => {
    const entry = RESULTS.find((r) => r.id === ID);
    expect(entry).toBeDefined();
    expect(entry!.hasDeformation).toBe(true);
    const raw = await entry!.load();
    expect(parseEyeDocument(raw.eye).id).toBe("navarro-1985-relaxed-fem");
    const d = parseDeformation(raw.deformation);
    expect(d.triangles.length % 3).toBe(0);
    expect(d.vertices.length).toBe(d.displacementMm.length);
    expect(d.magnitudeUm.length * 3).toBe(d.vertices.length);
    expect(d.maxUm).toBeGreaterThan(0);
    expect(d.reference.id).toBe("navarro-1985-relaxed");
    // Since M5 the sidecar also carries the raw field (pivot included) and the scleral maps.
    const side = raw.deformation as { rawDisplacementMm?: unknown[]; scleralMaps?: unknown };
    expect(side.rawDisplacementMm?.length).toBe(d.vertices.length / 3);
    expect(side.scleralMaps).toBeDefined();
  });
});

describe("parsing loaded documents", () => {
  it("rejects an unknown major version, naming it", () => {
    expect(() => parseEyeDocument({ schemaVersion: "2.0.0" })).toThrow(/2\.0\.0/);
    expect(() => parseEyeDocument({ schemaVersion: "2.0.0" })).toThrow(LoadError);
  });

  it("names the first schema problem of an invalid document", async () => {
    const raw = await RESULTS.find((r) => r.id === ID)!.load();
    const { surfaces: _s, ...rest } = raw.eye as Record<string, unknown>;
    expect(() => parseEyeDocument(rest)).toThrow(/surfaces/);
    expect(() => parseDeformation({ schemaVersion: "1.0.0" })).toThrow(LoadError);
  });

  it("pairs an EyeParameters file with an optional sidecar from a file selection", async () => {
    const raw = await RESULTS.find((r) => r.id === ID)!.load();
    const eyeFile = new File([JSON.stringify(raw.eye)], "a.eye.json");
    const sideFile = new File([JSON.stringify(raw.deformation)], "a.deformation.json");
    const both = await parseFiles([sideFile, eyeFile]);
    expect(both.eye.id).toBe("navarro-1985-relaxed-fem");
    expect(both.deformation).not.toBeNull();
    const alone = await parseFiles([eyeFile]);
    expect(alone.deformation).toBeNull();
    await expect(parseFiles([sideFile])).rejects.toThrow(/EyeParameters/);
    await expect(parseFiles([new File(["{"], "bad.eye.json")])).rejects.toThrow(LoadError);
  });

  it("refuses a sidecar written for another document, naming both ids", async () => {
    const raw = await RESULTS.find((r) => r.id === ID)!.load();
    const eyeFile = new File([JSON.stringify(raw.eye)], "a.eye.json");
    const other = { ...(raw.deformation as Record<string, unknown>), id: "some-other-result" };
    const sideFile = new File([JSON.stringify(other)], "a.deformation.json");
    const err = await parseFiles([eyeFile, sideFile]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoadError);
    expect(String(err)).toContain("some-other-result");
    expect(String(err)).toContain("navarro-1985-relaxed-fem");
  });
});
