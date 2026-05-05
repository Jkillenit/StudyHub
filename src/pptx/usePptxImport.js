import { useCallback, useState } from "react";
import { buildOutput } from "./pptxOutputBuilder.js";
import { classifySlides } from "./pptxClassifier.js";

export function usePptxImport() {
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const importPptx = useCallback(async (filePath, chapterId) => {
    void chapterId;
    setStatus("extracting");
    setProgress("READING FILE...");
    setResult(null);
    setError(null);

    try {
      const validation = validatePptxFile(filePath);
      if (!validation.valid) throw new Error(validation.message);

      const bridge = typeof window !== "undefined" ? window.studyHub : null;
      if (!bridge?.extractPptx) throw new Error("PPTX extraction requires the Study Hub desktop app.");

      const extracted = await bridge.extractPptx(filePath);
      console.log("[PPTX] IPC result:", extracted);
      console.log("[PPTX] Slides received:", extracted?.slides?.length);
      if (!extracted?.success) throw new Error(extracted?.error || "PPTX extraction failed.");
      if (!extracted?.slides?.length) {
        throw new Error("No readable content found in this file. The slides may contain only images.");
      }

      setStatus("classifying");
      setProgress("CLASSIFYING CONTENT...");
      const classified = classifySlides(extracted.slides);

      setProgress("BUILDING OUTPUT...");
      const output = buildOutput(classified);
      output.pptxMeta = {
        firstSlideTitle: extracted?.slides?.[0]?.title || "",
      };
      setStatus("complete");
      setProgress("");
      setResult(output);
      return output;
    } catch (err) {
      setStatus("error");
      setProgress("");
      setError(err?.message || String(err));
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    setStatus("idle");
    setProgress("");
    setResult(null);
    setError(null);
  }, []);

  return { importPptx, status, progress, result, error, reset };
}

export function validatePptxFile(filePath) {
  const ext = String(filePath || "")
    .split(".")
    .pop()
    .toLowerCase();
  if (ext === "pptx") return { valid: true };
  if (ext === "ppt") {
    return {
      valid: false,
      message: "Legacy .ppt format not supported. Please open in PowerPoint and Save As .pptx first.",
    };
  }
  if (ext === "key") {
    return {
      valid: false,
      message: "Keynote files not supported. Export as .pptx from Keynote first.",
    };
  }
  return {
    valid: false,
    message: "Please drop a .pptx file.",
  };
}
