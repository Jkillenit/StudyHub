import { useEffect, useRef } from "react";

const bbToast = (message, type = "success") => void window.studyHub?.blackboard?.showBbToast?.(message, type);

function isSyllabusName(fileName) {
  const lower = String(fileName || "").toLowerCase();
  return lower.includes("syllabus") || lower.includes("course outline") || lower.includes("course_outline");
}

/**
 * Bridges Blackboard-window events to the app. It never builds course objects itself:
 * course resolution and merging happen in the root app against live state.
 */
export default function BlackboardImportHandler({ onImport }) {
  const importRef = useRef(onImport);
  importRef.current = onImport;

  useEffect(() => {
    const bb = window.studyHub?.blackboard;
    if (!bb) return undefined;

    const handleImportReady = async (data) => {
      const { localPath, fileName, folderName, courseId, bbCourseId, role, action } = data || {};
      const effectiveRole = isSyllabusName(fileName) ? "syllabus" : role;
      let resolvedAction = effectiveRole === "syllabus" ? "parse-syllabus" : action;
      let extracted = null;

      if (resolvedAction === "import-pptx" && bb && window.studyHub?.extractPptx) {
        extracted = await window.studyHub.extractPptx(localPath);
      } else if (resolvedAction === "extract-text" || resolvedAction === "parse-syllabus") {
        const isPdf = String(fileName || "").toLowerCase().endsWith(".pdf");
        const raw = isPdf ? await window.studyHub?.extractPdfText?.(localPath) : await window.studyHub?.extractText?.(localPath);
        if (!raw?.success && !raw?.ok) {
          bbToast(`✕ ${fileName}: ${raw?.error || "text extraction failed"}`, "error");
          return;
        }
        extracted = { success: true, text: raw.text || "" };
      } else {
        resolvedAction = null;
      }
      if (!resolvedAction) return;

      const message = await importRef.current?.({
        courseId,
        bbCourseId,
        fileName,
        folderName,
        action: resolvedAction,
        extracted,
      });
      if (message) bbToast(message, message.startsWith("✕") || message.startsWith("○") ? "warning" : "success");
    };

    const handleImportError = (data) => bbToast(`✕ ${data?.fileName || "File"}: ${data?.error || "Import failed"}`, "error");
    const handleImportStarted = (data) => bbToast(`... importing ${data?.fileName || "file"}`);

    bb.onImportReady?.(handleImportReady);
    bb.onImportError?.(handleImportError);
    bb.onImportStarted?.(handleImportStarted);
    return () => {
      bb.offImportEvents?.();
    };
  }, []);

  return null;
}
