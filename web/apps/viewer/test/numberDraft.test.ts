import { describe, expect, it } from "vitest";
import { finalValue, liveValue } from "../src/ui/numberDraft";

describe("number box drafts", () => {
  it("commits nothing while a partly typed value is out of range", () => {
    // Typing "45" into Age passes through "4"; typing "0.33" into distance passes through "0" and "0.".
    expect(liveValue("4", 6, 90)).toBeNull();
    expect(liveValue("45", 6, 90)).toBe(45);
    expect(liveValue("0", 0.1, 6)).toBeNull();
    expect(liveValue("0.", 0.1, 6)).toBeNull();
    expect(liveValue("0.3", 0.1, 6)).toBe(0.3);
    expect(liveValue("0.33", 0.1, 6)).toBe(0.33);
  });

  it("treats an empty or unparsable draft as no value, never as zero", () => {
    for (const t of ["", " ", "-", "e", "."]) {
      expect(liveValue(t, 0, 90), t).toBeNull();
      expect(finalValue(t, 6, 90), t).toBeNull();
    }
  });

  it("clamps only when editing ends", () => {
    expect(liveValue("630", 6, 90)).toBeNull();
    expect(finalValue("630", 6, 90)).toBe(90);
    expect(finalValue("4", 6, 90)).toBe(6);
    expect(finalValue("0.05", 0.1, 6)).toBe(0.1);
    expect(finalValue("2.5", 0.1, 6)).toBe(2.5);
  });
});
