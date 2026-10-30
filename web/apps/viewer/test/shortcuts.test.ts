import { describe, expect, it } from "vitest";
import { shortcutAction } from "../src/ui/shortcuts";

const key = (k: string, over: Partial<Parameters<typeof shortcutAction>[0]> = {}) =>
  shortcutAction({ key: k, targetTag: "BODY", ctrlKey: false, metaKey: false, altKey: false, ...over });

describe("shortcutAction", () => {
  it("snaps the camera on 1–4", () => {
    expect(key("1")).toEqual({ kind: "view", view: "anterior" });
    expect(key("2")).toEqual({ kind: "view", view: "lateral" });
    expect(key("3")).toEqual({ kind: "view", view: "superior" });
    expect(key("4")).toEqual({ kind: "view", view: "sagittal" });
    expect(key("5")).toBeNull();
  });

  it("toggles the transport on Space and unpins on Escape", () => {
    expect(key(" ")).toEqual({ kind: "togglePlay" });
    expect(key("Escape")).toEqual({ kind: "unpinAll" });
    expect(key("a")).toBeNull();
  });

  it("does nothing inside form fields", () => {
    for (const tag of ["INPUT", "TEXTAREA", "SELECT", "input"]) {
      expect(key("1", { targetTag: tag })).toBeNull();
      expect(key(" ", { targetTag: tag })).toBeNull();
      expect(key("Escape", { targetTag: tag })).toBeNull();
    }
  });

  it("does nothing with a modifier held", () => {
    expect(key("1", { ctrlKey: true })).toBeNull();
    expect(key("2", { metaKey: true })).toBeNull();
    expect(key(" ", { altKey: true })).toBeNull();
  });
});
