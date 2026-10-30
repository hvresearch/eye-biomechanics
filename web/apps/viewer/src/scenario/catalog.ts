/**
 * The scenarios committed under data/scenarios (spec §6.5), bundled as text so the viewer
 * parses them with the same reader as an imported file.
 */
export interface ScenarioEntry {
  id: string;
  text: string;
}

const files: Record<string, string> = import.meta.glob("../../../../../data/scenarios/*.json", { query: "?raw", import: "default", eager: true });

export const SCENARIOS: ScenarioEntry[] = Object.entries(files)
  .map(([path, text]) => ({ id: path.slice(path.lastIndexOf("/") + 1, -".json".length), text }))
  .sort((a, b) => a.id.localeCompare(b.id));
