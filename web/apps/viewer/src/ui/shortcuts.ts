import { useEffect } from "react";
import { VIEW_KEYS, type ViewName } from "../scene/views";

export type ShortcutAction = { kind: "view"; view: ViewName } | { kind: "togglePlay" } | { kind: "unpinAll" };

/** Elements whose own keyboard handling the shortcuts must not take over. */
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Help text listing the shortcuts (shown in the Stage panel). */
export const SHORTCUT_HELP = "1–4 snap the camera (anterior, lateral, superior, sagittal section), Space plays or pauses, Escape unpins every readout.";

/**
 * The stage's keyboard shortcuts: 1–4 snap the camera, Space toggles the transport, Escape
 * removes every pinned readout. Nothing fires while focus is in a form field or with a
 * modifier held, so typing and the browser's own shortcuts are unaffected.
 */
export function shortcutAction(e: { key: string; targetTag: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): ShortcutAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (EDITABLE_TAGS.has(e.targetTag.toUpperCase())) return null;
  if (e.key in VIEW_KEYS) return { kind: "view", view: VIEW_KEYS[e.key as keyof typeof VIEW_KEYS] };
  if (e.key === " " || e.key === "Spacebar") return { kind: "togglePlay" };
  if (e.key === "Escape") return { kind: "unpinAll" };
  return null;
}

/** Installs the shortcuts on the window for as long as the calling component is mounted. */
export function useShortcuts(run: (a: ShortcutAction) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      // A focused button already answers Space and Enter itself; let it.
      if (e.key === " " && target?.tagName === "BUTTON") return;
      const action = shortcutAction({
        key: e.key,
        targetTag: target?.tagName ?? "",
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
      });
      if (!action) return;
      e.preventDefault();
      run(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [run]);
}
