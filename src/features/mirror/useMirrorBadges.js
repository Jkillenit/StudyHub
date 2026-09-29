import { useEffect, useState } from "react";
import { daysFromToday } from "../dashboard/dateLabels.js";

/** Sidebar badge counts for a course: unread announcements and incomplete work due within 7 days. */
export function useMirrorBadges(courseUuid) {
  const [badges, setBadges] = useState({ unread: 0, dueSoon: 0 });

  useEffect(() => {
    if (!courseUuid) return undefined;
    let cancelled = false;
    const load = async () => {
      const db = window.studyHub?.db;
      const [ann, asg] = await Promise.all([
        db?.announcements?.getByCourse?.(courseUuid),
        db?.assignments?.getByCourse?.(courseUuid),
      ]);
      if (cancelled) return;
      const unread = (ann || []).filter((a) => !a.read).length;
      const dueSoon = (asg || []).filter((a) => {
        if (a.completed || !a.due_date) return false;
        const d = daysFromToday(a.due_date);
        return d !== null && d >= 0 && d < 7;
      }).length;
      setBadges({ unread, dueSoon });
    };
    void load();
    const onChange = (e) => {
      if (!e.detail?.courseUuid || e.detail.courseUuid === courseUuid) void load();
    };
    window.addEventListener("studyhub-bb-synced", onChange);
    window.addEventListener("studyhub-mirror-changed", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("studyhub-bb-synced", onChange);
      window.removeEventListener("studyhub-mirror-changed", onChange);
    };
  }, [courseUuid]);

  return badges;
}
