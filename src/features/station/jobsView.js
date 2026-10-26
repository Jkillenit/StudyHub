/**
 * Shapes station_jobs rows for the PC jobs drawer. Pure.
 */

export const RUN_PRESET_OPTIONS = Object.freeze([
  { id: "full", label: "Full run", hint: "Sync, instructions, drafts, briefing" },
  { id: "sync", label: "Sync", hint: "Blackboard sync + briefing" },
  { id: "drafts", label: "Drafts", hint: "Instructions, drafts, briefing" },
  { id: "briefing", label: "Briefing only", hint: "Rebuild the briefing" },
]);

const TYPE_LABELS = {
  bb_sync: "Blackboard sync",
  instructions_sync: "Instructions",
  drafts_prep: "Draft prep",
  briefing_build: "Briefing",
  health_check: "Health check",
  notify_test: "Test push",
};

const ACTIVE = new Set(["queued", "running"]);

/**
 * @param {string} status
 * @returns {'danger'|'warn'|'ok'|'accent'|'muted'}
 */
export function jobStatusTone(status) {
  if (status === "failed") return "danger";
  if (status === "needs_you" || status === "cancelled") return "warn";
  if (status === "done") return "ok";
  if (status === "running") return "accent";
  return "muted";
}

function toRow(job) {
  const status = job.status || "queued";
  return {
    id: job.id,
    type: job.type,
    label: TYPE_LABELS[job.type] || job.type,
    status,
    tone: jobStatusTone(status),
    progress: Number(job.progress) || 0,
    summary: job.summary || null,
    error: job.error || null,
    source: job.source || null,
    createdAt: job.created_at || null,
    canCancel: ACTIVE.has(status),
  };
}

/**
 * @param {object[] | null | undefined} jobs
 */
export function buildJobsView(jobs) {
  const list = Array.isArray(jobs) ? [...jobs] : [];
  list.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  const rows = list.map(toRow);
  return {
    active: rows.filter((r) => ACTIVE.has(r.status)),
    recent: rows.filter((r) => !ACTIVE.has(r.status)),
    rows,
  };
}
