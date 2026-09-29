const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const officeParser = require("officeparser");

const rootDir = path.join(__dirname, "..");
try {
  require("dotenv").config({ path: path.join(rootDir, ".env") });
} catch {
  /* dotenv optional until npm install */
}

const aiConfig = require("./aiConfig.cjs");
const {
  generateFlashcards,
  enhanceContent,
  generatePracticeQuestions,
  searchStudyMaterials,
} = require("./anthropicClient.cjs");
const { registerDbHandlers } = require("./dbHandlers.cjs");
const { registerMirrorHandlers } = require("./dbMirrorHandlers.cjs");
const { registerBlackboardHandlers } = require("./blackboardWindow.cjs");
const { registerMaintenanceHandlers } = require("./maintenance.cjs");

/**
 * Files the user explicitly chose via a native dialog or import. Persisted in userData so
 * materials re-open across launches; the renderer can never add paths to this set itself.
 */
const allowedReadPaths = new Set();
const MAX_ALLOWED_PATHS = 5000;

function allowlistFile() {
  return path.join(app.getPath("userData"), "allowed-paths.json");
}

function loadAllowlist() {
  try {
    const list = JSON.parse(fs.readFileSync(allowlistFile(), "utf8"));
    if (Array.isArray(list)) list.forEach((p) => typeof p === "string" && allowedReadPaths.add(p));
  } catch {
    /* first launch */
  }
}

let allowlistSaveTimer = null;
function allowPaths(paths) {
  let changed = false;
  for (const p of paths) {
    if (typeof p !== "string" || !p.trim()) continue;
    const normalized = path.normalize(p.trim());
    if (!allowedReadPaths.has(normalized)) {
      allowedReadPaths.add(normalized);
      changed = true;
    }
  }
  if (!changed) return;
  clearTimeout(allowlistSaveTimer);
  allowlistSaveTimer = setTimeout(() => {
    try {
      const list = [...allowedReadPaths].slice(-MAX_ALLOWED_PATHS);
      fs.writeFileSync(allowlistFile(), JSON.stringify(list), "utf8");
    } catch {
      /* non-fatal: paths still work this session */
    }
  }, 250);
}

const OPENABLE_EXT = new Set([
  ".pdf", ".pptx", ".ppt", ".docx", ".doc", ".xlsx", ".xls", ".txt", ".md",
  ".html", ".htm", ".csv", ".rtf", ".png", ".jpg", ".jpeg", ".gif", ".mp4", ".mp3", ".zip",
]);

/** Files under OS temp/studyhub-bb/ (Blackboard downloads) may be read without picker registration. */
function isBbTempPath(normalized) {
  const bbTempDir = path.normalize(path.join(os.tmpdir(), "studyhub-bb"));
  return normalized === bbTempDir || normalized.startsWith(bbTempDir + path.sep);
}

ipcMain.handle("studyhub:pick-files", async (_evt, filters) => {
  const win = BrowserWindow.getFocusedWindow();
  const opts = {
    properties: ["openFile", "multiSelections"],
  };
  if (filters?.length) opts.filters = filters;
  const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, opts);
  if (canceled || !filePaths?.length) return [];
  allowPaths(filePaths);
  return filePaths;
});

ipcMain.handle("studyhub:open-file-dialog", async (_evt, options) => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win ?? undefined, {
    properties: ["openFile"],
    filters: options?.filters || [
      {
        name: "Supported Files",
        extensions: ["pptx", "pdf", "docx", "zip"],
      },
    ],
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true, filePath: null };
  }

  const filePath = result.filePaths[0];
  allowPaths([filePath]);
  return { canceled: false, filePath };
});

ipcMain.handle("studyhub:read-text", async (_evt, filePath) => {
  const normalized = path.normalize(filePath);
  if (!allowedReadPaths.has(normalized)) {
    throw new Error("Path was not chosen in a file picker for this session.");
  }
  const buf = await fs.promises.readFile(normalized);
  return buf.toString("utf8");
});

const MATERIAL_EXT = new Set([".pdf", ".pptx", ".docx", ".html", ".htm", ".txt", ".md"]);

function collectMaterialFiles(rootDir, maxFiles = 800, maxDepth = 6) {
  const out = [];
  function walk(dir, depth) {
    if (out.length >= maxFiles || depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (out.length >= maxFiles) break;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
        walk(full, depth + 1);
      } else {
        const ext = path.extname(ent.name).toLowerCase();
        if (MATERIAL_EXT.has(ext)) out.push(full);
      }
    }
  }
  walk(rootDir, 0);
  return out;
}

ipcMain.handle("studyhub:pick-folder-materials", async () => {
  const win = BrowserWindow.getFocusedWindow();
  const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, {
    properties: ["openDirectory"],
  });
  if (canceled || !filePaths?.length) return [];
  const files = collectMaterialFiles(filePaths[0]);
  allowPaths(files);
  return files;
});

const DROPPABLE_EXT = new Set([".pptx", ".pdf", ".docx", ".zip", ".txt", ".md"]);

/** Only reachable through preload's getDroppedFilePath, which resolves the path from a real dropped File. */
ipcMain.handle("studyhub:allow-dropped-path", async (evt, filePath) => {
  if (!mainWindow || evt.sender !== mainWindow.webContents) return { ok: false };
  const normalized = path.normalize(String(filePath || ""));
  if (!path.isAbsolute(normalized) || !DROPPABLE_EXT.has(path.extname(normalized).toLowerCase())) return { ok: false };
  try {
    if (!fs.statSync(normalized).isFile()) return { ok: false };
  } catch {
    return { ok: false };
  }
  allowPaths([normalized]);
  return { ok: true };
});

ipcMain.handle("studyhub:open-path", async (_evt, filePath) => {
  const normalized = path.normalize(String(filePath || ""));
  if (!allowedReadPaths.has(normalized) && !isBbTempPath(normalized)) {
    throw new Error("Path is not registered. Re-add the file from Materials.");
  }
  if (!OPENABLE_EXT.has(path.extname(normalized).toLowerCase())) {
    throw new Error("This file type cannot be opened from Study Hub.");
  }
  const err = await shell.openPath(normalized);
  if (err) throw new Error(err);
  return { ok: true };
});

ipcMain.handle("studyhub:extract-pdf-text", async (_evt, filePath) => {
  try {
    const normalized = path.normalize(String(filePath || ""));

    if (!isBbTempPath(normalized) && !allowedReadPaths.has(normalized)) {
      return {
        ok: false,
        error: "Path is not registered for this session.",
      };
    }

    if (path.extname(normalized).toLowerCase() !== ".pdf") {
      return {
        ok: false,
        error: "Only PDF files supported.",
      };
    }

    const buf = await fs.promises.readFile(normalized);

    const { PDFParse } = require("pdf-parse");
    const parser = new PDFParse({ data: buf });
    try {
      const textResult = await parser.getText();
      const text = String(textResult?.text ?? "").trim();
      const numpages = typeof textResult?.total === "number" ? textResult.total : 0;
      await parser.destroy();
      return {
        ok: true,
        text,
        numpages,
        empty: !text,
      };
    } catch (e) {
      try {
        await parser.destroy();
      } catch {
        /* ignore */
      }
      throw e;
    }
  } catch (err) {
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
});

ipcMain.handle("studyhub:extract-pptx", async (_evt, filePath) => {
  try {
    const normalized = path.normalize(String(filePath || ""));
    if (!isBbTempPath(normalized) && !allowedReadPaths.has(normalized)) {
      return {
        success: false,
        error: "Path is not registered. Re-add the file from Materials.",
      };
    }
    const fileBuffer = await fs.promises.readFile(normalized);
    const ast = await officeParser.parseOffice(fileBuffer, { ignoreNotes: true });
    const slides = groupIntoSlides(Array.isArray(ast?.content) ? ast.content : []);
    return { success: true, slides };
  } catch (err) {
    return { success: false, error: err?.message || String(err) };
  }
});

function extractTableText(tableNode) {
  const rows = [];
  const children = tableNode?.children || [];
  children.forEach((row) => {
    if (row?.type !== "row") return;
    const cells = (row?.children || [])
      .filter((cell) => cell?.type === "cell")
      .map((cell) => String(cell?.text || "").trim());
    if (cells.some((cell) => cell.length > 0)) {
      rows.push(cells.join("\t"));
    }
  });
  return rows.join("\n");
}

function extractTextFromAst(node) {
  if (!node) return "";
  if (typeof node === "string") return node;

  if (Array.isArray(node)) {
    const parts = [];
    node.forEach((child) => {
      const text = extractTextFromAst(child);
      if (text.trim()) parts.push(text);
    });
    return parts.join("\n");
  }

  if (node.type === "table") {
    return `${extractTableText(node)}\n`;
  }

  if (node.text && typeof node.text === "string" && node.text.trim()) {
    const childTypes = (node.children || []).map((child) => child?.type);
    const hasTableChild = childTypes.includes("table");
    if (!hasTableChild) return `${node.text}\n`;
  }

  const parts = [];
  const children = node.children || node.content || [];
  if (Array.isArray(children)) {
    children.forEach((child) => {
      const text = extractTextFromAst(child);
      if (text.trim()) parts.push(text);
    });
  }
  return parts.join("\n");
}

ipcMain.handle("studyhub:extract-text", async (_evt, filePath) => {
  try {
    const normalized = path.normalize(String(filePath || ""));
    if (!isBbTempPath(normalized) && !allowedReadPaths.has(normalized)) {
      return {
        success: false,
        error: "Path is not registered for this session. Re-add the file from Materials.",
        text: "",
      };
    }

    const ext = path.extname(normalized).toLowerCase();
    if (ext === ".pdf") {
      return {
        success: false,
        error: "Use extract-pdf-text for PDFs.",
        text: "",
      };
    }

    const fileBuffer = await fs.promises.readFile(normalized);
    const data = await new Promise((resolve, reject) => {
      officeParser.parseOffice(
        fileBuffer,
        (result, err) => {
          if (err) reject(err);
          else resolve(result);
        },
        { ignoreNotes: false, outputErrorToConsole: false }
      );
    });
    const text = typeof data === "string" ? data : extractTextFromAst(data);
    return {
      success: true,
      text,
      filePath: normalized,
    };
  } catch (err) {
    return {
      success: false,
      error: err?.message || String(err),
      text: "",
    };
  }
});

function groupIntoSlides(contentNodes) {
  const slides = [];
  let slideIndex = 0;

  for (const node of contentNodes || []) {
    const text = String(node?.text || "").trim();
    if (!text && !Array.isArray(node?.children)) continue;

    if (node?.type === "slide") {
      slideIndex += 1;
      const childNodes = Array.isArray(node?.children) ? node.children.map((child) => flattenNode(child)) : [];
      const runs = flattenNode(node).runs || [];
      const titleFromRuns = runs
        .map((run) => String(run?.text || "").trim())
        .find((runText) => runText && runText.length < 80 && !/^\d+$/.test(runText));
      const title = titleFromRuns || text.split(/\s+/).slice(0, 8).join(" ");
      slides.push({
        slideNumber: slideIndex,
        title,
        titleFormatting: node?.formatting || {},
        nodes: childNodes.length ? childNodes : [flattenNode(node)],
      });
      continue;
    }

    const isTitle =
      node?.type === "heading" ||
      (node?.formatting?.size && Number.parseFloat(node.formatting.size) >= 20 && text.length < 80) ||
      (node?.formatting?.bold === true && text.length < 80 && (!node?.children || node.children.length === 0)) ||
      (text === text.toUpperCase() && text.length > 3 && text.length < 60 && /[A-Z]/.test(text));

    if (isTitle || slides.length === 0) {
      if (!isTitle && slides.length > 0) {
        slides[slides.length - 1].nodes.push(flattenNode(node || {}));
      } else {
        slideIndex += 1;
        slides.push({
          slideNumber: slideIndex,
          title: text,
          titleFormatting: node?.formatting || {},
          nodes: [],
        });
      }
    } else {
      slides[slides.length - 1].nodes.push(flattenNode(node || {}));
    }
  }

  return slides;
}

function flattenNode(node) {
  const runs = [];

  function walk(n) {
    if (!n) return;
    if (n.text && (!n.children || n.children.length === 0)) {
      runs.push({
        text: n.text,
        bold: n.formatting?.bold || false,
        italic: n.formatting?.italic || false,
        type: n.type,
      });
    }
    if (Array.isArray(n.children)) n.children.forEach(walk);
  }

  walk(node);

  const text = node.text || runs.map((run) => run.text).join(" ").trim();
  return {
    type: node.type || "paragraph",
    text,
    runs,
  };
}

ipcMain.handle("studyhub:ai-status", async () => {
  const key = aiConfig.getApiKey(app);
  return {
    configured: !!key,
    maskedKey: aiConfig.maskKey(key),
    model: aiConfig.getModel(app),
    encrypted: aiConfig.isEncrypted(app),
    source: process.env.ANTHROPIC_API_KEY ? "environment" : key ? "saved" : "none",
  };
});

function requireKey() {
  const key = aiConfig.getApiKey(app);
  return key || null;
}

ipcMain.handle("studyhub:ai-enhance", async (_evt, payload) => {
  const key = requireKey();
  if (!key) return { ok: false, error: "no-key" };
  try {
    const result = await enhanceContent(key, {
      definitions: Array.isArray(payload?.definitions) ? payload.definitions.slice(0, 200) : [],
      unclassified: typeof payload?.unclassified === "string" ? payload.unclassified : null,
    });
    return { ok: true, result };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("studyhub:ai-practice", async (_evt, payload) => {
  const key = requireKey();
  if (!key) return { ok: false, error: "no-key" };
  try {
    const questions = await generatePracticeQuestions(key, {
      courseName: String(payload?.courseName || ""),
      definitions: Array.isArray(payload?.definitions) ? payload.definitions : [],
      count: Math.min(Math.max(Number(payload?.count) || 8, 1), 20),
    });
    return { ok: true, questions };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("studyhub:ai-web-search", async (_evt, payload) => {
  const key = requireKey();
  if (!key) return { ok: false, error: "no-key" };
  try {
    const results = await searchStudyMaterials(key, { query: String(payload?.query || "") });
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("studyhub:open-external", async (_evt, url) => {
  const value = String(url || "");
  if (!/^https:\/\//i.test(value)) return { ok: false, error: "Only https links can be opened." };
  await shell.openExternal(value);
  return { ok: true };
});

ipcMain.handle("studyhub:ai-set-key", async (_evt, apiKey) => {
  const trimmed = String(apiKey || "").trim();
  if (!trimmed) {
    aiConfig.clearApiKey(app);
    return { ok: true };
  }
  aiConfig.setApiKey(app, trimmed);
  return { ok: true };
});

ipcMain.handle("studyhub:ai-clear-key", async () => {
  aiConfig.clearApiKey(app);
  return { ok: true };
});

let windowChromeHandlersRegistered = false;
let mainWindow = null;

function registerWindowChromeHandlersOnce() {
  if (windowChromeHandlersRegistered) return;
  windowChromeHandlersRegistered = true;
  ipcMain.on("window-minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  });
  ipcMain.on("window-maximize", (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
  });
  ipcMain.on("window-close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
  ipcMain.handle("window-is-maximized", (event) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    return !!w && w.isMaximized();
  });
}

function attachWindowStateEvents(win) {
  win.on("maximize", () => win.webContents.send("window-maximized"));
  win.on("unmaximize", () => win.webContents.send("window-unmaximized"));
}

ipcMain.handle("studyhub:ai-generate-flashcards", async (_evt, payload) => {
  const sourceText = String(payload?.sourceText ?? "");
  const mode = payload?.mode === "exam_cram" ? "exam_cram" : "chapter_mastery";
  const key = aiConfig.getApiKey(app);
  if (!key) {
    return {
      ok: false,
      error:
        "No Anthropic API key. Open AI Assistant and save your key, or set ANTHROPIC_API_KEY (see README.md).",
    };
  }
  if (!sourceText.trim()) {
    return { ok: false, error: "Paste some notes or textbook text first." };
  }
  try {
    const model = aiConfig.getModel(app);
    const cards = await generateFlashcards(key, model, sourceText, mode);
    return { ok: true, cards };
  } catch (e) {
    const msg = e?.name === "AbortError" ? "Request timed out. Try shorter text." : e.message || String(e);
    return { ok: false, error: msg };
  }
});

function createWindow() {
  /** @type {import('electron').BrowserWindowConstructorOptions} */
  const opts = {
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: "#060608",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
  if (process.platform === "darwin") {
    opts.titleBarStyle = "hidden";
  }
  const win = new BrowserWindow(opts);
  mainWindow = win;

  if (process.platform === "darwin") {
    try {
      win.setWindowButtonVisibility(false);
    } catch {
      /* older Electron / edge cases */
    }
  }

  registerWindowChromeHandlersOnce();
  attachWindowStateEvents(win);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://")) {
      event.preventDefault();
      if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    }
  });

  win.once("ready-to-show", () => win.show());

  const indexHtml = path.join(__dirname, "..", "dist", "index.html");
  win.loadFile(indexHtml);
}

app.whenReady().then(() => {
  loadAllowlist();
  registerDbHandlers();
  registerMirrorHandlers();
  registerMaintenanceHandlers(() => mainWindow);
  createWindow();
  registerBlackboardHandlers(() => mainWindow, { allowPaths });
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
