const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  minimizeWindow: () => ipcRenderer.send("window-minimize"),
  maximizeWindow: () => ipcRenderer.send("window-maximize"),
  closeWindow: () => ipcRenderer.send("window-close"),
  isMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  /**
   * @param {(maximized: boolean) => void} callback
   * @returns {() => void} unsubscribe
   */
  subscribeWindowMaximized: (callback) => {
    const onMax = () => callback(true);
    const onUnmax = () => callback(false);
    ipcRenderer.on("window-maximized", onMax);
    ipcRenderer.on("window-unmaximized", onUnmax);
    return () => {
      ipcRenderer.removeListener("window-maximized", onMax);
      ipcRenderer.removeListener("window-unmaximized", onUnmax);
    };
  },
});

contextBridge.exposeInMainWorld("studyHub", {
  platform: process.platform,

  pickFiles: (filters) => ipcRenderer.invoke("studyhub:pick-files", filters),

  pickFolderMaterials: () => ipcRenderer.invoke("studyhub:pick-folder-materials"),

  registerMaterialPaths: (paths) => ipcRenderer.invoke("studyhub:register-material-paths", paths),

  openPath: (filePath) => ipcRenderer.invoke("studyhub:open-path", filePath),

  readTextFile: (filePath) => ipcRenderer.invoke("studyhub:read-text", filePath),

  /** @returns {Promise<{ ok: boolean, text?: string, numpages?: number, empty?: boolean, error?: string }>} */
  extractPdfText: (filePath) => ipcRenderer.invoke("studyhub:extract-pdf-text", filePath),

  /**
   * Claude / Anthropic — key stays in main process only.
   */
  ai: {
    getStatus: () => ipcRenderer.invoke("studyhub:ai-status"),
    setApiKey: (apiKey) => ipcRenderer.invoke("studyhub:ai-set-key", apiKey),
    clearApiKey: () => ipcRenderer.invoke("studyhub:ai-clear-key"),
    /** @returns {Promise<{ ok: boolean, cards?: Array<{front:string,back:string}>, error?: string }>} */
    generateFlashcards: (payload) =>
      ipcRenderer.invoke("studyhub:ai-generate-flashcards", payload),
  },
});
