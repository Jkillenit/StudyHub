import { STUDY_SIDEBAR_GROUPS, studySidebarPrefix } from "../study/chapterUiMeta.js";

/** @typedef {{ id: string, prefix: string, label: string, badge?: string|number, complete?: boolean, tone?: "amber"|"accent" }} NavItem */
/** @typedef {{ key: string, label: string|null, tourId: string, items: NavItem[] }} NavGroup */

export const COURSE_ITEMS = [
  { id: "course-assignments", prefix: "AS", label: "Assignments" },
  { id: "course-announcements", prefix: "AN", label: "Announcements" },
  { id: "course-bb-content", prefix: "BB", label: "Blackboard Content" },
];

export const STUDY_ITEMS = [
  { id: "qz-deck", prefix: "QZ", label: "Flashcard Deck" },
  { id: "study-test", prefix: "PT", label: "Practice Test" },
  { id: "study-guide", prefix: "SG", label: "Study Guide" },
  { id: "study-progress", prefix: "ST", label: "Progress" },
];

function withBadge(item, badges) {
  const badge = badges[item.id];
  return badge ? { ...item, badge } : { ...item };
}

/** @returns {NavGroup[]} */
export function userCourseNav(course, { completedIds = [], badges = {} } = {}) {
  const modules = Array.isArray(course?.modules) ? course.modules : [];
  const disabled = new Set(course?.disabledModuleIds || []);
  const done = new Set(completedIds);
  const moduleItems = modules
    .filter((m) => !disabled.has(m.id))
    .map((m, i) =>
      withBadge(
        {
          id: `module:${m.id}`,
          prefix: String(i + 1).padStart(2, "0"),
          label: m.title || m.label || "",
          complete: done.has(m.id),
        },
        badges
      )
    );
  return [
    { key: "modules", label: null, tourId: "course-modules", items: moduleItems },
    { key: "course", label: "Course", tourId: "course-mirror", items: COURSE_ITEMS.map((it) => withBadge(it, badges)) },
    { key: "study", label: "Study", tourId: "course-drill", items: STUDY_ITEMS.map((it) => withBadge(it, badges)) },
  ];
}

const BUILTIN_GROUP = {
  mod: { label: null, tourId: "course-modules" },
  ref: { label: "Reference", tourId: "course-mirror", tone: "amber" },
  drill: { label: "Study", tourId: "course-drill", tone: "accent" },
};

const BUILTIN_PREFIX = { final: "FR", formulas: "EQ", flashcards: "QZ" };

/** @returns {NavGroup[]} */
export function builtinCourseNav({ chapters, completedIds = [] }) {
  const byId = new Map((chapters || []).map((c) => [c.id, c]));
  const done = new Set(completedIds);
  return STUDY_SIDEBAR_GROUPS.map((g) => {
    const meta = BUILTIN_GROUP[g.key];
    const items = g.ids
      .filter((id) => byId.has(id))
      .map((id) => {
        const item = {
          id,
          prefix: BUILTIN_PREFIX[id] || studySidebarPrefix(id).replace(/^CH·/, ""),
          label: byId.get(id).title,
          complete: done.has(id),
        };
        return meta.tone ? { ...item, tone: meta.tone } : item;
      });
    return { key: g.key, label: meta.label, tourId: meta.tourId, items };
  });
}
