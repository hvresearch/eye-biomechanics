import { useScene } from "../store/scene";

/**
 * Play/pause for the oculomotor dynamics (saccades, vergence, accommodation), elapsed time,
 * and a scrubber over the recorded history. Paused, the eyes sit at the static fixation.
 */
export function Transport() {
  const playing = useScene((s) => s.playing);
  const timeS = useScene((s) => s.dynamics.timeS);
  const history = useScene((s) => s.history);
  const scrubS = useScene((s) => s.scrubS);
  const setPlaying = useScene((s) => s.setPlaying);
  const scrub = useScene((s) => s.scrub);
  const first = history[0]?.timeS ?? 0;
  const last = history[history.length - 1]?.timeS ?? 0;
  const canScrub = !playing && history.length > 1;
  const shown = scrubS ?? timeS;

  return (
    <div className="transport" role="group" aria-label="Transport">
      <button
        type="button"
        data-testid="transport-play"
        aria-pressed={playing}
        onClick={() => setPlaying(!playing)}
        title={playing ? "Pause: snap to the static fixation" : "Play: animate saccades, vergence, and accommodation"}
      >
        {playing ? "Pause" : "Play"}
      </button>
      <span className="time" data-testid="transport-time">
        {shown.toFixed(2)} s
      </span>
      <input
        type="range"
        aria-label="Scrub recorded history"
        data-testid="transport-scrub"
        min={first}
        max={Math.max(last, first + 1e-3)}
        step={0.001}
        value={canScrub ? (scrubS ?? last) : last}
        disabled={!canScrub}
        onChange={(e) => scrub(Number(e.target.value))}
      />
      <span className="mode">{playing ? "Dynamics" : scrubS !== null ? "Replay" : "Static"}</span>
    </div>
  );
}
