const { contextBridge, ipcRenderer, webUtils } = require("electron");
const bbCourseListenerMap = new Map();
const bbImportStartedListenerMap = new Map();
const bbImportReadyListenerMap = new Map();
const bbImportErrorListenerMap = new Map();

function subscribe(channel, callback) {
  if (typeof callback !== "function") return () => {};
  const wrapped = (_event, data) => callback(data);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
}

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
  openFileDialog: (options) => ipcRenderer.invoke("studyhub:open-file-dialog", options),

  pickFolderMaterials: () => ipcRenderer.invoke("studyhub:pick-folder-materials"),

  /**
   * Resolve a File from a drag-and-drop event to its disk path and grant read access to it.
   * Only real OS files resolve to a path, so page code cannot use this to grant arbitrary paths.
   * @returns {Promise<string|null>}
   */
  getDroppedFilePath: async (file) => {
    let filePath = "";
    try {
      filePath = webUtils.getPathForFile(file);
    } catch {
      return null;
    }
    if (!filePath) return null;
    const res = await ipcRenderer.invoke("studyhub:allow-dropped-path", filePath);
    return res?.ok ? filePath : null;
  },

  openPath: (filePath) => ipcRenderer.invoke("studyhub:open-path", filePath),

  readTextFile: (filePath) => ipcRenderer.invoke("studyhub:read-text", filePath),

  /** @returns {Promise<{ ok: boolean, text?: string, numpages?: number, empty?: boolean, error?: string }>} */
  extractPdfText: (filePath) => ipcRenderer.invoke("studyhub:extract-pdf-text", filePath),

  /** @returns {Promise<{ success: boolean, slides?: Array, error?: string }>} */
  extractPptx: (filePath) => ipcRenderer.invoke("studyhub:extract-pptx", filePath),
  extractText: (filePath) => ipcRenderer.invoke("studyhub:extract-text", filePath),

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
    /** @returns {Promise<{ ok: boolean, result?: { definitions: Array, newDefinitions: Array }, error?: string }>} */
    enhance: (payload) => ipcRenderer.invoke("studyhub:ai-enhance", payload),
    /** @returns {Promise<{ ok: boolean, questions?: Array, error?: string }>} */
    practice: (payload) => ipcRenderer.invoke("studyhub:ai-practice", payload),
    /** @returns {Promise<{ ok: boolean, results?: Array<{title,url,summary,kind}>, error?: string }>} */
    webSearch: (payload) => ipcRenderer.invoke("studyhub:ai-web-search", payload),
    /** @returns {Promise<{ ok: boolean, text?: string, error?: string }>} */
    companionRephrase: (payload) => ipcRenderer.invoke("studyhub:ai-companion-rephrase", payload),
  },

  openExternal: (url) => ipcRenderer.invoke("studyhub:open-external", url),

  app: {
    info: () => ipcRenderer.invoke("app:info"),
    backup: {
      create: () => ipcRenderer.invoke("app:backup:create"),
      restore: () => ipcRenderer.invoke("app:backup:restore"),
    },
    update: {
      check: () => ipcRenderer.invoke("app:update:check"),
      install: () => ipcRenderer.invoke("app:update:install"),
    },
    onUpdateStatus: (callback) => subscribe("app:update-status", callback),
  },
  blackboard: {
    open: () => ipcRenderer.invoke("bb:open"),
    /** Opens a *.blackboard.com URL in the signed-in Blackboard window. */
    openUrl: (url) => ipcRenderer.invoke("bb:open-url", url),
    close: () => ipcRenderer.invoke("bb:close"),
    disconnect: () => ipcRenderer.invoke("bb:disconnect"),
    getStatus: () => ipcRenderer.invoke("bb:getStatus"),
    setActiveCourse: (courseId) => ipcRenderer.invoke("bb:set-active-course", courseId),
    showBbToast: (message, type) => ipcRenderer.invoke("bb:show-toast", { message, type }),
    onCourseDetected: (callback) => {
      if (typeof callback !== "function") return;
      const wrapped = (_event, data) => callback(data);
      bbCourseListenerMap.set(callback, wrapped);
      ipcRenderer.on("bb:course-detected", wrapped);
    },
    offCourseDetected: (callback) => {
      const wrapped = bbCourseListenerMap.get(callback);
      if (!wrapped) return;
      ipcRenderer.removeListener("bb:course-detected", wrapped);
      bbCourseListenerMap.delete(callback);
    },
    onImportStarted: (callback) => {
      if (typeof callback !== "function") return;
      const wrapped = (_event, data) => callback(data);
      bbImportStartedListenerMap.set(callback, wrapped);
      ipcRenderer.on("bb:import-started", wrapped);
    },
    onImportReady: (callback) => {
      if (typeof callback !== "function") return;
      const wrapped = (_event, data) => callback(data);
      bbImportReadyListenerMap.set(callback, wrapped);
      ipcRenderer.on("bb:import-ready", wrapped);
    },
    onImportError: (callback) => {
      if (typeof callback !== "function") return;
      const wrapped = (_event, data) => callback(data);
      bbImportErrorListenerMap.set(callback, wrapped);
      ipcRenderer.on("bb:import-error", wrapped);
    },
    offImportEvents: () => {
      for (const [channel, map] of [
        ["bb:import-started", bbImportStartedListenerMap],
        ["bb:import-ready", bbImportReadyListenerMap],
        ["bb:import-error", bbImportErrorListenerMap],
      ]) {
        for (const wrapped of map.values()) ipcRenderer.removeListener(channel, wrapped);
        map.clear();
      }
    },
    /** @returns {Promise<{ ok: boolean, courses?: Array, error?: string }>} */
    listCourses: () => ipcRenderer.invoke("bb:list-courses"),
    /** @returns {Promise<{ ok: boolean, counts?: object, error?: string }>} */
    syncCourse: (data) => ipcRenderer.invoke("bb:sync-course", data),
    /** @returns {() => void} unsubscribe */
    onSyncProgress: (callback) => subscribe("bb:sync-progress", callback),
    /** @returns {() => void} unsubscribe */
    onSyncComplete: (callback) => subscribe("bb:sync-complete", callback),
  },

  /** Desktop Nova (overlay, tray). Settings writes are honored only from this window. */
  desktop: {
    get: () => ipcRenderer.invoke("desktop:getSettings"),
    set: (patch) => ipcRenderer.invoke("desktop:setSettings", patch),
    hide: (kind) => ipcRenderer.invoke("desktop:hide", { for: kind }),
    show: () => ipcRenderer.invoke("desktop:show"),
    onState: (callback) => subscribe("nova:state", callback),
    onOpenSettings: (callback) => subscribe("desktop:open-settings", callback),
    onNavigate: (callback) => subscribe("desktop:navigate", callback),
    onBbChecked: (callback) => subscribe("desktop:bb-checked", callback),
  },
  db: {
    courses: {
      getAll: () => ipcRenderer.invoke("db:courses:getAll"),
      get: (uuid) => ipcRenderer.invoke("db:courses:get", uuid),
      getFull: (uuid) => ipcRenderer.invoke("db:courses:getFull", uuid),
      saveFull: (payload) => ipcRenderer.invoke("db:courses:saveFull", payload),
      delete: (courseUuid) => ipcRenderer.invoke("db:courses:delete", courseUuid),
    },
    notes: {
      save: (data) => ipcRenderer.invoke("db:notes:save", data),
    },
    mastery: {
      update: (data) => ipcRenderer.invoke("db:mastery:update", data),
    },
    settings: {
      get: (key) => ipcRenderer.invoke("db:settings:get", key),
      set: (data) => ipcRenderer.invoke("db:settings:set", data),
    },
    grades: {
      getComponents: (courseUuid) => ipcRenderer.invoke("db:grades:getComponents", courseUuid),
      saveComponents: (data) => ipcRenderer.invoke("db:grades:saveComponents", data),
      upsertEntry: (data) => ipcRenderer.invoke("db:grades:upsertEntry", data),
      getSubEntries: (componentId) => ipcRenderer.invoke("db:grades:getSubEntries", componentId),
      saveSubEntry: (data) => ipcRenderer.invoke("db:grades:saveSubEntry", data),
      deleteSubEntry: (id) => ipcRenderer.invoke("db:grades:deleteSubEntry", id),
      saveGradingScale: (data) => ipcRenderer.invoke("db:grades:saveGradingScale", data),
      getGradingScale: (courseUuid) => ipcRenderer.invoke("db:grades:getGradingScale", courseUuid),
    },
    assignments: {
      getByCourse: (courseUuid) => ipcRenderer.invoke("db:assignments:getByCourse", courseUuid),
      getRange: (range) => ipcRenderer.invoke("db:assignments:getRange", range),
      save: (data) => ipcRenderer.invoke("db:assignments:save", data),
      setCompleted: (data) => ipcRenderer.invoke("db:assignments:setCompleted", data),
      delete: (uuid) => ipcRenderer.invoke("db:assignments:delete", uuid),
    },
    exams: {
      getScopes: (courseUuid) => ipcRenderer.invoke("db:exams:getScopes", courseUuid),
      setScope: (data) => ipcRenderer.invoke("db:exams:setScope", data),
      setSyllabusCoverage: (data) => ipcRenderer.invoke("db:exams:setSyllabusCoverage", data),
    },
    announcements: {
      getByCourse: (courseUuid) => ipcRenderer.invoke("db:announcements:getByCourse", courseUuid),
      markRead: (uuid) => ipcRenderer.invoke("db:announcements:markRead", uuid),
    },
    bb: {
      getItems: (courseUuid) => ipcRenderer.invoke("db:bb:getItems", courseUuid),
      getGradeItems: (courseUuid) => ipcRenderer.invoke("db:bb:getGradeItems", courseUuid),
      setItemComponent: (data) => ipcRenderer.invoke("db:bb:setItemComponent", data),
      applyGrades: (courseUuid) => ipcRenderer.invoke("db:bb:applyGrades", courseUuid),
    },
    dashboard: {
      get: () => ipcRenderer.invoke("db:dashboard:get"),
    },
    today: {
      get: (args) => ipcRenderer.invoke("db:today:get", args),
      setTargetGrade: (data) => ipcRenderer.invoke("db:courses:setTargetGrade", data),
    },
    sessions: {
      log: (data) => ipcRenderer.invoke("db:sessions:log", data),
      stats: (courseUuid) => ipcRenderer.invoke("db:sessions:stats", courseUuid),
      history: (args) => ipcRenderer.invoke("db:sessions:history", args),
    },
    companion: {
      memory: () => ipcRenderer.invoke("db:companion:memory:getAll"),
      rememberMany: (entries) => ipcRenderer.invoke("db:companion:memory:setMany", entries),
      mute: (data) => ipcRenderer.invoke("db:companion:memory:mute", data),
      forget: () => ipcRenderer.invoke("db:companion:memory:forget"),
      saidSince: (since) => ipcRenderer.invoke("db:companion:said:recent", since),
      markSaid: (lineId) => ipcRenderer.invoke("db:companion:said:mark", lineId),
      studyFacts: (args) => ipcRenderer.invoke("db:companion:studyFacts", args),
    },
    web: {
      getByCourse: (courseUuid) => ipcRenderer.invoke("db:web:getByCourse", courseUuid),
      save: (data) => ipcRenderer.invoke("db:web:save", data),
      delete: (uuid) => ipcRenderer.invoke("db:web:delete", uuid),
    },
  },
});
