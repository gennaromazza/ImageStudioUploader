"use strict";

const { contextBridge, ipcRenderer, webUtils } = require("electron");

function getPathForFile(file) {
  if (webUtils && typeof webUtils.getPathForFile === "function") {
    return webUtils.getPathForFile(file);
  }
  return file && file.path ? file.path : "";
}

contextBridge.exposeInMainWorld("galleryApi", {
  listGalleries: (params) => ipcRenderer.invoke("gallery:list", params || {}),
  searchGalleries: (query, limit) => ipcRenderer.invoke("gallery:search", { query, limit }),
  createGallery: (payload) => ipcRenderer.invoke("gallery:create", payload),
  updateGalleryAssociations: (payload) => ipcRenderer.invoke("gallery:update-associations", payload || {}),
  searchClients: (query, limit = 8) => ipcRenderer.invoke("client:search", { query, limit }),
  listJobs: (limit = 150) => ipcRenderer.invoke("job:list", { limit }),
  listJobsForClient: (payload) => ipcRenderer.invoke("job:list-for-client", payload || {}),
  suggestJobForClient: (payload) => ipcRenderer.invoke("job:suggest-for-client", payload || {}),
  listThemes: () => ipcRenderer.invoke("theme:list"),
  checkSpecialPin: (pin) => ipcRenderer.invoke("pin:check", { pin }),
  whatsappForGallery: (galleryId) => ipcRenderer.invoke("whatsapp:gallery-link", { galleryId }),
  pickFolder: () => ipcRenderer.invoke("folder:pick"),
  pickImage: () => ipcRenderer.invoke("image:pick"),
  getPathForFile,
  startUpload: (payload) => ipcRenderer.invoke("upload:start", payload),
  analyzeExistingUpload: (payload) => ipcRenderer.invoke("upload:analyze-existing", payload || {}),
  analyzeUploadFolders: (payload) => ipcRenderer.invoke("upload:analyze-folders", payload || {}),
  cancelUpload: (uploadId) => ipcRenderer.invoke("upload:cancel", { uploadId }),
  openExternal: (url) => ipcRenderer.invoke("external:open", { url }),
  onUploadProgress: (cb) => {
    const h = (_event, payload) => cb(payload);
    ipcRenderer.on("upload:progress", h);
    return () => ipcRenderer.removeListener("upload:progress", h);
  },
  onUploadError: (cb) => {
    const h = (_event, payload) => cb(payload);
    ipcRenderer.on("upload:error", h);
    return () => ipcRenderer.removeListener("upload:error", h);
  },
  onUploadDone: (cb) => {
    const h = (_event, payload) => cb(payload);
    ipcRenderer.on("upload:done", h);
    return () => ipcRenderer.removeListener("upload:done", h);
  },
});
