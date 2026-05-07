import { useCallback, useEffect } from "react";

export default function BlackboardImportHandler({ courses, activeCourse, onCreateCourse, onUpsertImport, onShowToast }) {
  const handleImportReady = useCallback(
    async (data) => {
      console.log("[BB IMPORT] Event received:", JSON.stringify(data, null, 2));
      console.log("[BB IMPORT] courseId:", data?.courseId);
      console.log("[BB IMPORT] bbCourseId:", data?.bbCourseId);
      console.log("[BB IMPORT] action:", data?.action);
      console.log("[BB IMPORT] localPath:", data?.localPath);
      console.log("[BB IMPORT] folderName:", data?.folderName);
      console.log(
        "[BB IMPORT] Available courses:",
        courses?.map((c) => ({
          id: c.uuid || c.id,
          name: c.name,
          bbCourseId: c.bbCourseId,
        }))
      );

      const {
        localPath,
        fileName,
        folderName,
        courseId,
        bbCourseId,
        courseTitle,
        role,
        action,
      } = data || {};
      const lowerFileName = String(fileName || "").toLowerCase();
      const effectiveRole = (
        lowerFileName.includes("syllabus") ||
        lowerFileName.includes("course outline") ||
        lowerFileName.includes("course_outline")
      )
        ? "syllabus"
        : role;

      let course = activeCourse || null;
      if (!course && courseId) {
        course = (courses || []).find((c) => (c.uuid || c.id) === courseId);
      }
      if (!course && bbCourseId) {
        course = (courses || []).find((c) => c.bbCourseId === bbCourseId);
      }
      if (!course && onCreateCourse) {
        course = await onCreateCourse({
          name: courseTitle || bbCourseId || "Blackboard Course",
          bbCourseId,
        });
      }
      if (!course) return;

      if (action === "import-pptx" && window.studyHub?.extractPptx) {
        const extracted = await window.studyHub.extractPptx(localPath);
        await onUpsertImport?.({
          course,
          fileName,
          folderName,
          role: effectiveRole,
          action,
          extracted,
          localPath,
        });
        onShowToast?.(effectiveRole === "syllabus" ? "✓ Syllabus detected — checking grades" : `✓ Importing ${fileName}...`);
        return;
      }

      const resolvedAction = effectiveRole === "syllabus" ? "parse-syllabus" : action;
      if ((resolvedAction === "extract-text" || resolvedAction === "parse-syllabus") && window.studyHub?.extractText) {
        const extracted = await window.studyHub.extractText(localPath);
        if (!extracted?.success && !extracted?.ok) {
          onShowToast?.(`✕ ${fileName}: ${extracted?.error || "text extraction failed"}`);
          return;
        }
        const normalizedExtracted = extracted?.ok
          ? { success: true, text: extracted.text || "" }
          : extracted;
        console.log('[SYLLABUS DEBUG]',
          'role:', effectiveRole,
          'resolvedAction:', resolvedAction,
          'extracted.ok:', extracted?.ok,
          'extracted.success:', extracted?.success,
          'textLength:', (
            extracted?.text ||
            normalizedExtracted?.text || ''
          ).length
        );
        await onUpsertImport?.({
          course,
          fileName,
          folderName,
          role: effectiveRole,
          action: resolvedAction,
          extracted: normalizedExtracted,
          localPath,
        });
        if (effectiveRole === "syllabus") {
          onShowToast?.("✓ Syllabus — setting up GRADES tab");
        } else {
          onShowToast?.(`✓ ${fileName} → notes`);
        }
      }
    },
    [courses, activeCourse, onCreateCourse, onShowToast, onUpsertImport]
  );

  useEffect(() => {
    console.log("[BB HANDLER] Mounted with", courses?.length, "courses");
    console.log("[BB HANDLER] Active course:", activeCourse?.name || "none");
    window.studyHub?.blackboard?.onImportReady?.(handleImportReady);
    window.studyHub?.blackboard?.onImportError?.((data) => {
      const fileName = data?.fileName || "File";
      const error = data?.error || "Import failed";
      onShowToast?.(`✕ ${fileName}: ${error}`);
    });
    window.studyHub?.blackboard?.onImportStarted?.((data) => {
      const fileName = data?.fileName || "file";
      onShowToast?.(`... importing ${fileName}`);
    });
    return () => {
      window.studyHub?.blackboard?.offImportEvents?.();
    };
  }, [handleImportReady]);

  return null;
}
