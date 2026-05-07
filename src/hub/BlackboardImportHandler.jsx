import { useCallback, useEffect, useRef } from "react";
import { ensureUserCourse } from "./userCourseModel.js";

export default function BlackboardImportHandler({ courses, activeCourse, onCreateCourse, onUpsertImport }) {
  const coursesRef = useRef(courses);
  useEffect(() => {
    coursesRef.current = courses;
  }, [courses]);

  const activeCourseRef = useRef(activeCourse);
  useEffect(() => {
    activeCourseRef.current = activeCourse;
  }, [activeCourse]);

  const bbToast = useCallback((message, type = "success") => {
    void window.studyHub?.blackboard?.showBbToast?.(message, type);
  }, []);

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

      bbToast(`✓ Course created: ${course.name}`);
    };

    window.studyHub?.blackboard?.onCreateCourseRequest?.(handleCreateRequest);

    return () => {
      window.studyHub?.blackboard?.offCreateCourseRequest?.();
    };
  }, [onCreateCourse, bbToast]);

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
        bbToast("○ Click CREATE STUDY HUB COURSE in the toolbar first", "warning");
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
        bbToast(
          effectiveRole === "syllabus" ? "✓ Syllabus detected — checking grades" : `✓ Importing ${fileName}...`
        );
        return;
      }

      const resolvedAction = effectiveRole === "syllabus" ? "parse-syllabus" : action;
      if (
        (resolvedAction === "extract-text" || resolvedAction === "parse-syllabus") &&
        (window.studyHub?.extractText || window.studyHub?.extractPdfText)
      ) {
        const isPdf = String(fileName || "").toLowerCase().endsWith(".pdf");
        const extracted = isPdf
          ? await window.studyHub.extractPdfText(localPath)
          : await window.studyHub.extractText(localPath);
        if (!extracted?.success && !extracted?.ok) {
          bbToast(`✕ ${fileName}: ${extracted?.error || "text extraction failed"}`, "error");
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
          bbToast("✓ Syllabus — setting up GRADES tab");
        } else {
          bbToast(`✓ ${fileName} → notes`);
        }
      }
    },
    [bbToast, onUpsertImport]
  );

  useEffect(() => {
    window.studyHub?.blackboard?.onImportReady?.(handleImportReady);
    window.studyHub?.blackboard?.onImportError?.((data) => {
      const fileName = data?.fileName || "File";
      const error = data?.error || "Import failed";
      bbToast(`✕ ${fileName}: ${error}`, "error");
    });
    window.studyHub?.blackboard?.onImportStarted?.((data) => {
      const fileName = data?.fileName || "file";
      bbToast(`... importing ${fileName}`);
    });
    return () => {
      window.studyHub?.blackboard?.offImportEvents?.();
    };
  }, [handleImportReady, bbToast]);

  return null;
}
