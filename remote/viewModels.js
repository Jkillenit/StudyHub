/**
 * Pure view helpers for the Station remote PWA.
 */

export const RUN_PRESET_OPTIONS = Object.freeze([
  { id: "full", label: "Full run", hint: "Sync, instructions, drafts, briefing" },
  { id: "sync", label: "Sync", hint: "Blackboard + briefing" },
  { id: "drafts", label: "Drafts", hint: "Instructions, drafts, briefing" },
  { id: "briefing", label: "Briefing", hint: "Rebuild briefing only" },
]);

const PRESET_IDS = new Set(RUN_PRESET_OPTIONS.map((p) => p.id));

/** @param {string} preset */
export function isRunPreset(preset) {
  return PRESET_IDS.has(preset);
}

/**
 * @param {object|null|undefined} briefing
 * @returns {{ id: string, title: string, empty: string, items: object[] }[]}
 */
export function briefingSections(briefing) {
  if (!briefing || typeof briefing !== "object") return [];
  return [
    {
      id: "needsYou",
      title: "Needs you",
      empty: "Nothing waiting on you",
      items: Array.isArray(briefing.needsYou) ? briefing.needsYou : [],
    },
    {
      id: "newGrades",
      title: "New grades",
      empty: "No new grades",
      items: Array.isArray(briefing.newGrades) ? briefing.newGrades : [],
    },
    {
      id: "dueSoon",
      title: "Due soon",
      empty: "Nothing due soon",
      items: Array.isArray(briefing.dueSoon) ? briefing.dueSoon : [],
    },
    {
      id: "draftsReady",
      title: "Drafts ready",
      empty: "No drafts ready",
      items: Array.isArray(briefing.draftsReady) ? briefing.draftsReady : [],
    },
    {
      id: "announcements",
      title: "Announcements",
      empty: "No announcements",
      items: Array.isArray(briefing.announcements) ? briefing.announcements : [],
    },
  ];
}

/**
 * @param {object} item
 * @param {string} sectionId
 */
export function cardPrimaryText(item, sectionId) {
  if (!item || typeof item !== "object") return "";
  if (sectionId === "needsYou") return String(item.text || "");
  const course = item.course ? String(item.course) : "";
  const title = item.title ? String(item.title) : "";
  if (course && title) return `${course} — ${title}`;
  return title || course || String(item.text || "");
}

/**
 * @param {object} item
 * @param {string} sectionId
 */
export function cardMetaText(item, sectionId) {
  if (!item || typeof item !== "object") return "";
  if (sectionId === "newGrades") {
    if (item.score == null) return "";
    const possible = item.pointsPossible != null ? ` / ${item.pointsPossible}` : "";
    return `${item.score}${possible}`;
  }
  if (sectionId === "dueSoon") {
    const parts = [];
    if (item.dueAt) parts.push(formatShortWhen(item.dueAt));
    if (item.state) parts.push(String(item.state).replace(/_/g, " "));
    return parts.join(" · ");
  }
  if (sectionId === "draftsReady") {
    const parts = [];
    if (item.mode) parts.push(String(item.mode).replace(/_/g, " "));
    if (item.checks != null) parts.push(`${item.checks} checks`);
    return parts.join(" · ");
  }
  if (sectionId === "announcements" && item.postedAt) {
    return formatShortWhen(item.postedAt);
  }
  if (sectionId === "needsYou" && item.kind) {
    return String(item.kind).replace(/_/g, " ");
  }
  return "";
}

/** @param {string} iso */
export function formatShortWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Newest / most active first.
 * @param {object[]} jobs
 */
export function sortJobs(jobs) {
  const list = Array.isArray(jobs) ? [...jobs] : [];
  const rank = {
    running: 0,
    queued: 1,
    needs_you: 2,
    failed: 3,
    done: 4,
    cancelled: 5,
  };
  list.sort((a, b) => {
    const ra = rank[a?.status] ?? 9;
    const rb = rank[b?.status] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(b?.created_at || "").localeCompare(String(a?.created_at || ""));
  });
  return list;
}

/**
 * Merge a job.updated payload into the jobs list.
 * @param {object[]} jobs
 * @param {object} job
 */
export function upsertJob(jobs, job) {
  if (!job || !job.id) return Array.isArray(jobs) ? [...jobs] : [];
  const list = Array.isArray(jobs) ? [...jobs] : [];
  const i = list.findIndex((j) => j.id === job.id);
  if (i >= 0) list[i] = { ...list[i], ...job };
  else list.unshift(job);
  return sortJobs(list);
}

/**
 * Pull a token from a dashboard URL or raw string (QR / paste).
 * Accepts `?token=`, `#token=`, or bare token text.
 * @param {string} raw
 */
export function parseTokenInput(raw) {
  const text = String(raw || "").trim();
  if (!text) return { token: "", baseUrl: "" };
  try {
    const url = new URL(text);
    const token = url.searchParams.get("token") || "";
    if (token) {
      url.searchParams.delete("token");
      return { token, baseUrl: url.origin + (url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "")) };
    }
  } catch {
    // not a URL
  }
  const hashMatch = text.match(/[#&?]token=([^&]+)/i);
  if (hashMatch) {
    return { token: decodeURIComponent(hashMatch[1]), baseUrl: "" };
  }
  return { token: text, baseUrl: "" };
}

/**
 * @param {object|null} briefing
 * @param {{ offline?: boolean }} [opts]
 */
export function sessionLine(briefing, opts = {}) {
  if (opts.offline) return "Offline — showing last briefing";
  const session = briefing?.session?.blackboard;
  if (session === "expired") return "Blackboard signed out — sign in on the PC";
  if (session === "ok") {
    const at = briefing?.session?.lastSyncAt;
    return at ? `Session ok · synced ${formatShortWhen(at)}` : "Session ok";
  }
  if (session === "unknown") return "Session unknown";
  return "No briefing yet";
}
