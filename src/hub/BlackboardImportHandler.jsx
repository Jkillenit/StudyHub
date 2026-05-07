import { useCallback, useEffect, useRef } from "react";
import { ensureUserCourse } from "./userCourseModel.js";

export default function BlackboardImportHandler({ courses, activeCourse, onCreateCourse, onUpsertImport, onShowToast }) {
  const coursesRef = useRef(courses);
  useEffect(() => {
    coursesRef.current = courses;
  }, [courses]);

  const activeCourseRef = useRef(activeCourse);
  useEffect(() => {
    activeCourseRef.current = activeCourse;
  }, [activeCourse]);

  useEffect(() => {
    const handleCreateRequest = async (data) => {
      const { courseTitle, bbCourseId } = data || {};

      const existing = (coursesRef.current || []).find(
        (c) => c.bbCourseId === bbCourseId || c.name === courseTitle
      );

      let course = existing;

      if (!course && onCreateCourse) {
        course = await onCreateCourse({
          name: courseTitle || bbCourseId || "Blackboard Course",
          bbCourseId,
        });
      }

      if (!course) return;

      const courseId = course.uuid || course.id;

      await window.studyHub?.blackboard?.setActiveCourse?.(courseId);

      await window.studyHub?.blackboard?.reportCourseCreated?.({
        courseId,
        courseTitle: course.name,
        bbCourseId,
      });

      onShowToast?.(`✓ Course created: ${course.name}`);
    };

    window.studyHub?.blackboard?.onCreateCourseRequest?.(handleCreateRequest);

    return () => {
      window.studyHub?.blackboard?.offCreateCourseRequest?.();
    };
  }, [onCreateCourse, onShowToast]);

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
      const lowerFileName = String(fileName || "").toLowerCase();
      const effectiveRole =
        lowerFileName.includes("syllabus") ||
        lowerFileName.includes("course outline") ||
        lowerFileName.includes("course_outline")
          ? "syllabus"
          : role;

      let course = null;

      if (courseId) {
        const row = await window.studyHub?.db?.courses?.get?.(courseId);
        if (row) {
          course = ensureUserCourse({
            id: row.uuid,
            uuid: row.uuid,
            name: row.name,
            color: row.color,
            bbCourseId: bbCourseId || "",
          });
        }
      }

      if (!course) {
        course = activeCourseRef.current || null;
      }

      if (!course && bbCourseId) {
        course = (coursesRef.current || []).find((c) => c.bbCourseId === bbCourseId) || null;
      }

      if (!course) {
        onShowToast?.(
          "○ Open a course in Study Hub first, or click CREATE COURSE in the toolbar"
        );
        return;
      }

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
        const normalizedExtracted = extracted?.ok ? { success: true, text: extracted.text || "" } : extracted;
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
    [onShowToast, onUpsertImport]
  );

  useEffect(() => {
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
  }, [handleImportReady, onShowToast]);

  return null;
}
