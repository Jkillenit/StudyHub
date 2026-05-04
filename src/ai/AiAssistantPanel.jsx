import { useCallback, useEffect, useRef, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import Stack from "react-bootstrap/Stack";
import { useShell } from "../shell/ShellContext.jsx";
import { loadFlashcardDeck, persistFlashcardDeck } from "../om300/flashcards/flashcardPersistence.js";

function mergeAiCardsIntoDeck(newCards) {
  const existing = loadFlashcardDeck();
  const ts = Date.now();
  const withIds = newCards.map((c, i) => ({
    id: `ai_${ts}_${i}`,
    front: c.front,
    back: c.back,
  }));
  persistFlashcardDeck([...existing, ...withIds]);
  window.dispatchEvent(new CustomEvent("studyhub-flashcards-updated"));
}

export function AiAssistantPanel({ open, onClose }) {
  const { setApiLive } = useShell();
  const bridge = typeof window !== "undefined" ? window.studyHub : null;
  const ai = bridge?.ai;

  const [status, setStatus] = useState(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [mode, setMode] = useState("chapter_mastery");
  const [sourceText, setSourceText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [inlineApiNotice, setInlineApiNotice] = useState(false);
  const apiKeySectionRef = useRef(null);
  const apiKeyInputRef = useRef(null);

  const refreshStatus = useCallback(async () => {
    if (!ai?.getStatus) return;
    try {
      const s = await ai.getStatus();
      setStatus(s);
      setApiLive(!!s?.configured);
    } catch {
      setStatus(null);
      setApiLive(false);
    }
  }, [ai, setApiLive]);

  useEffect(() => {
    if (open) {
      void refreshStatus();
      setErr("");
      setOkMsg("");
      setInlineApiNotice(false);
    }
  }, [open, refreshStatus]);

  useEffect(() => {
    if (status?.configured) setInlineApiNotice(false);
  }, [status?.configured]);

  const focusApiKeySection = useCallback(() => {
    window.requestAnimationFrame(() => {
      apiKeySectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      const el = apiKeyInputRef.current;
      if (el && typeof el.focus === "function") el.focus();
    });
  }, []);

  const saveKey = async () => {
    setErr("");
    try {
      await ai.setApiKey(apiKeyInput);
      setApiKeyInput("");
      await refreshStatus();
      setInlineApiNotice(false);
      setOkMsg("API key saved securely on this computer.");
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const clearKey = async () => {
    setErr("");
    try {
      await ai.clearApiKey();
      await refreshStatus();
      setOkMsg("Saved key removed.");
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const loadFromFile = async () => {
    if (!bridge?.pickFiles || !bridge?.readTextFile) return;
    setErr("");
    setOkMsg("");
    try {
      const paths = await bridge.pickFiles([
        { name: "Text & notes", extensions: ["txt", "md", "rtf"] },
        { name: "All files", extensions: ["*"] },
      ]);
      if (!paths?.length) return;
      const text = await bridge.readTextFile(paths[0]);
      setSourceText(text);
      setOkMsg(`Loaded: ${paths[0].split(/[/\\]/).pop()}`);
    } catch (e) {
      setErr(e.message || String(e));
    }
  };

  const runGenerate = async () => {
    setErr("");
    setOkMsg("");
    setBusy(true);
    try {
      const result = await ai.generateFlashcards({
        sourceText,
        mode,
      });
      if (!result?.ok) {
        setErr(result?.error || "Generation failed.");
        return;
      }
      const cards = result.cards || [];
      if (!cards.length) {
        setErr("Model returned no cards.");
        return;
      }
      mergeAiCardsIntoDeck(cards);
      setOkMsg(`Added ${cards.length} flashcards to OM 300 → Quizlet. Open that tab to study.`);
      setSourceText("");
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const onGenerateClick = async () => {
    if (!ai) return;
    if (!status?.configured) {
      setInlineApiNotice(true);
      focusApiKeySection();
      return;
    }
    await runGenerate();
  };

  return (
    <Modal show={open} onHide={onClose} size="lg" centered scrollable className="sh-modal" contentClassName="sh-modal-content">
      <Modal.Header closeButton className="sh-modal-header border-bottom py-2">
        <Modal.Title id="ai-panel-title" className="mono mb-0" style={{ fontSize: 12, letterSpacing: "0.08em" }}>
          AI · CLAUDE
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="sh-modal-body font-sans">
        <p className="text-secondary small mb-3">
          Keys never leave your PC except to Anthropic&apos;s API. Paste notes below and generate flashcards for{" "}
          <strong className="text-light">OM 300 → Quizlet</strong>.
        </p>

        {!ai && (
          <Alert variant="warning" className="mb-0 small">
            AI runs inside the <strong>Study Hub desktop app</strong> only. Build with{" "}
            <code className="text-dark">npm run dist:win</code> and open <code className="text-dark">App\Study Hub.exe</code>.
          </Alert>
        )}

        {ai && (
          <Stack gap={3}>
            <div ref={apiKeySectionRef} id="studyhub-ai-api-key-section" className="p-3 rounded border border-secondary bg-black bg-opacity-25">
              <div className="small text-secondary mb-2">
                Status:{" "}
                <span className={status?.configured ? "text-success" : "text-warning"}>
                  {status?.configured ? `Ready (${status.maskedKey || "key set"})` : "No key saved"}
                </span>
                {status?.model ? (
                  <span className="ms-2 text-secondary">
                    Model: <span className="text-light">{status.model}</span>
                  </span>
                ) : null}
                {status?.source === "environment" ? (
                  <span className="ms-2 text-info">Using ANTHROPIC_API_KEY from environment</span>
                ) : null}
              </div>
              <Form.Label className="small text-secondary">Anthropic API key (stored locally — see README.md)</Form.Label>
              <Form.Control
                ref={apiKeyInputRef}
                type="password"
                autoComplete="off"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="sk-ant-api03-…"
                className="mb-2 sh-form"
                size="sm"
                id="studyhub-ai-api-key-input"
              />
              <Stack direction="horizontal" gap={2} className="flex-wrap">
                <Button variant="primary" size="sm" onClick={saveKey}>
                  Save key
                </Button>
                <Button variant="outline-secondary" size="sm" onClick={clearKey}>
                  Remove saved key
                </Button>
                <a
                  href="https://console.anthropic.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="small ms-auto align-self-center link-info"
                >
                  Get a key →
                </a>
              </Stack>
            </div>

            <div>
              <Form.Label className="small text-secondary">Study mode</Form.Label>
              <Form.Select
                size="sm"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="sh-form"
                style={{ maxWidth: 400 }}
              >
                <option value="chapter_mastery">Chapter mastery — balanced coverage</option>
                <option value="exam_cram">Exam cram — high-yield facts & definitions</option>
              </Form.Select>
            </div>

            <div>
              <Stack direction="horizontal" gap={2} className="align-items-center mb-2 flex-wrap">
                <Form.Label className="small text-secondary mb-0">Source text</Form.Label>
                {bridge?.pickFiles && (
                  <Button variant="outline-secondary" size="sm" onClick={loadFromFile}>
                    Load from file…
                  </Button>
                )}
              </Stack>
              <Form.Label className="small text-secondary visually-hidden">Paste study material</Form.Label>
              <Form.Control
                as="textarea"
                rows={10}
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="Paste material here…"
                className="sh-form font-monospace small"
              />
            </div>

            {busy ? (
              <div className="mb-2">
                <div className="sh-loading-label">GENERATING FLASHCARDS…</div>
                <div className="sh-loading-dots mono" aria-hidden>
                  <span>●</span>
                  <span>●</span>
                  <span>●</span>
                  <span>●</span>
                  <span>●</span>
                </div>
              </div>
            ) : null}

            {inlineApiNotice && !status?.configured ? (
              <div className="sh-ai-inline-key border border-secondary border-opacity-50 rounded px-2 py-3">
                <pre className="sh-empty-ascii-box">{`┌────────────────────────────┐
│   API KEY REQUIRED         │
│                            │
│   ADD KEY IN SETTINGS →   │
└────────────────────────────┘`}</pre>
                <button
                  type="button"
                  className="sh-btn-ghost ctx-btn"
                  style={{ maxWidth: 160 }}
                  onClick={focusApiKeySection}
                >
                  OPEN SETTINGS
                </button>
                <p className="sh-empty-sub" style={{ opacity: 0.5, textAlign: "center" }}>
                  BASIC IMPORT WORKS WITHOUT AN API KEY
                </p>
              </div>
            ) : null}

            <Stack direction="horizontal" gap={2} className="align-items-center flex-wrap">
              <Button variant="success" size="sm" disabled={busy || !sourceText.trim()} onClick={() => void onGenerateClick()}>
                GENERATE
              </Button>
            </Stack>

            {err ? (
              <Alert variant="danger" className="mb-0 small">
                {err}
              </Alert>
            ) : null}
            {okMsg ? (
              <Alert variant="success" className="mb-0 small">
                {okMsg}
              </Alert>
            ) : null}
          </Stack>
        )}
      </Modal.Body>
    </Modal>
  );
}
