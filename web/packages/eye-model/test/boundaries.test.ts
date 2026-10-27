import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : e.name.endsWith(".ts") ? [join(dir, e.name)] : [],
  );
}

describe("package boundaries", () => {
  it("imports @eye/optics as a type-only dependency (plan Global Constraints)", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(resolve(import.meta.dirname, "../src"))) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/^import\s+(type\s+)?[^;]*?from\s+"@eye\/optics";/gms)) {
        if (!m[1]) offenders.push(`${file}: ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
