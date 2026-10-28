import { describe, expect, it } from "vitest";
import anderson from "../../../../data/accommodation/anderson-2008-amplitude.json";
import lag from "../../../../data/accommodation/lag-default.json";
import navarro from "../../../../data/schematic-eyes/navarro-1985.json";

describe("data provenance", () => {
  it("does not mark the Anderson 2008 table verified without a comparison to the paper's group means", () => {
    expect(anderson.verified).toBe(false);
    expect(anderson.verifiedDate).toBeNull();
    expect(anderson.verificationNote).toMatch(/group means/);
  });

  it("does not quote an unsourced lag value", () => {
    expect(lag.note).not.toContain("0.72");
  });

  it("describes the Navarro accommodation geometry the builder implements (retina fixed)", () => {
    expect(navarro.accommodation.description).not.toContain("axial length grows");
    expect(navarro.accommodation.description).toContain("vitreous absorbs");
  });
});
