import { useEffect, useState } from "react";
import { courseStore } from "../../db/courseStore.js";
import { loadCompanionState, saveCompanionState } from "../../companion/companionStore.js";
import { known, memoryMap } from "../../companion/memory/derive.js";

const STEPS = ["NAME", "BLACKBOARD", "MAKE IT YOURS", "TOUR"];
const MAX_NAME = 40;

/**
 * First run, full window: name, Blackboard, look, tour. Nova stands on the stage beside the
 * column (CompanionLayer houses her in `[data-nova-home]` while `place === "setup"`).
 */
export function SetupScreen({ onDone }) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [named, setNamed] = useState(false);
  const bb = window.studyHub?.blackboard;
  const [bbStatus, setBbStatus] = useState({ loggedIn: false });
  const [bbOpened, setBbOpened] = useState(false);
  const clean = name.trim().slice(0, MAX_NAME);

  useEffect(() => {
    let live = true;
    void courseStore.companionMemory().then((rows) => {
      const saved = known(memoryMap(rows), "name")?.name;
      if (live && saved) setName((cur) => cur || saved);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!bb?.getStatus) return undefined;
    const check = async () => {
      const s = await bb.getStatus();
      if (s) setBbStatus(s);
    };
    void check();
    window.addEventListener("focus", check);
    return () => window.removeEventListener("focus", check);
  }, [bb]);

  /** Nova marks herself onboarded when she's listening; otherwise the saved state is patched here. */
  const finish = ({ tour = false } = {}) => {
    const e = new CustomEvent("studyhub-setup-done", { detail: { tour, named }, cancelable: true });
    if (window.dispatchEvent(e)) void loadCompanionState().then((s) => saveCompanionState({ ...s, onboarded: true }));
    onDone();
  };

  const saveName = (e) => {
    e.preventDefault();
    if (!clean) return;
    void courseStore.companionRemember([{ key: "name", value: { name: clean }, source: "told" }], { notify: true });
    setNamed(true);
    setStep(1);
  };

  const openBlackboard = async () => {
    await bb.open();
    setBbOpened(true);
    window.setTimeout(async () => {
      const s = await bb.getStatus?.();
      if (s) setBbStatus(s);
    }, 1000);
  };

  let body;
  if (step === 0) {
    body = (
      <>
        <h1 className="sh-setup-title">What should I call you?</h1>
        <p className="sh-setup-sub">I&apos;m Nova. Every day I&apos;ll tell you what matters and get you ready for it.</p>
        <form className="sh-setup-name" onSubmit={saveName}>
          <input
            className="sh-setup-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={MAX_NAME}
            placeholder="Your name"
            aria-label="Your name"
            autoFocus
          />
          <button type="submit" className="sh-btn-primary sh-setup-next" disabled={!clean}>
            Continue
          </button>
        </form>
      </>
    );
  } else if (step === 1) {
    body = (
      <>
        <h1 className="sh-setup-title">Nice to meet you, {clean || "you"}.</h1>
        <p className="sh-setup-sub">
          Let me see your Blackboard. Log in like you normally do and I&apos;ll mirror your courses, files, assignments and grades. I only read,
          and I never see your password.
        </p>
        {bb?.open ? (
          <p className={`sh-setup-status mono${bbStatus.loggedIn ? " sh-setup-status--on" : ""}`}>
            {bbStatus.loggedIn ? "Connected" : bbOpened ? "Log in in the Blackboard window" : "Not connected"}
          </p>
        ) : (
          <p className="sh-setup-status mono">Blackboard connects in the desktop app</p>
        )}
        <div className="sh-setup-actions">
          {bb?.open && !bbStatus.loggedIn ? (
            <button type="button" className="sh-btn-primary sh-setup-next" onClick={() => void openBlackboard()}>
              Open Blackboard
            </button>
          ) : null}
          {bbStatus.loggedIn ? (
            <button type="button" className="sh-btn-primary sh-setup-next" onClick={() => setStep(2)}>
              Continue
            </button>
          ) : (
            <button type="button" className="sh-btn-quiet" onClick={() => setStep(2)}>
              Skip for now
            </button>
          )}
        </div>
        <ul className="sh-setup-fine mono">
          <li>Read only</li>
          <li>Stays on this computer</li>
          <li>No account needed</li>
        </ul>
      </>
    );
  } else if (step === 2) {
    body = (
      <>
        <h1 className="sh-setup-title">Make it yours</h1>
        <p className="sh-setup-sub">Pick a look. Packs change colors and my voice, never where things are.</p>
        <div className="sh-setup-packs">
          <button type="button" className="sh-setup-pack" aria-pressed="true">
            <span className="sh-setup-pack-name">Nova</span>
            <span className="sh-setup-pack-meta mono">Selected</span>
          </button>
          <button type="button" className="sh-setup-pack" disabled>
            <span className="sh-setup-pack-name">Zombies</span>
            <span className="sh-setup-pack-meta mono">Coming soon</span>
          </button>
        </div>
        <div className="sh-setup-actions">
          <button type="button" className="sh-btn-primary sh-setup-next" onClick={() => setStep(3)}>
            Continue
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="sh-setup-title">Want the quick tour?</h1>
        <p className="sh-setup-sub">A couple of minutes. I&apos;ll point at the parts that matter. It&apos;s in my menu if you want it later.</p>
        <div className="sh-setup-actions">
          <button type="button" className="sh-btn-primary sh-setup-next" autoFocus onClick={() => finish({ tour: true })}>
            Take the tour
          </button>
          <button type="button" className="sh-btn-quiet" onClick={() => finish()}>
            Skip the tour
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="sh-plan sh-setup">
      <div className="sh-setup-body">
        <div className="sh-setup-col">
          <ol className="sh-setup-steps mono">
            {STEPS.map((label, i) => (
              <li key={label}>
                <button
                  type="button"
                  className="sh-setup-step"
                  aria-current={i === step ? "step" : undefined}
                  data-done={i < step || undefined}
                  disabled={i >= step}
                  onClick={() => setStep(i)}
                >
                  {String(i + 1).padStart(2, "0")} {label}
                </button>
              </li>
            ))}
          </ol>
          {body}
        </div>
        <div className="sh-setup-stage" data-nova-home aria-hidden="true">
          <div className="sh-setup-floor" data-nova-floor />
        </div>
      </div>
      <button type="button" className="sh-setup-skip sh-setup-done mono" onClick={() => finish()}>
        Skip setup
      </button>
    </div>
  );
}
