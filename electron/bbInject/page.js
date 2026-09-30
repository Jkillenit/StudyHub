// Injected into *.blackboard.com pages by blackboardWindow.cjs as `(<this file>)(ctx)`.
// Talks to Study Hub only through window.__shBridge (bbPreload.cjs). Must stay one function
// expression with no trailing semicolon. ctx: { courseId, bbCourseId, linkedName }.
(function (ctx) {
  if (!document.body) return;
  const INJECTED_ATTR = "data-sh-injected";
  const FOLDER_ATTR = "data-sh-folder";
  const courseId = ctx.courseId;
  const bbCourseId = ctx.bbCourseId;
  const linkedName = String(ctx.linkedName || "").trim();

  /* ---------------- toolbar ---------------- */

  function renderToolbar() {
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
      "letter-spacing: 0.08em",
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
        "cursor: pointer",
      ].join(";");
      btn.addEventListener("click", function () {
        if (!window.__shBridge || !window.__shBridge.syncCourse) return;
        btn.disabled = true;
        btn.textContent = "SYNCING... (UP TO A MINUTE)";
        window.__shBridge.syncCourse({ courseTitle: getCourseTitle() || "" }).then(function (res) {
          if (!document.body.contains(btn)) return;
          btn.disabled = false;
          btn.textContent = label;
          if (res && res.ok) {
            const c = res.counts || {};
            let msg = "\u2713 Synced " + (c.assignments || 0) + " due dates, " + (c.scored || 0) + " of " + (c.grades || 0) + " grades scored";
            msg += res.syllabus ? " \u00b7 syllabus found" : " \u00b7 no syllabus found";
            window.__shToast(msg, "success");
          } else {
            window.__shToast("\u2715 " + ((res && res.error) || "Sync failed"), "error");
          }
        });
      });
      return btn;
    }

    if (linkedName) {
      const courseLabel = document.createElement("span");
      courseLabel.style.cssText = "color:#00ff88;font-size:11px;letter-spacing:0.06em;";
      courseLabel.textContent = "\u25cf " + linkedName;
      courseArea.appendChild(courseLabel);

      const statusBtn = document.createElement("button");
      statusBtn.id = "sh-status-toggle";
      statusBtn.textContent = "STATUS \u25be";
      statusBtn.style.cssText = [
        "background: transparent",
        "border: 1px solid #1a3a1a",
        "color: #8ea88e",
        "font-family: inherit",
        "font-size: 9px",
        "letter-spacing: 0.1em",
        "padding: 3px 8px",
        "cursor: pointer",
      ].join(";");
      statusBtn.addEventListener("click", function () {
        window.__shToggleStatus();
      });
      courseArea.appendChild(statusBtn);
      courseArea.appendChild(makeSyncBtn("\u27f3 SYNC"));
    } else if (bbCourseId) {
      courseArea.appendChild(makeSyncBtn("\u27f3 SYNC TO STUDY HUB"));
    }

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "\u2715 CLOSE";
    closeBtn.style.cssText = [
      "background: transparent",
      "border: 1px solid #1a2a1a",
      "color: #8ea88e",
      "font-family: inherit",
      "font-size: 10px",
      "letter-spacing: 0.1em",
      "padding: 3px 10px",
      "cursor: pointer",
    ].join(";");
    closeBtn.addEventListener("click", function () {
      if (window.__shBridge && window.__shBridge.closeWindow) window.__shBridge.closeWindow();
      else window.close();
    });

    toolbar.appendChild(logo);
    toolbar.appendChild(div1);
    toolbar.appendChild(courseArea);
    toolbar.appendChild(closeBtn);

    document.body.prepend(toolbar);
    document.body.style.paddingTop = "40px";
  }

  /* ---------------- page helpers ---------------- */

  function makeBtn(text, onClick, style) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    btn.setAttribute("data-sh-btn", "true");
    btn.style.cssText =
      "background:transparent;border:1px solid #00ff88;color:#00ff88;font-family:'Consolas',monospace;font-size:10px;letter-spacing:0.08em;padding:3px 10px;cursor:pointer;margin-left:8px;white-space:nowrap;vertical-align:middle;z-index:999999;position:relative;pointer-events:auto;" +
      (style || "");
    btn.addEventListener("mousedown", (e) => e.stopPropagation(), true);
    btn.addEventListener(
      "click",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        onClick();
      },
      true
    );
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
        if (!text.match(/\.[a-z]{2,4}$/i)) return text;
      }
      el = el.parentElement;
      depth += 1;
    }
    return "General";
  }

  function getFileUrl(element) {
    const anchor = element.closest("a") || element.querySelector("a");
    if (
      anchor &&
      anchor.href &&
      (anchor.href.includes("/bbcswebdav/") ||
        anchor.href.includes("/xid-") ||
        anchor.href.includes("/courses/") ||
        anchor.href.includes("download"))
    ) {
      return anchor.href;
    }
    const dataUrl = element.closest("[data-url]")?.getAttribute("data-url");
    if (dataUrl) return dataUrl;

    const container = element.closest('[class*="content-item"],[class*="list-item"],[data-handler]');
    if (container) {
      const link = container.querySelector('a[href*="bbcswebdav"],a[href*="/xid-"],a[href*="download"]');
      if (link && link.href) return link.href;
    }
    return null;
  }

  function getContentId(element) {
    const container = element.closest("[data-content-id]") || element.querySelector("[data-content-id]");
    const fromAttr = container?.getAttribute("data-content-id");
    if (fromAttr) return fromAttr;
    const row = element.closest('[class*="content-list-item"]');
    return row?.getAttribute("data-content-id") || null;
  }

  function getFileName(element) {
    const title = element.closest("[title]")?.title || element.querySelector("[title]")?.title;
    if (title && title.match(/\.[a-z]{2,5}$/i)) return title;

    const text = element.textContent?.trim();
    if (text && text.match(/\.[a-z]{2,5}$/i)) return text.split("\n")[0].trim();

    const aria = element.getAttribute("aria-label") || element.querySelector("[aria-label]")?.getAttribute("aria-label");
    if (aria) return aria.trim();
    return "unknown_file";
  }

  function getCourseTitle() {
    const selectors = [
      'h1[class*="course-title"]',
      'h1[class*="courseName"]',
      ".base-page-header h1",
      '[class*="course-banner"] h1',
      '[class*="courseBanner"] h1',
      '[aria-label*="Course name"]',
      "h1",
    ];
    for (const sel of selectors) {
      const text = document.querySelector(sel)?.textContent?.trim();
      if (text && text.length > 2 && text.length < 120) return text;
    }
    const docTitle = document.title?.trim();
    if (docTitle && docTitle.length > 2) return docTitle.replace(/\s*\|\s*Blackboard.*$/i, "").trim();
    return null;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  window.__shToast = function (message, type) {
    const existingToast = document.getElementById("sh-bb-toast");
    if (existingToast) existingToast.remove();

    const color = type === "error" ? "#ff4444" : type === "warning" ? "#ffaa00" : "#00ff88";

    const toast = document.createElement("div");
    toast.id = "sh-bb-toast";
    toast.style.cssText =
      "position:fixed;bottom:24px;right:24px;background:#0a0e0a;border:1px solid " +
      color +
      ";border-left:3px solid " +
      color +
      ";color:" +
      color +
      ";font-family:Consolas,monospace;font-size:11px;letter-spacing:0.06em;padding:10px 16px;z-index:999999;max-width:320px;line-height:1.4;box-shadow:0 4px 12px rgba(0,0,0,0.4);animation:shSlideIn 150ms ease";

    if (!document.getElementById("sh-toast-style")) {
      const styleEl = document.createElement("style");
      styleEl.id = "sh-toast-style";
      styleEl.textContent = "@keyframes shSlideIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}";
      document.head.appendChild(styleEl);
    }

    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(function () {
      if (!toast.parentNode) return;
      toast.style.opacity = "0";
      toast.style.transition = "opacity 200ms ease";
      setTimeout(function () {
        toast.remove();
      }, 200);
    }, 4000);
  };

  /* ---------------- import buttons ---------------- */

  function injectImportButtons() {
    const seen = new Set();
    const rows = document.querySelectorAll('[data-content-id], .content-list-item, [class*="content-list-item"]');
    rows.forEach((item) => {
      if (seen.has(item) || item.hasAttribute(INJECTED_ATTR)) return;

      const analyticsId = item.querySelector("[data-analytics-id]")?.getAttribute("data-analytics-id") || "";
      if (
        analyticsId.includes("folder.toggleFolder") ||
        analyticsId.includes("assessment.readOnly") ||
        analyticsId.includes("gradebook")
      ) {
        return;
      }

      const fileName = getFileName(item);
      const looksLikeFileName = /\.[a-z0-9]{2,5}$/i.test(fileName || "");
      const isCourseContentLink = analyticsId.includes("course.outline.courseContent.link");
      if (!looksLikeFileName && !isCourseContentLink) return;

      const folderName = getFolderContext(item);
      const contentId = getContentId(item);
      const fileUrl = getFileUrl(item) || (contentId ? "bb-content-id:" + contentId : null);
      if (!fileUrl) return;

      seen.add(item);
      item.setAttribute(INJECTED_ATTR, "1");
      const btn = makeBtn("\u2192 IMPORT", () => {
        let effectiveFileName = fileName;
        try {
          const lastPart = fileUrl.split("/").pop().split("?")[0];
          const decoded = decodeURIComponent(lastPart);
          if (decoded.includes(".") && decoded.length > 3) effectiveFileName = decoded;
        } catch {
          /* keep the row's name */
        }
        window.__shBridge?.importFile?.({
          fileUrl,
          fileName: effectiveFileName || fileName,
          folderName,
          contentId,
          courseId,
          bbCourseId,
          courseTitle: getCourseTitle() || "",
        });
      });

      let actions = item.querySelector('[class*="action"],[class*="options"],[data-testid*="action"]');
      if (!actions) {
        actions = document.createElement("div");
        actions.setAttribute("data-sh-actions", "1");
        actions.style.cssText = "display:flex;justify-content:flex-end;align-items:center;gap:6px;margin-top:6px;";
        item.appendChild(actions);
      }
      actions.appendChild(btn);
    });
  }

  function importFolder(folderName, folderElement) {
    const files = [];
    folderElement.querySelectorAll("[" + INJECTED_ATTR + "]").forEach((item) => {
      const contentId = getContentId(item);
      const fileUrl = getFileUrl(item) || (contentId ? "bb-content-id:" + contentId : null);
      const fileName = getFileName(item);
      if (fileUrl && fileName) files.push({ fileUrl, fileName, contentId, folderName, courseId, bbCourseId, courseTitle: getCourseTitle() || "" });
    });
    window.__shBridge?.importFolder?.({ folderName, courseId, bbCourseId, courseTitle: getCourseTitle() || "", files });
  }

  function injectFolderButtons() {
    const seen = new Set();
    ['[class*="folder"]', "[aria-expanded]", "[data-contents]"].forEach((selector) => {
      document.querySelectorAll(selector).forEach((el) => {
        if (seen.has(el) || el.getAttribute(FOLDER_ATTR)) return;
        const titleEl = el.querySelector('h3, h4, [class*="title"], [class*="folder-name"]');
        const folderName = titleEl?.textContent?.trim();
        if (!folderName) return;
        seen.add(el);
        el.setAttribute(FOLDER_ATTR, "1");
        titleEl.appendChild(makeBtn("\u2192 IMPORT ALL", () => importFolder(folderName, el), "border-color:#00ccff;color:#00ccff;"));
      });
    });
  }

  /* ---------------- status panel ---------------- */

  function renderStatus(status, content) {
    if (!content) return;
    if (!status) {
      content.textContent = "No data available";
      return;
    }
    const syllabusLine = status.hasSyllabus
      ? '<div style="color:#00ff88;margin-bottom:4px">\u2713 Syllabus \u2014 ' + Number(status.gradeComponentCount || 0) + " components</div>"
      : '<div style="color:#8ea88e;margin-bottom:4px">\u25cb Syllabus \u2014 not imported</div>';
    const modulesHtml = (status.modules || [])
      .map(
        (m) =>
          '<div style="margin:3px 0;padding-left:8px">' +
          (m.itemCount > 0 ? '<span style="color:#00ff88">\u2713</span>' : '<span style="color:#8ea88e">\u25cb</span>') +
          " " +
          escapeHtml(m.title || "") +
          ' <span style="color:#4a6a4a">(' +
          Number(m.itemCount || 0) +
          " items)</span></div>"
      )
      .join("");
    content.innerHTML =
      syllabusLine +
      '<div style="color:#00ccff;letter-spacing:0.1em;font-size:9px;margin:8px 0 4px">CONTENT</div>' +
      (modulesHtml || '<div style="color:#4a6a4a;padding-left:8px">No content yet</div>');
  }

  async function fetchStatus() {
    const bridge = window.__shBridge;
    return bridge && bridge.getCourseStatus ? bridge.getCourseStatus({ courseId, bbCourseId }) : null;
  }

  window.__shToggleStatus = async function () {
    const existingPanel = document.getElementById("sh-status-panel");
    if (existingPanel) {
      existingPanel.remove();
      return;
    }

    const panel = document.createElement("div");
    panel.id = "sh-status-panel";
    panel.style.cssText = [
      "position: fixed",
      "top: 40px",
      "right: 0",
      "width: 280px",
      "max-height: calc(100vh - 40px)",
      "background: #0a0e0a",
      "border-left: 2px solid #1a3a1a",
      "border-bottom: 2px solid #1a3a1a",
      "padding: 16px",
      "z-index: 999998",
      "font-family: Consolas, monospace",
      "font-size: 11px",
      "color: #8ea88e",
      "overflow-y: auto",
    ].join(";");
    panel.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">' +
      '<div style="color:#00ff88;font-weight:600;letter-spacing:0.12em;font-size:11px;">COURSE STATUS</div>' +
      '<button id="sh-status-refresh" style="background:transparent;border:1px solid #1a3a1a;color:#8ea88e;font-family:inherit;font-size:9px;letter-spacing:0.1em;padding:2px 8px;cursor:pointer;">\u21bb REFRESH</button>' +
      "</div>" +
      '<div id="sh-status-content" style="color:#8ea88e;font-size:10px;">Loading...</div>';
    document.body.appendChild(panel);

    renderStatus(await fetchStatus(), document.getElementById("sh-status-content"));
    document.getElementById("sh-status-refresh")?.addEventListener("click", async function () {
      const content = document.getElementById("sh-status-content");
      if (content) content.textContent = "Refreshing...";
      renderStatus(await fetchStatus(), content);
    });
  };

  /* ---------------- run ---------------- */

  renderToolbar();
  injectImportButtons();
  injectFolderButtons();

  // Blackboard renders content lazily; re-scan after DOM changes settle. One observer per page.
  window.__shRescan = function () {
    injectImportButtons();
    injectFolderButtons();
  };
  if (!window.__shObserverActive) {
    window.__shObserverActive = true;
    let rescanTimer = null;
    new MutationObserver(() => {
      clearTimeout(rescanTimer);
      rescanTimer = setTimeout(() => window.__shRescan(), 300);
    }).observe(document.body, { childList: true, subtree: true });
  }
})
