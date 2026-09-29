const { app, BrowserWindow, session, ipcMain, net, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { getDb } = require("./database.cjs");
const { applyBbSync, ensureCourseForBb } = require("./dbMirrorHandlers.cjs");
const { listEnrolledCourses, syncCourse, resetUserCache, setPageFetcher, getCourseInfo } = require("./bbSync.cjs");

let bbWindow = null;
const syllabusPopups = new Set();
let extractBufferText = null;
let getMainWindow = () => null;
let allowPaths = () => {};
let activeCourseId = "";
let linkedCourseName = "";
let linkedBbCourseId = "";
let awaitBBDownload = null;

/** filename → { resolve, reject, timeoutId } for BB will-download interceptor */
const bbPendingDownloads = new Map();
let bbWillDownloadListenerAttached = false;

const BB_PARTITION = "persist:blackboard";
const BB_URL = "https://ualearn.blackboard.com";
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

function buildToolbarScript(_courseId, bbCourseId, linkedNameForPage) {
  const safeBbCourseId = JSON.stringify(String(bbCourseId || ""));
  const safeLinked = JSON.stringify(String(linkedNameForPage || ""));
  const isLinked = !!(linkedNameForPage && String(linkedNameForPage).trim());

  return `
(function() {
  if (!document.body) return;

  const existing = document.getElementById("sh-bb-toolbar");
  if (existing) existing.remove();

  const toolbar = document.createElement("div");
  toolbar.id = "sh-bb-toolbar";
  toolbar.style.cssText = [
    "position: fixed",
    "top: 0",
    "left: 0",
    "right: 0",
    "height: 40px",
    "background: #0a0e0a",
    "border-bottom: 2px solid #1a2a1a",
    "display: flex",
    "align-items: center",
    "padding: 0 16px",
    "gap: 12px",
    "z-index: 999999",
    "font-family: Consolas, monospace",
    "font-size: 11px",
    "color: #8ea88e",
    "letter-spacing: 0.08em"
  ].join(";");

  const logo = document.createElement("span");
  logo.style.cssText = "color:#00ff88;font-weight:600;letter-spacing:0.12em;font-size:12px;";
  logo.textContent = "STUDY HUB";

  const div1 = document.createElement("span");
  div1.style.color = "#1a2a1a";
  div1.textContent = "|";

  const courseArea = document.createElement("div");
  courseArea.style.cssText = "display:flex;align-items:center;gap:8px;flex:1;";

  function makeSyncBtn(label) {
    const btn = document.createElement("button");
    btn.id = "sh-sync-course-btn";
    btn.textContent = label;
    btn.style.cssText = [
      "background: transparent",
      "border: 1px solid #00ff88",
      "color: #00ff88",
      "font-family: inherit",
      "font-size: 10px",
      "letter-spacing: 0.1em",
      "padding: 4px 12px",
      "cursor: pointer"
    ].join(";");
    btn.addEventListener("click", function() {
      if (!window.__shBridge || !window.__shBridge.syncCourse) return;
      var title = window.__shGetCourseTitle ? window.__shGetCourseTitle() : null;
      btn.disabled = true;
      btn.textContent = "SYNCING... (UP TO A MINUTE)";
      window.__shBridge.syncCourse({ courseTitle: title || "" }).then(function(res) {
        if (!document.body.contains(btn)) return;
        btn.disabled = false;
        btn.textContent = label;
        if (!window.__shToast) return;
        if (res && res.ok) {
          var c = res.counts || {};
          var msg = "\\u2713 Synced " + (c.assignments || 0) + " due dates, " + (c.scored || 0) + " of " + (c.grades || 0) + " grades scored";
          msg += res.syllabus ? " \\u00b7 syllabus found" : " \\u00b7 no syllabus found";
          window.__shToast(msg, "success");
        } else {
          window.__shToast("\\u2715 " + ((res && res.error) || "Sync failed"), "error");
        }
      });
    });
    return btn;
  }

  if (${isLinked}) {
    const courseLabel = document.createElement("span");
    courseLabel.style.cssText = "color:#00ff88;font-size:11px;letter-spacing:0.06em;";
    courseLabel.textContent = "\\u25cf " + ${safeLinked};
    courseArea.appendChild(courseLabel);

    const statusBtn = document.createElement("button");
    statusBtn.id = "sh-status-toggle";
    statusBtn.textContent = "STATUS \\u25be";
    statusBtn.style.cssText = [
      "background: transparent",
      "border: 1px solid #1a3a1a",
      "color: #8ea88e",
      "font-family: inherit",
      "font-size: 9px",
      "letter-spacing: 0.1em",
      "padding: 3px 8px",
      "cursor: pointer"
    ].join(";");
    statusBtn.addEventListener("click", function() {
      if (window.__shToggleStatus) window.__shToggleStatus();
    });
    courseArea.appendChild(statusBtn);
    courseArea.appendChild(makeSyncBtn("\\u27f3 SYNC"));
  } else if (${safeBbCourseId}) {
    courseArea.appendChild(makeSyncBtn("\\u27f3 SYNC TO STUDY HUB"));
  }

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "\\u2715 CLOSE";
  closeBtn.style.cssText = [
    "background: transparent",
    "border: 1px solid #1a2a1a",
    "color: #8ea88e",
    "font-family: inherit",
    "font-size: 10px",
    "letter-spacing: 0.1em",
    "padding: 3px 10px",
    "cursor: pointer"
  ].join(";");
  closeBtn.addEventListener("click", function() {
    if (window.__shBridge && window.__shBridge.closeWindow) window.__shBridge.closeWindow();
    else window.close();
  });

  toolbar.appendChild(logo);
  toolbar.appendChild(div1);
  toolbar.appendChild(courseArea);
  toolbar.appendChild(closeBtn);

  document.body.prepend(toolbar);
  document.body.style.paddingTop = "40px";
})();
`;
}

const OBSERVER_SCRIPT = `
  (function() {
    if (!document.body) return
    if (window.__shObserverActive) return;
    window.__shObserverActive = true
    let injectTimer = null

    const observer = new MutationObserver(() => {
      clearTimeout(injectTimer)
      injectTimer = setTimeout(() => {
        window.__shInjectImportButtons?.()
        window.__shInjectFolderButtons?.()
      }, 300)
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true
    })
  })();
`;

async function isLoggedIn() {
  const bbSession = session.fromPartition(BB_PARTITION);
  const cookies = await bbSession.cookies.get({
    domain: "ualearn.blackboard.com",
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
  if (linkedBbCourseId && pageBbCourseId === linkedBbCourseId && linkedCourseName) return linkedCourseName;
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

  const safeFileUrl = JSON.stringify(String(fileUrl || ""));
  const safeFileName = JSON.stringify(String(fileName || ""));

  await bbWindow.webContents
    .executeJavaScript(
      `
      (function() {
        try {
          var targetName = ${safeFileName};
          var targetBtn = null;
          var items = document.querySelectorAll("[title], [aria-label]");
          for (var i = 0; i < items.length; i++) {
            var el = items[i];
            var text = (
              el.getAttribute("title") ||
              el.getAttribute("aria-label") ||
              el.textContent ||
              ""
            ).trim();
            var baseName = targetName.replace(/\\.[^.]+$/, "");
            if (text.indexOf(baseName) !== -1 || text.indexOf(targetName) !== -1) {
              var container =
                el.closest('[class*="item"],[class*="content"],[role="listitem"]') ||
                el.parentElement;
              if (container) {
                targetBtn = container.querySelector(
                  '[data-testid*="more"],[aria-label*="more"],[aria-label*="option"],button[aria-haspopup],[class*="context-menu"]'
                );
                if (targetBtn) break;
              }
            }
          }

          if (targetBtn) {
            targetBtn.click();
            setTimeout(function() {
              var menuItems = document.querySelectorAll(
                '[role="menuitem"],[role="option"],[class*="menu-item"]'
              );
              for (var j = 0; j < menuItems.length; j++) {
                var item = menuItems[j];
                var t = (item.textContent || "").toLowerCase();
                if (t.indexOf("download") !== -1 || t.indexOf("original") !== -1) {
                  item.click();
                  return true;
                }
              }
              window.__shFallbackDownload = ${safeFileUrl};
            }, 300);
            return true;
          }

          window.__shFallbackDownload = ${safeFileUrl};
          return false;
        } catch (e) {
          window.__shFallbackDownload = ${safeFileUrl};
          return false;
        }
      })()
    `
    )
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
  if (candidate.startsWith("/")) return `https://ualearn.blackboard.com${candidate}`;
  return null;
}

async function requestJsonFromEndpoint(url, bbSession) {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, session: bbSession });
    request.setHeader("Accept", "application/json, text/plain, */*");
    const chunks = [];
    request.on("response", (response) => {
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Content lookup failed: ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(body);
        }
      });
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

async function resolveDownloadUrlFromContent(bbCourseId, contentId) {
  const bbSession = session.fromPartition(BB_PARTITION);
  const encodedCourseId = encodeURIComponent(String(bbCourseId || ""));
  const encodedContentId = encodeURIComponent(String(contentId || ""));
  const candidates = [
    `https://ualearn.blackboard.com/learn/api/public/v1/courses/${encodedCourseId}/contents/${encodedContentId}`,
    `https://ualearn.blackboard.com/learn/api/public/v2/courses/${encodedCourseId}/contents/${encodedContentId}`,
  ];

  for (const endpoint of candidates) {
    try {
      const payload = await requestJsonFromEndpoint(endpoint, bbSession);
      const urls = collectUrlsDeep(payload, []);
      const direct = urls
        .map((u) => normalizeBbUrl(u))
        .find((u) => u && (u.includes("/bbcswebdav/") || u.includes("download") || u.includes("xid-")));
      if (direct) return direct;
    } catch {
      // continue
    }
  }

  const attachmentEndpoints = [
    `https://ualearn.blackboard.com/learn/api/public/v1/courses/${encodedCourseId}/contents/${encodedContentId}/attachments`,
    `https://ualearn.blackboard.com/learn/api/public/v2/courses/${encodedCourseId}/contents/${encodedContentId}/attachments`,
  ];

  for (const endpoint of attachmentEndpoints) {
    try {
      const payload = await requestJsonFromEndpoint(endpoint, bbSession);
      const urls = collectUrlsDeep(payload, []);
      const direct = urls
        .map((u) => normalizeBbUrl(u))
        .find((u) => u && (u.includes("/bbcswebdav/") || u.includes("download") || u.includes("xid-")));
      if (direct) return direct;
    } catch {
      // continue
    }
  }

  const ultraFallback = normalizeBbUrl(`/ultra/courses/${bbCourseId}/cl/outline/file/${contentId}`);
  if (ultraFallback) return ultraFallback;

  return null;
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

function buildInjectionScript(courseId, bbCourseId) {
  const safeCourseId = JSON.stringify(String(courseId || ""));
  const safeBbCourseId = JSON.stringify(String(bbCourseId || ""));
  return `
    (function() {
      const INJECTED_ATTR = 'data-sh-injected';
      const FOLDER_ATTR = 'data-sh-folder';
      const courseId = ${safeCourseId};
      const bbCourseId = ${safeBbCourseId};

      function makeBtn(text, onClick, style) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        btn.setAttribute('data-sh-btn', 'true');
        btn.style.cssText =
          "background:transparent;border:1px solid #00ff88;color:#00ff88;font-family:'Consolas',monospace;font-size:10px;letter-spacing:0.08em;padding:3px 10px;cursor:pointer;margin-left:8px;white-space:nowrap;vertical-align:middle;z-index:999999;position:relative;pointer-events:auto;" + (style || "");
        btn.addEventListener('mousedown', (e) => e.stopPropagation(), true);
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
          onClick();
        }, true);
        return btn;
      }

      function getFolderContext(element) {
        let el = element.parentElement;
        let depth = 0;
        while (el && depth < 15) {
          const titleEl = el.querySelector(
            '[data-sh-folder-title], h3, h4, .content-title, [class*="folder"] [class*="title"], [class*="item-title"]'
          );
          if (titleEl && titleEl.textContent && titleEl.textContent.trim().length > 0) {
            const text = titleEl.textContent.trim();
            if (!text.match(/\\.[a-z]{2,4}$/i)) return text;
          }
          el = el.parentElement;
          depth += 1;
        }
        return 'General';
      }

      function getFileUrl(element) {
        const anchor = element.closest('a') || element.querySelector('a');
        if (
          anchor &&
          anchor.href &&
          (anchor.href.includes('/bbcswebdav/') ||
            anchor.href.includes('/xid-') ||
            anchor.href.includes('/courses/') ||
            anchor.href.includes('download'))
        ) {
          return anchor.href;
        }
        const dataUrl = element.closest('[data-url]')?.getAttribute('data-url');
        if (dataUrl) return dataUrl;

        const container = element.closest('[class*="content-item"],[class*="list-item"],[data-handler]');
        if (container) {
          const link = container.querySelector(
            'a[href*="bbcswebdav"],a[href*="/xid-"],a[href*="download"]'
          );
          if (link && link.href) return link.href;
        }
        return null;
      }

      function getContentId(element) {
        const container = element.closest('[data-content-id]') || element.querySelector('[data-content-id]');
        const fromAttr = container?.getAttribute('data-content-id');
        if (fromAttr) return fromAttr;
        const row = element.closest('[class*="content-list-item"]');
        return row?.getAttribute('data-content-id') || null;
      }

      function getFileName(element) {
        const title = element.closest('[title]')?.title || element.querySelector('[title]')?.title;
        if (title && title.match(/\\.[a-z]{2,5}$/i)) return title;

        const text = element.textContent?.trim();
        if (text && text.match(/\\.[a-z]{2,5}$/i)) return text.split('\\n')[0].trim();

        const aria = element.getAttribute('aria-label') || element.querySelector('[aria-label]')?.getAttribute('aria-label');
        if (aria) return aria.trim();
        return 'unknown_file';
      }

      function getCourseTitle() {
        const selectors = [
          'h1[class*="course-title"]',
          'h1[class*="courseName"]',
          '.base-page-header h1',
          '[class*="course-banner"] h1',
          '[class*="courseBanner"] h1',
          '[aria-label*="Course name"]',
          'h1',
        ];

        for (const sel of selectors) {
          const el = document.querySelector(sel);
          const text = el?.textContent?.trim();
          if (text && text.length > 2 && text.length < 120) {
            return text;
          }
        }

        const docTitle = document.title?.trim();
        if (docTitle && docTitle.length > 2) {
          return docTitle.replace(/\\s*\\|\\s*Blackboard.*$/i, '').trim();
        }

        return null;
      }

      window.__shToast = function(message, type) {
        var existingToast = document.getElementById('sh-bb-toast');
        if (existingToast) existingToast.remove();

        var color =
          type === 'error' ? '#ff4444' : type === 'warning' ? '#ffaa00' : '#00ff88';

        var toast = document.createElement('div');
        toast.id = 'sh-bb-toast';
        toast.style.cssText =
          'position:fixed;bottom:24px;right:24px;background:#0a0e0a;border:1px solid ' +
          color +
          ';border-left:3px solid ' +
          color +
          ';color:' +
          color +
          ';font-family:Consolas,monospace;font-size:11px;letter-spacing:0.06em;padding:10px 16px;z-index:999999;max-width:320px;line-height:1.4;box-shadow:0 4px 12px rgba(0,0,0,0.4);animation:shSlideIn 150ms ease';

        if (!document.getElementById('sh-toast-style')) {
          var styleEl = document.createElement('style');
          styleEl.id = 'sh-toast-style';
          styleEl.textContent =
            '@keyframes shSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}';
          document.head.appendChild(styleEl);
        }

        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(function() {
          if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 200ms ease';
            setTimeout(function() {
              toast.remove();
            }, 200);
          }
        }, 4000);
      };

      function injectImportButtons() {
        const seen = new Set();
        const rows = document.querySelectorAll('[data-content-id], .content-list-item, [class*="content-list-item"]');
        rows.forEach((item) => {
          if (seen.has(item)) return;
          if (item.hasAttribute(INJECTED_ATTR)) return;

          const analyticsId =
            item.querySelector('[data-analytics-id]')?.getAttribute('data-analytics-id') || '';

          if (
            analyticsId.includes('folder.toggleFolder') ||
            analyticsId.includes('assessment.readOnly') ||
            analyticsId.includes('gradebook')
          ) {
            return;
          }

          const fileName = getFileName(item);
          const looksLikeFileName = /\.[a-z0-9]{2,5}$/i.test(fileName || '');
          const isCourseContentLink = analyticsId.includes('course.outline.courseContent.link');
          if (!looksLikeFileName && !isCourseContentLink) return;

          const folderName = getFolderContext(item);
          const contentId = getContentId(item);
          const directUrl = getFileUrl(item);
          const fileUrl = directUrl || (contentId ? ('bb-content-id:' + contentId) : null);
          if (!fileUrl) return;

          seen.add(item);
          item.setAttribute(INJECTED_ATTR, '1');
          const btn = makeBtn('→ IMPORT', () => {
            const courseTitle = getCourseTitle();
            let effectiveFileName = fileName;
            if (fileUrl) {
              try {
                const urlParts = fileUrl.split('/');
                const lastPart = urlParts[urlParts.length - 1].split('?')[0];
                const decoded = decodeURIComponent(lastPart);
                if (decoded.includes('.') && decoded.length > 3) {
                  effectiveFileName = decoded;
                }
              } catch (e) {}
            }
            window.__shBridge?.importFile?.({
              fileUrl,
              fileName: effectiveFileName || fileName,
              folderName,
              contentId,
              courseId,
              bbCourseId,
              courseTitle: courseTitle || ''
            });
          });

          let actions = item.querySelector('[class*="action"],[class*="options"],[data-testid*="action"]');
          if (!actions) {
            actions = document.createElement('div');
            actions.setAttribute('data-sh-actions', '1');
            actions.style.cssText = 'display:flex;justify-content:flex-end;align-items:center;gap:6px;margin-top:6px;';
            item.appendChild(actions);
          }
          actions.appendChild(btn);
        });
      }

      function injectFolderButtons() {
        const folderSelectors = ['[class*="folder"]', '[aria-expanded]', '[data-contents]'];
        const seen = new Set();
        folderSelectors.forEach((selector) => {
          document.querySelectorAll(selector).forEach((el) => {
            if (seen.has(el)) return;
            if (el.getAttribute(FOLDER_ATTR)) return;
            const titleEl = el.querySelector('h3, h4, [class*="title"], [class*="folder-name"]');
            if (!titleEl) return;
            const folderName = titleEl.textContent?.trim();
            if (!folderName) return;
            seen.add(el);
            el.setAttribute(FOLDER_ATTR, '1');
            const btn = makeBtn(
              '→ IMPORT ALL',
              () => {
                const courseTitle = getCourseTitle();
                window.__shImportFolder?.({
                  folderName,
                  folderElement: el,
                  courseId,
                  bbCourseId,
                  courseTitle: courseTitle || ''
                });
              },
              'border-color:#00ccff;color:#00ccff;'
            );
            titleEl.appendChild(btn);
          });
        });
      }

      window.__shGetCourseTitle = getCourseTitle;
      window.__shInjectFolderButtons = injectFolderButtons;

      function escapeHtml(value) {
        return String(value == null ? '' : value)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      window.__shToggleStatus = async function() {
        var existingPanel = document.getElementById('sh-status-panel');
        if (existingPanel) {
          existingPanel.remove();
          return;
        }

        var panel = document.createElement('div');
        panel.id = 'sh-status-panel';
        panel.style.cssText = [
          'position: fixed',
          'top: 40px',
          'right: 0',
          'width: 280px',
          'max-height: calc(100vh - 40px)',
          'background: #0a0e0a',
          'border-left: 2px solid #1a3a1a',
          'border-bottom: 2px solid #1a3a1a',
          'padding: 16px',
          'z-index: 999998',
          'font-family: Consolas, monospace',
          'font-size: 11px',
          'color: #8ea88e',
          'overflow-y: auto'
        ].join(';');

        panel.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
          '<div style="color:#00ff88;font-weight:600;letter-spacing:0.12em;font-size:11px;">COURSE STATUS</div>' +
          '<button id="sh-status-refresh" style="background:transparent;border:1px solid #1a3a1a;color:#8ea88e;font-family:inherit;font-size:9px;letter-spacing:0.1em;padding:2px 8px;cursor:pointer;">\u21bb REFRESH</button>' +
          '</div>' +
          '<div id="sh-status-content" style="color:#8ea88e;font-size:10px;">Loading...</div>';

        document.body.appendChild(panel);

        function renderStatus(status, content) {
          if (!content) return;
          if (!status) {
            content.textContent = 'No data available';
            return;
          }

          var syllabusLine = status.hasSyllabus
            ? '<div style="color:#00ff88;margin-bottom:4px">\\u2713 Syllabus \\u2014 ' +
              Number(status.gradeComponentCount || 0) +
              ' components</div>'
            : '<div style="color:#8ea88e;margin-bottom:4px">\\u25cb Syllabus \\u2014 not imported</div>';

          var modulesHtml = (status.modules || [])
            .map(function(m) {
              return (
                '<div style="margin:3px 0;padding-left:8px">' +
                (m.itemCount > 0
                  ? '<span style="color:#00ff88">\\u2713</span>'
                  : '<span style="color:#8ea88e">\\u25cb</span>') +
                ' ' +
                escapeHtml(m.title || '') +
                ' <span style="color:#4a6a4a">(' +
                Number(m.itemCount || 0) +
                ' items)</span></div>'
              );
            })
            .join('');

          content.innerHTML =
            syllabusLine +
            '<div style="color:#00ccff;letter-spacing:0.1em;font-size:9px;margin:8px 0 4px">CONTENT</div>' +
            (modulesHtml ||
              '<div style="color:#4a6a4a;padding-left:8px">No content yet</div>');
        }

        var bridge = window.__shBridge;
        var initialStatus =
          bridge && bridge.getCourseStatus
            ? await bridge.getCourseStatus({
                courseId: courseId,
                bbCourseId: bbCourseId
              })
            : null;

        var contentEl = document.getElementById('sh-status-content');
        renderStatus(initialStatus, contentEl);

        var refreshBtn = document.getElementById('sh-status-refresh');
        if (refreshBtn) {
          refreshBtn.addEventListener('click', async function() {
            var content = document.getElementById('sh-status-content');
            if (content) {
              content.textContent = 'Refreshing...';
            }
            var fresh =
              bridge && bridge.getCourseStatus
                ? await bridge.getCourseStatus({
                    courseId: courseId,
                    bbCourseId: bbCourseId
                  })
                : null;
            renderStatus(fresh, content);
          });
        }
      };

      window.__shInjectImportButtons = injectImportButtons;

      window.__shImportFile = (context) => {
        window.__shBridge?.importFile?.(context);
      };

      window.__shImportFolder = (context) => {
        const files = [];
        const items = context.folderElement.querySelectorAll('[' + INJECTED_ATTR + ']');
        items.forEach((item) => {
          const contentId = getContentId(item);
          const fileUrl = getFileUrl(item) || (contentId ? 'bb-content-id:' + contentId : null);
          const fileName = getFileName(item);
          if (fileUrl && fileName) {
            files.push({
              fileUrl,
              fileName,
              contentId,
              folderName: context.folderName,
              courseId: context.courseId,
              bbCourseId: context.bbCourseId,
              courseTitle: context.courseTitle || ''
            });
          }
        });
        window.__shBridge?.importFolder?.({
          folderName: context.folderName,
          courseId: context.courseId,
          bbCourseId: context.bbCourseId,
          courseTitle: context.courseTitle || '',
          files
        });
      };

      injectImportButtons();
      injectFolderButtons();
    })();
  `;
}

async function injectPage(url) {
  if (!bbWindow || bbWindow.isDestroyed() || !isBlackboardUrl(url)) return;
  const courseId = activeCourseId || "";
  const bbCourse = parseCourseFromUrl(url);
  const bbCourseId = bbCourse?.bbCourseId || "";
  const displayLinked = displayLinkedCourseName(bbCourseId);
  await bbWindow.webContents.executeJavaScript(buildToolbarScript(courseId, bbCourseId, displayLinked)).catch(() => {});
  await bbWindow.webContents.executeJavaScript(OBSERVER_SCRIPT).catch(() => {});
  await bbWindow.webContents.executeJavaScript(buildInjectionScript(courseId, bbCourseId, displayLinked)).catch(() => {});
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
  const bbSession = session.fromPartition(BB_PARTITION);
  await bbSession.clearStorageData();
  await bbSession.clearCache();
}

function registerBlackboardHandlers(mainWindowGetter, options = {}) {
  getMainWindow = typeof mainWindowGetter === "function" ? mainWindowGetter : () => mainWindowGetter;
  if (typeof options.allowPaths === "function") allowPaths = options.allowPaths;
  if (typeof options.extractBufferText === "function") extractBufferText = options.extractBufferText;

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

  ipcMain.handle("bb:isLoggedIn", async () => isLoggedIn());

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
    if (!isMainWindowSender(event) && !isTrustedBbSender(event)) return { success: false };
    if (bbWindow && !bbWindow.isDestroyed()) {
      await bbWindow.webContents
        .executeJavaScript(
          `window.__shToast?.(${JSON.stringify(String(message || ""))}, ${JSON.stringify(type || "success")})`
        )
        .catch(() => {});
    }
    return { success: true };
  });

  ipcMain.handle("bb:create-course", async (event, data) => {
    if (!isTrustedBbSender(event)) return { success: false };
    activeCourseId = "";
    sendToMain("bb:create-course-request", {
      courseTitle: String(data?.courseTitle || "").slice(0, 200),
      bbCourseId: String(data?.bbCourseId || ""),
    });
    return { success: true };
  });

  ipcMain.handle("bb:course-created", async (event, payload) => {
    if (!isMainWindowSender(event)) return { success: false };
    const { courseId, courseTitle, bbCourseId } = payload || {};
    activeCourseId = String(courseId || "");
    linkedCourseName = courseTitle || "";
    linkedBbCourseId = String(bbCourseId || "");
    if (bbWindow && !bbWindow.isDestroyed()) {
      await injectPage(bbWindow.webContents.getURL());
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
}

module.exports = {
  registerBlackboardHandlers,
  parseCourseFromUrl,
  detectFileRole,
};

