/**
 * One transparent, click-through, always-on-top window per display. Windows are hidden (not
 * just transparent) whenever Nova is hidden, so nothing renders.
 */
const { BrowserWindow, screen } = require("electron");
const path = require("path");

const PRELOAD = path.join(__dirname, "..", "overlayPreload.cjs");
const HTML = path.join(__dirname, "..", "..", "dist", "overlay.html");

/**
 * A topmost window covering the whole monitor makes Windows report a fullscreen app
 * (SHQueryUserNotificationState = busy), which would trip auto-hide on herself. One pixel short avoids it.
 */
const overlayBounds = (d) => ({ ...d.bounds, height: d.bounds.height - 1 });

function createOverlays({ onReady }) {
  /** displayId -> BrowserWindow */
  const wins = new Map();
  let shown = false;

  function create(d) {
    const win = new BrowserWindow({
      ...overlayBounds(d),
      show: false,
      transparent: true,
      backgroundColor: "#00000000",
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      webPreferences: {
        preload: PRELOAD,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    win.setAlwaysOnTop(true, "screen-saver");
    win.setBounds(overlayBounds(d));
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setContentProtection(true);
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.webContents.on("will-navigate", (e) => e.preventDefault());
    win.webContents.once("did-finish-load", () => onReady(d.id));
    win.loadFile(HTML);
    if (shown) win.showInactive();
    wins.set(d.id, win);
  }

  function destroyAll() {
    for (const win of wins.values()) if (!win.isDestroyed()) win.destroy();
    wins.clear();
  }

  function build() {
    destroyAll();
    for (const d of screen.getAllDisplays()) create(d);
  }

  return {
    build,
    destroyAll,
    show() {
      shown = true;
      for (const win of wins.values()) if (!win.isDestroyed() && !win.isVisible()) win.showInactive();
    },
    hide() {
      shown = false;
      for (const win of wins.values()) if (!win.isDestroyed()) win.hide();
    },
    send(displayId, state) {
      const win = wins.get(displayId);
      if (win && !win.isDestroyed()) win.webContents.send("overlay:state", state);
    },
    displayIds: () => [...wins.keys()],
    /** Display id for an overlay's webContents, or null when the sender isn't an overlay. */
    displayOf(sender) {
      for (const [id, win] of wins) if (!win.isDestroyed() && win.webContents === sender) return id;
      return null;
    },
    /**
     * Chromium drops the mousedown on a non-focusable window, so she's focusable only while the
     * cursor is on her or her bubble; focus goes back to the window below when it leaves.
     */
    setInteractive(displayId, on) {
      const win = wins.get(displayId);
      if (!win || win.isDestroyed()) return;
      if (on) {
        win.setFocusable(true);
        win.setIgnoreMouseEvents(false);
        return;
      }
      win.setIgnoreMouseEvents(true, { forward: true });
      if (win.isFocused()) win.blur();
      win.setFocusable(false);
    },
    window: (displayId) => wins.get(displayId) || null,
  };
}

module.exports = { createOverlays };
