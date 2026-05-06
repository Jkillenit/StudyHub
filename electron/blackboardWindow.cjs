const { app, BrowserWindow, session, ipcMain, net } = require("electron");
const fs = require("fs");
const path = require("path");

let bbWindow = null;
let activeCourseId = "";

const BB_PARTITION = "persist:blackboard";
const BB_URL = "https://ualearn.blackboard.com";
const BB_TEMP_DIR = path.join(app.getPath("temp"), "studyhub-bb");

const TOOLBAR_SCRIPT = `
  (function() {
    if (!document.body) return;
    if (document.getElementById("sh-bb-toolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.id = "sh-bb-toolbar";
    toolbar.style.cssText = [
      "position: fixed",
      "top: 0",
      "left: 0",
      "right: 0",
      "height: 36px",
      "background: #0a0e0a",
      "border-bottom: 1px solid #1a2a1a",
      "display: flex",
      "align-items: center",
      "padding: 0 16px",
      "gap: 12px",
      "z-index: 999999",
      "font-family: 'JetBrains Mono', 'Consolas', monospace",
      "font-size: 11px",
      "color: #8ea88e",
      "letter-spacing: 0.08em"
    ].join(";");

    const logo = document.createElement("span");
    logo.style.cssText = "color:#00ff88;font-weight:600;letter-spacing:0.12em;";
    logo.textContent = "STUDY HUB";

    const divider = document.createElement("span");
    divider.style.cssText = "color:#1a2a1a;font-size:14px;";
    divider.textContent = "|";

    const status = document.createElement("span");
    status.id = "sh-bb-status";
    status.style.color = "#8ea88e";
    status.textContent = "CONNECTED";

    const spacer = document.createElement("div");
    spacer.style.flex = "1";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕ CLOSE";
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
      window.close();
    });

    toolbar.appendChild(logo);
    toolbar.appendChild(divider);
    toolbar.appendChild(status);
    toolbar.appendChild(spacer);
    toolbar.appendChild(closeBtn);

    document.body.prepend(toolbar);
    document.body.style.paddingTop = "36px";
  })();
`;

const OBSERVER_SCRIPT = `
  (function() {
    if (!document.body) return
    if (window.__shObserverActive) return;
    window.__shObserverActive = true
    let injectTimer = null

    const observer = new MutationObserver(() => {
      if (!document.getElementById("sh-bb-toolbar")) {
        // Toolbar re-injection is handled by navigation handlers
      }
      clearTimeout(injectTimer)
      injectTimer = setTimeout(() => {
        window.__shInjectImportButtons?.()
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

function ensureTempDir() {
  if (!fs.existsSync(BB_TEMP_DIR)) {
    fs.mkdirSync(BB_TEMP_DIR, { recursive: true });
  }
}

async function downloadBBFile(fileUrl, fileName) {
  ensureTempDir();
  const safeName = String(fileName || "bb_file")
    .replace(/[^a-zA-Z0-9._\-\s]/g, "_")
    .trim();
  const finalName = safeName || `bb_${Date.now()}`;
  const localPath = path.join(BB_TEMP_DIR, finalName);

  return new Promise((resolve, reject) => {
    const bbSession = session.fromPartition(BB_PARTITION);
    const request = net.request({ url: fileUrl, session: bbSession });
    const chunks = [];

    request.on("response", (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: ${response.statusCode}`));
        return;
      }
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const buffer = Buffer.concat(chunks);
        fs.writeFileSync(localPath, buffer);
        resolve(localPath);
      });
      response.on("error", reject);
    });

    request.on("error", reject);
    request.end();
  });
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

async function importFileFromUrl(context, mainWindow) {
  const { fileUrl, fileName, folderName, courseId, bbCourseId, skipIfRole = [] } = context || {};
  const ext = String(fileName || "").split(".").pop().toLowerCase();
  const role = detectFileRole(fileName, folderName);

  if (skipIfRole.includes(role)) {
    return { success: false, reason: "skipped", role };
  }

  const action = getRoleAction(role, ext);
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("bb:import-started", { fileName, folderName, role });
    }

    const localPath = await downloadBBFile(fileUrl, fileName);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("bb:import-ready", {
        localPath,
        fileName,
        folderName,
        courseId,
        bbCourseId,
        role,
        action,
      });
    }

    return { success: true, role, action, localPath };
  } catch (err) {
    console.error("[BB Import] Failed:", fileName, err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("bb:import-error", {
        fileName,
        error: err?.message || String(err),
      });
    }
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
        btn.textContent = text;
        btn.setAttribute('data-sh-btn', 'true');
        btn.style.cssText =
          "background:transparent;border:1px solid #00ff88;color:#00ff88;font-family:'Consolas',monospace;font-size:10px;letter-spacing:0.08em;padding:3px 10px;cursor:pointer;margin-left:8px;white-space:nowrap;vertical-align:middle;z-index:99998;position:relative;" + (style || "");
        btn.addEventListener('mousedown', (e) => e.stopPropagation());
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        });
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

      function getFileName(element) {
        const title = element.closest('[title]')?.title || element.querySelector('[title]')?.title;
        if (title && title.match(/\\.[a-z]{2,5}$/i)) return title;

        const text = element.textContent?.trim();
        if (text && text.match(/\\.[a-z]{2,5}$/i)) return text.split('\\n')[0].trim();

        const aria = element.getAttribute('aria-label') || element.querySelector('[aria-label]')?.getAttribute('aria-label');
        if (aria) return aria.trim();
        return 'unknown_file';
      }

      function injectImportButtons() {
        const fileSelectors = [
          '[title$=".pdf"],[title$=".pptx"],[title$=".docx"],[title$=".ppt"],[title$=".PDF"],[title$=".PPTX"],[title$=".DOCX"]',
          '[class*="file-icon"]',
          '[class*="document-icon"]',
          '[data-ng-init]',
          'a[href*="bbcswebdav"],a[href*="/xid-"],a[href*="download"]'
        ];
        const seen = new Set();
        fileSelectors.forEach((selector) => {
          document.querySelectorAll(selector).forEach((el) => {
            const item = el.closest('[class*="content-item"],[class*="list-item"],[role="listitem"],[data-handler]') || el;
            if (seen.has(item)) return;
            if (item.hasAttribute(INJECTED_ATTR)) return;
            const fileUrl = getFileUrl(item);
            if (!fileUrl) return;

            const fileName = getFileName(item);
            const folderName = getFolderContext(item);
            seen.add(item);
            item.setAttribute(INJECTED_ATTR, '1');
            const btn = makeBtn('→ IMPORT', () => {
              window.__shImportFile?.({
                fileUrl,
                fileName,
                folderName,
                courseId,
                bbCourseId
              });
            });

            const actions = item.querySelector('[class*="action"],[class*="options"],[data-testid*="action"]') || item;
            actions.appendChild(btn);
          });
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
                window.__shImportFolder?.({
                  folderName,
                  folderElement: el,
                  courseId,
                  bbCourseId
                });
              },
              'border-color:#00ccff;color:#00ccff;'
            );
            titleEl.appendChild(btn);
          });
        });
      }

      window.__shInjectImportButtons = injectImportButtons;

      window.__shImportFile = (context) => {
        window.__shBridge?.importFile?.(context);
      };

      window.__shImportFolder = (context) => {
        const files = [];
        const items = context.folderElement.querySelectorAll('[' + INJECTED_ATTR + ']');
        items.forEach((item) => {
          const fileUrl = getFileUrl(item);
          const fileName = getFileName(item);
          if (fileUrl && fileName) {
            files.push({
              fileUrl,
              fileName,
              folderName: context.folderName,
              courseId: context.courseId,
              bbCourseId: context.bbCourseId
            });
          }
        });
        window.__shBridge?.importFolder?.({
          folderName: context.folderName,
          courseId: context.courseId,
          bbCourseId: context.bbCourseId,
          files
        });
      };

      injectImportButtons();
      injectFolderButtons();
    })();
  `;
}

async function injectToolbarAndObserver() {
  if (!bbWindow || bbWindow.isDestroyed()) return;
  await bbWindow.webContents.executeJavaScript(TOOLBAR_SCRIPT).catch(() => {});
  await bbWindow.webContents.executeJavaScript(OBSERVER_SCRIPT).catch(() => {});
}

async function openBlackboardWindow(mainWindow) {
  if (bbWindow && !bbWindow.isDestroyed()) {
    bbWindow.focus();
    return;
  }

  const loggedIn = await isLoggedIn();
  bbWindow = new BrowserWindow({
    width: 1200,
    height: 850,
    title: "Study Hub — Blackboard",
    webPreferences: {
      partition: BB_PARTITION,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "bbPreload.cjs"),
    },
  });

  bbWindow.webContents.on("did-navigate", async (_event, url) => {
    await bbWindow.webContents.executeJavaScript(TOOLBAR_SCRIPT).catch(() => {});
    await bbWindow.webContents.executeJavaScript(OBSERVER_SCRIPT).catch(() => {});
    const courseId = activeCourseId || "";
    const bbCourse = parseCourseFromUrl(url);
    const bbCourseId = bbCourse?.bbCourseId || "";
    await bbWindow.webContents.executeJavaScript(buildInjectionScript(courseId, bbCourseId)).catch(() => {});
    if (bbCourse && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("bb:course-detected", bbCourse);
    }
  });

  bbWindow.webContents.on("did-navigate-in-page", async (_event, url) => {
    await bbWindow.webContents.executeJavaScript(TOOLBAR_SCRIPT).catch(() => {});
    await bbWindow.webContents.executeJavaScript(OBSERVER_SCRIPT).catch(() => {});
    const courseId = activeCourseId || "";
    const bbCourse = parseCourseFromUrl(url);
    const bbCourseId = bbCourse?.bbCourseId || "";
    await bbWindow.webContents.executeJavaScript(buildInjectionScript(courseId, bbCourseId)).catch(() => {});
    if (bbCourse && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("bb:course-detected", bbCourse);
    }
    await bbWindow.webContents.executeJavaScript(TOOLBAR_SCRIPT).catch(() => {});
  });

  bbWindow.webContents.on("did-finish-load", async () => {
    await injectToolbarAndObserver();
    await bbWindow.webContents
      .executeJavaScript(
        `
        (function() {
          if (window.__shToolbarReinjectBound) return;
          window.__shToolbarReinjectBound = true;
          window.addEventListener("sh-bb-reinject-toolbar", function() {
            ${TOOLBAR_SCRIPT}
          });
        })();
      `
      )
      .catch(() => {});
  });

  bbWindow.on("closed", () => {
    bbWindow = null;
  });

  const startUrl = loggedIn ? `${BB_URL}/ultra/course` : BB_URL;
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
  const bbSession = session.fromPartition(BB_PARTITION);
  await bbSession.clearStorageData();
  await bbSession.clearCache();
}

function registerBlackboardHandlers(mainWindow) {
  ipcMain.handle("bb:open", async () => {
    await openBlackboardWindow(mainWindow);
    return { success: true };
  });

  ipcMain.handle("bb:close", async () => {
    closeBlackboardWindow();
    return { success: true };
  });

  ipcMain.handle("bb:disconnect", async () => {
    await disconnectBlackboard();
    return { success: true };
  });

  ipcMain.handle("bb:isLoggedIn", async () => {
    return isLoggedIn();
  });

  ipcMain.handle("bb:getStatus", async () => {
    const loggedIn = await isLoggedIn();
    return {
      loggedIn,
      windowOpen: bbWindow !== null && !bbWindow.isDestroyed(),
    };
  });

  ipcMain.handle("bb:import-file", async (_event, context) => {
    return importFileFromUrl(context, mainWindow);
  });

  ipcMain.handle("bb:import-folder", async (_event, context) => {
    const { files = [], skipIfRole = [] } = context || {};
    const results = [];
    for (const file of files) {
      const result = await importFileFromUrl({ ...file, skipIfRole }, mainWindow);
      results.push(result);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return {
      success: true,
      total: files.length,
      imported: results.filter((r) => r.success).length,
      skipped: results.filter((r) => r.reason === "skipped").length,
    };
  });

  ipcMain.handle("bb:set-active-course", async (_event, courseId) => {
    activeCourseId = String(courseId || "");
    return { success: true };
  });

  // SESSION C: Course Sweep
  // async function sweepCourse(bbCourseId) {
  //   Reads all file items from current DOM via executeJavaScript
  //   Calls importFileFromUrl in loop
  //   skipIfRole: ['assignment', 'assessment']
  //   Reports progress via bb:sweep-progress
  // }

  // SESSION C: Semester Sweep
  // async function sweepSemester() {
  //   Navigates to BB courses page
  //   Reads all enrolled course links
  //   Calls sweepCourse on each
  //   2-3 sec delay between courses
  //   Reports overall progress
  // }

  // SESSION C: Course selector in toolbar
  // Updates activeCourseId when user selects
  // a Study Hub course from toolbar dropdown
}

module.exports = {
  openBlackboardWindow,
  closeBlackboardWindow,
  disconnectBlackboard,
  registerBlackboardHandlers,
  parseCourseFromUrl,
  isLoggedIn,
  importFileFromUrl,
  detectFileRole,
  downloadBBFile,
};
