import { useEffect, useRef, useState } from "react";
import { parseTokenInput } from "../viewModels.js";

/**
 * First-run token entry + optional QR scan (BarcodeDetector when available).
 */
export function TokenGate({ onSave, error, busy }) {
  const [raw, setRaw] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    return () => {
      stopScan();
    };
  }, []);

  function stopScan() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }
    setScanning(false);
  }

  async function startScan() {
    setScanError("");
    if (!("BarcodeDetector" in globalThis)) {
      setScanError("QR scan needs a browser with BarcodeDetector. Paste the token instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const detector = new globalThis.BarcodeDetector({ formats: ["qr_code"] });
      const tick = async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes[0]?.rawValue) {
            const parsed = parseTokenInput(codes[0].rawValue);
            stopScan();
            if (parsed.token) onSave(parsed);
            return;
          }
        } catch {
          // keep scanning
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setScanError("Camera permission denied. Paste the token instead.");
      stopScan();
    }
  }

  function submit(e) {
    e.preventDefault();
    const parsed = parseTokenInput(raw);
    if (parsed.token) onSave(parsed);
  }

  return (
    <form className="remote-gate" onSubmit={submit}>
      <div className="remote-brand">
        <h1>Study Hub</h1>
        <p>Enter the Station token from your PC (shown once when you enable Station).</p>
      </div>
      <label>
        Token or setup link
        <textarea
          className="remote-input"
          rows={3}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Paste token or https://…/?token=…"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
        />
      </label>
      {error ? (
        <div className="remote-banner" data-tone="danger" role="alert">
          {error}
        </div>
      ) : null}
      {scanError ? (
        <div className="remote-banner" data-tone="warn" role="status">
          {scanError}
        </div>
      ) : null}
      {scanning ? <video ref={videoRef} className="remote-video" playsInline muted /> : null}
      <div className="remote-run-row">
        <button type="submit" className="remote-btn remote-btn-primary" disabled={busy || !raw.trim()}>
          {busy ? "Checking…" : "Connect"}
        </button>
        {scanning ? (
          <button type="button" className="remote-btn remote-btn-ghost" onClick={stopScan}>
            Stop scan
          </button>
        ) : (
          <button type="button" className="remote-btn remote-btn-ghost" onClick={startScan}>
            Scan QR
          </button>
        )}
      </div>
    </form>
  );
}
