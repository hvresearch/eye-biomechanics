/**
 * Biomechanics results committed under data/results/fem (spec §12): each `<name>.eye.json`
 * EyeParameters result with its optional `<name>.deformation.json` sidecar, loaded on demand
 * (the sidecars hold a few hundred kilobytes of surface data).
 */
export interface ResultEntry {
  id: string;
  label: string;
  hasDeformation: boolean;
  load(): Promise<{ eye: unknown; deformation: unknown | null }>;
}

const eyes = import.meta.glob<{ default: unknown }>("../../../../../data/results/fem/*.eye.json");
const sidecars = import.meta.glob<{ default: unknown }>("../../../../../data/results/fem/*.deformation.json");

const LABELS: Record<string, string> = {
  "emmetrope-right-primary-15mmHg": "Navarro 1985 schematic eye, primary gaze, IOP 15 mmHg, muscles and lids",
};

function entry(path: string): ResultEntry {
  const id = path.slice(path.lastIndexOf("/") + 1, -".eye.json".length);
  const sidePath = path.slice(0, -".eye.json".length) + ".deformation.json";
  const side = sidecars[sidePath];
  const eye = eyes[path]!;
  return {
    id,
    label: LABELS[id] ?? id,
    hasDeformation: side !== undefined,
    async load() {
      const [e, d] = await Promise.all([eye(), side ? side() : Promise.resolve(null)]);
      return { eye: e.default, deformation: d ? d.default : null };
    },
  };
}

export const RESULTS: ResultEntry[] = Object.keys(eyes).sort().map(entry);
