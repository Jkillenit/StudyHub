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
  const [expressError, setExpressError] = useState("");
  const [dragExpress, setDragExpress] = useState(false);
  const completeRef = useRef(onExpressComplete);
  completeRef.current = onExpressComplete;

  useEffect(() => {
    if (!open) {
      setPhase("idle");
      setExpressLabel("");
      setProcessingLabel("");
      setChapterLabel("");
      setExpressError("");
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

  const handleFileSelected = useCallback(
    (filePath) => {
      if (!filePath) return;
      const ext = String(filePath).split(".").pop().toLowerCase();
      console.log("[IMPORT] File selected:", filePath);
      console.log("[IMPORT] Extension:", ext);

      const base = String(filePath).split(/[/\\]/).pop() || String(filePath);
      setExpressError("");
      void runExpressFinish(base, String(filePath));
    },
    [runExpressFinish]
  );

  const handleBrowseFiles = useCallback(async () => {
    const bridge = typeof window !== "undefined" ? window.studyHub : null;
    if (bridge?.openFileDialog) {
      const result = await bridge.openFileDialog({
        filters: [
          { name: "PPTX Files", extensions: ["pptx"] },
          { name: "PDF Files", extensions: ["pdf"] },
          { name: "All Supported", extensions: ["pptx", "pdf", "docx", "zip"] },
        ],
      });
      if (!result?.canceled && result?.filePath) {
        handleFileSelected(result.filePath);
      }
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pptx,.pdf,.docx,.zip";
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      console.warn("[IMPORT] Browser mode: file.path unavailable. Run in Electron for full import.");
      handleFileSelected(file.path || file.name);
    };
    input.click();
  }, [handleFileSelected]);

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
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const filePath = file.path;
    if (
      !filePath ||
      typeof filePath !== "string" ||
      (!filePath.includes("/") && !filePath.includes("\\"))
    ) {
      setExpressError(
        "Drag-and-drop requires running in the Electron app. Click BROWSE FILES above to select your file."
      );
      return;
    }
    handleFileSelected(filePath);
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
            </div>
            <button
              type="button"
              className="sh-btn-ghost sh-btn-ghost-amber sh-express-modal-browse"
              onClick={() => void handleBrowseFiles()}
            >
              BROWSE FILES…
            </button>
            {expressError ? (
              <div className="mono mt-2" style={{ color: "var(--sh-amber)", fontSize: 10 }}>
                {expressError}
              </div>
            ) : null}
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
}
