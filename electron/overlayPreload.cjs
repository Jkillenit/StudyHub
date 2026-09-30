/** Bridge for the Desktop Nova overlay windows. Nothing here reads files, the DB, or other windows. */
const { contextBridge, ipcRenderer } = require("electron");

const num = (v) => (Number.isFinite(v) ? v : 0);
const point = (p) => ({ x: num(p?.x), y: num(p?.y) });

contextBridge.exposeInMainWorld("novaDesktop", {
  onState: (callback) => {
    if (typeof callback !== "function") return () => {};
    const wrapped = (_e, state) => callback(state);
    ipcRenderer.on("overlay:state", wrapped);
    return () => ipcRenderer.removeListener("overlay:state", wrapped);
  },
  ready: () => ipcRenderer.send("overlay:ready"),
  hit: (over) => ipcRenderer.send("overlay:hit", !!over),
  click: (data) => ipcRenderer.send("overlay:click", { button: typeof data?.button === "string" ? data.button.slice(0, 40) : null }),
  menu: () => ipcRenderer.send("overlay:menu"),
  dragStart: (p) => ipcRenderer.send("overlay:drag", { phase: "start", ...point(p) }),
  dragMove: (p) => ipcRenderer.send("overlay:drag", { phase: "move", ...point(p) }),
  dragEnd: (p) => ipcRenderer.send("overlay:drag", { phase: "end", ...point(p) }),
  prefs: (p) => ipcRenderer.send("overlay:prefs", { reducedMotion: !!p?.reducedMotion }),
});
