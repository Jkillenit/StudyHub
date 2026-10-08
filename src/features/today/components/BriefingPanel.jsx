import { useEffect, useRef, useState } from "react";
import { useTyping } from "../useArrival.js";
import { ArrowIcon, HudPanel } from "./HudPanel.jsx";
import { playScene } from "../../../nova/stage.js";
import { sceneFrom } from "../../../nova/scenePlayer.js";
import briefingScene from "../../../nova/scenes/briefing.json";

const TYPE_MS = 10;
const SPEAK_MS_PER_CHAR = 65;
const CUT_GRACE_MS = 1000;

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

const talk = (ms) => window.dispatchEvent(new CustomEvent("studyhub-companion-talk", { detail: { ms } }));

/**
 * "Play briefing": Nova performs the briefing scene, walking to each thing and saying it aloud.
 * When she can't (hidden, quiet, busy), the panel text is just read out.
 */
export function BriefingPanel({ briefing, context, arriving, onStart, canStart, index = 0 }) {
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);
  /* Any click or key ends her scene before this button's click lands; a click right after that means "stop", not "play again". */
  const cutAtRef = useRef(0);
  const total = briefing.text.length;
  const typed = useTyping(total, arriving, TYPE_MS);

  const setPlaying = (on) => {
    speakingRef.current = on;
    setSpeaking(on);
  };

  useEffect(
    () => () => {
      if (speakingRef.current && speechAvailable()) window.speechSynthesis.cancel();
    },
    []
  );

  const readAloud = () => {
    const u = new SpeechSynthesisUtterance(briefing.text);
    u.onend = u.onerror = () => {
      setPlaying(false);
      talk(0);
    };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setPlaying(true);
    talk(briefing.text.length * SPEAK_MS_PER_CHAR);
  };

  const toggleSpeech = () => {
    if (!speechAvailable()) return;
    if (speakingRef.current || performance.now() - cutAtRef.current < CUT_GRACE_MS) {
      cutAtRef.current = 0;
      window.speechSynthesis.cancel();
      setPlaying(false);
      talk(0);
      return;
    }
    const scene = sceneFrom(briefingScene, { ...context, speak: true });
    const handled = playScene(async (stage) => {
      setPlaying(true);
      try {
        await scene(stage);
      } finally {
        if (!stage.running) cutAtRef.current = performance.now();
        setPlaying(false);
      }
    });
    if (!handled) readAloud();
  };

  return (
    <HudPanel className="sh-brief" hud index={index} aria-label="Briefing" data-nova-anchor="panel.briefing" data-perch>
      <div className="sh-hud-label sh-hud-label--accent">Briefing</div>
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
          <button
            type="button"
            className="sh-btn-outline sh-btn-lg"
            onClick={toggleSpeech}
            aria-pressed={speaking}
          >
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
