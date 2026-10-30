import { useState } from "react";
import { RESULTS } from "../results/catalog";
import { SCENARIOS } from "../scenario/catalog";
import { downloadBlob, downloadText, fileStem, stagePng } from "../scenario/export";
import { parseScenario, scenarioDurationS, scenarioJson, serializeScenario } from "../scenario/scenario";
import { useScene } from "../store/scene";
import type { Scenario } from "@eye/eye-model";

const RESULT_IDS = RESULTS.map((r) => r.id);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Bundled scenarios parsed once; a file that fails to parse is listed with its error. */
const BUNDLED = SCENARIOS.map((s) => {
  try {
    return { id: s.id, doc: parseScenario(s.text, RESULT_IDS), error: null };
  } catch (e) {
    return { id: s.id, doc: null, error: message(e) };
  }
});

/**
 * Scenarios panel (spec §6.5): load and play a bundled scenario or an imported file, and
 * export the current state as a Scenario JSON (the reproducibility unit) and a PNG of the stage.
 */
export function Scenarios() {
  const scenario = useScene((s) => s.scenario);
  const loadScenario = useScene((s) => s.loadScenario);
  const restartScenario = useScene((s) => s.restartScenario);
  const clearScenario = useScene((s) => s.clearScenario);
  const setPlaying = useScene((s) => s.setPlaying);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("My scenario");

  const load = async (doc: Scenario) => {
    setError(null);
    const entry = doc.result ? RESULTS.find((r) => r.id === doc.result?.id) : undefined;
    await loadScenario(doc, entry);
  };

  const exportJson = () => {
    const s = useScene.getState();
    const keep = s.scenario?.doc;
    const doc = serializeScenario(s.scenarioInput(), {
      name,
      description: keep && keep.name === name ? keep.description : "",
      timeline: keep && keep.name === name ? keep.timeline : [],
    });
    downloadText(`${fileStem(name)}.json`, scenarioJson(doc), "application/json");
  };

  const exportPng = async () => {
    const canvas = document.querySelector<HTMLCanvasElement>("[data-testid=stage] canvas");
    if (!canvas) return setError("The stage is not drawn yet");
    try {
      downloadBlob(`${fileStem(name)}.png`, await stagePng(canvas));
    } catch (e) {
      setError(message(e));
    }
  };

  return (
    <section className="panel" data-testid="scenarios">
      <h2>Scenarios</h2>
      {error && (
        <div className="banner" role="alert" data-testid="scenario-error">
          {error}
        </div>
      )}
      <ul className="scenario-list">
        {BUNDLED.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              data-testid={`scenario-${b.id}`}
              aria-pressed={scenario?.doc.name === b.doc?.name}
              disabled={b.doc === null}
              title={b.doc?.description ?? b.error ?? ""}
              onClick={() => b.doc && void load(b.doc)}
            >
              {b.doc?.name ?? b.id}
            </button>
          </li>
        ))}
      </ul>
      {scenario && (
        <div className="scenario-current" data-testid="scenario-current">
          <p>
            <strong>{scenario.doc.name}</strong>
            {scenario.doc.timeline.length > 0 ? ` · timeline ${scenarioDurationS(scenario.doc).toFixed(0)} s` : " · no timeline"}
          </p>
          <p className="note">{scenario.doc.description}</p>
          <div className="button-row">
            <button
              type="button"
              data-testid="scenario-play"
              onClick={() => {
                restartScenario();
                setPlaying(true);
              }}
            >
              Play from start
            </button>
            <button type="button" data-testid="scenario-clear" onClick={clearScenario} title="Keep the current state, stop following the timeline">
              Detach
            </button>
          </div>
        </div>
      )}
      <div className="field">
        <label htmlFor="scenario-file">Import scenario</label>
        <input
          id="scenario-file"
          data-testid="scenario-file"
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            void file
              .text()
              .then((text) => load(parseScenario(text, RESULT_IDS)))
              .catch((err: unknown) => setError(message(err)));
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="scenario-name">Export name</label>
        <input id="scenario-name" data-testid="scenario-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="button-row">
        <button type="button" data-testid="scenario-export-json" onClick={exportJson} title="Scene, both eyes, prescription, and the loaded scenario's timeline as Scenario JSON">
          Export JSON
        </button>
        <button type="button" data-testid="scenario-export-png" onClick={() => void exportPng()} title="The stage as drawn now">
          Export PNG
        </button>
      </div>
    </section>
  );
}
