import { useCallback, useEffect, useRef, useState } from "react";
import Modal from "react-bootstrap/Modal";
import { ExpressProcessingView } from "./ExpressProcessingView.jsx";

export const EXPRESS_FILTERS = [
  { name: "PPTX, PDF, ZIP", extensions: ["pptx", "pdf", "zip"] },
  { name: "All files", extensions: ["*"] },
];

const ASCII_EXPRESS = `┌─────────────────┐
│                 │
│   DROP FILE     │
│   TO START      │
│                 │
└─────────────────┘`;

export function ExpressImportModal({ open, onClose, onExpressComplete }) {
  const [phase, setPhase] = useState("idle");
  const [expressLabel, setExpressLabel] = useState("");
  const [processingLabel, setProcessingLabel] = useState("");
  const [chapterLabel, setChapterLabel] = useState("");
  const [dragExpress, setDragExpress] = useState(false);
  const completeRef = useRef(onExpressComplete);
  completeRef.current = onExpressComplete;

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setExpressLabel("");
      setProcessingLabel("");
      setChapterLabel("");
      setDragExpress(false);
    }
  }, [open]);

  const runExpressFinish = useCallback(async (fileName, absPath) => {
    setPhase("processing");
    setExpressLabel(fileName);
    setProcessingLabel("READING FILE...");
    setChapterLabel("");
    await completeRef.current?.({
      fileName,
      absPath,
      onProgress: ({ label = "", chapter = "" }) => {
        if (label) setProcessingLabel(label);
        setChapterLabel(chapter);
      },
    });
  }, []);

  const handleFile = useCallback(
    (file) => {
      if (!file) return;
      const name = file.name || "file";
      const path = typeof file.path === "string" && file.path ? file.path : undefined;
      void runExpressFinish(name, path);
    },
    [runExpressFinish]
  );

  const onPickFiles = useCallback(async () => {
    const bridge = typeof window !== "undefined" ? window.studyHub : null;
    if (!bridge?.pickFiles) return;
    try {
      const paths = await bridge.pickFiles(EXPRESS_FILTERS);
      if (!paths?.length) return;
      const p = paths[0];
      const base = p.split(/[/\\]/).pop() || p;
      void runExpressFinish(base, p);
    } catch {
      /* ignore */
    }
  }, [runExpressFinish]);

  const onRootDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setDragExpress(true);
  };

  const onRootDragLeave = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragExpress(false);
  };

  const onRootDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragExpress(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <Modal show={open} onHide={onClose} centered className="sh-modal" contentClassName="sh-modal-content" size="md">
      <Modal.Header closeButton className="sh-modal-header border-bottom py-2 px-3">
        <Modal.Title className="mono mb-0" style={{ fontSize: 11, letterSpacing: "0.14em" }}>
          EXPRESS IMPORT
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="sh-modal-body p-4">
        {phase === "processing" ? (
          <ExpressProcessingView fileLabel={expressLabel} statusLabel={processingLabel} chapterLabel={chapterLabel} />
        ) : (
          <div className="sh-express-modal-drop-wrap">
            <div
              className={`sh-express-modal-drop ${dragExpress ? "sh-welcome-panel--drag" : ""}`}
              onDragEnter={onRootDragOver}
              onDragOver={onRootDragOver}
              onDragLeave={onRootDragLeave}
              onDrop={onRootDrop}
            >
              <div className="sh-welcome-panel-label sh-welcome-panel-label--amber">EXPRESS</div>
              <pre className="sh-welcome-ascii">{ASCII_EXPRESS}</pre>
              <div className="sh-welcome-sublabel">PPTX · PDF · BLACKBOARD ZIP</div>
              <input
                type="file"
                className="sh-welcome-file-input"
                accept=".pptx,.pdf,.zip,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/pdf,application/zip"
                aria-label="Choose file for express import"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            <button
              type="button"
              className="sh-btn-ghost sh-btn-ghost-amber sh-express-modal-browse"
              onClick={() => void onPickFiles()}
            >
              BROWSE FILES…
            </button>
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
}
