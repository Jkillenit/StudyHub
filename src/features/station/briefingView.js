/**
 * Shapes a Station Briefing (§3.3) for the PC Briefing panel. Pure.
 */

const SECTION_ORDER = [
  { id: "needsYou", title: "Needs you", map: mapNeedsYou },
  { id: "newGrades", title: "New grades", map: mapGrade },
  { id: "draftsReady", title: "Drafts ready", map: mapDraft },
  { id: "dueSoon", title: "Due soon", map: mapDue },
  { id: "announcements", title: "Announcements", map: mapAnnouncement },
];

function mapNeedsYou(item) {
  return { primary: item.text || "Needs you", secondary: item.kind || "", ref: item.ref || null };
}

function mapGrade(item) {
  const score = item.score != null && item.pointsPossible != null ? `${item.score}/${item.pointsPossible}` : item.score != null ? String(item.score) : "";
  return {
    primary: [item.course, item.title].filter(Boolean).join(" · "),
    secondary: score,
  };
}

function mapDraft(item) {
  return {
    primary: [item.course, item.title].filter(Boolean).join(" · "),
    secondary: [item.mode, item.checks != null ? `${item.checks} checks` : null].filter(Boolean).join(" · "),
    ref: item.draftId || null,
  };
}

function mapDue(item) {
  return {
    primary: [item.course, item.title].filter(Boolean).join(" · "),
    secondary: [item.state, item.dueAt].filter(Boolean).join(" · "),
    ref: item.draftId || null,
  };
}

function mapAnnouncement(item) {
  return {
    primary: [item.course, item.title].filter(Boolean).join(" · "),
    secondary: item.postedAt || "",
  };
}

function sessionLabel(session) {
  const state = session?.blackboard || "unknown";
  if (state === "expired") return "Blackboard signed out — sign in on the PC";
  if (state === "ok") {
    return session.lastSyncAt ? `Session ok · synced ${session.lastSyncAt}` : "Session ok";
  }
  return "Session unknown";
}

/**
 * @param {import('../../../electron/station/contracts.cjs').Briefing | null | undefined} briefing
 */
export function buildBriefingView(briefing) {
  if (!briefing || typeof briefing !== "object") return null;

  const sections = [];
  for (const def of SECTION_ORDER) {
    const raw = Array.isArray(briefing[def.id]) ? briefing[def.id] : [];
    if (!raw.length) continue;
    sections.push({
      id: def.id,
      title: def.title,
      items: raw.map(def.map),
    });
  }

  const jobs = briefing.jobs || { ran: 0, failed: 0, failures: [] };
  const failed = Number(jobs.failed) || 0;
  const ran = Number(jobs.ran) || 0;
  let jobsSummary = `${ran} job${ran === 1 ? "" : "s"} ran`;
  if (failed > 0) jobsSummary += ` · ${failed} failed`;

  const spend = briefing.aiSpend || { todayCents: 0, capCents: 150 };
  const todayCents = Number(spend.todayCents) || 0;
  const capCents = Number(spend.capCents) || 150;

  return {
    headline: String(briefing.headline || ""),
    kind: briefing.kind || "on_demand",
    generatedAt: briefing.generatedAt || null,
    session: {
      blackboard: briefing.session?.blackboard || "unknown",
      lastSyncAt: briefing.session?.lastSyncAt || null,
      label: sessionLabel(briefing.session),
    },
    sections,
    jobsSummary,
    aiSpend: {
      todayCents,
      capCents,
      label: `${todayCents}¢ of ${capCents}¢ today`,
    },
  };
}
