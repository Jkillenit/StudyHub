const { BrowserWindow, session, ipcMain } = require("electron");

let bbWindow = null;

const BB_PARTITION = "persist:blackboard";
const BB_URL = "https://ualearn.blackboard.com";

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
    if (!document.body) return;
    if (window.__shObserverActive) return;
    window.__shObserverActive = true;

    window.__shInjectToolbar = function() {
      if (!document.getElementById("sh-bb-toolbar")) {
        const event = new CustomEvent("sh-bb-reinject-toolbar");
        window.dispatchEvent(event);
      }
    };

    const observer = new MutationObserver(function() {
      if (!document.getElementById("sh-bb-toolbar")) {
        window.__shInjectToolbar && window.__shInjectToolbar();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
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

async function injectToolbarAndObserver() {
  if (!bbWindow || bbWindow.isDestroyed()) return;
  await bbWindow.webContents.executeJavaScript(TOOLBAR_SCRIPT).catch(() => {});
  await bbWindow.webContents.executeJavaScript(OBSERVER_SCRIPT).catch(() => {});
}

async function handleUrl(mainWindow, url) {
  await injectToolbarAndObserver();
  const course = parseCourseFromUrl(url);
  if (course && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("bb:course-detected", course);
  }
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
    },
  });

  bbWindow.webContents.on("did-navigate", async (_event, url) => {
    await handleUrl(mainWindow, url);
  });

  bbWindow.webContents.on("did-navigate-in-page", async (_event, url) => {
    await handleUrl(mainWindow, url);
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

  // SESSION B: Add import button injection function here.
  // Called from MutationObserver and did-navigate handlers.
  // function injectImportButtons() { ... }

  // SESSION B: Add file download handler here.
  // Intercepts Blackboard file URLs and routes through existing Study Hub pipeline.
  // ipcMain.handle('bb:download-file', ...)

  // SESSION B: Add folder detection here.
  // Reads DOM for folder context around files.
  // Passes folder name as module name to renderer.

  // SESSION C: Add course selector injection here.
  // Updates toolbar with active Study Hub course.
  // ipcMain.handle('bb:set-active-course', ...)
}

module.exports = {
  openBlackboardWindow,
  closeBlackboardWindow,
  disconnectBlackboard,
  registerBlackboardHandlers,
  parseCourseFromUrl,
  isLoggedIn,
};
