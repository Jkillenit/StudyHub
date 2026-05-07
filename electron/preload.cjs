const { contextBridge, ipcRenderer } = require("electron");
const bbCourseListenerMap = new Map();
const bbImportStartedListenerMap = new Map();
const bbImportReadyListenerMap = new Map();
const bbImportErrorListenerMap = new Map();

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

  registerMaterialPaths: (paths) => ipcRenderer.invoke("studyhub:register-material-paths", paths),

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
  },
  blackboard: {
    open: () => ipcRenderer.invoke("bb:open"),
    close: () => ipcRenderer.invoke("bb:close"),
    disconnect: () => ipcRenderer.invoke("bb:disconnect"),
    isLoggedIn: () => ipcRenderer.invoke("bb:isLoggedIn"),
    getStatus: () => ipcRenderer.invoke("bb:getStatus"),
    setActiveCourse: (courseId) => ipcRenderer.invoke("bb:set-active-course", courseId),
    importFile: (context) => ipcRenderer.invoke("bb:import-file", context),
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
      ipcRenderer.removeAllListeners("bb:import-started");
      ipcRenderer.removeAllListeners("bb:import-ready");
      ipcRenderer.removeAllListeners("bb:import-error");
      bbImportStartedListenerMap.clear();
      bbImportReadyListenerMap.clear();
      bbImportErrorListenerMap.clear();
    },
    createCourseFromBB: (data) => ipcRenderer.invoke("bb:create-course", data),
    reportCourseCreated: (data) => ipcRenderer.invoke("bb:course-created", data),
    onCreateCourseRequest: (callback) => {
      if (typeof callback !== "function") return;
      ipcRenderer.on("bb:create-course-request", (_event, data) => callback(data));
    },
    offCreateCourseRequest: () => {
      ipcRenderer.removeAllListeners("bb:create-course-request");
    },
  },

  db: {
    courses: {
      getAll: () => ipcRenderer.invoke("db:courses:getAll"),
      get: (uuid) => ipcRenderer.invoke("db:courses:get", uuid),
      create: (course) => ipcRenderer.invoke("db:courses:create", course),
      update: (data) => ipcRenderer.invoke("db:courses:update", data),
      delete: (courseUuid) => ipcRenderer.invoke("db:courses:delete", courseUuid),
    },
    modules: {
      getByCourse: (courseUuid) => ipcRenderer.invoke("db:modules:getByCourse", courseUuid),
      create: (moduleData) => ipcRenderer.invoke("db:modules:create", moduleData),
      update: (data) => ipcRenderer.invoke("db:modules:update", data),
      delete: (uuid) => ipcRenderer.invoke("db:modules:delete", uuid),
    },
    notes: {
      get: (moduleUuid) => ipcRenderer.invoke("db:notes:get", moduleUuid),
      save: (data) => ipcRenderer.invoke("db:notes:save", data),
    },
    content: {
      getByModule: (moduleUuid) => ipcRenderer.invoke("db:content:getByModule", moduleUuid),
      saveMany: (data) => ipcRenderer.invoke("db:content:saveMany", data),
    },
    flashcards: {
      getByCourse: (courseUuid) => ipcRenderer.invoke("db:flashcards:getByCourse", courseUuid),
      getDue: (courseUuid) => ipcRenderer.invoke("db:flashcards:getDue", courseUuid),
      saveMany: (data) => ipcRenderer.invoke("db:flashcards:saveMany", data),
      replaceForCourse: (data) => ipcRenderer.invoke("db:flashcards:replaceForCourse", data),
    },
    mastery: {
      update: (data) => ipcRenderer.invoke("db:mastery:update", data),
    },
    glossary: {
      getByCourse: (courseUuid) => ipcRenderer.invoke("db:glossary:getByCourse", courseUuid),
      saveMany: (data) => ipcRenderer.invoke("db:glossary:saveMany", data),
      replaceForCourse: (data) => ipcRenderer.invoke("db:glossary:replaceForCourse", data),
      delete: (uuid) => ipcRenderer.invoke("db:glossary:delete", uuid),
    },
    settings: {
      get: (key) => ipcRenderer.invoke("db:settings:get", key),
      set: (data) => ipcRenderer.invoke("db:settings:set", data),
      getAll: () => ipcRenderer.invoke("db:settings:getAll"),
    },
    grades: {
      getComponents: (courseUuid) => ipcRenderer.invoke("db:grades:getComponents", courseUuid),
      saveComponents: (data) => ipcRenderer.invoke("db:grades:saveComponents", data),
      getEntries: (courseUuid) => ipcRenderer.invoke("db:grades:getEntries", courseUuid),
      upsertEntry: (data) => ipcRenderer.invoke("db:grades:upsertEntry", data),
      getSubEntries: (componentId) => ipcRenderer.invoke("db:grades:getSubEntries", componentId),
      saveSubEntry: (data) => ipcRenderer.invoke("db:grades:saveSubEntry", data),
      deleteSubEntry: (id) => ipcRenderer.invoke("db:grades:deleteSubEntry", id),
      saveGradingScale: (data) => ipcRenderer.invoke("db:grades:saveGradingScale", data),
      getGradingScale: (courseUuid) => ipcRenderer.invoke("db:grades:getGradingScale", courseUuid),
    },
  },
});
