import { useCallback, useEffect } from "react";

export default function BlackboardImportHandler({ courses, onCreateCourse, onUpsertImport, onShowToast }) {
  const handleImportReady = useCallback(
    async (data) => {
      const {
        localPath,
        fileName,
        folderName,
        courseId,
        bbCourseId,
        role,
        action,
      } = data || {};

      let course = (courses || []).find((c) => (c.uuid || c.id) === courseId || c.bbCourseId === bbCourseId);
      if (!course && onCreateCourse) {
        course = await onCreateCourse({
          name: bbCourseId || "Blackboard Course",
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
          role,
          action,
          extracted,
          localPath,
        });
        onShowToast?.(role === "syllabus" ? "✓ Syllabus detected — checking grades" : `✓ Importing ${fileName}...`);
        return;
      }

      if ((action === "extract-text" || action === "parse-syllabus") && window.studyHub?.extractText) {
        const extracted = await window.studyHub.extractText(localPath);
        await onUpsertImport?.({
          course,
          fileName,
          folderName,
          role,
          action,
          extracted,
          localPath,
        });
        if (role === "syllabus") {
          onShowToast?.("✓ Syllabus — setting up GRADES tab");
        } else {
          onShowToast?.(`✓ ${fileName} → notes`);
        }
      }
    },
    [courses, onCreateCourse, onShowToast, onUpsertImport]
  );

  useEffect(() => {
    window.studyHub?.blackboard?.onImportReady?.(handleImportReady);
    return () => {
      window.studyHub?.blackboard?.offImportEvents?.();
    };
  }, [handleImportReady]);

  return null;
}
