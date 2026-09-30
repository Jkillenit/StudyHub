import { describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";

const { shouldHide, loadMatchers, createHideWatcher } = createRequire(import.meta.url)("./autoHide.cjs");

const matchers = loadMatchers();
const displays = [
  { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1032 } },
  { id: 2, bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, workArea: { x: 1920, y: 0, width: 2560, height: 1392 } },
];

let nextId = 1;
function win(over) {
  return {
    hwnd: nextId++,
    bounds: { x: 100, y: 100, width: 1200, height: 800 },
    title: "",
    cls: "Chrome_WidgetWin_1",
    exe: "chrome.exe",
    pid: 500,
    minimized: false,
    cloaked: false,
    tool: false,
    ...over,
  };
}

function snap(windows, { fg = 0, notifState = 5 } = {}) {
  return { foreground: windows[fg] || null, windows, notifState };
}

const desktop = [
  win({ title: "LVMH case.docx - Word", exe: "winword.exe", cls: "OpusApp" }),
  win({ title: "Blackboard - Google Chrome" }),
  win({ title: "", cls: "Shell_TrayWnd", exe: "explorer.exe", bounds: { x: 0, y: 1032, width: 1920, height: 48 } }),
  win({ title: "Program Manager", cls: "Progman", exe: "explorer.exe", bounds: displays[0].bounds }),
];

describe("shouldHide", () => {
  it("plain desktop use stays visible", () => {
    expect(shouldHide(snap(desktop), displays, matchers)).toEqual({ hide: false, reason: null });
  });

  it("desktop shell covering the screen is not fullscreen", () => {
    expect(shouldHide(snap(desktop, { fg: 3 }), displays, matchers).hide).toBe(false);
  });

  it("a maximized window (work area) is not fullscreen", () => {
    const w = [win({ bounds: displays[0].workArea }), ...desktop];
    expect(shouldHide(snap(w), displays, matchers).hide).toBe(false);
  });

  it("fullscreen YouTube in the browser", () => {
    const w = [win({ title: "Lecture - YouTube - Google Chrome", bounds: displays[0].bounds }), ...desktop];
    expect(shouldHide(snap(w), displays, matchers)).toEqual({ hide: true, reason: "fullscreen" });
  });

  it("borderless game on the second monitor", () => {
    const w = [win({ title: "Elden Ring", exe: "eldenring.exe", cls: "ELDEN RING", bounds: displays[1].bounds }), ...desktop];
    expect(shouldHide(snap(w), displays, matchers).reason).toBe("fullscreen");
  });

  it("exclusive fullscreen game via shell state", () => {
    expect(shouldHide(snap(desktop, { notifState: 3 }), displays, matchers)).toEqual({ hide: true, reason: "game" });
  });

  it("PowerPoint slideshow", () => {
    const w = [win({ title: "PowerPoint Slide Show - Deck.pptx", exe: "POWERPNT.EXE", cls: "screenClass" }), ...desktop];
    expect(shouldHide(snap(w, { fg: 1 }), displays, matchers).reason).toBe("present");
  });

  it("presentation mode via shell state", () => {
    expect(shouldHide(snap(desktop, { notifState: 4 }), displays, matchers).reason).toBe("present");
  });

  it("Zoom sharing while another app is in front", () => {
    const w = [...desktop, win({ title: "", exe: "Zoom.exe", cls: "ZPFloatToolbarClass", bounds: { x: 700, y: 0, width: 500, height: 60 } })];
    expect(shouldHide(snap(w), displays, matchers)).toEqual({ hide: true, reason: "call" });
  });

  it("Zoom home window alone does not hide", () => {
    const w = [...desktop, win({ title: "Zoom Workplace", exe: "Zoom.exe", cls: "ZPPTMainFrmWndClass" })];
    expect(shouldHide(snap(w), displays, matchers).hide).toBe(false);
  });

  it("Teams call", () => {
    const w = [...desktop, win({ title: "Meeting with Dana | Microsoft Teams", exe: "ms-teams.exe", cls: "TeamsWebView" })];
    expect(shouldHide(snap(w), displays, matchers).reason).toBe("call");
  });

  it("Teams chat alone does not hide", () => {
    const w = [...desktop, win({ title: "Chat | Group project | Microsoft Teams", exe: "ms-teams.exe", cls: "TeamsWebView" })];
    expect(shouldHide(snap(w), displays, matchers).hide).toBe(false);
  });

  it("Google Meet tab", () => {
    const w = [...desktop, win({ title: "Meet - abc-defg-hij - Google Chrome" })];
    expect(shouldHide(snap(w), displays, matchers).reason).toBe("call");
  });

  it("browser screen-share bar", () => {
    const w = [...desktop, win({ title: "meet.google.com is sharing your screen.", tool: true })];
    expect(shouldHide(snap(w), displays, matchers).reason).toBe("share");
  });

  it("meeting on another virtual desktop (cloaked) is ignored", () => {
    const w = [...desktop, win({ title: "Meet - abc-defg-hij - Google Chrome", cloaked: true })];
    expect(shouldHide(snap(w), displays, matchers).hide).toBe(false);
  });

  it("'Hide during meetings' off still hides for fullscreen", () => {
    const w = [win({ bounds: displays[0].bounds }), win({ title: "Meet - x - Google Chrome" })];
    expect(shouldHide(snap(w), displays, matchers, { meetings: false }).reason).toBe("fullscreen");
    expect(shouldHide(snap(w.slice(1)), displays, matchers, { meetings: false }).hide).toBe(false);
  });

  it("Study Hub's own windows never trigger a hide", () => {
    const w = [win({ pid: 42, bounds: displays[0].bounds, title: "Meet - Study Hub overlay" })];
    expect(shouldHide(snap(w), displays, matchers, { ownPid: 42 }).hide).toBe(false);
  });
});

describe("createHideWatcher", () => {
  it("hides at once and returns only after 3 clear seconds", () => {
    vi.useFakeTimers();
    let current = snap(desktop, { notifState: 3 });
    const changes = [];
    const w = createHideWatcher({ probe: () => ({ snap: current, displays }), getOpts: () => ({}), onChange: (s) => changes.push(s) });
    w.start();
    expect(changes).toEqual([{ hidden: true, reason: "game" }]);
    current = snap(desktop);
    vi.advanceTimersByTime(2000);
    expect(changes).toHaveLength(1);
    vi.advanceTimersByTime(2000);
    expect(changes.at(-1)).toEqual({ hidden: false, reason: null });
    w.stop();
    vi.useRealTimers();
  });
});
