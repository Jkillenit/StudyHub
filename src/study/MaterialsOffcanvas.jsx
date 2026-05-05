import { useCallback, useEffect, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Modal from "react-bootstrap/Modal";
import Offcanvas from "react-bootstrap/Offcanvas";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";
import {
  loadOm300Materials,
  mergePathsIntoMaterials,
  saveOm300Materials,
} from "./materialsStorage.js";

const FILE_FILTERS = [
  {
    name: "Course files",
    extensions: ["pdf", "pptx", "docx", "html", "htm", "txt", "md"],
  },
];

function extOf(path) {
  const base = path.split(/[/\\]/).pop() || "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "—";
}

function isPdfPath(p) {
  return extOf(p) === "pdf";
}

export function MaterialsOffcanvas({ show, onHide }) {
  const bridge = typeof window !== "undefined" ? window.studyHub : null;
  const [items, setItems] = useState(() => loadOm300Materials());

  const [readerOpen, setReaderOpen] = useState(false);
  const [readerTitle, setReaderTitle] = useState("");
  const [readerLoading, setReaderLoading] = useState(false);
  const [readerText, setReaderText] = useState("");
  const [readerPages, setReaderPages] = useState(0);
  const [readerWarn, setReaderWarn] = useState("");
  const [readerErr, setReaderErr] = useState("");

  useEffect(() => {
    if (!show) return;
    setItems(loadOm300Materials());
  }, [show]);

  useEffect(() => {
    if (!show || !bridge?.registerMaterialPaths || !items.length) return;
    bridge.registerMaterialPaths(items.map((m) => m.path)).catch(() => {});
  }, [show, bridge, items]);

  const addFiles = async () => {
    if (!bridge?.pickFiles) return;
    const paths = await bridge.pickFiles(FILE_FILTERS);
    if (!paths?.length) return;
    setItems((prev) => {
      const next = mergePathsIntoMaterials(prev, paths);
      saveOm300Materials(next);
      return next;
    });
  };

  const addFolder = async () => {
    if (!bridge?.pickFolderMaterials) return;
    const paths = await bridge.pickFolderMaterials();
    if (!paths?.length) return;
    setItems((prev) => {
      const next = mergePathsIntoMaterials(prev, paths);
      saveOm300Materials(next);
      return next;
    });
  };

  const openFile = useCallback(
    async (p) => {
      if (!bridge?.openPath) return;
      try {
        await bridge.openPath(p);
      } catch (e) {
        window.alert(e?.message || "Could not open file.");
      }
    },
    [bridge]
  );

  const openPdfReader = async (filePath, name) => {
    setReaderTitle(name);
    setReaderOpen(true);
    setReaderText("");
    setReaderPages(0);
    setReaderWarn("");
    setReaderErr("");
    if (!bridge?.extractPdfText) {
      setReaderErr("PDF text reading is available in the Study Hub desktop app (Electron).");
      return;
    }
    setReaderLoading(true);
    try {
      const res = await bridge.extractPdfText(filePath);
      if (!res?.ok) {
        setReaderErr(res?.error || "Could not read PDF.");
        return;
      }
      setReaderText(res.text || "");
      setReaderPages(typeof res.numpages === "number" ? res.numpages : 0);
      if (res.empty) {
        setReaderWarn("No extractable text found — the PDF may be scanned or image-only. Use Open to view it in your PDF app.");
      }
    } catch (e) {
      setReaderErr(e?.message || String(e));
    } finally {
      setReaderLoading(false);
    }
  };

  const removeAt = (id) => {
    setItems((prev) => {
      const next = prev.filter((m) => m.id !== id);
      saveOm300Materials(next);
      return next;
    });
  };

  return (
    <>
      <Offcanvas show={show} onHide={onHide} placement="end" scroll backdrop="static">
        <Offcanvas.Header closeButton className="border-bottom border-secondary">
          <Offcanvas.Title className="text-light">Materials library</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="d-flex flex-column gap-3 pt-3">
          <p className="text-secondary small mb-0">
            Add downloads or a Blackboard export folder. Opens files in your default app (Reader, PowerPoint, etc.). After restarting
            the app, open this panel once so saved paths are registered for opening. PDFs also support{" "}
            <strong className="text-light">Read text</strong> in the desktop build.
          </p>

          {!bridge?.pickFiles ? (
            <Alert variant="warning" className="mb-0 small py-2">
              Materials picking is available in the <strong>desktop (Electron)</strong> build. In the browser preview, use the packaged
              app for imports.
            </Alert>
          ) : (
            <div className="d-flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={addFiles}>
                Add files…
              </Button>
              <Button variant="outline-primary" size="sm" onClick={addFolder}>
                Add folder…
              </Button>
            </div>
          )}

          {items.length === 0 ? (
            <p className="text-secondary small mb-0">No materials yet. Add files or scan a folder.</p>
          ) : (
            <div className="table-responsive border border-secondary rounded">
              <Table hover variant="dark" size="sm" className="mb-0 align-middle">
                <thead>
                  <tr className="text-secondary">
                    <th>Name</th>
                    <th style={{ width: 64 }}>Type</th>
                    <th className="text-end" style={{ minWidth: 200 }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => (
                    <tr key={m.id}>
                      <td className="text-break" title={m.path}>
                        {m.name}
                      </td>
                      <td className="text-secondary text-uppercase small">{extOf(m.path)}</td>
                      <td className="text-end">
                        {isPdfPath(m.path) ? (
                          <Button
                            variant="outline-success"
                            size="sm"
                            className="me-1"
                            disabled={!bridge?.extractPdfText}
                            onClick={() => openPdfReader(m.path, m.name)}
                          >
                            Read text
                          </Button>
                        ) : null}
                        <Button
                          variant="outline-info"
                          size="sm"
                          className="me-1"
                          disabled={!bridge?.openPath}
                          onClick={() => openFile(m.path)}
                        >
                          Open
                        </Button>
                        <Button variant="outline-danger" size="sm" onClick={() => removeAt(m.id)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </Offcanvas.Body>
      </Offcanvas>

      <Modal show={readerOpen} onHide={() => setReaderOpen(false)} size="lg" scrollable centered contentClassName="border-secondary">
        <Modal.Header closeButton className="bg-dark border-secondary">
          <Modal.Title className="text-light h6 text-truncate" title={readerTitle}>
            {readerTitle || "PDF text"}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-light">
          {readerLoading ? (
            <div className="d-flex align-items-center gap-2 text-secondary small py-4">
              <Spinner animation="border" size="sm" role="status" />
              Extracting text…
            </div>
          ) : null}
          {readerErr ? (
            <Alert variant="danger" className="small">
              {readerErr}
            </Alert>
          ) : null}
          {readerWarn ? (
            <Alert variant="warning" className="small">
              {readerWarn}
            </Alert>
          ) : null}
          {!readerLoading && !readerErr && readerPages > 0 ? (
            <p className="small text-secondary mb-2">{readerPages} page{readerPages === 1 ? "" : "s"} extracted</p>
          ) : null}
          {readerText ? (
            <pre
              className="sh-form small text-secondary mb-0 p-3 rounded border border-secondary"
              style={{
                maxHeight: "min(62vh, 520px)",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                margin: 0,
                fontFamily: "ui-monospace, Consolas, monospace",
                lineHeight: 1.55,
              }}
            >
              {readerText}
            </pre>
          ) : null}
        </Modal.Body>
      </Modal>
    </>
  );
}
