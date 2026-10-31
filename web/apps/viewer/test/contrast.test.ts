import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { paletteFor, THEMES, type Theme } from "../src/scene/palette";
import { composite, contrastRatio, parseColor, readsAsHot, type RGB } from "../src/ui/color";
import { divergingColor, sequentialColor } from "../src/ui/optics/colormap";

/** WCAG AA: body text 4.5:1; large text and graphical marks (chart marks, focus rings) 3:1. */
const AA_TEXT = 4.5;
const AA_MARK = 3;

const css = readFileSync(resolve(import.meta.dirname, "../src/theme.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Custom properties declared by the rules whose selector list contains `selector`. */
function declarations(selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1]!.split(",").map((s) => s.trim());
    if (!selectors.includes(selector)) continue;
    for (const d of m[2]!.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]!] = d[2]!.trim();
  }
  return out;
}

/** The tokens in force for a theme: `:root` overlaid with the theme's own rule. */
function tokens(theme: Theme): Record<string, string> {
  return { ...declarations(":root"), ...declarations(`:root[data-theme="${theme}"]`) };
}

function opaque(t: Record<string, string>, name: string, under?: RGB): RGB {
  const v = t[name];
  if (v === undefined) throw new Error(`Missing token ${name}`);
  const c = parseColor(v);
  if (c.alpha < 1) {
    if (!under) throw new Error(`${name} is translucent; give the backdrop`);
    return composite(c, under);
  }
  return c.rgb;
}

const TEXT_TOKENS = ["--text", "--text-muted", "--text-faint", "--accent-strong", "--warn"] as const;
const MARK_TOKENS = ["--accent", "--hot", "--chart-1", "--chart-2", "--chart-3", "--chart-4"] as const;

describe.each(THEMES)("%s theme tokens", (theme) => {
  const t = tokens(theme);
  const stage = opaque(t, "--stage");
  const backgrounds: Record<string, RGB> = {
    "--bg": opaque(t, "--bg"),
    "--surface": opaque(t, "--surface"),
    "--stage": stage,
    "--overlay on --stage": opaque(t, "--overlay", stage),
  };

  it("declares every token the plan names", () => {
    for (const name of ["--bg", "--surface", "--text", "--text-muted", "--accent", "--hot", "--chart-1", "--chart-2", "--chart-3", "--chart-4"]) expect(t[name], name).toBeDefined();
    for (let i = 0; i <= 5; i++) expect(t[`--fs-${i}`], `--fs-${i}`).toBeDefined();
    for (let i = 0; i <= 6; i++) expect(t[`--sp-${i}`], `--sp-${i}`).toBeDefined();
  });

  it.each(TEXT_TOKENS)("%s meets 4.5:1 on every background", (fg) => {
    for (const [name, bg] of Object.entries(backgrounds)) {
      expect(contrastRatio(opaque(t, fg), bg), `${fg} on ${name}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("puts text on the accent fill at 4.5:1", () => {
    expect(contrastRatio(opaque(t, "--on-accent"), opaque(t, "--accent"))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(MARK_TOKENS)("%s meets 3:1 against the chart surface", (mark) => {
    expect(contrastRatio(opaque(t, mark), backgrounds["--surface"]!)).toBeGreaterThanOrEqual(AA_MARK);
  });

  it("mirrors the shared tokens in the stage palette", () => {
    const p = paletteFor(theme);
    expect(p.bg).toBe(t["--stage"]);
    expect(p.hot).toBe(t["--hot"]);
    expect(p.accent).toBe(t["--accent"]);
    expect(p.warn).toBe(t["--warn"]);
  });

  it("uses the hot color for muscle activation only", () => {
    const hot = opaque(t, "--hot");
    const reserved = new Set(["--hot", "--hot-wash"]);
    for (const [name, value] of Object.entries(t)) {
      if (reserved.has(name) || !/^(#|rgba?\()/.test(value)) continue;
      expect(readsAsHot(parseColor(value).rgb, hot), `${theme} ${name} ${value}`).toBe(false);
    }
    const p = paletteFor(theme);
    for (const [name, value] of Object.entries(p)) {
      // The activation ramp runs from the resting muscle tone to hot; both belong to it.
      if (name === "hot" || name === "muscleRest" || typeof value !== "string") continue;
      expect(readsAsHot(parseColor(value).rgb, hot), `palette ${name} ${value}`).toBe(false);
    }
    for (const [name, value] of Object.entries(p.structures)) {
      expect(readsAsHot(parseColor(value).rgb, hot), `structure ${name} ${value}`).toBe(false);
    }
    for (let v = -1; v <= 1.0001; v += 0.125) {
      expect(readsAsHot(divergingColor(v, theme), hot), `diverging ${v}`).toBe(false);
      if (v >= 0) expect(readsAsHot(sequentialColor(v, theme), hot), `sequential ${v}`).toBe(false);
    }
  });
});
