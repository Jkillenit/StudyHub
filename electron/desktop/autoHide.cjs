/**
 * Decides whether Desktop Nova must be hidden: fullscreen apps, games, presentations, calls and
 * screen shares. Pure; the result carries only a reason code, never the matched title.
 */
const SHELL_CLASSES = new Set(["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"]);
/** SHQueryUserNotificationState: 2 busy (fullscreen), 3 Direct3D fullscreen, 4 presentation mode. */
const NOTIF_REASON = { 2: "fullscreen", 3: "game", 4: "present" };
const EDGE_TOLERANCE = 2;

function loadMatchers() {
  return compileMatchers(require("./hideMatchers.json"));
}

function compileMatchers(list) {
  return list.map((m) => ({
    reason: m.reason,
    exe: m.exe ? new RegExp(m.exe, "i") : null,
    cls: m.cls ? new RegExp(m.cls) : null,
    title: m.title ? new RegExp(m.title, "i") : null,
  }));
}

function matches(m, w) {
  if (m.exe && !m.exe.test(w.exe || "")) return false;
  if (m.cls && !m.cls.test(w.cls || "")) return false;
  if (m.title && !m.title.test(w.title || "")) return false;
  return !!(m.exe || m.cls || m.title);
}

function coversDisplay(b, d) {
  const db = d.bounds;
  return (
    Math.abs(b.x - db.x) <= EDGE_TOLERANCE &&
    Math.abs(b.y - db.y) <= EDGE_TOLERANCE &&
    b.width >= db.width - EDGE_TOLERANCE &&
    b.height >= db.height - EDGE_TOLERANCE
  );
}

/**
 * @param snap winProbe.snapshot() result
 * @param displays winProbe.displays() result
 * @param matchers compiled matcher list
 * @param opts { meetings: boolean (hide during calls/shares), ownPid: number }
 * @returns {{ hide: boolean, reason: string | null }}
 */
function shouldHide(snap, displays, matchers, opts = {}) {
  const { meetings = true, ownPid = -1 } = opts;
  const reason = NOTIF_REASON[snap?.notifState];
  if (reason) return { hide: true, reason };

  const fg = snap?.foreground;
  if (fg && fg.pid !== ownPid && !fg.minimized && !fg.cloaked && !SHELL_CLASSES.has(fg.cls)) {
    if ((displays || []).some((d) => coversDisplay(fg.bounds, d))) return { hide: true, reason: "fullscreen" };
  }

  if (meetings) {
    for (const w of snap?.windows || []) {
      if (w.cloaked || w.pid === ownPid) continue;
      const hit = matchers.find((m) => matches(m, w));
      if (hit) return { hide: true, reason: hit.reason };
    }
  }
  return { hide: false, reason: null };
}

/**
 * Polls once a second while started. Hides at once; shows again only after `clearMs` with nothing detected.
 * `probe()` returns { snap, displays }, `getOpts()` the shouldHide options.
 */
function createHideWatcher({ probe, getOpts, onChange, intervalMs = 1000, clearMs = 3000, matchers = loadMatchers() }) {
  let timer = null;
  let hidden = false;
  let reason = null;
  let clearSince = 0;

  function tick() {
    let res;
    try {
      const { snap, displays } = probe();
      res = shouldHide(snap, displays, matchers, getOpts());
    } catch {
      res = { hide: false, reason: null };
    }
    const now = Date.now();
    if (res.hide) {
      clearSince = 0;
      if (!hidden || reason !== res.reason) {
        hidden = true;
        reason = res.reason;
        onChange({ hidden, reason });
      }
    } else if (hidden) {
      if (!clearSince) clearSince = now;
      if (now - clearSince >= clearMs) {
        hidden = false;
        reason = null;
        onChange({ hidden, reason });
      }
    }
  }

  return {
    start() {
      if (timer) return;
      tick();
      timer = setInterval(tick, intervalMs);
    },
    stop() {
      clearInterval(timer);
      timer = null;
    },
    get state() {
      return { hidden, reason };
    },
  };
}

module.exports = { shouldHide, compileMatchers, loadMatchers, createHideWatcher };
