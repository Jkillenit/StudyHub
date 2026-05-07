const { app, BrowserWindow, session, ipcMain, net } = require("electron");
const fs = require("fs");
const path = require("path");

let bbWindow = null;
let activeCourseId = "";
let linkedCourseName = "";
let linkedBbCourseId = "";

const BB_PARTITION = "persist:blackboard";
const BB_URL = "https://ualearn.blackboard.com";
const BB_TEMP_DIR = path.join(app.getPath("temp"), "studyhub-bb");

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
  } else {
    const createBtn = document.createElement("button");
    createBtn.id = "sh-create-course-btn";
    createBtn.textContent = "+ CREATE STUDY HUB COURSE";
    createBtn.style.cssText = [
      "background: transparent",
      "border: 1px solid #00ff88",
      "color: #00ff88",
      "font-family: inherit",
      "font-size: 10px",
      "letter-spacing: 0.1em",
      "padding: 4px 12px",
      "cursor: pointer",
      "transition: background 100ms"
    ].join(";");
    createBtn.addEventListener("click", function() {
      var title = window.__shGetCourseTitle ? window.__shGetCourseTitle() : null;
      createBtn.textContent = "CREATING...";
      createBtn.disabled = true;
      if (window.__shBridge && window.__shBridge.createCourse) {
        window.__shBridge.createCourse({
          courseTitle: title || ${safeBbCourseId},
          bbCourseId: ${safeBbCourseId}
        });
      }
    });
    courseArea.appendChild(createBtn);
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

  window.__shUpdateToolbar = function(data) {
    if (data && data.linked) {
      var t = document.getElementById("sh-bb-toolbar");
      if (t) t.remove();
    }
  };
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

function displayLinkedCourseName(pageBbCourseId) {
  return linkedBbCourseId && pageBbCourseId && pageBbCourseId === linkedBbCourseId ? linkedCourseName : "";
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

async function importFileFromUrl(context, mainWindow) {
  let { fileUrl, fileName, folderName, courseId, bbCourseId, contentId, courseTitle, skipIfRole = [] } = context || {};
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

    if ((!fileUrl || String(fileUrl).startsWith("bb-content-id:")) && contentId && bbCourseId) {
      fileUrl = await resolveDownloadUrlFromContent(bbCourseId, contentId);
      if (!fileUrl) throw new Error("Could not resolve Blackboard download URL from content item");
    }

    const localPath = await downloadBBFile(fileUrl, fileName);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("bb:import-ready", {
        localPath,
        fileName,
        folderName,
        courseId,
        bbCourseId,
        courseTitle: String(courseTitle || ""),
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

function buildInjectionScript(courseId, bbCourseId, _linkedCourseName) {
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
          '<div style="color:#00ff88;font-weight:600;letter-spacing:0.12em;margin-bottom:12px;">COURSE STATUS</div>' +
          '<div id="sh-status-content" style="color:#8ea88e;font-size:10px;">Loading...</div>';

        document.body.appendChild(panel);

        var bridge = window.__shBridge;
        var status =
          bridge && bridge.getCourseStatus
            ? await bridge.getCourseStatus({
                courseId: courseId,
                bbCourseId: bbCourseId
              })
            : null;

        var contentEl = document.getElementById('sh-status-content');
        if (!contentEl) return;

        if (!status) {
          contentEl.innerHTML = '<div>No data available</div>';
          return;
        }

        var syllabusLine = status.hasSyllabus
          ? '<div style="color:#00ff88">\\u2713 Syllabus \\u2014 ' +
            status.gradeComponentCount +
            ' components</div>'
          : '<div style="color:#8ea88e">\\u25cb Syllabus \\u2014 not imported</div>';

        var modulesHtml = (status.modules || [])
          .map(function(m) {
            var mark =
              m.itemCount > 0
                ? '<span style="color:#00ff88">\\u2713</span>'
                : '<span style="color:#8ea88e">\\u25cb</span>';
            return (
              '<div style="margin:4px 0">' +
              mark +
              ' ' +
              String(m.title || '') +
              ' (' +
              m.itemCount +
              ' items)</div>'
            );
          })
          .join('');

        var emptyState =
          status.moduleCount === 0
            ? '<div style="color:#8ea88e;margin-top:8px">No content imported yet.<br>Click \\u2192 IMPORT on files below.</div>'
            : '';

        contentEl.innerHTML =
          '<div style="margin-bottom:8px">' +
          syllabusLine +
          '</div>' +
          '<div style="color:#00ccff;letter-spacing:0.1em;font-size:9px;margin-bottom:6px">CONTENT</div>' +
          modulesHtml +
          emptyState;
      };

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
              contentId: getContentId(item),
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

async function injectToolbarAndObserver(pageUrl) {
  if (!bbWindow || bbWindow.isDestroyed()) return;
  const url = pageUrl || bbWindow.webContents.getURL();
  const courseId = activeCourseId || "";
  const bbCourse = parseCourseFromUrl(url);
  const pageBbId = bbCourse?.bbCourseId || "";
  const displayLinked = displayLinkedCourseName(pageBbId);
  await bbWindow.webContents.executeJavaScript(buildToolbarScript(courseId, pageBbId, displayLinked)).catch(() => {});
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
    const courseId = activeCourseId || "";
    const bbCourse = parseCourseFromUrl(url);
    const bbCourseId = bbCourse?.bbCourseId || "";
    const displayLinked = displayLinkedCourseName(bbCourseId);
    await bbWindow.webContents
      .executeJavaScript(buildToolbarScript(courseId, bbCourseId, displayLinked))
      .catch(() => {});
    await bbWindow.webContents.executeJavaScript(OBSERVER_SCRIPT).catch(() => {});
    await bbWindow.webContents
      .executeJavaScript(buildInjectionScript(courseId, bbCourseId, displayLinked))
      .catch(() => {});
    if (bbCourse && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("bb:course-detected", bbCourse);
    }
  });

  bbWindow.webContents.on("did-navigate-in-page", async (_event, url) => {
    const courseId = activeCourseId || "";
    const bbCourse = parseCourseFromUrl(url);
    const bbCourseId = bbCourse?.bbCourseId || "";
    const displayLinked = displayLinkedCourseName(bbCourseId);
    await bbWindow.webContents
      .executeJavaScript(buildToolbarScript(courseId, bbCourseId, displayLinked))
      .catch(() => {});
    await bbWindow.webContents.executeJavaScript(OBSERVER_SCRIPT).catch(() => {});
    await bbWindow.webContents
      .executeJavaScript(buildInjectionScript(courseId, bbCourseId, displayLinked))
      .catch(() => {});
    if (bbCourse && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("bb:course-detected", bbCourse);
    }
  });

  bbWindow.webContents.on("did-finish-load", async () => {
    const url = bbWindow.webContents.getURL();
    await injectToolbarAndObserver(url);
    const cid = activeCourseId || "";
    const bbCourse = parseCourseFromUrl(url);
    const bbCourseIdNav = bbCourse?.bbCourseId || "";
    const displayLinked = displayLinkedCourseName(bbCourseIdNav);
    const reinjectToolbar = buildToolbarScript(cid, bbCourseIdNav, displayLinked);
    await bbWindow.webContents
      .executeJavaScript(
        `
        (function() {
          if (window.__shToolbarReinjectBound) return;
          window.__shToolbarReinjectBound = true;
          window.addEventListener("sh-bb-reinject-toolbar", function() {
            ${reinjectToolbar}
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

  ipcMain.handle("bb:create-course", async (_event, data) => {
    activeCourseId = "";
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("bb:create-course-request", {
        courseTitle: data?.courseTitle,
        bbCourseId: data?.bbCourseId,
      });
    }
    return { success: true };
  });

  ipcMain.handle("bb:course-created", async (_event, payload) => {
    const { courseId, courseTitle, bbCourseId } = payload || {};
    activeCourseId = String(courseId || "");
    linkedCourseName = courseTitle || "";
    linkedBbCourseId = String(bbCourseId || "");
    console.log("[BB] Course created and active:", courseTitle, courseId);

    if (bbWindow && !bbWindow.isDestroyed()) {
      bbWindow.webContents.send("bb:toolbar-update", {
        courseId,
        courseTitle,
        bbCourseId,
        linked: true,
      });
      const url = bbWindow.webContents.getURL();
      const bbCourse = parseCourseFromUrl(url);
      const pageBbId = bbCourse?.bbCourseId || linkedBbCourseId || "";
      const displayLinked = displayLinkedCourseName(pageBbId);
      await bbWindow.webContents
        .executeJavaScript(buildToolbarScript(activeCourseId, pageBbId, displayLinked))
        .catch(() => {});
      await bbWindow.webContents
        .executeJavaScript(buildInjectionScript(activeCourseId, pageBbId, displayLinked))
        .catch(() => {});
    }
    return { success: true };
  });

  ipcMain.handle("bb:get-course-status", async (_event, { courseId }) => {
    if (!courseId) return null;
    try {
      const { getDb } = require("./database.cjs");
      const db = getDb();
      const gradeRows = db
        .prepare(
          `
        SELECT COUNT(*) as count
        FROM grade_components gc
        JOIN courses c ON c.id = gc.course_id
        WHERE c.uuid = ?
      `
        )
        .get(courseId);

      const modules = db
        .prepare(
          `
        SELECT m.title,
          COUNT(ci.id) as item_count
        FROM modules m
        LEFT JOIN content_items ci ON ci.module_id = m.id
        JOIN courses c ON c.id = m.course_id
        WHERE c.uuid = ?
        GROUP BY m.id
      `
        )
        .all(courseId);

      return {
        hasSyllabus: (gradeRows?.count || 0) > 0,
        gradeComponentCount: gradeRows?.count || 0,
        moduleCount: modules.length,
        modules: modules.map((m) => ({
          title: m.title,
          itemCount: m.item_count,
        })),
      };
    } catch {
      return null;
    }
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
