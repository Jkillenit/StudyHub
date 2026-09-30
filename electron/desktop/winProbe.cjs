/**
 * Reads top-level window geometry and the shell's fullscreen/presentation state via user32/dwmapi.
 * Titles and exe names never leave the main process: callers get them only to derive booleans.
 */
const { screen } = require("electron");

const WIN = process.platform === "win32";
const EMPTY = { foreground: null, windows: [], notifState: 1 };

let api = null;
function load() {
  if (api || !WIN) return api;
  const koffi = require("koffi");
  const user32 = koffi.load("user32.dll");
  const dwmapi = koffi.load("dwmapi.dll");
  const shell32 = koffi.load("shell32.dll");
  const kernel32 = koffi.load("kernel32.dll");
  const RECT = koffi.struct("SH_RECT", { left: "long", top: "long", right: "long", bottom: "long" });
  const EnumProc = koffi.proto("bool SH_EnumProc(void *hwnd, intptr_t lParam)");
  api = {
    koffi,
    EnumWindows: user32.func("EnumWindows", "bool", [koffi.pointer(EnumProc), "intptr_t"]),
    GetForegroundWindow: user32.func("GetForegroundWindow", "void *", []),
    IsWindowVisible: user32.func("IsWindowVisible", "bool", ["void *"]),
    IsIconic: user32.func("IsIconic", "bool", ["void *"]),
    GetWindowLongPtrW: user32.func("GetWindowLongPtrW", "intptr_t", ["void *", "int"]),
    GetWindowTextW: user32.func("GetWindowTextW", "int", ["void *", "void *", "int"]),
    GetClassNameW: user32.func("GetClassNameW", "int", ["void *", "void *", "int"]),
    GetWindowThreadProcessId: user32.func("GetWindowThreadProcessId", "uint32_t", ["void *", koffi.out(koffi.pointer("uint32_t"))]),
    DwmRect: dwmapi.func("DwmGetWindowAttribute", "long", ["void *", "uint32_t", koffi.out(koffi.pointer(RECT)), "uint32_t"]),
    DwmU32: dwmapi.func("DwmGetWindowAttribute", "long", ["void *", "uint32_t", koffi.out(koffi.pointer("uint32_t")), "uint32_t"]),
    SHQueryUserNotificationState: shell32.func("SHQueryUserNotificationState", "long", [koffi.out(koffi.pointer("int"))]),
    OpenProcess: kernel32.func("OpenProcess", "void *", ["uint32_t", "bool", "uint32_t"]),
    QueryFullProcessImageNameW: kernel32.func("QueryFullProcessImageNameW", "bool", ["void *", "uint32_t", "void *", koffi.inout(koffi.pointer("uint32_t"))]),
    CloseHandle: kernel32.func("CloseHandle", "bool", ["void *"]),
  };
  return api;
}

const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x80;
const WS_EX_NOACTIVATE = 0x08000000;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const DWMWA_CLOAKED = 14;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
const textBuf = Buffer.alloc(1024);

function readText(fn, hwnd) {
  const n = fn(hwnd, textBuf, 512);
  return n > 0 ? textBuf.toString("utf16le", 0, n * 2) : "";
}

// ponytail: pid -> exe cache cleared each minute; pid reuse inside that window can mislabel an app.
const exeCache = new Map();
let exeCacheAt = 0;
function exeFor(a, pid) {
  if (Date.now() - exeCacheAt > 60000) {
    exeCache.clear();
    exeCacheAt = Date.now();
  }
  if (exeCache.has(pid)) return exeCache.get(pid);
  let exe = "";
  const h = a.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (h) {
    const size = [512];
    if (a.QueryFullProcessImageNameW(h, 0, textBuf, size)) {
      exe = textBuf.toString("utf16le", 0, size[0] * 2).split("\\").pop().toLowerCase();
    }
    a.CloseHandle(h);
  }
  exeCache.set(pid, exe);
  return exe;
}

function toDip(r) {
  const rect = { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
  try {
    return screen.screenToDipRect(null, rect);
  } catch {
    return rect;
  }
}

/** Visible top-level windows, front to back, with DIP bounds. */
function snapshot() {
  const a = load();
  if (!a) return EMPTY;
  const fg = a.GetForegroundWindow();
  const fgId = fg ? Number(a.koffi.address(fg)) : 0;
  const windows = [];
  a.EnumWindows((hwnd) => {
    if (!a.IsWindowVisible(hwnd)) return true;
    const rect = {};
    if (a.DwmRect(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, rect, 16) !== 0) return true;
    if (rect.right - rect.left < 2 || rect.bottom - rect.top < 2) return true;
    const cloaked = [0];
    a.DwmU32(hwnd, DWMWA_CLOAKED, cloaked, 4);
    const ex = Number(a.GetWindowLongPtrW(hwnd, GWL_EXSTYLE));
    const pid = [0];
    a.GetWindowThreadProcessId(hwnd, pid);
    const id = Number(a.koffi.address(hwnd));
    windows.push({
      hwnd: id,
      bounds: toDip(rect),
      title: readText(a.GetWindowTextW, hwnd),
      cls: readText(a.GetClassNameW, hwnd),
      exe: exeFor(a, pid[0]),
      pid: pid[0],
      minimized: a.IsIconic(hwnd),
      cloaked: cloaked[0] !== 0,
      tool: (ex & WS_EX_TOOLWINDOW) !== 0 || (ex & WS_EX_NOACTIVATE) !== 0,
    });
    return true;
  }, 0);
  const state = [1];
  a.SHQueryUserNotificationState(state);
  return { foreground: windows.find((w) => w.hwnd === fgId) || null, windows, notifState: state[0] };
}

function displays() {
  return screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor }));
}

module.exports = { snapshot, displays };
