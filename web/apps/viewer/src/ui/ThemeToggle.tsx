import { useEffect } from "react";
import { useScene } from "../store/scene";

/** Keeps `<html data-theme>` on the store's theme (the CSS tokens switch on it). */
export function useThemeAttribute(): void {
  const theme = useScene((s) => s.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
}

/** Switches between the dark and light themes; the choice is remembered. */
export function ThemeToggle() {
  const theme = useScene((s) => s.theme);
  const setTheme = useScene((s) => s.setTheme);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className="theme-toggle" data-testid="theme-toggle" aria-label={`Switch to the ${next} theme`} onClick={() => setTheme(next)}>
      {theme === "dark" ? "Light theme" : "Dark theme"}
    </button>
  );
}
