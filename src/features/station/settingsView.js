/**
 * Station settings form shaping + patch validation. Pure.
 */

export const DRAFT_MODES = Object.freeze(["off", "outline", "rough_draft"]);

const DRAFT_MODE_SET = new Set(DRAFT_MODES);
const DEFAULT_DRAFT_MODE = "outline";

function asBool(v) {
  return v === true || v === 1 || v === "1" || v === "true";
}

function parseCapCents(raw) {
  if (raw == null || raw === "") return 150;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 150;
}

/**
 * @param {object} raw
 * @param {{ uuid: string, name?: string, courseCode?: string }[]} [courses]
 */
export function buildSettingsView(raw = {}, courses = []) {
  const draftModes = raw.draftModes && typeof raw.draftModes === "object" ? raw.draftModes : {};
  return {
    enabled: asBool(raw.enabled),
    hasToken: Boolean(raw.tokenHash),
    ntfyUrl: raw.ntfyUrl || "https://ntfy.sh",
    ntfyTopic: raw.ntfyTopic || "",
    pushDetails: asBool(raw.pushDetails),
    aiCapCents: parseCapCents(raw.aiCapCents),
    cloudModel: raw.cloudModel || "claude-sonnet-5-5",
    preferLocal: asBool(raw.preferLocal == null ? "1" : raw.preferLocal),
    localModel: raw.localModel || "llama3.2",
    allowOpus: asBool(raw.allowOpus),
    morningBriefAt: raw.morningBriefAt || "06:45",
    courseDraftModes: (courses || []).map((c) => ({
      courseUuid: c.uuid,
      name: c.name || c.courseCode || c.uuid,
      mode: DRAFT_MODE_SET.has(draftModes[c.uuid]) ? draftModes[c.uuid] : DEFAULT_DRAFT_MODE,
    })),
  };
}
