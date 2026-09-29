const fs = require("fs");
const path = require("path");
const { app, ipcMain, dialog } = require("electron");
const Database = require("better-sqlite3");
const { getDb, getDbPath, closeDb } = require("./database.cjs");

const KEEP_DAILY_BACKUPS = 7;
let registered = false;
let updater = null;

function backupDir() {
  return path.join(app.getPath("userData"), "backups");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** One rolling backup per day, pruned to the last KEEP_DAILY_BACKUPS. */
async function runDailyBackup() {
  const dir = backupDir();
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `studyhub-${today()}.db`);
  if (!fs.existsSync(target)) await getDb().backup(target);
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^studyhub-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort()
    .reverse();
  files.slice(KEEP_DAILY_BACKUPS).forEach((f) => {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch {
      /* ignore locked files */
    }
  });
}

function isValidStudyHubDb(filePath) {
  let probe = null;
  try {
    probe = new Database(filePath, { readonly: true, fileMustExist: true });
    const tables = probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);
    return ["courses", "modules", "flashcards", "schema_version"].every((t) => tables.includes(t));
  } catch {
    return false;
  } finally {
    probe?.close();
  }
}

function initUpdater(getMainWindow) {
  if (!app.isPackaged) return;
  try {
    ({ autoUpdater: updater } = require("electron-updater"));
  } catch {
    updater = null;
    return;
  }
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  const send = (status, extra = {}) => getMainWindow()?.webContents.send("app:update-status", { status, ...extra });
  updater.on("update-available", (info) => send("available", { version: info?.version }));
  updater.on("update-not-available", () => send("current"));
  updater.on("download-progress", (p) => send("downloading", { percent: Math.round(p?.percent || 0) }));
  updater.on("update-downloaded", (info) => send("ready", { version: info?.version }));
  updater.on("error", (err) => send("error", { error: err?.message || String(err) }));
  setTimeout(() => updater.checkForUpdates().catch(() => {}), 15000);
}

function registerMaintenanceHandlers(getMainWindow) {
  if (registered) return;
  registered = true;

  runDailyBackup().catch(() => {});
  initUpdater(getMainWindow);

  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    packaged: app.isPackaged,
    updaterAvailable: !!updater,
    dataPath: app.getPath("userData"),
  }));

  ipcMain.handle("app:backup:create", async () => {
    const { canceled, filePath } = await dialog.showSaveDialog(getMainWindow() ?? undefined, {
      title: "Save Study Hub backup",
      defaultPath: `study-hub-backup-${today()}.db`,
      filters: [{ name: "Study Hub backup", extensions: ["db"] }],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    await getDb().backup(filePath);
    return { ok: true, filePath };
  });

  ipcMain.handle("app:backup:restore", async () => {
    const win = getMainWindow();
    const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
      title: "Restore Study Hub backup",
      properties: ["openFile"],
      filters: [{ name: "Study Hub backup", extensions: ["db"] }],
    });
    if (canceled || !filePaths?.length) return { ok: false, canceled: true };
    const source = filePaths[0];
    if (!isValidStudyHubDb(source)) return { ok: false, error: "That file is not a Study Hub backup." };
    const { response } = await dialog.showMessageBox(win ?? undefined, {
      type: "warning",
      buttons: ["Restore and restart", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      message: "Replace all current Study Hub data with this backup?",
      detail: "A safety copy of your current data is saved in the backups folder first.",
    });
    if (response !== 0) return { ok: false, canceled: true };

    fs.mkdirSync(backupDir(), { recursive: true });
    await getDb().backup(path.join(backupDir(), `pre-restore-${Date.now()}.db`));
    closeDb();
    const dbPath = getDbPath();
    ["-wal", "-shm"].forEach((suffix) => {
      try {
        fs.unlinkSync(dbPath + suffix);
      } catch {
        /* not present */
      }
    });
    fs.copyFileSync(source, dbPath);
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });

  ipcMain.handle("app:update:check", async () => {
    if (!updater) return { ok: false, error: app.isPackaged ? "Updater unavailable" : "Updates only run in the installed app" };
    try {
      const result = await updater.checkForUpdates();
      return { ok: true, version: result?.updateInfo?.version || null };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("app:update:install", () => {
    if (!updater) return { ok: false };
    updater.quitAndInstall();
    return { ok: true };
  });
}

module.exports = { registerMaintenanceHandlers };
