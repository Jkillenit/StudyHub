export function SetupScreen({ onDone }) {
  return (
    <div className="sh-plan sh-setup">
      <div className="sh-plan-col">
        <section className="sh-panel sh-hub-block">
          <h2 className="sh-hud-title">SET UP STUDY HUB</h2>
          <p className="sh-hub-empty-hint">Setup will show here.</p>
          <button type="button" className="sh-btn-primary sh-setup-done" onClick={onDone}>
            Continue
          </button>
        </section>
      </div>
    </div>
  );
}
