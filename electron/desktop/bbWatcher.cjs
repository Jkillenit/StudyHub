/**
 * Background Blackboard checks for Desktop Nova. Runs whether or not she's enabled (so Today
 * stays current); what's new is diffed against desktop_announced and handed to `onEvents`,
 * which decides whether anyone is around to say it.
 */
const { execFile } = require("child_process");

const FIRST_MIN_MS = 2 * 60000;
const FIRST_MAX_MS = 5 * 60000;
const EVERY_MIN_MS = 30 * 60000;
const EVERY_MAX_MS = 60 * 60000;
const AFTER_RESUME_MS = 90 * 1000;
const DUE_TICK_MS = 60 * 1000;
const DUE_SOON_MS = [20 * 60000, 35 * 60000];
const ANN_MAX_AGE_MS = 7 * 86400000;

const between = (a, b, random = Math.random) => a + random() * (b - a);

/**
 * What changed in one course since the last check. Pure.
 * @param opts.known Map<key, fingerprint> of this course's rows in desktop_announced
 * @param opts.seeded false on a course's first check: record everything, announce nothing
 * @returns {{ events: object[], writes: [string, string][] }}
 */
function diffCourse({ courseUuid, payload, known, seeded, now = Date.now() }) {
  const events = [];
  const writes = [];
  const see = (key, fp, event) => {
    const had = known.get(key);
    if (had === fp) return;
    writes.push([key, fp]);
    if (seeded && event) events.push(event(had));
  };

  for (const a of payload.announcements || []) {
    if (!a?.id) continue;
    const posted = Date.parse(a.postedAt || "");
    const fresh = !Number.isFinite(posted) || now - posted < ANN_MAX_AGE_MS;
    see(`ann:${courseUuid}:${a.id}`, "1", (had) => (had == null && fresh ? { kind: "announcement", courseUuid, bbId: a.id, title: a.title } : null));
  }
  for (const g of payload.gradeItems || []) {
    if (!g?.id || g.score == null) continue;
    see(`grade:${courseUuid}:${g.id}`, String(g.score), (had) => ({
      kind: "grade",
      courseUuid,
      bbId: g.id,
      title: g.name || "",
      score: g.score,
      pointsPossible: g.pointsPossible || null,
      changed: had != null,
    }));
  }
  for (const a of payload.assignments || []) {
    if (!a?.id) continue;
    const isNew = !known.has(`asg:${courseUuid}:${a.id}`);
    see(`asg:${courseUuid}:${a.id}`, "1", () => ({ kind: "assignment", courseUuid, bbId: a.id, title: a.title, dueDate: a.dueDate || null }));
    if (a.dueDate) {
      see(`due:${courseUuid}:${a.id}`, String(a.dueDate), (had) =>
        had != null && !isNew ? { kind: "dueChanged", courseUuid, bbId: a.id, title: a.title, dueDate: a.dueDate } : null
      );
    }
  }
  return { events: events.filter(Boolean), writes };
}

/** Assignments due 20–35 minutes from now that haven't been flagged yet. Pure. */
function dueSoon(rows, known, now = Date.now()) {
  return rows
    .filter((r) => r.due_date && String(r.due_date).length > 10)
    .map((r) => ({ r, at: Date.parse(r.due_date) }))
    .filter(({ r, at }) => {
      const left = at - now;
      return Number.isFinite(at) && left >= DUE_SOON_MS[0] && left <= DUE_SOON_MS[1] && known.get(`due30:${r.uuid}`) !== r.due_date;
    })
    .map(({ r, at }) => ({ kind: "due30", courseUuid: r.course_uuid, uuid: r.uuid, title: r.title, dueDate: r.due_date, expiresAt: at }));
}

const COST_SCRIPT =
  "$p=[Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile();" +
  "if(-not $p){'none'}else{$c=$p.GetConnectionCost();'{0}|{1}|{2}' -f $c.NetworkCostType,$c.Roaming,$c.OverDataLimit}";

/** "offline" | "metered" | "ok". Metered = Fixed/Variable cost, roaming, or over the data limit. */
function parseCost(out) {
  const s = String(out || "").trim();
  if (s === "none") return "offline";
  const [type, roaming, over] = s.split("|");
  if (/^(Fixed|Variable)$/i.test(type) || /true/i.test(roaming) || /true/i.test(over)) return "metered";
  return "ok";
}

function connectionCost() {
  if (process.platform !== "win32") return Promise.resolve("ok");
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", COST_SCRIPT], { timeout: 5000, windowsHide: true }, (err, out) =>
      resolve(err ? "ok" : parseCost(out))
    );
  });
}

/**
 * @param deps.db () => better-sqlite3 handle
 * @param deps.check (bbCourseId) => Promise<{ ok, error?, courseUuid?, payload? }>
 * @param deps.onEvents (events[]) => void
 * @param deps.onChecked (courseUuid) => void   after a course's mirror was refreshed
 * @param deps.onSession ("expired" | "ok") => void
 */
function createBbWatcher({ db, check, onEvents, onChecked = () => {}, onSession = () => {}, cost = connectionCost, random = Math.random }) {
  let timer = null;
  let dueTimer = null;
  let running = false;
  let stopped = true;

  const esc = (s) => String(s).replace(/[%_\\]/g, "\\$&");
  const knownLike = (pattern) =>
    new Map(db().prepare("SELECT key, fingerprint FROM desktop_announced WHERE key LIKE ? ESCAPE '\\'").all(pattern).map((r) => [r.key, r.fingerprint]));

  function record(writes) {
    if (!writes.length) return;
    const stmt = db().prepare(
      "INSERT INTO desktop_announced (key, fingerprint, announced_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET fingerprint = excluded.fingerprint, announced_at = excluded.announced_at"
    );
    db().transaction(() => writes.forEach(([k, fp]) => stmt.run(k, fp)))();
  }

  async function runOnce() {
    if (running) return;
    running = true;
    try {
      if ((await cost()) !== "ok") return;
      const courses = db().prepare("SELECT uuid, bb_course_id FROM courses WHERE bb_course_id IS NOT NULL AND bb_course_id != ''").all();
      const events = [];
      for (const c of courses) {
        if (stopped) return;
        const res = await check(c.bb_course_id);
        if (res?.error === "not-logged-in") return onSession("expired");
        if (!res?.ok) continue;
        onSession("ok");
        const known = knownLike(`%:${esc(c.uuid)}:%`);
        const seedKey = `seed:${c.uuid}:`;
        const { events: found, writes } = diffCourse({ courseUuid: c.uuid, payload: res.payload, known, seeded: known.has(seedKey) });
        record(known.has(seedKey) ? writes : [...writes, [seedKey, "1"]]);
        events.push(...found);
        onChecked(c.uuid);
      }
      if (events.length) onEvents(events);
    } finally {
      running = false;
    }
  }

  function schedule(ms) {
    clearTimeout(timer);
    if (stopped) return;
    timer = setTimeout(async () => {
      await runOnce().catch(() => {});
      schedule(between(EVERY_MIN_MS, EVERY_MAX_MS, random));
    }, ms);
  }

  function dueTick() {
    try {
      const rows = db()
        .prepare(
          `SELECT a.uuid, a.title, a.due_date, c.uuid AS course_uuid FROM assignments a JOIN courses c ON c.id = a.course_id
           WHERE COALESCE(a.completed, 0) = 0 AND a.due_date IS NOT NULL AND a.due_date BETWEEN ? AND ?`
        )
        .all(new Date(Date.now() - 86400000).toISOString().slice(0, 10), new Date(Date.now() + 2 * 86400000).toISOString());
      const found = dueSoon(rows, knownLike("due30:%"));
      record(found.map((e) => [`due30:${e.uuid}`, e.dueDate]));
      if (found.length) onEvents(found);
    } catch {
      /* a missed tick is retried next minute */
    }
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      schedule(between(FIRST_MIN_MS, FIRST_MAX_MS, random));
      dueTimer = setInterval(dueTick, DUE_TICK_MS);
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      clearInterval(dueTimer);
    },
    resumed() {
      schedule(AFTER_RESUME_MS);
    },
    runOnce,
  };
}

module.exports = { createBbWatcher, diffCourse, dueSoon, parseCost, connectionCost };
