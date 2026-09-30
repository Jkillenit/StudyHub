import { useEffect, useRef, useState } from "react";
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

const brief = (detail) => window.dispatchEvent(new CustomEvent("studyhub-companion-brief", { detail }));

export function BriefingPanel({ briefing, arriving, onStart, canStart, index = 0 }) {
  const [speaking, setSpeaking] = useState(false);
  const total = briefing.text.length;
  const typed = useTyping(total, arriving, TYPE_MS);
  const walkRef = useRef(null);

  const stopWalk = () => {
    const w = walkRef.current;
    if (!w) return;
    walkRef.current = null;
    w.timers.forEach((t) => window.clearTimeout(t));
    brief({ phase: "end" });
  };

  useEffect(
    () => () => {
      if (speechAvailable()) window.speechSynthesis.cancel();
      stopWalk();
    },
    []
  );

  const toggleSpeech = () => {
    if (!speechAvailable()) return;
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      stopWalk();
      window.dispatchEvent(new CustomEvent("studyhub-companion-talk", { detail: { ms: 0 } }));
      return;
    }
    const u = new SpeechSynthesisUtterance(briefing.text);
    u.rate = 1;
    /*
     * Nova walks to each thing as the voice reaches it. Word boundaries give the exact spot;
     * voices that don't report them fall back to an estimate from the speaking pace.
     */
    const beats = briefing.beats || [];
    const walk = { next: 0, heard: false, timers: [] };
    const reach = (charIndex) => {
      while (walk.next < beats.length && charIndex >= beats[walk.next].from) {
        brief({ phase: "beat", target: beats[walk.next].target });
        walk.next += 1;
      }
    };
    u.onboundary = (e) => {
      if (walkRef.current !== walk) return;
      walk.heard = true;
      reach(e.charIndex);
    };
    u.onstart = () => {
      if (walkRef.current !== walk) return;
      walk.timers = beats.map((b) =>
        window.setTimeout(() => {
          if (walkRef.current === walk && !walk.heard) reach(b.from);
        }, b.from * SPEAK_MS_PER_CHAR)
      );
    };
    const done = () => {
      setSpeaking(false);
      if (walkRef.current === walk) stopWalk();
    };
    u.onend = done;
    u.onerror = done;
    synth.cancel();
    stopWalk();
    walkRef.current = walk;
    if (beats.length) brief({ phase: "start" });
    synth.speak(u);
    setSpeaking(true);
    window.dispatchEvent(new CustomEvent("studyhub-companion-talk", { detail: { ms: briefing.text.length * SPEAK_MS_PER_CHAR } }));
  };

  return (
    <HudPanel className="sh-brief" brackets index={index} aria-label="Briefing" data-nova-anchor="panel.briefing" data-perch>
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
