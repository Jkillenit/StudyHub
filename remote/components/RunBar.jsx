import { RUN_PRESET_OPTIONS } from "../viewModels.js";

export function RunBar({ preset, onPresetChange, onRun, disabled, running }) {
  return (
    <div className="remote-run">
      <div className="remote-run-row">
        <select
          className="remote-select"
          value={preset}
          onChange={(e) => onPresetChange(e.target.value)}
          aria-label="Run preset"
          disabled={disabled || running}
        >
          {RUN_PRESET_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="remote-btn remote-btn-primary"
          onClick={onRun}
          disabled={disabled || running}
        >
          {running ? "Running…" : "Run"}
        </button>
      </div>
      <p className="remote-empty" style={{ margin: 0 }}>
        {RUN_PRESET_OPTIONS.find((o) => o.id === preset)?.hint}
      </p>
    </div>
  );
}
