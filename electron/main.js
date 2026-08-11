"use strict";

const path = require("path");
const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
let core;
let coreLoadError = null;
try {
  core = require("../core/uploader-core");
} catch (err) {
  coreLoadError = err;
  core = {};
}

const {
  THEMES = [],
  UploadCancelledError,
  createCancelToken,
  listGalleries,
  searchGalleries,
  updateGalleryAssociations,
  searchClients,
  listJobs,
  listJobsForClient,
  suggestJobForClient,
  createGalleryRecord,
  createAndUploadNewGallery,
  addPhotosToExistingGallery,
  analyzeExistingUploadPlan,
  analyzeUploadFolders,
  buildWhatsAppShareForGallery,
  isSpecialPinUnique,
} = core;

const activeUploads = new Map();
const ALLOWED_EXTERNAL_HOSTS = new Set(["wa.me", "imagestudiofotografico.com"]);

function makeUploadId() {
  return `up_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1220,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#f3efe8",
    icon: path.join(__dirname, "..", "assets", "icon-uploader-v1", "generated", "icons", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

function emitToWindow(eventName, payload) {
  const focused = BrowserWindow.getFocusedWindow();
  const target = focused || BrowserWindow.getAllWindows()[0];
  if (target && !target.isDestroyed()) {
    target.webContents.send(eventName, payload);
  }
}

function isAllowedExternalUrl(rawUrl) {
  if (!rawUrl) {
    return false;
  }

  try {
    const parsed = new URL(String(rawUrl));
    if (parsed.protocol !== "https:") {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (ALLOWED_EXTERNAL_HOSTS.has(host)) {
      return true;
    }
    if (host.endsWith(".imagestudiofotografico.com") || host.endsWith(".whatsapp.com")) {
      return true;
    }
    return false;
  } catch (_err) {
    return false;
  }
}

ipcMain.handle("gallery:list", async (_event, params) => {
  return listGalleries(params || {});
});

ipcMain.handle("gallery:search", async (_event, params) => {
  const query = (params && params.query) || "";
  const rawLimit = params && params.limit;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : undefined;
  return searchGalleries(query, { limit });
});

ipcMain.handle("gallery:create", async (_event, payload) => {
  return createGalleryRecord(payload || {});
});

ipcMain.handle("gallery:update-associations", async (_event, payload) => {
  return updateGalleryAssociations(payload || {});
});

ipcMain.handle("client:search", async (_event, params) => {
  const query = (params && params.query) || "";
  const limit = (params && params.limit) || 8;
  return searchClients(query, { limit });
});

ipcMain.handle("job:list", async (_event, params) => {
  const limit = (params && params.limit) || 150;
  return listJobs({ limit });
});

ipcMain.handle("job:list-for-client", async (_event, params) => {
  return listJobsForClient({
    clienteId: (params && params.clienteId) || "",
    clientEmail: (params && params.clientEmail) || "",
    clientName: (params && params.clientName) || "",
    limit: (params && params.limit) || 150,
  });
});

ipcMain.handle("job:suggest-for-client", async (_event, params) => {
  return suggestJobForClient({
    clienteId: (params && params.clienteId) || "",
    clientEmail: (params && params.clientEmail) || "",
    clientName: (params && params.clientName) || "",
  });
});

ipcMain.handle("theme:list", async () => {
  return THEMES;
});

ipcMain.handle("pin:check", async (_event, params) => {
  const pin = (params && params.pin) || "";
  const unique = await isSpecialPinUnique(pin);
  return { unique };
});

ipcMain.handle("folder:pick", async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
    title: "Seleziona la cartella con le foto",
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true, folder: "" };
  }

  return { canceled: false, folder: result.filePaths[0] };
});

ipcMain.handle("image:pick", async () => {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  const result = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    title: "Seleziona immagine copertina",
    filters: [{ name: "Immagini", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "tif", "tiff", "heic", "heif", "avif"] }],
  });

  if (result.canceled || !result.filePaths.length) {
    return { canceled: true, file: "" };
  }

  return { canceled: false, file: result.filePaths[0] };
});

ipcMain.handle("upload:start", async (_event, payload) => {
  const uploadId = makeUploadId();
  const cancelToken = createCancelToken();
  activeUploads.set(uploadId, cancelToken);

  const onProgress = (evt) => {
    emitToWindow("upload:progress", { uploadId, ...evt });
  };

  (async () => {
    try {
      let result;
      if (payload.mode === "new") {
        result = await createAndUploadNewGallery({
          name: payload.name,
          date: payload.date,
          location: payload.location,
          description: payload.description,
          folder: payload.folder,
          folders: payload.folders,
          access: payload.access,
          selection: payload.selection,
          youtubeUrls: payload.youtubeUrls,
          client: payload.client,
          jobId: payload.jobId,
          customCovers: payload.customCovers,
          chapterSettings: payload.chapterSettings,
          cancelToken,
          onProgress,
        });
      } else {
        result = await addPhotosToExistingGallery({
          galleryId: payload.galleryId,
          folder: payload.folder,
          folders: payload.folders,
          skipDuplicates: payload.skipDuplicates !== false,
          customCovers: payload.customCovers,
          cancelToken,
          onProgress,
        });
      }

      emitToWindow("upload:done", {
        uploadId,
        ...result,
      });
    } catch (err) {
      if (err instanceof UploadCancelledError) {
        emitToWindow("upload:done", {
          uploadId,
          cancelled: true,
          message: err.message,
        });
      } else {
        emitToWindow("upload:done", {
          uploadId,
          cancelled: false,
          failed: true,
          message: err && err.message ? err.message : String(err),
        });
      }
    } finally {
      activeUploads.delete(uploadId);
    }
  })();

  return { uploadId };
});

ipcMain.handle("upload:analyze-existing", async (_event, payload) => {
  const galleryId = payload && payload.galleryId;
  const folder = payload && payload.folder;
  const folders = payload && payload.folders;
  return analyzeExistingUploadPlan({ galleryId, folder, folders });
});

ipcMain.handle("upload:analyze-folders", async (_event, payload) => {
  return analyzeUploadFolders({
    folder: payload && payload.folder,
    folders: payload && payload.folders,
  });
});

ipcMain.handle("upload:cancel", async (_event, payload) => {
  const uploadId = payload && payload.uploadId;
  if (!uploadId || !activeUploads.has(uploadId)) {
    return { ok: false, message: "Upload non trovato." };
  }

  const token = activeUploads.get(uploadId);
  token.cancelled = true;
  return { ok: true };
});

ipcMain.handle("external:open", async (_event, payload) => {
  const url = payload && payload.url;
  if (url) {
    if (!isAllowedExternalUrl(url)) {
      throw new Error("URL esterno non consentito.");
    }
    await shell.openExternal(url);
  }
  return { ok: true };
});

ipcMain.handle("whatsapp:gallery-link", async (_event, payload) => {
  const galleryId = payload && payload.galleryId;
  if (!galleryId) {
    throw new Error("galleryId mancante.");
  }
  return buildWhatsAppShareForGallery(galleryId);
});

app.whenReady().then(() => {
  if (coreLoadError) {
    dialog.showErrorBox(
      "Configurazione Firebase mancante",
      `${coreLoadError.message}\n\nConsulta CREDENZIALI-FIREBASE.txt.`,
    );
    app.quit();
    return;
  }

  app.setAppUserModelId("com.imagestudio.uploader");
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
