const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("__shBridge", {
  importFile: (context) => {
    ipcRenderer.invoke("bb:import-file", context);
  },
  importFolder: (context) => {
    ipcRenderer.invoke("bb:import-folder", context);
  },
});
