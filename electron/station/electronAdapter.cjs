/**
 * Only Station file allowed to import Electron. Thin bridge for jobs/scheduler later.
 */
const { app, powerMonitor, BrowserWindow } = require("electron");
const { getDb } = require("../database.cjs");

/**
 * @param {{
 *   getMainWindow?: () => import('electron').BrowserWindow | null,
 *   backgroundCheck?: (id: string) => Promise<unknown>,
 *   getApiKey?: () => string|null,
 * }} [opts]
 */
function createAdapter(opts = {}) {
  let backgroundCheck =
    opts.backgroundCheck ||
    (async () => {
      throw new Error("blackboard not attached");
    });

  const getMainWindow =
    opts.getMainWindow ||
    (() => {
      const wins = BrowserWindow.getAllWindows();
      return wins.find((w) => !w.isDestroyed()) || null;
    });

  const getApiKey =
    typeof opts.getApiKey === "function"
      ? opts.getApiKey
      : () => null;

  return {
    getDb,
    getApiKey,
    get backgroundCheck() {
      return backgroundCheck;
    },
    setBackgroundCheck(fn) {
      if (typeof fn === "function") backgroundCheck = fn;
    },
    paths: {
      appData: () => app.getPath("userData"),
      documents: () => app.getPath("documents"),
    },
    onPower(event, listener) {
      powerMonitor.on(event, listener);
    },
    offPower(event, listener) {
      powerMonitor.off(event, listener);
    },
    ipcSend(channel, payload) {
      const win = getMainWindow();
      if (!win || win.isDestroyed()) return;
      win.webContents.send(channel, payload);
    },
  };
}

module.exports = { createAdapter };
