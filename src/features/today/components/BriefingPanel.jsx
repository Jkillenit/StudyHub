import { useEffect, useState } from "react";
import { useTyping } from "../useArrival.js";
import { ArrowIcon, HudPanel } from "./HudPanel.jsx";

const TYPE_MS = 10;
const SPEAK_MS_PER_CHAR = 65;

const speechAvailable = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Renders briefing segments, cut off after `limit` characters for the typing effect. */
function Segments({ segments, limit }) {
  let left = limit;
  const out = [];
  segments.forEach((seg, i) => {
    if (left <= 0) return;
    const text = typeof seg === "string" ? seg : seg.num;
    const part = text.slice(0, left);
    left -= text.length;
    out.push(
      typeof seg === "string" ? (
        <span key={i}>{part}</span>
      ) : (
        <span key={i} className={`sh-brief-num sh-brief-num--${seg.tone || "plain"}`}>
          {part}
        </span>
      )
    );
  });
  return out;
}

export function BriefingPanel({ briefing, arriving, onStart, canStart, index = 0 }) {
  const [speaking, setSpeaking] = useState(false);
  const total = briefing.text.length;
  const typed = useTyping(total, arriving, TYPE_MS);

  useEffect(() => () => speechAvailable() && window.speechSynthesis.cancel(), []);

  const toggleSpeech = () => {
    if (!speechAvailable()) return;
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      window.dispatchEvent(new CustomEvent("studyhub-companion-talk", { detail: { ms: 0 } }));
      return;
    }
    const u = new SpeechSynthesisUtterance(briefing.text);
    u.rate = 1;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
    window.dispatchEvent(new CustomEvent("studyhub-companion-talk", { detail: { ms: briefing.text.length * SPEAK_MS_PER_CHAR } }));
  };

  return (
    <HudPanel className="sh-brief" brackets index={index} aria-label="Briefing" data-perch>
      <div className="sh-hud-label sh-hud-label--accent">BRIEFING</div>
      <p className="sh-brief-text" aria-live="polite">
        <span className="sh-visually-hidden">{briefing.text}</span>
        <span aria-hidden>
          <Segments segments={briefing.segments} limit={typed} />
        </span>
      </p>
      <div className="sh-brief-actions">
        <button type="button" className="sh-btn-accent sh-btn-accent--glow sh-btn-lg" onClick={onStart} disabled={!canStart}>
          Start first task
          <ArrowIcon size={16} />
        </button>
        {speechAvailable() ? (
          <button type="button" className="sh-btn-outline sh-btn-lg" onClick={toggleSpeech} aria-pressed={speaking}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 5L6 9H3v6h3l5 4z" />
              {speaking ? (
                <path d="M16 9l5 6M21 9l-5 6" />
              ) : (
                <>
                  <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                  <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                </>
              )}
            </svg>
            {speaking ? "Stop" : "Play briefing"}
          </button>
        ) : null}
      </div>
    </HudPanel>
  );
}
