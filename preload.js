const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electron", {
  onTabCloseActive: (cb) => ipcRenderer.on("tab:close-active", cb),
  onTabNext:        (cb) => ipcRenderer.on("tab:next",         cb),
  onTabPrev:        (cb) => ipcRenderer.on("tab:prev",         cb),
});
