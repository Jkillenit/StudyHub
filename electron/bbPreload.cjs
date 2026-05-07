const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__shBridge", {
  importFile: (context) => {
    ipcRenderer.invoke("bb:import-file", context);
  },
  importFolder: (context) => {
    ipcRenderer.invoke("bb:import-folder", context);
  },
  createCourse: (data) => ipcRenderer.invoke("bb:create-course", data),
  getCourseStatus: (data) => ipcRenderer.invoke("bb:get-course-status", data),
  closeWindow: () => ipcRenderer.invoke("bb:close"),
  showToast: (message, type) => ipcRenderer.invoke("bb:show-toast", { message, type }),
  onToolbarUpdate: (callback) => {
    ipcRenderer.on("bb:toolbar-update", (_event, data) => {
      if (typeof callback === "function") callback(data);
    });
  },
});
