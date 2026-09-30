/**
 * Desktop Nova wiring: settings, power events, tray, main-window lifetime (close to tray) and
 * the desktop:* / overlay:* IPC. Everything here is off until the student enables it, except
 * the tray and close-to-tray, which keep the app alive for background Blackboard checks.
 */
const { app, ipcMain, powerMonitor, screen, dialog } = require("electron");
const fs = require("fs");
const path = require("path");
const settings = require("./desktopSettings.cjs");
const { snapshot, displays } = require("./winProbe.cjs");
const { createHideWatcher, shouldHide, loadMatchers } = require("./autoHide.cjs");
const { createOverlays } = require("./overlay.cjs");
const { createNova } = require("./novaState.cjs");
const { createSpeech } = require("./speech.cjs");
const { createTray } = require("./tray.cjs");
const { createBbWatcher } = require("./bbWatcher.cjs");
const { getDb } = require("../database.cjs");

const PACK_ID = "nova";
const FPS_AC = 15;
const FPS_BATTERY = 5;
/** Hide reasons that make the auto-hide probe pointless until they clear. */
const PROBE_OFF = ["locked", "asleep", "manual", "app"];
const USER_KEYS = new Set(["enabled", "hideInMeetings", "size", "startWithWindows", "level", "notify"]);
const GRADE_HOLD_RETRY_MS = 60 * 1000;
const TODAY = [{ id: "today", label: "Open Today" }];
const CLICK_BUTTONS = [
  { id: "hide1h", label: "Hide 1 hr" },
  { id: "tomorrow", label: "Until tomorrow" },
  { id: "open", label: "Open Study Hub" },
];

function readPack(id) {
  const base = path.join(__dirname, "..", "..", "dist", "personas", id);
  const json = (p) => JSON.parse(fs.readFileSync(path.join(base, p), "utf8"));
  const pack = json("pack.json");
  return { pack, frames: json(pack.sprites), lines: json(pack.lines) };
}

function tomorrowMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(6, 0, 0, 0);
  return d;
}

const clip = (s, n = 60) => {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const num = (v) => String(Math.round(Number(v) * 10) / 10);

function courseInfo(uuid) {
  try {
    const c = getDb().prepare("SELECT name, course_code, target_grade FROM courses WHERE uuid = ?").get(uuid);
    return c ? { label: clip(c.course_code || c.name, 30), target: Number.isFinite(c.target_grade) ? c.target_grade : 80 } : null;
  } catch {
    return null;
  }
}

function formatDue(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "a new date" : d.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Feet position that puts her in the middle of the focused window, or null. */
function activeWindowSpot() {
  try {
    const fg = snapshot().foreground;
    if (!fg || fg.minimized || fg.pid === process.pid || fg.bounds.width < 300 || fg.bounds.height < 300) return null;
    return { x: fg.bounds.x + fg.bounds.width / 2, y: fg.bounds.y + fg.bounds.height * 0.6 };
  } catch {
    return null;
  }
}

function markSaid(lineId) {
  try {
    getDb()
      .prepare("INSERT INTO companion_said (line_id, said_at) VALUES (?, ?) ON CONFLICT(line_id) DO UPDATE SET said_at = excluded.said_at")
      .run(String(lineId).slice(0, 120), new Date().toISOString());
  } catch {
    /* history is best effort */
  }
}

function registerDesktop({ getMainWindow, showMainWindow }) {
  let quitting = false;
  let overlays = null;
  let nova = null;
  let speech = null;
  let watcher = null;
  let manualTimer = null;
  let reflowTimer = null;
  let lastReasons = [];
  let bb = null;
  let bbWatch = null;
  let heldGrades = [];
  let heldTimer = null;
  let expiredSaid = false;
  let meetingMatchers = null;

  const running = () => !!nova;
  const mainSender = (evt) => getMainWindow()?.webContents === evt.sender;

  function status() {
    return {
      enabled: settings.get().enabled,
      running: running(),
      hidden: nova ? nova.hidden() : true,
      reasons: nova ? nova.reasons() : [],
      autoReason: watcher?.state.reason || null,
    };
  }

  function pushStatus() {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) win.webContents.send("nova:state", status());
  }

  function syncWatcher() {
    if (!watcher) return;
    const off = !nova || nova.reasons().some((r) => PROBE_OFF.includes(r));
    if (off) watcher.stop();
    else watcher.start();
  }

  function applyManual() {
    clearTimeout(manualTimer);
    if (!nova) return;
    const until = Date.parse(settings.get().hiddenUntil || "");
    if (Number.isFinite(until) && until > Date.now()) {
      nova.setHidden("manual", true);
      manualTimer = setTimeout(() => settings.set({ hiddenUntil: null }), Math.min(until - Date.now(), 2 ** 31 - 1));
    } else {
      if (settings.get().hiddenUntil) return void settings.set({ hiddenUntil: null });
      nova.setHidden("manual", false);
    }
  }

  function syncAppWindow() {
    const win = getMainWindow();
    const inApp = !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && win.isFocused();
    nova?.setHidden("app", inApp);
  }

  function onHiddenChange({ hidden, reasons }) {
    const prev = lastReasons;
    lastReasons = reasons;
    syncWatcher();
    pushStatus();
    if (hidden || !speech) return;
    if (prev.includes("app")) nova.wave();
    if (!speech.flushOne() && (prev.includes("auto") || prev.includes("manual"))) {
      speech.say({ lineId: "desktop.return", unprompted: true });
    }
  }

  /** Grades wait out meetings and screen shares even when she isn't set to hide for them. */
  function inMeeting() {
    try {
      meetingMatchers = meetingMatchers || loadMatchers();
      return shouldHide(snapshot(), displays(), meetingMatchers, { meetings: true, ownPid: process.pid }).hide;
    } catch {
      return false;
    }
  }

  function flushGrades() {
    clearTimeout(heldTimer);
    if (!nova || !heldGrades.length) return;
    if (inMeeting()) {
      heldTimer = setTimeout(flushGrades, GRADE_HOLD_RETRY_MS);
      return;
    }
    const list = heldGrades;
    heldGrades = [];
    for (const g of list) {
      speech.say({
        lineId: g.changed ? "desktop.gradeChanged" : "desktop.gradeEnvelope",
        priority: 3,
        vars: g.vars,
        ms: 20000,
        buttons: [
          { id: "reveal", label: "Open it" },
          { id: "later", label: "Later" },
        ],
        extra: { pose: "holdEnvelope", prop: { kind: "envelope" }, data: { action: "reveal", grade: g } },
      });
    }
  }

  function revealGrade(g) {
    const pct = g.pointsPossible ? (g.score / g.pointsPossible) * 100 : null;
    const score = g.pointsPossible ? `${num(g.score)}/${num(g.pointsPossible)}` : num(g.score);
    let lineId = "desktop.gradePlain";
    if (pct != null) lineId = pct >= g.target ? "desktop.gradeGood" : pct >= g.target - 5 ? "desktop.gradeOk" : "desktop.gradeLow";
    nova.clearBubble();
    speech.say({
      lineId,
      priority: 3,
      vars: { ...g.vars, score },
      buttons: [{ id: "grades", label: lineId === "desktop.gradeLow" ? "Show me" : "See grades" }],
      extra: { pose: lineId === "desktop.gradeGood" ? "celebrate" : undefined, data: { action: "grades", courseUuid: g.courseUuid } },
    });
  }

  /** Checks run with or without her; she only speaks when Desktop Nova is on. */
  function onBbEvents(events) {
    if (!nova) return;
    const on = settings.get().notify;
    for (const e of events) {
      const c = courseInfo(e.courseUuid);
      if (!c) continue;
      const vars = { course: c.label, item: clip(e.title, 50) };
      const data = { action: "today" };
      if (e.kind === "grade" && on.grades) heldGrades.push({ ...e, vars, target: c.target });
      else if (e.kind === "announcement" && on.announcements) {
        speech.say({
          lineId: "desktop.announcement",
          priority: 2,
          vars,
          buttons: [{ id: "course", label: "Open" }],
          extra: { pose: "holdSign", prop: { kind: "sign", text: clip(e.title, 48) }, data: { action: "course", courseUuid: e.courseUuid } },
        });
      } else if (e.kind === "assignment" && on.assignments) {
        speech.say({ lineId: "desktop.assignment", priority: 2, vars, buttons: TODAY, extra: { data } });
      } else if (e.kind === "dueChanged" && on.assignments) {
        speech.say({ lineId: "desktop.dueChanged", priority: 2, vars: { ...vars, due: formatDue(e.dueDate) }, buttons: TODAY, extra: { data } });
      } else if (e.kind === "due30" && on.due) {
        speech.say({ lineId: "desktop.due30", priority: 4, vars, expiresAt: e.expiresAt, buttons: TODAY, extra: { pose: "tapGlass", at: activeWindowSpot(), data } });
      }
    }
    flushGrades();
  }

  function onBbSession(state) {
    if (state === "ok") {
      expiredSaid = false;
      if (settings.get().bbDisconnected) settings.set({ bbDisconnected: false });
      return;
    }
    if (!nova || expiredSaid || settings.get().bbDisconnected) return;
    expiredSaid = true;
    speech.say({
      lineId: "desktop.bbExpired",
      priority: 1,
      buttons: [
        { id: "bbLogin", label: "Log in" },
        { id: "later", label: "Later" },
      ],
      extra: { data: { action: "bbLogin" } },
    });
  }

  function runAction(data) {
    if (data.action === "bbLogin") return bb?.openLogin();
    showMainWindow();
    const to = data.action === "grades" ? { courseUuid: data.courseUuid, tab: "grades" } : data.action === "course" ? { courseUuid: data.courseUuid, item: "course-announcements" } : { view: "today" };
    getMainWindow()?.webContents.send("desktop:navigate", to);
  }

  function onDisplaysChanged() {
    clearTimeout(reflowTimer);
    reflowTimer = setTimeout(() => {
      if (!nova) return;
      overlays.build();
      nova.reflow();
    }, 300);
  }

  function start() {
    if (nova) return;
    let packData;
    try {
      packData = readPack(PACK_ID);
    } catch {
      return;
    }
    const { pack, frames, lines } = packData;
    overlays = createOverlays({ onReady: () => nova?.broadcast() });
    nova = createNova({ overlays, frames, pack, packId: PACK_ID, settings: settings.get, companion: settings.companion, onHiddenChange });
    speech = createSpeech({
      lines,
      show: (bubble, ms) => nova.showBubble(bubble, ms, () => speech?.flushOne()),
      isHidden: () => !nova || nova.hidden(),
      companion: settings.companion,
      name: settings.studentName,
      level: () => settings.get().level,
      markSaid,
      busy: () => !!nova?.bubble()?.data,
    });
    watcher = createHideWatcher({
      probe: () => ({ snap: snapshot(), displays: displays() }),
      getOpts: () => ({ meetings: settings.get().hideInMeetings, ownPid: process.pid }),
      onChange: ({ hidden }) => {
        nova?.setHidden("auto", hidden);
        pushStatus();
      },
    });
    overlays.build();
    overlays.show();
    nova.setFps(powerMonitor.isOnBatteryPower() ? FPS_BATTERY : FPS_AC);
    applyManual();
    syncAppWindow();
    syncWatcher();
    nova.arrive(() => speech?.say({ lineId: "desktop.arrive" }));
    screen.on("display-added", onDisplaysChanged);
    screen.on("display-removed", onDisplaysChanged);
    screen.on("display-metrics-changed", onDisplaysChanged);
    pushStatus();
  }

  function stop() {
    if (!nova) return;
    watcher.stop();
    nova.stop();
    overlays.destroyAll();
    clearTimeout(manualTimer);
    clearTimeout(reflowTimer);
    clearTimeout(heldTimer);
    heldGrades = [];
    screen.removeListener("display-added", onDisplaysChanged);
    screen.removeListener("display-removed", onDisplaysChanged);
    screen.removeListener("display-metrics-changed", onDisplaysChanged);
    nova = null;
    speech = null;
    watcher = null;
    overlays = null;
    lastReasons = [];
    pushStatus();
  }

  function applyLogin(on) {
    if (!app.isPackaged) return;
    app.setLoginItemSettings({ openAtLogin: !!on, args: ["--hidden"] });
  }

  function hide(kind) {
    if (!settings.get().enabled) return;
    const until = kind === "tomorrow" ? tomorrowMorning() : new Date(Date.now() + 3600000);
    const said = speech?.say({ lineId: kind === "tomorrow" ? "desktop.hideTomorrow" : "desktop.hideHour" });
    setTimeout(() => settings.set({ hiddenUntil: until.toISOString() }), said === "shown" ? 1800 : 0);
  }

  function showNova() {
    settings.set({ hiddenUntil: null });
  }

  function openSettings() {
    showMainWindow();
    getMainWindow()?.webContents.send("desktop:open-settings");
  }

  function quit() {
    quitting = true;
    app.quit();
  }

  settings.events.on("change", (next, prev) => {
    if (next.enabled !== prev.enabled) (next.enabled ? start : stop)();
    if (next.startWithWindows !== prev.startWithWindows) applyLogin(next.startWithWindows);
    if (next.hiddenUntil !== prev.hiddenUntil) applyManual();
    if (next.size !== prev.size) nova?.reflow();
    pushStatus();
  });

  powerMonitor.on("lock-screen", () => nova?.setHidden("locked", true));
  powerMonitor.on("unlock-screen", () => nova?.setHidden("locked", false));
  powerMonitor.on("suspend", () => nova?.setHidden("asleep", true));
  powerMonitor.on("resume", () => {
    nova?.setHidden("asleep", false);
    applyManual();
    bbWatch?.resumed();
  });
  powerMonitor.on("on-battery", () => nova?.setFps(FPS_BATTERY));
  powerMonitor.on("on-ac", () => nova?.setFps(FPS_AC));
  app.on("before-quit", () => {
    quitting = true;
  });

  const tray = createTray({
    packId: PACK_ID,
    actions: { show: showNova, hide, open: showMainWindow, settings: openSettings, quit },
    status: () => ({ desktopEnabled: settings.get().enabled }),
  });

  ipcMain.handle("desktop:getSettings", () => ({ settings: settings.get(), status: status() }));
  ipcMain.handle("desktop:setSettings", (evt, patch) => {
    if (!mainSender(evt)) return null;
    const clean = Object.fromEntries(Object.entries(patch || {}).filter(([k]) => USER_KEYS.has(k)));
    return { settings: settings.set(clean), status: status() };
  });
  ipcMain.handle("desktop:hide", (evt, args) => {
    if (!mainSender(evt)) return { ok: false };
    hide(args?.for === "tomorrow" ? "tomorrow" : "1h");
    return { ok: true };
  });
  ipcMain.handle("desktop:show", (evt) => {
    if (!mainSender(evt)) return { ok: false };
    showNova();
    return { ok: true };
  });

  const fromOverlay = (evt) => (overlays ? overlays.displayOf(evt.sender) : null);
  ipcMain.on("overlay:ready", (evt) => {
    if (fromOverlay(evt) != null) nova?.broadcast();
  });
  ipcMain.on("overlay:hit", (evt, over) => {
    const id = fromOverlay(evt);
    if (id != null) overlays.setInteractive(id, !!over);
  });
  ipcMain.on("overlay:prefs", (evt, prefs) => {
    if (fromOverlay(evt) != null) nova?.setReducedMotion(!!prefs?.reducedMotion);
  });
  ipcMain.on("overlay:click", (evt, data) => {
    if (fromOverlay(evt) == null || !nova) return;
    const button = data?.button;
    const note = nova.bubble()?.data;
    if (note) {
      const action = button || note.action;
      if (action === "reveal") return revealGrade(note.grade);
      nova.clearBubble();
      if (action !== "later") runAction(note);
      speech.flushOne();
      return;
    }
    if (button === "hide1h") return hide("1h");
    if (button === "tomorrow") return hide("tomorrow");
    if (button === "open") {
      nova.clearBubble();
      return showMainWindow();
    }
    speech.say({ lineId: "desktop.click", buttons: CLICK_BUTTONS });
  });
  ipcMain.on("overlay:menu", (evt) => {
    const id = fromOverlay(evt);
    if (id != null) tray.menu().popup({ window: overlays.window(id) });
  });
  ipcMain.on("overlay:drag", (evt, d) => {
    const id = fromOverlay(evt);
    if (id == null || !nova || !["start", "move", "end"].includes(d?.phase)) return;
    nova.drag(d.phase, Number(d.x) || 0, Number(d.y) || 0);
    if (d.phase === "start" && Math.random() < 0.5) speech.say({ lineId: "desktop.picked" });
    if (d.phase === "end") {
      overlays.setInteractive(id, false);
      if (Math.random() < 0.5) speech.say({ lineId: "desktop.dropped" });
    }
  });

  if (settings.get().enabled) start();

  return {
    isQuitting: () => quitting,
    /** Background Blackboard checks start here, whether or not Desktop Nova is on. */
    attachBlackboard(handle) {
      bb = handle;
      bbWatch = createBbWatcher({
        db: getDb,
        check: (id) => bb.backgroundCheck(id),
        onEvents: onBbEvents,
        onSession: onBbSession,
        onChecked: (courseUuid) => {
          const win = getMainWindow();
          if (win && !win.isDestroyed()) win.webContents.send("desktop:bb-checked", { courseUuid });
        },
      });
      bbWatch.start();
    },
    bbDisconnected() {
      settings.set({ bbDisconnected: true });
    },
    /** Close hides to the tray (explained once); focus and minimize hand Nova between app and desktop. */
    attachMainWindow(win) {
      win.on("close", (e) => {
        if (quitting) return;
        e.preventDefault();
        win.hide();
        if (settings.get().closeToTrayExplained) return;
        settings.set({ closeToTrayExplained: true });
        if (nova) {
          setTimeout(() => speech?.say({ lineId: "desktop.trayNotice", priority: 1 }), 600);
        } else {
          void dialog.showMessageBox({
            type: "info",
            message: "Study Hub is still running",
            detail: "It stays in the tray so it can keep checking Blackboard. Use Quit in the tray menu to close it completely.",
            buttons: ["OK"],
          });
        }
      });
      win.on("focus", () => {
        if (nova && win.isVisible() && !win.isMinimized()) nova.enterApp(win.getBounds());
      });
      win.on("minimize", () => nova?.leaveApp(win.getNormalBounds()));
      win.on("hide", () => nova?.leaveApp(win.getNormalBounds()));
    },
  };
}

module.exports = { registerDesktop };
