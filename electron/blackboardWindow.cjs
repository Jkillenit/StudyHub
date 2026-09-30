const { app, BrowserWindow, session, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { getDb } = require("./database.cjs");
const { applyBbSync, ensureCourseForBb } = require("./dbMirrorHandlers.cjs");
const {
  BB_PARTITION,
  BB_ORIGIN: BB_URL,
  getJson,
  listEnrolledCourses,
  syncCourse,
  checkCourse,
  resetUserCache,
  setPageFetcher,
  getCourseInfo,
} = require("./bbSync.cjs");

let bbWindow = null;
const syllabusPopups = new Set();
let extractBufferText = null;
let getMainWindow = () => null;
let allowPaths = () => {};
let onDisconnect = () => {};
let activeCourseId = "";
let awaitBBDownload = null;

/** filename → { resolve, reject, timeoutId } for BB will-download interceptor */
const bbPendingDownloads = new Map();
let bbWillDownloadListenerAttached = false;

const BB_TEMP_DIR = path.join(app.getPath("temp"), "studyhub-bb");
const BB_TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isBlackboardUrl(url) {
  try {
    const u = new URL(String(url || ""));
    return u.protocol === "https:" && (u.hostname === "blackboard.com" || u.hostname.endsWith(".blackboard.com"));
  } catch {
    return false;
  }
}

/** Only the Blackboard window, while showing a *.blackboard.com page, may drive imports. */
function isTrustedBbSender(event) {
  if (!bbWindow || bbWindow.isDestroyed()) return false;
  if (event?.sender !== bbWindow.webContents) return false;
  return isBlackboardUrl(event.senderFrame?.url || bbWindow.webContents.getURL());
}

function isMainWindowSender(event) {
  const win = getMainWindow();
  return !!win && !win.isDestroyed() && event?.sender === win.webContents;
}

function isAllowedImportUrl(fileUrl) {
  const value = String(fileUrl || "");
  return value.startsWith("bb-content-id:") || isBlackboardUrl(value);
}

function cleanupTempDir() {
  try {
    if (!fs.existsSync(BB_TEMP_DIR)) return;
    const cutoff = Date.now() - BB_TEMP_MAX_AGE_MS;
    fs.readdirSync(BB_TEMP_DIR).forEach((name) => {
      const full = path.join(BB_TEMP_DIR, name);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
      } catch {
        /* in use */
      }
    });
  } catch {
    /* ignore */
  }
}

function sendToMain(channel, payload) {
  const win = getMainWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/** Page scripts live in bbInject/ as single function expressions; args are JSON-encoded at the call site. */
const readInjected = (name) => fs.readFileSync(path.join(__dirname, "bbInject", name), "utf8");
const PAGE_SCRIPT = readInjected("page.js");
const CLICK_DOWNLOAD_SCRIPT = readInjected("clickDownload.js");
const callInjected = (script, ...args) => `(\n${script}\n)(${args.map((a) => JSON.stringify(a)).join(", ")})`;

async function isLoggedIn() {
  const bbSession = session.fromPartition(BB_PARTITION);
  const cookies = await bbSession.cookies.get({
    domain: new URL(BB_URL).hostname,
  });
  return cookies.some(
    (c) => c.name === "BbRouter" || c.name === "BBLEARN_Login_Code" || c.name === "bbdlicd"
  );
}

function parseCourseFromUrl(url) {
  const match = String(url || "").match(/\/ultra\/courses\/(_\d+_\d+)\//);
  if (!match) return null;
  return { bbCourseId: match[1], url };
}

function displayLinkedCourseName(pageBbCourseId) {
  if (!pageBbCourseId) return "";
  try {
    return getDb().prepare("SELECT name FROM courses WHERE bb_course_id = ? LIMIT 1").get(pageBbCourseId)?.name || "";
  } catch {
    return "";
  }
}

/* ---------------- syllabus capture (Simple Syllabus and other LTI tools) ---------------- */

const SYLLABUS_HOST_RE = /(^|\.)simplesyllabus\.com$/i;
const LTI_LAUNCH_RE = /\/webapps\/blackboard\/execute\/blti\//i;
const LTI_TIMEOUT_MS = 15000;
const TAB_FIND_TIMEOUT_MS = 15000;
const TAB_LOAD_TIMEOUT_MS = 25000;
const SYLLABUS_LAUNCH_KEY = "bb.syllabusLaunch";
const HIDDEN_PREFS = {
  partition: BB_PARTITION,
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: true,
  backgroundThrottling: false,
};

function withTimeout(promise, ms, fallback) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(fallback), ms))]);
}

function readSyllabusLaunches() {
  try {
    const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(SYLLABUS_LAUNCH_KEY);
    return JSON.parse(row?.value || "{}") || {};
  } catch {
    return {};
  }
}

/** Remembers the Blackboard LTI launch that opened a syllabus page: per course, plus a course-agnostic template. */
function rememberSyllabusLaunch(launchUrl) {
  let u;
  try {
    u = new URL(launchUrl);
  } catch {
    return;
  }
  const courseId = u.searchParams.get("course_id");
  if (!/^_\d+_\d+$/.test(String(courseId || ""))) return;
  const relative = u.pathname + u.search;
  const data = readSyllabusLaunches();
  data.byCourse = { ...(data.byCourse || {}), [courseId]: relative };
  if (!u.searchParams.has("content_id")) data.template = relative.replace(/course_id=[^&]+/, "course_id={COURSE}");
  try {
    getDb()
      .prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
      )
      .run(SYLLABUS_LAUNCH_KEY, JSON.stringify(data));
  } catch {
    /* best effort */
  }
}

function syllabusLaunchFor(bbCourseId) {
  const data = readSyllabusLaunches();
  if (data.byCourse?.[bbCourseId]) return data.byCourse[bbCourseId];
  return data.template ? data.template.replace("{COURSE}", bbCourseId) : null;
}

/** When a syllabus tool page loads in any frame, the Blackboard LTI launch just before it is remembered. */
function watchLtiLaunches(wc) {
  let lastLaunch = null;
  wc.on("did-frame-navigate", (_event, url) => {
    if (isBlackboardUrl(url) && LTI_LAUNCH_RE.test(url)) lastLaunch = url;
    else if (isSyllabusToolUrl(url) && lastLaunch) rememberSyllabusLaunch(lastLaunch);
  });
}

function createHiddenBbWindow() {
  const win = new BrowserWindow({ show: false, width: 1200, height: 900, webPreferences: HIDDEN_PREFS });
  const popups = [];
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(({ url }) =>
    isSyllabusToolUrl(url) || isBlackboardUrl(url)
      ? { action: "allow", overrideBrowserWindowOptions: { show: false, webPreferences: HIDDEN_PREFS } }
      : { action: "deny" }
  );
  win.webContents.on("did-create-window", (child) => {
    popups.push(child);
    watchLtiLaunches(child.webContents);
  });
  watchLtiLaunches(win.webContents);
  return {
    win,
    contents: () => [win.webContents, ...popups.filter((p) => !p.isDestroyed()).map((p) => p.webContents)],
    destroy: () => {
      popups.forEach((p) => !p.isDestroyed() && p.destroy());
      if (!win.isDestroyed()) win.destroy();
    },
  };
}

function isSyllabusToolUrl(url) {
  try {
    const u = new URL(String(url || ""));
    return u.protocol === "https:" && SYLLABUS_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

function syllabusFrames(webContentsList) {
  const frames = [];
  for (const wc of webContentsList) {
    if (!wc || wc.isDestroyed()) continue;
    try {
      for (const frame of wc.mainFrame.framesInSubtree) if (isSyllabusToolUrl(frame.url)) frames.push(frame);
    } catch {
      /* frame tree unavailable */
    }
  }
  return frames;
}

/** Longest syllabus-tool text across frames once it stops growing (SPA pages render late). */
async function waitForSyllabusText(getWebContents, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    let best = "";
    for (const frame of syllabusFrames(getWebContents())) {
      try {
        const text = await withTimeout(
          frame.executeJavaScript("document.body ? document.body.innerText : ''"),
          3000,
          ""
        );
        if (typeof text === "string" && text.length > best.length) best = text;
      } catch {
        /* frame navigated away */
      }
    }
    if (best.length >= 500 && best.length === last.length) return best;
    last = best;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return last.length >= 500 ? last : "";
}

const COURSE_ID_RE = /^_\d+_\d+$/;

/** Loads `relativeUrl` in a hidden Blackboard-session window and reads the syllabus tool page it leads to. */
async function readSyllabusAt(relativeUrl, timeoutMs) {
  const hidden = createHiddenBbWindow();
  try {
    hidden.win.loadURL(`${BB_URL}${relativeUrl}`).catch(() => {});
    return await waitForSyllabusText(hidden.contents, timeoutMs);
  } finally {
    hidden.destroy();
  }
}

/** Launches a course content LTI link (a syllabus item in the content list). */
async function readLtiText(bbCourseId, contentId) {
  if (!COURSE_ID_RE.test(String(bbCourseId)) || !COURSE_ID_RE.test(String(contentId))) return "";
  return readSyllabusAt(
    `/webapps/blackboard/execute/blti/launchLink?course_id=${bbCourseId}&content_id=${contentId}&from_ultra=true`,
    LTI_TIMEOUT_MS
  );
}

const CLICK_SYLLABUS_TAB = `(() => {
  const re = /^\\s*(simple\\s+)?syllabus\\s*$/i;
  const nodes = [...document.querySelectorAll('a, button, [role="tab"], [role="link"], [role="menuitem"]')];
  const matches = nodes.filter((n) => re.test(n.textContent || "") || re.test(n.getAttribute("aria-label") || ""));
  const target = matches.find((n) => n.offsetParent !== null) || matches[0];
  if (!target) return false;
  target.click();
  return true;
})()`;

/** Opens the course in a hidden window and clicks its Syllabus tab, like the student would. */
async function readSyllabusViaTab(bbCourseId) {
  const hidden = createHiddenBbWindow();
  try {
    hidden.win.loadURL(`${BB_URL}/ultra/courses/${bbCourseId}/outline`).catch(() => {});
    const deadline = Date.now() + TAB_FIND_TIMEOUT_MS;
    let clicked = false;
    while (!clicked && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (hidden.win.isDestroyed()) return "";
      clicked = !!(await withTimeout(hidden.win.webContents.executeJavaScript(CLICK_SYLLABUS_TAB).catch(() => false), 3000, false));
    }
    if (!clicked) return "";
    return await waitForSyllabusText(hidden.contents, TAB_LOAD_TIMEOUT_MS);
  } finally {
    hidden.destroy();
  }
}

/** Course-level syllabus tool (e.g. a Simple Syllabus tab): remembered launch first, then clicking the tab. */
async function readCourseSyllabus(bbCourseId) {
  if (!COURSE_ID_RE.test(String(bbCourseId))) return "";
  const launch = syllabusLaunchFor(bbCourseId);
  if (launch) {
    const text = await readSyllabusAt(launch, LTI_TIMEOUT_MS);
    if (text) return text;
  }
  return readSyllabusViaTab(bbCourseId);
}

/** A syllabus the student already has open in the Blackboard window, only while that window is on this course. */
async function readOpenSyllabus(bbCourseId) {
  if (!bbWindow || bbWindow.isDestroyed()) return "";
  if (parseCourseFromUrl(bbWindow.webContents.getURL())?.bbCourseId !== bbCourseId) return "";
  const list = [bbWindow.webContents];
  for (const popup of syllabusPopups) if (!popup.isDestroyed()) list.push(popup.webContents);
  if (!syllabusFrames(list).length) return "";
  return waitForSyllabusText(() => list, 5000);
}

function ensureTempDir() {
  if (!fs.existsSync(BB_TEMP_DIR)) {
    fs.mkdirSync(BB_TEMP_DIR, { recursive: true });
  }
}

function setupDownloadInterceptor() {
  const bbSession = session.fromPartition(BB_PARTITION);

  if (!bbWillDownloadListenerAttached) {
    bbWillDownloadListenerAttached = true;
    bbSession.on("will-download", (event, item) => {
      const suggestedName = item.getFilename() || "";

      let pendingKey = null;
      let entry = bbPendingDownloads.get(suggestedName);
      if (entry) {
        pendingKey = suggestedName;
      } else if (bbPendingDownloads.size === 1) {
        pendingKey = bbPendingDownloads.keys().next().value;
        entry = bbPendingDownloads.get(pendingKey);
      }

      if (!entry) {
        const lower = suggestedName.toLowerCase();
        for (const [k, v] of bbPendingDownloads.entries()) {
          const kl = k.toLowerCase();
          if (
            kl === lower ||
            lower.endsWith(kl) ||
            kl.endsWith(lower) ||
            suggestedName.includes(k) ||
            k.includes(suggestedName)
          ) {
            pendingKey = k;
            entry = v;
            break;
          }
        }
      }

      if (!entry || pendingKey == null) {
        return;
      }

      event.preventDefault();

      ensureTempDir();
      const safeName = suggestedName.replace(/[^a-zA-Z0-9._\-\s]/g, "_").trim();
      const finalName = safeName || `bb_${Date.now()}`;
      const localPath = path.join(BB_TEMP_DIR, finalName);

      item.setSavePath(localPath);
      bbPendingDownloads.delete(pendingKey);
      if (entry.timeoutId) clearTimeout(entry.timeoutId);

      item.once("done", (_e, state) => {
        if (state === "completed") {
          allowPaths([localPath]);
          entry.resolve(localPath);
        } else {
          entry.reject(new Error(`Download ${state}: ${suggestedName}`));
        }
      });
    });
  }

  return function awaitDownload(fileName, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const key = String(fileName || "bb_file");
      const timeoutId = setTimeout(() => {
        if (bbPendingDownloads.has(key)) {
          bbPendingDownloads.delete(key);
          reject(new Error(`Download timeout: ${fileName}`));
        }
      }, timeoutMs);

      bbPendingDownloads.set(key, { resolve, reject, timeoutId });
    });
  };
}

async function downloadBBFile(fileUrl, fileName) {
  if (!bbWindow || bbWindow.isDestroyed()) {
    throw new Error("Blackboard window is not open");
  }

  if (!awaitBBDownload) {
    throw new Error("Download interceptor not initialized");
  }

  const downloadPromise = awaitBBDownload(fileName);
  let downloadSettled = false;
  downloadPromise.finally(() => {
    downloadSettled = true;
  });

  await bbWindow.webContents
    .executeJavaScript(callInjected(CLICK_DOWNLOAD_SCRIPT, String(fileName || ""), String(fileUrl || "")))
    .catch(() => {});

  setTimeout(async () => {
    if (downloadSettled || !bbWindow || bbWindow.isDestroyed()) return;
    const fallback = await bbWindow.webContents
      .executeJavaScript("window.__shFallbackDownload || null")
      .catch(() => null);
    if (fallback) {
      await bbWindow.webContents.executeJavaScript("window.__shFallbackDownload = null").catch(() => {});
      bbWindow.webContents.downloadURL(fallback);
    }
  }, 500);

  return downloadPromise;
}

function collectUrlsDeep(value, urls = []) {
  if (!value) return urls;
  if (typeof value === "string") {
    if (
      value.includes("/bbcswebdav/") ||
      value.includes("/webapps/") ||
      value.includes("download") ||
      value.includes("xid-")
    ) {
      urls.push(value);
    }
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach((v) => collectUrlsDeep(v, urls));
    return urls;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((v) => collectUrlsDeep(v, urls));
  }
  return urls;
}

function normalizeBbUrl(candidate) {
  if (!candidate) return null;
  if (candidate.startsWith("http://") || candidate.startsWith("https://")) return candidate;
  if (candidate.startsWith("//")) return `https:${candidate}`;
  if (candidate.startsWith("/")) return `${BB_ORIGIN}${candidate}`;
  return null;
}

async function resolveDownloadUrlFromContent(bbCourseId, contentId) {
  const item = `/courses/${encodeURIComponent(String(bbCourseId || ""))}/contents/${encodeURIComponent(String(contentId || ""))}`;
  for (const suffix of ["", "/attachments"]) {
    for (const version of ["v1", "v2"]) {
      try {
        const payload = await getJson(`/learn/api/public/${version}${item}${suffix}`);
        const direct = collectUrlsDeep(payload, [])
          .map(normalizeBbUrl)
          .find((u) => u && (u.includes("/bbcswebdav/") || u.includes("download") || u.includes("xid-")));
        if (direct) return direct;
      } catch {
        // try the next endpoint
      }
    }
  }
  return normalizeBbUrl(`/ultra/courses/${bbCourseId}/cl/outline/file/${contentId}`);
}

function detectFileRole(fileName, folderName) {
  const name = String(fileName || "").toLowerCase();
  const folder = String(folderName || "").toLowerCase();

  if (name.includes("syllabus") || name.includes("course outline") || name.includes("course_outline")) {
    return "syllabus";
  }

  if (
    name.includes("assignment") ||
    name.includes("homework") ||
    name.includes(" hw") ||
    name.includes("_hw") ||
    name.includes("submit") ||
    name.includes("submission") ||
    folder.includes("assignment") ||
    folder.includes("submission") ||
    folder.includes("dropbox")
  ) {
    return "assignment";
  }

  if (
    name.includes("quiz") ||
    name.includes("exam") ||
    name.includes("test") ||
    name.includes("midterm") ||
    name.includes("final exam")
  ) {
    return "assessment";
  }

  if (name.includes("lab") || folder.includes("lab")) return "lab";
  if (name.endsWith(".pptx") || name.endsWith(".ppt")) return "lecture";
  return "content";
}

function getRoleAction(role, fileExt) {
  switch (role) {
    case "syllabus":
      return "parse-syllabus";
    case "lecture":
      return "import-pptx";
    default:
      if (fileExt === "pptx" || fileExt === "ppt") return "import-pptx";
      return "extract-text";
  }
}

async function importFileFromUrl(context) {
  let { fileUrl, fileName, folderName, courseId, bbCourseId, contentId, courseTitle, skipIfRole = [] } = context || {};
  const ext = String(fileName || "").split(".").pop().toLowerCase();
  const role = detectFileRole(fileName, folderName);

  if (skipIfRole.includes(role)) {
    return { success: false, reason: "skipped", role };
  }
  if (fileUrl && !isAllowedImportUrl(fileUrl)) {
    return { success: false, reason: "URL is not a Blackboard file", role };
  }

  const action = getRoleAction(role, ext);
  try {
    sendToMain("bb:import-started", { fileName, folderName, role });

    if ((!fileUrl || String(fileUrl).startsWith("bb-content-id:")) && contentId && bbCourseId) {
      fileUrl = await resolveDownloadUrlFromContent(bbCourseId, contentId);
      if (!fileUrl) throw new Error("Could not resolve Blackboard download URL from content item");
    }
    if (!isBlackboardUrl(fileUrl)) throw new Error("Resolved URL is not a Blackboard file");

    const localPath = await downloadBBFile(fileUrl, fileName);

    sendToMain("bb:import-ready", {
      localPath,
      fileName,
      folderName,
      courseId,
      bbCourseId,
      courseTitle: String(courseTitle || ""),
      role,
      action,
    });

    return { success: true, role, action, localPath };
  } catch (err) {
    sendToMain("bb:import-error", { fileName, error: err?.message || String(err) });
    return { success: false, reason: err?.message || String(err), role };
  }
}

async function injectPage(url) {
  if (!bbWindow || bbWindow.isDestroyed() || !isBlackboardUrl(url)) return;
  const courseId = activeCourseId || "";
  const bbCourse = parseCourseFromUrl(url);
  const bbCourseId = bbCourse?.bbCourseId || "";
  const displayLinked = displayLinkedCourseName(bbCourseId);
  await bbWindow.webContents
    .executeJavaScript(callInjected(PAGE_SCRIPT, { courseId, bbCourseId, linkedName: displayLinked }))
    .catch(() => {});
  if (bbCourse) sendToMain("bb:course-detected", bbCourse);
}

async function openBlackboardWindow(targetUrl = null) {
  if (bbWindow && !bbWindow.isDestroyed()) {
    if (targetUrl) await bbWindow.loadURL(targetUrl).catch(() => {});
    bbWindow.focus();
    return;
  }

  cleanupTempDir();
  const loggedIn = await isLoggedIn();
  bbWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    title: "Study Hub — Blackboard",
    webPreferences: {
      partition: BB_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, "bbPreload.cjs"),
    },
  });

  if (!awaitBBDownload) {
    awaitBBDownload = setupDownloadInterceptor();
  }

  bbWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSyllabusToolUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1000,
          height: 850,
          title: "Study Hub — Syllabus",
          webPreferences: { partition: BB_PARTITION, nodeIntegration: false, contextIsolation: true, sandbox: true },
        },
      };
    }
    if (isBlackboardUrl(url)) {
      bbWindow?.loadURL(url);
    } else if (/^https:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  watchLtiLaunches(bbWindow.webContents);
  bbWindow.webContents.on("did-create-window", (child) => {
    syllabusPopups.add(child);
    watchLtiLaunches(child.webContents);
    child.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    child.on("closed", () => syllabusPopups.delete(child));
  });

  let injectTimer = null;
  const scheduleInject = (url) => {
    clearTimeout(injectTimer);
    injectTimer = setTimeout(() => void injectPage(url), 150);
  };
  bbWindow.webContents.on("did-navigate", (_event, url) => scheduleInject(url));
  bbWindow.webContents.on("did-navigate-in-page", (_event, url) => scheduleInject(url));
  bbWindow.webContents.on("did-finish-load", () => scheduleInject(bbWindow.webContents.getURL()));

  bbWindow.on("closed", () => {
    bbWindow = null;
  });

  const startUrl = loggedIn ? targetUrl || `${BB_URL}/ultra/course` : BB_URL;
  await bbWindow.loadURL(startUrl);
}

function closeBlackboardWindow() {
  if (bbWindow && !bbWindow.isDestroyed()) {
    bbWindow.close();
  }
  bbWindow = null;
}

async function disconnectBlackboard() {
  closeBlackboardWindow();
  resetUserCache();
  onDisconnect();
  const bbSession = session.fromPartition(BB_PARTITION);
  await bbSession.clearStorageData();
  await bbSession.clearCache();
}

function registerBlackboardHandlers(mainWindowGetter, options = {}) {
  getMainWindow = typeof mainWindowGetter === "function" ? mainWindowGetter : () => mainWindowGetter;
  if (typeof options.allowPaths === "function") allowPaths = options.allowPaths;
  if (typeof options.extractBufferText === "function") extractBufferText = options.extractBufferText;
  if (typeof options.onDisconnect === "function") onDisconnect = options.onDisconnect;

  setPageFetcher(async (pathname) => {
    if (!bbWindow || bbWindow.isDestroyed()) return null;
    const wc = bbWindow.webContents;
    if (!isBlackboardUrl(wc.getURL()) || !/^\/learn\/api\//.test(String(pathname))) return null;
    try {
      return await wc.executeJavaScript(
        `fetch(${JSON.stringify(pathname)}, { credentials: "include", headers: { Accept: "application/json" } })
          .then(async (r) => ({ status: r.status, body: await r.text() }))`
      );
    } catch {
      return null;
    }
  });

  ipcMain.handle("bb:open", async (event) => {
    if (!isMainWindowSender(event)) return { success: false };
    await openBlackboardWindow();
    return { success: true };
  });

  ipcMain.handle("bb:open-url", async (event, url) => {
    if (!isMainWindowSender(event) || !isBlackboardUrl(url)) return { success: false };
    await openBlackboardWindow(String(url));
    return { success: true };
  });

  ipcMain.handle("bb:close", async (event) => {
    if (!isMainWindowSender(event) && !isTrustedBbSender(event)) return { success: false };
    closeBlackboardWindow();
    return { success: true };
  });

  ipcMain.handle("bb:disconnect", async (event) => {
    if (!isMainWindowSender(event)) return { success: false };
    await disconnectBlackboard();
    return { success: true };
  });

  ipcMain.handle("bb:getStatus", async () => ({
    loggedIn: await isLoggedIn(),
    windowOpen: bbWindow !== null && !bbWindow.isDestroyed(),
  }));

  ipcMain.handle("bb:import-file", async (event, context) => {
    if (!isTrustedBbSender(event)) return { success: false, reason: "untrusted" };
    return importFileFromUrl(context);
  });

  ipcMain.handle("bb:import-folder", async (event, context) => {
    if (!isTrustedBbSender(event)) return { success: false, reason: "untrusted" };
    const { files = [], skipIfRole = [] } = context || {};
    const results = [];
    for (const file of files.slice(0, 100)) {
      results.push(await importFileFromUrl({ ...file, skipIfRole }));
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return {
      success: true,
      total: files.length,
      imported: results.filter((r) => r.success).length,
      skipped: results.filter((r) => r.reason === "skipped").length,
    };
  });

  ipcMain.handle("bb:set-active-course", async (event, courseId) => {
    if (!isMainWindowSender(event)) return { success: false };
    activeCourseId = String(courseId || "");
    return { success: true };
  });

  ipcMain.handle("bb:show-toast", async (event, { message, type } = {}) => {
    if (!isMainWindowSender(event)) return { success: false };
    if (bbWindow && !bbWindow.isDestroyed()) {
      await bbWindow.webContents
        .executeJavaScript(
          `window.__shToast?.(${JSON.stringify(String(message || ""))}, ${JSON.stringify(type || "success")})`
        )
        .catch(() => {});
    }
    return { success: true };
  });

  ipcMain.handle("bb:get-course-status", async (event, { courseId } = {}) => {
    if (!isTrustedBbSender(event) || !courseId) return null;
    try {
      const db = getDb();
      const gradeRows = db
        .prepare(
          "SELECT COUNT(*) as count FROM grade_components gc JOIN courses c ON c.id = gc.course_id WHERE c.uuid = ?"
        )
        .get(courseId);
      const modules = db
        .prepare(`
          SELECT m.title, COUNT(ci.id) as item_count
          FROM modules m
          LEFT JOIN content_items ci ON ci.module_id = m.id
          JOIN courses c ON c.id = m.course_id
          WHERE c.uuid = ?
          GROUP BY m.id
        `)
        .all(courseId);
      return {
        hasSyllabus: (gradeRows?.count || 0) > 0,
        gradeComponentCount: gradeRows?.count || 0,
        moduleCount: modules.length,
        modules: modules.map((m) => ({ title: m.title, itemCount: m.item_count })),
      };
    } catch {
      return null;
    }
  });

  /* ---------------- Phase 1: Blackboard mirror sync ---------------- */

  ipcMain.handle("bb:list-courses", async (event) => {
    if (!isMainWindowSender(event)) return { ok: false, error: "untrusted" };
    if (!(await isLoggedIn())) return { ok: false, error: "not-logged-in" };
    try {
      return { ok: true, courses: await listEnrolledCourses() };
    } catch (err) {
      const error = err?.status === 401 || err?.status === 403 ? "not-logged-in" : err?.message || String(err);
      return { ok: false, error };
    }
  });

  let syncing = false;

  /** Finds or creates the linked Study Hub course, sweeps Blackboard into it, and reports to the main window. */
  async function runSync({ bbCourseId, name, courseCode, term, fallbackName } = {}) {
    const id = String(bbCourseId || "");
    if (!/^_\d+_\d+$/.test(id)) return { ok: false, error: "Invalid Blackboard course id" };
    if (syncing) return { ok: false, error: "A sync is already running." };
    if (!(await isLoggedIn())) return { ok: false, error: "not-logged-in" };
    syncing = true;
    let courseUuid = null;
    try {
      let info = { name, courseCode, term };
      if (!info.name) info = { ...info, ...(await getCourseInfo(id).catch(() => ({}))) };
      if (!info.name) info.name = fallbackName;
      const ensured = ensureCourseForBb(getDb(), { bbCourseId: id, ...info });
      courseUuid = ensured.courseUuid;
      const payload = await syncCourse(id, (progress) => sendToMain("bb:sync-progress", { bbCourseId: id, courseUuid, ...progress }), {
        extractBufferText,
        readLtiText,
        readOpenSyllabus,
        readCourseSyllabus,
      });
      const result = applyBbSync(getDb(), courseUuid, payload);
      const syllabus = payload.syllabus
        ? { source: payload.syllabus.source, title: payload.syllabus.title, text: payload.syllabus.text.slice(0, 200000) }
        : null;
      const summary = {
        ok: result.success,
        bbCourseId: id,
        courseUuid,
        created: ensured.created,
        counts: result.counts ? { ...result.counts, scored: payload.scoredCount || 0 } : result.counts,
        gradeSource: payload.gradeSource,
        error: result.error,
        syllabus,
      };
      sendToMain("bb:sync-complete", summary);
      return summary;
    } catch (err) {
      const error = err?.status === 401 || err?.status === 403 ? "not-logged-in" : err?.message || String(err);
      sendToMain("bb:sync-complete", { ok: false, bbCourseId: id, courseUuid, error });
      return { ok: false, bbCourseId: id, courseUuid, error };
    } finally {
      syncing = false;
    }
  }

  ipcMain.handle("bb:sync-course", async (event, data = {}) => {
    if (!isMainWindowSender(event)) return { ok: false, error: "untrusted" };
    return runSync(data);
  });

  ipcMain.handle("bb:sync-from-page", async (event, data = {}) => {
    if (!isTrustedBbSender(event)) return { ok: false, error: "untrusted" };
    const pageCourse = parseCourseFromUrl(event.sender.getURL());
    const bbCourseId = pageCourse?.bbCourseId || "";
    if (!bbCourseId) return { ok: false, error: "Open a course first." };
    const result = await runSync({ bbCourseId, fallbackName: String(data?.courseTitle || "").slice(0, 200) || undefined });
    if (result.ok && bbWindow && !bbWindow.isDestroyed()) await injectPage(bbWindow.webContents.getURL());
    return result;
  });

  /** Background check of one linked course (Desktop Nova). Shares the sync lock so it never overlaps a manual sync. */
  async function backgroundCheck(bbCourseId) {
    const id = String(bbCourseId || "");
    if (!/^_\d+_\d+$/.test(id)) return { ok: false, error: "invalid" };
    if (syncing) return { ok: false, error: "busy" };
    if (!(await isLoggedIn())) return { ok: false, error: "not-logged-in" };
    const course = getDb().prepare("SELECT uuid FROM courses WHERE bb_course_id = ? ORDER BY id ASC LIMIT 1").get(id);
    if (!course) return { ok: false, error: "not-linked" };
    syncing = true;
    try {
      const payload = await checkCourse(id);
      const result = applyBbSync(getDb(), course.uuid, payload);
      return { ok: !!result.success, courseUuid: course.uuid, payload };
    } catch (err) {
      return { ok: false, error: err?.status === 401 || err?.status === 403 ? "not-logged-in" : err?.message || String(err) };
    } finally {
      syncing = false;
    }
  }

  return { backgroundCheck, openLogin: () => openBlackboardWindow() };
}

module.exports = {
  registerBlackboardHandlers,
  parseCourseFromUrl,
  detectFileRole,
};

