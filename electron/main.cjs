const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const officeParser = require("officeparser");

const rootDir = path.join(__dirname, "..");
try {
  require("dotenv").config({ path: path.join(rootDir, ".env") });
} catch {
  /* dotenv optional until npm install */
}

const aiConfig = require("./aiConfig.cjs");
const { generateFlashcards } = require("./anthropicClient.cjs");
const { registerDbHandlers } = require("./dbHandlers.cjs");
const { registerBlackboardHandlers } = require("./blackboardWindow.cjs");

/** Tracks files the user explicitly chose (open dialog); readText allowed only for these paths. */
const allowedReadPaths = new Set();

ipcMain.handle("studyhub:pick-files", async (_evt, filters) => {
  const win = BrowserWindow.getFocusedWindow();
  const opts = {
    properties: ["openFile", "multiSelections"],
  };
  if (filters?.length) opts.filters = filters;
  const { canceled, filePaths } = await dialog.showOpenDialog(win ?? undefined, opts);
  if (canceled || !filePaths?.length) return [];
  filePaths.forEach((p) => allowedReadPaths.add(path.normalize(p)));
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
  allowedReadPaths.add(path.normalize(filePath));
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
  files.forEach((p) => allowedReadPaths.add(path.normalize(p)));
  return files;
});

ipcMain.handle("studyhub:register-material-paths", async (_evt, paths) => {
  if (!Array.isArray(paths)) return { ok: true };
  for (const p of paths) {
    if (typeof p === "string" && p.trim()) allowedReadPaths.add(path.normalize(p.trim()));
  }
  return { ok: true };
});

ipcMain.handle("studyhub:open-path", async (_evt, filePath) => {
  const normalized = path.normalize(String(filePath || ""));
  if (!allowedReadPaths.has(normalized)) {
    throw new Error("Path is not registered for this session. Re-add the file from Materials.");
  }
  const err = await shell.openPath(normalized);
  if (err) throw new Error(err);
  return { ok: true };
});

ipcMain.handle("studyhub:extract-pdf-text", async (_evt, filePath) => {
  const normalized = path.normalize(String(filePath || ""));
  if (!allowedReadPaths.has(normalized)) {
    return {
      ok: false,
      error: "Path is not registered for this session. Re-add the file from Materials.",
    };
  }
  if (path.extname(normalized).toLowerCase() !== ".pdf") {
    return { ok: false, error: "Only PDF files support in-app text extraction." };
  }
  let PDFParse;
  try {
    ({ PDFParse } = require("pdf-parse"));
  } catch {
    return { ok: false, error: "pdf-parse is not installed in this build." };
  }
  const buf = await fs.promises.readFile(normalized);
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    await parser.destroy();
    const text = String(result?.text ?? "").trim();
    const numpages = typeof result?.total === "number" ? result.total : 0;
    return { ok: true, text, numpages, empty: !text };
  } catch (e) {
    try {
      await parser.destroy();
    } catch {
      /* ignore */
    }
    return { ok: false, error: e?.message || String(e) };
  }
});

ipcMain.handle("studyhub:extract-pptx", async (_evt, filePath) => {
  try {
    const normalized = path.normalize(String(filePath || ""));
    if (!allowedReadPaths.has(normalized)) {
      return {
        success: false,
        error: "Path is not registered for this session. Re-add the file from Materials.",
      };
    }
    const ast = await officeParser.parseOffice(normalized, { ignoreNotes: true });
    const slides = groupIntoSlides(Array.isArray(ast?.content) ? ast.content : []);
    console.log("[PPTX] Total AST nodes:", ast?.content?.length || 0);
    (ast?.content || []).slice(0, 10).forEach((node, i) => {
      console.log(
        `[PPTX] Node ${i}:`,
        JSON.stringify({
          type: node?.type,
          text: node?.text?.slice(0, 80),
          childCount: node?.children?.length,
          formatting: node?.formatting,
        })
      );
    });
    console.log("[PPTX] groupIntoSlides result:", slides.length, "slides");
    slides.slice(0, 3).forEach((slide, i) => {
      console.log(
        `[PPTX] Slide ${i}:`,
        JSON.stringify({
          title: slide?.title,
          nodeCount: slide?.nodes?.length,
          firstNodeText: slide?.nodes?.[0]?.text?.slice(0, 60),
        })
      );
    });
    console.log("[PPTX] AST type:", ast?.type);
    console.log("[PPTX] AST content length:", ast?.content?.length);
    console.log("[PPTX] First 3 content nodes:", JSON.stringify(ast?.content?.slice(0, 3), null, 2));
    console.log("[PPTX] groupIntoSlides result length:", slides.length);
    console.log("[PPTX] First slide:", JSON.stringify(slides[0], null, 2));
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
    if (!allowedReadPaths.has(normalized)) {
      return {
        success: false,
        error: "Path is not registered for this session. Re-add the file from Materials.",
        text: "",
      };
    }
    const officeParserModule = require("officeparser");
    const data = await new Promise((resolve, reject) => {
      officeParserModule.parseOffice(
        normalized,
        (result, err) => {
          if (err) reject(err);
          else resolve(result);
        },
        { ignoreNotes: false }
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
    source: process.env.ANTHROPIC_API_KEY ? "environment" : key ? "saved" : "none",
  };
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

  win.once("ready-to-show", () => win.show());

  const indexHtml = path.join(__dirname, "..", "dist", "index.html");
  win.loadFile(indexHtml);
  win.webContents.on("did-finish-load", () => {
    if (process.env.NODE_ENV !== "production") {
      win.webContents.openDevTools({ mode: "detach" });
    }
  });
}

app.whenReady().then(() => {
  registerDbHandlers();
  createWindow();
  registerBlackboardHandlers(mainWindow);
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
