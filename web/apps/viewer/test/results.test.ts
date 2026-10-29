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
    expect(parseEyeDocument(raw.eye).id).toBe(`emmetrope-right-fem`);
    const d = parseDeformation(raw.deformation);
    expect(d.triangles.length % 3).toBe(0);
    expect(d.vertices.length).toBe(d.displacementMm.length);
    expect(d.magnitudeUm.length * 3).toBe(d.vertices.length);
    expect(d.maxUm).toBeGreaterThan(0);
    expect(d.reference.id).toBe("emmetrope-right");
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
    expect(both.eye.id).toBe("emmetrope-right-fem");
    expect(both.deformation).not.toBeNull();
    const alone = await parseFiles([eyeFile]);
    expect(alone.deformation).toBeNull();
    await expect(parseFiles([sideFile])).rejects.toThrow(/EyeParameters/);
    await expect(parseFiles([new File(["{"], "bad.eye.json")])).rejects.toThrow(LoadError);
  });
});
