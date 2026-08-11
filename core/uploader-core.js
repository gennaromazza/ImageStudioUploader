"use strict";

const { initializeApp, getApps, cert } = require("firebase-admin/app");
const { getFirestore, FieldValue, FieldPath, Timestamp } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const fs = require("fs");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const { getFirebaseConfig, GALLERY_URL } = require("../config/firebase-config");

const IMG_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
  ".tiff",
  ".tif",
  ".heic",
  ".heif",
  ".avif",
]);

const THEMES = [
  { id: "natale", label: "Natale" },
  { id: "carnevale", label: "Carnevale" },
  { id: "san-valentino", label: "San Valentino" },
  { id: "pasqua", label: "Pasqua" },
  { id: "halloween", label: "Halloween" },
];

const MAX_PARALLEL = 3;
const SIGNED_URL_EXPIRY = "2099-01-01";
const WEB_MAX_EDGE = 3200;
const WEB_JPEG_QUALITY = 86;
const WEB_WEBP_QUALITY = 88;
const NETWORK_MAX_RETRIES = 5;
const NETWORK_RETRY_BASE_MS = 900;
const EXISTING_PHOTO_NAMES_CACHE_TTL_MS = 60 * 1000;

let services;
const existingPhotoNamesCache = new Map();

class UploadCancelledError extends Error {
  constructor() {
    super("Upload annullato dall'utente.");
    this.name = "UploadCancelledError";
  }
}

function initFirebase() {
  const { serviceAccount, bucket } = getFirebaseConfig();
  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: bucket,
    });
  }

  if (!services) {
    services = {
      db: getFirestore(),
      bucket: getStorage().bucket(),
    };
  }

  return services;
}

function nanoid(n = 8) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function mime(file) {
  const e = path.extname(file).toLowerCase();
  return (
    {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".bmp": "image/bmp",
      ".tiff": "image/tiff",
      ".tif": "image/tiff",
      ".heic": "image/heic",
      ".heif": "image/heif",
      ".avif": "image/avif",
    }[e] || "image/jpeg"
  );
}

function isCover(filePath) {
  const base = path.basename(filePath).toLowerCase();
  return (
    base.startsWith("_copertina") ||
    base.startsWith("copertina") ||
    base.startsWith("_cover") ||
    base.startsWith("cover")
  );
}

function hasAlphaChannel(metadata) {
  if (metadata.hasAlpha) {
    return true;
  }

  if (!metadata.channels) {
    return false;
  }

  return metadata.channels === 4;
}

function sanitizeBaseName(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err) {
  if (!err) {
    return false;
  }

  const code = String(err.code || err.statusCode || err.status || "").toUpperCase();
  const msg = String(err.message || "").toLowerCase();

  const retryableCodes = new Set([
    "ECONNRESET",
    "ECONNABORTED",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "ENOTFOUND",
    "ESOCKETTIMEDOUT",
    "UNAVAILABLE",
    "DEADLINE_EXCEEDED",
    "429",
    "500",
    "502",
    "503",
    "504",
  ]);

  if (retryableCodes.has(code)) {
    return true;
  }

  return (
    msg.includes("timeout") ||
    msg.includes("network") ||
    msg.includes("socket hang up") ||
    msg.includes("connection reset") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("deadline exceeded") ||
    msg.includes("unavailable")
  );
}

async function withRetry(fn, { retries = NETWORK_MAX_RETRIES, baseMs = NETWORK_RETRY_BASE_MS } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn(attempt + 1);
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !isRetryableError(err)) {
        throw err;
      }
      const jitter = Math.floor(Math.random() * 250);
      const delay = baseMs * Math.pow(2, attempt - 1) + jitter;
      await sleep(delay);
    }
  }
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractClientPhone(data) {
  if (!data) {
    return "";
  }
  return (
    data.whatsapp ||
    data.cellulare1 ||
    data.cellulare ||
    data.telefono ||
    data.phone ||
    data.mobile ||
    ""
  );
}

async function prepareUploadAsset(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const originalSize = fs.statSync(filePath).size;

  if (ext === ".gif") {
    return {
      uploadPath: filePath,
      cleanup: null,
      contentType: mime(filePath),
      optimizedSize: originalSize,
      outputExt: ext || ".jpg",
    };
  }

  let image;
  let metadata;
  try {
    image = sharp(filePath, { failOn: "none" });
    metadata = await image.metadata();
  } catch (_err) {
    return {
      uploadPath: filePath,
      cleanup: null,
      contentType: mime(filePath),
      optimizedSize: originalSize,
      outputExt: ext || ".jpg",
    };
  }

  const width = metadata.width || 0;
  const height = metadata.height || 0;
  const shouldResize = Math.max(width, height) > WEB_MAX_EDGE;
  const alpha = hasAlphaChannel(metadata);

  let pipeline = image.rotate();
  if (shouldResize) {
    pipeline = pipeline.resize({
      width: WEB_MAX_EDGE,
      height: WEB_MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const sourceBase = sanitizeBaseName(path.basename(filePath, ext));
  const suffix = `${Date.now()}_${nanoid(6)}`;
  const outExt = alpha ? ".webp" : ".jpg";
  const outPath = path.join(os.tmpdir(), `sync_gallery_${sourceBase}_${suffix}${outExt}`);

  try {
    if (alpha) {
      await pipeline.webp({ quality: WEB_WEBP_QUALITY }).toFile(outPath);
    } else {
      await pipeline
        .jpeg({
          quality: WEB_JPEG_QUALITY,
          mozjpeg: true,
          chromaSubsampling: "4:4:4",
        })
        .toFile(outPath);
    }
  } catch (_err) {
    return {
      uploadPath: filePath,
      cleanup: null,
      contentType: mime(filePath),
      optimizedSize: originalSize,
      outputExt: ext || ".jpg",
    };
  }

  const optimizedSize = fs.statSync(outPath).size;
  const shouldKeepOriginal = !shouldResize && optimizedSize >= originalSize;
  if (shouldKeepOriginal) {
    fs.unlinkSync(outPath);
    return {
      uploadPath: filePath,
      cleanup: null,
      contentType: mime(filePath),
      optimizedSize: originalSize,
      outputExt: ext || ".jpg",
    };
  }

  return {
    uploadPath: outPath,
    cleanup: () => {
      if (fs.existsSync(outPath)) {
        fs.unlinkSync(outPath);
      }
    },
    contentType: alpha ? "image/webp" : "image/jpeg",
    optimizedSize,
    outputExt: outExt,
  };
}

function ensureFolderExists(folder) {
  if (!folder || !fs.existsSync(folder)) {
    throw new Error(`Cartella non trovata: ${folder || "(vuoto)"}`);
  }
}

function listImageFilesRecursive(rootDir) {
  const out = [];
  const walk = (currentDir) => {
    const entries = fs
      .readdirSync(currentDir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && IMG_EXT.has(path.extname(entry.name).toLowerCase())) {
        out.push(fullPath);
      }
    }
  };

  walk(rootDir);
  return out;
}

function scanFolder(root) {
  ensureFolderExists(root);
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const subdirs = entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const isImageName = (fileName) => IMG_EXT.has(path.extname(fileName).toLowerCase());
  const rootFiles = entries
    .filter((e) => e.isFile() && isImageName(e.name))
    .map((e) => path.join(root, e.name))
    .sort();

  const rootCover = rootFiles.find((f) => isCover(f)) || null;
  const rootPhotos = rootFiles.filter((f) => !isCover(f));

  if (!subdirs.length) {
    return rootPhotos.length || rootCover
      ? [{ name: null, ordine: 0, photos: rootPhotos, cover: rootCover }]
      : [];
  }

  const chapters = [];
  for (const [i, dirent] of subdirs.entries()) {
    const chapterPath = path.join(root, dirent.name);
    const files = listImageFilesRecursive(chapterPath);

    const cover = files.find((f) => isCover(f)) || null;
    const photos = files.filter((f) => !isCover(f));

    if (photos.length || cover) {
      chapters.push({ name: dirent.name, ordine: i, photos, cover });
    }
  }

  if (rootPhotos.length || rootCover) {
    chapters.push({ name: null, ordine: chapters.length, photos: rootPhotos, cover: rootCover });
  }

  return chapters;
}

function normalizeFolders(folder, folders) {
  const raw = Array.isArray(folders) && folders.length ? folders : folder ? [folder] : [];
  const unique = [];
  const seen = new Set();

  for (const item of raw) {
    const clean = String(item || "").trim();
    if (!clean) {
      continue;
    }
    const resolved = path.resolve(clean);
    const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(resolved);
    }
  }

  return unique;
}

function scanMultipleFoldersAsChapters(folders) {
  const chapters = [];

  for (const [i, folderPath] of folders.entries()) {
    ensureFolderExists(folderPath);
    const files = listImageFilesRecursive(folderPath);
    const cover = files.find((f) => isCover(f)) || null;
    const photos = files.filter((f) => !isCover(f));

    if (photos.length || cover) {
      chapters.push({
        name: path.basename(folderPath),
        ordine: i,
        photos,
        cover,
      });
    }
  }

  return chapters;
}

function scanUploadFolders({ folder, folders } = {}) {
  const normalized = normalizeFolders(folder, folders);
  if (normalized.length > 1) {
    return scanMultipleFoldersAsChapters(normalized);
  }
  return scanFolder(normalized[0] || folder);
}

function hasUploadFolders(folder, folders) {
  return normalizeFolders(folder, folders).length > 0;
}

function resolveSkippedDuplicateFilePaths(folder, folders, skippedDuplicateFiles) {
  const normalized = normalizeFolders(folder, folders);
  if (normalized.length <= 1) {
    return skippedDuplicateFiles.map((relPath) => path.join(normalized[0] || folder, relPath));
  }

  const rootsByName = Object.fromEntries(normalized.map((rootPath) => [path.basename(rootPath), rootPath]));
  return skippedDuplicateFiles
    .map((relPath) => {
      const [chapterName, ...rest] = String(relPath).split(/[\\/]/);
      const rootPath = rootsByName[chapterName];
      return rootPath && rest.length ? path.join(rootPath, ...rest) : null;
    })
    .filter(Boolean);
}

function toGallerySummary(doc, index) {
  const dt = doc.data();
  return {
    n: index + 1,
    id: doc.id,
    name: dt.name || "",
    code: dt.code || "",
    date: dt.date || "",
    count: dt.photoCount || 0,
    location: dt.location || "",
    clienteId: dt.clienteId || "",
    clientName: dt.clientName || "",
    clientEmail: dt.clientEmail || "",
    clientPhone: dt.clientPhone || "",
    jobId: dt.jobId || "",
    chapterCount: Array.isArray(dt.chapters) ? dt.chapters.length : 0,
    galleryUrl: dt.code ? `${GALLERY_URL}/${dt.code}` : "",
    createdAt: dt.createdAt ? dt.createdAt.toDate().toISOString() : "",
  };
}

function normalizeStoredChapter(chapter, index = 0) {
  const item = chapter || {};
  return {
    id: String(item.id || "").trim(),
    titolo: String(item.titolo || item.title || "").trim(),
    descrizione: String(item.descrizione || item.description || "").trim(),
    ordine: Number.isFinite(Number(item.ordine ?? item.position)) ? Number(item.ordine ?? item.position) : index,
    excludeFromSelection: item.excludeFromSelection === true,
    coverPhotoId: item.coverPhotoId || null,
    coverPhotoUrl: item.coverPhotoUrl || null,
    coverPhotoPosition: item.coverPhotoPosition || null,
  };
}

async function getGalleryDetails(galleryId) {
  const { db } = initFirebase();
  const cleanGalleryId = String(galleryId || "").trim();
  if (!cleanGalleryId) {
    throw new Error("galleryId mancante.");
  }

  const snap = await withRetry(() => db.collection("galleries").doc(cleanGalleryId).get());
  if (!snap.exists) {
    throw new Error("Galleria non trovata.");
  }

  const data = snap.data() || {};
  const chapters = (Array.isArray(data.chapters) ? data.chapters : [])
    .map(normalizeStoredChapter)
    .sort((a, b) => a.ordine - b.ordine || a.titolo.localeCompare(b.titolo));

  return {
    id: snap.id,
    name: data.name || "",
    code: data.code || "",
    date: data.date || "",
    location: data.location || "",
    description: data.description || "",
    photoCount: Number(data.photoCount || 0),
    chaptersEnabled: data.chaptersEnabled === true || chapters.length > 0,
    chapters,
    galleryUrl: data.code ? `${GALLERY_URL}/${data.code}` : "",
    clienteId: data.clienteId || "",
    clientName: data.clientName || "",
    clientEmail: data.clientEmail || "",
    clientPhone: data.clientPhone || "",
    jobId: data.jobId || "",
  };
}

async function listGalleryPhotos({ galleryId, limit = 1000 } = {}) {
  const { db } = initFirebase();
  const cleanGalleryId = String(galleryId || "").trim();
  if (!cleanGalleryId) {
    throw new Error("galleryId mancante.");
  }

  const maxItems = Math.min(5000, Math.max(1, Number(limit) || 1000));
  const docs = [];
  let cursor = null;
  while (docs.length < maxItems) {
    const batchSize = Math.min(500, maxItems - docs.length);
    let request = db.collection("photos").where("galleryId", "==", cleanGalleryId).limit(batchSize);
    if (cursor) request = request.startAfter(cursor);
    const snap = await withRetry(() => request.get());
    if (snap.empty) break;
    docs.push(...snap.docs);
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < batchSize) break;
  }

  return docs
    .map((doc) => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        name: data.name || "",
        url: data.url || "",
        chapterId: data.chapterId || null,
        chapterPosition: Number.isFinite(Number(data.chapterPosition)) ? Number(data.chapterPosition) : null,
        position: Number.isFinite(Number(data.position)) ? Number(data.position) : null,
      };
    })
    .sort((a, b) =>
      String(a.chapterId || "").localeCompare(String(b.chapterId || "")) ||
      (a.chapterPosition ?? a.position ?? Number.MAX_SAFE_INTEGER) -
        (b.chapterPosition ?? b.position ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name),
    );
}

async function updateGalleryChapters({ galleryId, chapters } = {}) {
  const { db } = initFirebase();
  const cleanGalleryId = String(galleryId || "").trim();
  if (!cleanGalleryId) {
    throw new Error("galleryId mancante.");
  }
  if (!Array.isArray(chapters)) {
    throw new Error("Elenco capitoli non valido.");
  }

  const galleryRef = db.collection("galleries").doc(cleanGalleryId);
  const gallerySnap = await withRetry(() => galleryRef.get());
  if (!gallerySnap.exists) {
    throw new Error("Galleria non trovata.");
  }

  const current = gallerySnap.data() || {};
  const currentById = new Map((Array.isArray(current.chapters) ? current.chapters : []).map((item) => [String(item.id), item]));
  const seenIds = new Set();
  const seenTitles = new Set();
  const now = new Date();
  const normalized = chapters.map((raw, index) => {
    const requestedId = String(raw.id || "").trim();
    const id = !requestedId || requestedId.startsWith("new_") ? nanoid(10) : requestedId;
    const titolo = String(raw.titolo || raw.title || "").trim();
    if (!titolo) {
      throw new Error(`Il capitolo ${index + 1} deve avere un titolo.`);
    }
    const titleKey = normalizeSearchText(titolo);
    if (seenIds.has(id) || seenTitles.has(titleKey)) {
      throw new Error(`Capitolo duplicato: ${titolo}.`);
    }
    seenIds.add(id);
    seenTitles.add(titleKey);

    const previous = currentById.get(id) || {};
    const item = {
      ...previous,
      id,
      titolo,
      descrizione: String(raw.descrizione || raw.description || "").trim(),
      ordine: index,
      excludeFromSelection: raw.excludeFromSelection === true,
      createdAt: previous.createdAt || now,
      updatedAt: now,
    };
    return item;
  });

  const removedIds = [...currentById.keys()].filter((id) => !seenIds.has(id));
  if (removedIds.length) {
    const assigned = await withRetry(() =>
      db.collection("photos").where("galleryId", "==", cleanGalleryId).get(),
    );
    const usedRemoved = new Set();
    assigned.forEach((doc) => {
      const chapterId = String(doc.data().chapterId || "");
      if (removedIds.includes(chapterId)) usedRemoved.add(chapterId);
    });
    if (usedRemoved.size) {
      throw new Error("Non puoi eliminare un capitolo che contiene foto. Spostale prima in un altro capitolo.");
    }
  }

  await withRetry(() =>
    galleryRef.update({
      chapters: normalized,
      chaptersEnabled: normalized.length > 0,
      hasChapters: normalized.length > 0,
      updatedAt: FieldValue.serverTimestamp(),
    }),
  );
  return getGalleryDetails(cleanGalleryId);
}

async function moveGalleryPhotos({ galleryId, photoIds, chapterId = null } = {}) {
  const { db } = initFirebase();
  const cleanGalleryId = String(galleryId || "").trim();
  const cleanPhotoIds = [...new Set((Array.isArray(photoIds) ? photoIds : []).map((id) => String(id || "").trim()).filter(Boolean))];
  const targetChapterId = chapterId ? String(chapterId).trim() : null;
  if (!cleanGalleryId || !cleanPhotoIds.length) {
    throw new Error("Galleria e fotografie sono obbligatorie.");
  }
  if (cleanPhotoIds.length > 400) {
    throw new Error("Puoi spostare al massimo 400 fotografie per volta, per garantire un salvataggio atomico.");
  }

  const details = await getGalleryDetails(cleanGalleryId);
  if (targetChapterId && !details.chapters.some((chapter) => chapter.id === targetChapterId)) {
    throw new Error("Il capitolo di destinazione non esiste.");
  }

  const allPhotos = await listGalleryPhotos({ galleryId: cleanGalleryId, limit: 5000 });
  const byId = new Map(allPhotos.map((photo) => [photo.id, photo]));
  if (cleanPhotoIds.some((id) => !byId.has(id))) {
    throw new Error("Una o piu fotografie non appartengono alla galleria selezionata.");
  }

  let nextPosition = allPhotos
    .filter((photo) => (photo.chapterId || null) === targetChapterId && !cleanPhotoIds.includes(photo.id))
    .reduce((max, photo) => Math.max(max, photo.chapterPosition ?? -1), -1) + 1;

  const batch = db.batch();
  for (const id of cleanPhotoIds) {
    batch.update(db.collection("photos").doc(id), {
      chapterId: targetChapterId,
      chapterPosition: nextPosition++,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await withRetry(() => batch.commit());

  return { ok: true, galleryId: cleanGalleryId, chapterId: targetChapterId, moved: cleanPhotoIds.length };
}

async function updateGalleryAssociations({ galleryId, client = {}, jobId = "" } = {}) {
  const { db } = initFirebase();
  const cleanGalleryId = String(galleryId || "").trim();
  if (!cleanGalleryId) {
    throw new Error("galleryId mancante.");
  }

  const galleryRef = db.collection("galleries").doc(cleanGalleryId);
  const gallerySnap = await withRetry(() => galleryRef.get());
  if (!gallerySnap.exists) {
    throw new Error("Galleria non trovata.");
  }

  const current = gallerySnap.data() || {};
  const oldJobId = String(current.jobId || "").trim();
  const newJobId = String(jobId || "").trim();
  const cleanClient = {
    clienteId: String(client.clienteId || "").trim(),
    clientName: String(client.clientName || "").trim(),
    clientEmail: String(client.clientEmail || "").trim(),
    clientPhone: String(client.clientPhone || "").trim(),
  };

  let newJobRef = null;
  if (newJobId) {
    newJobRef = db.collection("jobs").doc(newJobId);
    const newJobSnap = await withRetry(() => newJobRef.get());
    if (!newJobSnap.exists) {
      throw new Error("Il job selezionato non esiste piu.");
    }
  }

  const batch = db.batch();
  batch.update(galleryRef, {
    ...cleanClient,
    jobId: newJobId || FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (oldJobId && oldJobId !== newJobId) {
    const oldJobRef = db.collection("jobs").doc(oldJobId);
    const oldJobSnap = await withRetry(() => oldJobRef.get());
    if (oldJobSnap.exists) {
      batch.update(oldJobRef, {
        galleryIds: FieldValue.arrayRemove(cleanGalleryId),
      });
    }
  }
  if (newJobRef) {
    batch.update(newJobRef, {
      galleryIds: FieldValue.arrayUnion(cleanGalleryId),
    });
  }

  await withRetry(() => batch.commit());
  return { ok: true, galleryId: cleanGalleryId, jobId: newJobId, ...cleanClient };
}

async function listGalleries({ limit } = {}) {
  const { db } = initFirebase();
  const pageSize = 500;
  const maxItems = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;
  const docs = [];
  let cursor = null;

  while (true) {
    const remaining = maxItems == null ? pageSize : Math.max(0, maxItems - docs.length);
    if (remaining === 0) {
      break;
    }

    const batchSize = Math.min(pageSize, remaining);
    let req = db.collection("galleries").orderBy("createdAt", "desc").limit(batchSize);
    if (cursor) {
      req = req.startAfter(cursor);
    }

    const snap = await withRetry(() => req.get());
    if (snap.empty) {
      break;
    }

    docs.push(...snap.docs);
    cursor = snap.docs[snap.docs.length - 1];

    if (snap.docs.length < batchSize) {
      break;
    }
  }

  return docs.map((doc, i) => toGallerySummary(doc, i));
}

async function searchGalleries(query, { limit } = {}) {
  const trimmed = (query || "").trim().toLowerCase();
  const list = await listGalleries({ limit });
  if (!trimmed) {
    return list;
  }

  return list.filter((g) => {
    const hay = `${g.name} ${g.date} ${g.code} ${g.location}`.toLowerCase();
    return hay.includes(trimmed);
  });
}

async function searchClients(query, { limit = 8 } = {}) {
  const { db } = initFirebase();
  const q = normalizeSearchText(query);
  if (!q) {
    return [];
  }

  const all = [];
  let cursor = null;
  const batchSize = 500;

  while (true) {
    let req = db.collection("clienti").orderBy(FieldPath.documentId()).limit(batchSize);
    if (cursor) {
      req = req.startAfter(cursor);
    }
    const snap = await req.get();
    if (snap.empty) {
      break;
    }

    all.push(...snap.docs);
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < batchSize) {
      break;
    }
  }

  const tokens = q.split(" ").filter(Boolean);
  const scored = all
    .map((doc) => {
      const c = { id: doc.id, ...doc.data() };
      const nome = c.nome || "";
      const cognome = c.cognome || "";
      const email = c.email || "";
      const phone = String(extractClientPhone(c) || "");

      const hay = normalizeSearchText(`${nome} ${cognome} ${email} ${phone}`);
      let score = 0;

      if (hay.includes(q)) {
        score += 100;
      }
      if (normalizeSearchText(nome).startsWith(q)) {
        score += 35;
      }
      if (normalizeSearchText(cognome).startsWith(q)) {
        score += 35;
      }
      if (normalizeSearchText(email).startsWith(q)) {
        score += 30;
      }
      for (const t of tokens) {
        if (hay.includes(t)) {
          score += 8;
        }
      }

      return {
        score,
        value: {
          id: c.id,
          nome,
          cognome,
          email,
          whatsapp: c.whatsapp || "",
          cellulare1: c.cellulare1 || "",
          phone,
        },
      };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || `${a.value.nome} ${a.value.cognome}`.localeCompare(`${b.value.nome} ${b.value.cognome}`))
    .slice(0, limit)
    .map((x) => x.value);

  return scored;
}

async function listJobs({ limit = 150 } = {}) {
  const { db } = initFirebase();
  const snap = await withRetry(() => db.collection("jobs").orderBy("createdAt", "desc").limit(limit).get());
  return snap.docs.map((doc, i) => {
    const dt = doc.data();
    const title =
      dt.title ||
      dt.nome ||
      dt.name ||
      dt.eventName ||
      dt.servizio ||
      dt.tipoServizio ||
      dt.jobName ||
      `Job ${doc.id.slice(0, 8)}`;

    const rawDate = dt.date || dt.eventDate || dt.dataEvento || "";
    const dateLabel =
      rawDate && typeof rawDate.toDate === "function"
        ? rawDate.toDate().toISOString().slice(0, 10)
        : String(rawDate || "");

    return {
      n: i + 1,
      id: doc.id,
      title,
      date: dateLabel,
    };
  });
}

async function listJobsForClient({ clienteId = "", clientEmail = "", clientName = "", limit = 150 } = {}) {
  const { db } = initFirebase();
  const cid = String(clienteId || "").trim();
  const email = normalizeSearchText(clientEmail);
  const name = normalizeSearchText(clientName);
  const maxItems = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 150;

  if (!cid && !email && !name) {
    return listJobs({ limit: maxItems });
  }

  const snap = await withRetry(() =>
    db.collection("jobs").orderBy("createdAt", "desc").limit(Math.max(maxItems, 300)).get(),
  );

  const clientKeys = ["clienteId", "clientId", "customerId", "cliente", "client"];
  const filtered = snap.docs.filter((doc) => {
    const data = doc.data() || {};
    const linkedIds = clientKeys
      .map((key) => data[key])
      .filter(Boolean)
      .map((value) => String(value && value.id ? value.id : value));
    if (cid && linkedIds.includes(cid)) {
      return true;
    }

    const jobEmail = normalizeSearchText(data.clientEmail || data.email || data.emailCliente || "");
    if (email && jobEmail && jobEmail === email) {
      return true;
    }

    const jobClientName = normalizeSearchText(
      data.clientName || data.nomeCliente || `${data.nome || ""} ${data.cognomeCliente || ""}`,
    );
    return Boolean(name && jobClientName && (jobClientName.includes(name) || name.includes(jobClientName)));
  });

  return filtered.slice(0, maxItems).map((doc, i) => {
    const dt = doc.data() || {};
    const title =
      dt.title || dt.nome || dt.name || dt.eventName || dt.servizio || dt.tipoServizio || dt.jobName ||
      `Job ${doc.id.slice(0, 8)}`;
    const rawDate = dt.date || dt.eventDate || dt.dataEvento || "";
    const date = rawDate && typeof rawDate.toDate === "function"
      ? rawDate.toDate().toISOString().slice(0, 10)
      : String(rawDate || "");
    return { n: i + 1, id: doc.id, title, date };
  });
}

async function suggestJobForClient({ clienteId = "", clientEmail = "", clientName = "" }) {
  const { db } = initFirebase();
  const cid = String(clienteId || "").trim();
  const email = String(clientEmail || "").trim().toLowerCase();
  const name = normalizeSearchText(clientName);
  const docsById = new Map();

  if (cid) {
    const idKeys = ["clienteId", "clientId", "customerId", "cliente", "client"];
    for (const key of idKeys) {
      const snap = await withRetry(() => db.collection("jobs").where(key, "==", cid).limit(50).get());
      snap.docs.forEach((d) => docsById.set(d.id, d));
    }
  }

  let candidates = Array.from(docsById.values());

  if (!candidates.length && (email || name)) {
    const snap = await withRetry(() => db.collection("jobs").orderBy("createdAt", "desc").limit(300).get());
    candidates = snap.docs.filter((d) => {
      const j = d.data() || {};
      const hay = normalizeSearchText(
        `${j.clientEmail || j.email || ""} ${j.clientName || j.nomeCliente || j.nome || ""} ${j.cognomeCliente || ""}`,
      );
      return (email && hay.includes(normalizeSearchText(email))) || (name && hay.includes(name));
    });
  }

  if (!candidates.length) {
    return null;
  }

  candidates.sort((a, b) => {
    const ad = a.data();
    const bd = b.data();
    const at = ad.createdAt && typeof ad.createdAt.toMillis === "function" ? ad.createdAt.toMillis() : 0;
    const bt = bd.createdAt && typeof bd.createdAt.toMillis === "function" ? bd.createdAt.toMillis() : 0;
    return bt - at;
  });

  const chosen = candidates[0];
  const dt = chosen.data();
  return {
    id: chosen.id,
    title:
      dt.title ||
      dt.nome ||
      dt.name ||
      dt.eventName ||
      dt.servizio ||
      dt.tipoServizio ||
      dt.jobName ||
      `Job ${chosen.id.slice(0, 8)}`,
    date: dt.date || dt.eventDate || dt.dataEvento || "",
  };
}

async function isSpecialPinUnique(pin) {
  const { db } = initFirebase();
  const clean = (pin || "").trim();
  if (!clean) {
    return false;
  }

  const snap = await withRetry(() => db.collection("gallerySecrets").where("specialPin", "==", clean).limit(1).get());
  return snap.empty;
}

async function createGalleryRecord({ name, date = "", location = "" }) {
  const cleanName = (name || "").trim();
  if (!cleanName) {
    throw new Error("Nome galleria obbligatorio.");
  }

  const { db } = initFirebase();
  const galleryId = db.collection("galleries").doc().id;
  const galleryCode = nanoid(8);

  await withRetry(() => db.collection("galleries").doc(galleryId).set({
    name: cleanName,
    code: galleryCode,
    date: date || "",
    location: location || "",
    description: "",
    hasPassword: false,
    active: true,
    photoCount: 0,
    selectionEnabled: false,
    unlimitedSelection: false,
    chaptersEnabled: false,
    chapters: [],
    userId: "script-upload",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }));

  await withRetry(() => db.collection("gallerySecrets").doc(galleryId).set({
    galleryId,
    password: null,
    specialPin: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }));

  return {
    galleryId,
    galleryCode,
    galleryUrl: `${GALLERY_URL}/${galleryCode}`,
  };
}

function normalizeSelection(selection) {
  const s = selection || {};
  const enabled = Boolean(s.selectionEnabled);
  if (!enabled) {
    return {
      selectionEnabled: false,
      selectionMode: "like",
      unlimitedSelection: false,
      requiredPhotoCount: 0,
      selectionDeadline: null,
    };
  }

  const mode = s.selectionMode === "dislike" ? "dislike" : "like";
  const unlimited = Boolean(s.unlimitedSelection);
  const requiredCount = unlimited ? 0 : Math.max(0, parseInt(s.requiredPhotoCount || 0, 10) || 0);

  let deadline = null;
  if (s.selectionDeadline) {
    const d = new Date(s.selectionDeadline);
    if (!Number.isNaN(d.getTime())) {
      deadline = d;
    }
  }

  return {
    selectionEnabled: true,
    selectionMode: mode,
    unlimitedSelection: unlimited,
    requiredPhotoCount: requiredCount,
    selectionDeadline: deadline,
  };
}

function normalizeYoutubeUrls(youtubeUrls) {
  const urls = Array.isArray(youtubeUrls)
    ? youtubeUrls
    : String(youtubeUrls || "")
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean);

  return urls.filter((url) => /youtu/i.test(url));
}

async function normalizeAccess(access) {
  const a = access || {};
  const mode = ["public", "password", "theme"].includes(a.mode) ? a.mode : "public";

  if (mode === "password") {
    const password = String(a.password || "").trim();
    if (!password) {
      throw new Error("Password obbligatoria per accesso protetto.");
    }
    return { mode, password, specialTheme: null, specialPin: null };
  }

  if (mode === "theme") {
    const specialTheme = String(a.specialTheme || "").trim();
    const specialPin = String(a.specialPin || "").trim();

    if (!THEMES.find((t) => t.id === specialTheme)) {
      throw new Error("Tema speciale non valido.");
    }

    if (!/^[a-zA-Z0-9]{4,}$/.test(specialPin)) {
      throw new Error("PIN non valido. Minimo 4 caratteri alfanumerici.");
    }

    const unique = await isSpecialPinUnique(specialPin);
    if (!unique) {
      throw new Error("PIN speciale gia in uso. Scegline uno diverso.");
    }

    return { mode, password: null, specialTheme, specialPin };
  }

  return { mode: "public", password: null, specialTheme: null, specialPin: null };
}

function createGalleryDocuments(fields) {
  const {
    name,
    date,
    location,
    description,
    userId,
    code,
    access,
    selection,
    youtubeUrls,
    client,
    jobId,
  } = fields;

  const galleryData = {
    name: String(name || "").trim(),
    code,
    date: date || "",
    location: String(location || "").trim(),
    description: String(description || "").trim(),
    hasPassword: access.mode === "password" && !!access.password,
    userId: userId || "script-upload",
    photoCount: 0,
    active: true,
    selectionEnabled: selection.selectionEnabled,
    chaptersEnabled: false,
    chapters: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (access.specialTheme) {
    galleryData.specialTheme = access.specialTheme;
  }

  if (client.clientEmail) {
    galleryData.clientEmail = client.clientEmail;
  }
  if (client.clientName) {
    galleryData.clientName = client.clientName;
  }
  if (client.clientPhone) {
    galleryData.clientPhone = client.clientPhone;
  }
  if (client.clienteId) {
    galleryData.clienteId = client.clienteId;
  }
  if (jobId) {
    galleryData.jobId = jobId;
  }
  if (youtubeUrls.length) {
    galleryData.youtubeUrls = youtubeUrls;
    galleryData.youtubeUrl = youtubeUrls[0];
  }

  if (selection.selectionEnabled) {
    if (selection.selectionMode === "dislike") {
      galleryData.selectionMode = "dislike";
    }
    galleryData.selectionStatus = "pending";
    galleryData.selectedPhotoIds = [];

    if (selection.unlimitedSelection) {
      galleryData.unlimitedSelection = true;
      galleryData.requiredPhotoCount = 0;
    } else if (selection.requiredPhotoCount > 0) {
      galleryData.requiredPhotoCount = selection.requiredPhotoCount;
    }

    if (selection.selectionDeadline) {
      galleryData.selectionDeadline = Timestamp.fromDate(selection.selectionDeadline);
      galleryData.selectionDeadlineEnforced = true;
    }
  }

  const secretsData = {
    password: access.mode === "password" ? access.password : null,
    specialPin: access.mode === "theme" ? access.specialPin : null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  return { galleryData, secretsData };
}

function createCancelToken() {
  return { cancelled: false };
}

function assertNotCancelled(cancelToken) {
  if (cancelToken && cancelToken.cancelled) {
    throw new UploadCancelledError();
  }
}

async function runPool(jobs, fn, concurrency, cancelToken) {
  let i = 0;
  const size = Math.min(concurrency, jobs.length);

  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < jobs.length) {
        assertNotCancelled(cancelToken);
        const job = jobs[i++];
        await fn(job);
      }
    }),
  );
}

function createEtaTracker(totalUnits) {
  const startedAt = Date.now();
  return (completedUnits) => {
    if (!totalUnits || completedUnits <= 0) {
      return null;
    }

    const elapsedMs = Date.now() - startedAt;
    const perUnitMs = elapsedMs / completedUnits;
    const remainingUnits = Math.max(0, totalUnits - completedUnits);
    return Math.ceil((perUnitMs * remainingUnits) / 1000);
  };
}

function computeProgressPercent(completedUnits, totalUnits) {
  if (!totalUnits) {
    return 100;
  }
  return Math.min(100, Math.round((completedUnits / totalUnits) * 100));
}

async function uploadPhoto(filePath, galleryId, chapterId, onStage) {
  const { db, bucket } = initFirebase();

  const original = path.basename(filePath);
  onStage?.("compression_start", original);
  const prepared = await prepareUploadAsset(filePath);
  onStage?.("compression_done", original);

  const outputBase = path.basename(original, path.extname(original));
  const storageDisplayName = `${outputBase}${prepared.outputExt}`;
  const storageName = `${Date.now()}_${nanoid(6)}-${storageDisplayName}`;
  const storagePath = `galleries/${galleryId}/photos/${storageName}`;
  const contentType = prepared.contentType;

  try {
    onStage?.("upload_start", original);
    await withRetry(() =>
      bucket.upload(prepared.uploadPath, {
        destination: storagePath,
        metadata: { contentType },
        resumable: true,
      }),
    );
    onStage?.("upload_done", original);

    const [url] = await withRetry(() =>
      bucket.file(storagePath).getSignedUrl({
        action: "read",
        expires: SIGNED_URL_EXPIRY,
      }),
    );

    const ref = await withRetry(() =>
      db.collection("photos").add({
        galleryId,
        chapterId: chapterId || null,
        name: original,
        url,
        size: prepared.optimizedSize,
        contentType,
        uploadedBy: "admin",
        uploaderUid: "script-upload",
        uploaderEmail: "admin@script",
        uploaderName: "Script Upload",
        likeCount: 0,
        commentCount: 0,
        position: 0,
        createdAt: FieldValue.serverTimestamp(),
      }),
    );

    return { id: ref.id, url, name: original };
  } finally {
    prepared.cleanup?.();
  }
}

async function uploadGalleryCover(filePath, galleryId) {
  const { bucket } = initFirebase();
  const prepared = await prepareUploadAsset(filePath);
  const storagePath = `galleries/${galleryId}/cover/cover-${Date.now()}${prepared.outputExt}`;

  try {
    await withRetry(() =>
      bucket.upload(prepared.uploadPath, {
        destination: storagePath,
        metadata: { contentType: prepared.contentType },
        resumable: true,
      }),
    );

    const [url] = await withRetry(() =>
      bucket.file(storagePath).getSignedUrl({
        action: "read",
        expires: SIGNED_URL_EXPIRY,
      }),
    );

    return url;
  } finally {
    prepared.cleanup?.();
  }
}

async function resolveGalleryCoverUrls(galleryId, chapters, customCovers) {
  const desktopCustom = customCovers && customCovers.desktopPath ? String(customCovers.desktopPath).trim() : "";
  const mobileCustom = customCovers && customCovers.mobilePath ? String(customCovers.mobilePath).trim() : "";

  const rootCover = chapters.find((c) => c.name === null && c.cover)?.cover || null;
  const fallbackCover = chapters.find((c) => c.cover)?.cover || null;
  const autoCover = rootCover || fallbackCover || null;

  const desktopSource = desktopCustom || autoCover;
  const mobileSource = mobileCustom || autoCover || desktopSource;

  if (!desktopSource && !mobileSource) {
    return null;
  }

  const coverImageDesktop = desktopSource ? await uploadGalleryCover(desktopSource, galleryId) : null;
  const coverImageMobile = mobileSource ? await uploadGalleryCover(mobileSource, galleryId) : coverImageDesktop;
  const coverImageUrl = coverImageDesktop || coverImageMobile;

  return {
    coverImageUrl,
    coverImageDesktop: coverImageDesktop || coverImageUrl,
    coverImageMobile: coverImageMobile || coverImageUrl,
  };
}

async function fetchGalleryById(galleryId) {
  const { db } = initFirebase();
  const doc = await withRetry(() => db.collection("galleries").doc(galleryId).get());
  if (!doc.exists) {
    throw new Error("Galleria non trovata.");
  }

  const data = doc.data();
  return {
    id: doc.id,
    name: data.name || "",
    code: data.code || "",
    date: data.date || "",
    photoCount: data.photoCount || 0,
    chapters: data.chapters || [],
    clientName: data.clientName || "",
    clienteId: data.clienteId || "",
  };
}

async function getExistingPhotoNames(galleryId) {
  const cached = existingPhotoNamesCache.get(galleryId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.names;
  }

  const { db } = initFirebase();
  const snap = await withRetry(() => db.collection("photos").where("galleryId", "==", galleryId).get());
  const names = new Set();
  snap.forEach((doc) => {
    const name = doc.data().name;
    if (name) {
      names.add(String(name).toLowerCase());
    }
  });
  existingPhotoNamesCache.set(galleryId, {
    names,
    expiresAt: Date.now() + EXISTING_PHOTO_NAMES_CACHE_TTL_MS,
  });
  return names;
}

function invalidateExistingPhotoNamesCache(galleryId) {
  if (!galleryId) {
    return;
  }
  existingPhotoNamesCache.delete(galleryId);
}

function buildJobsFromChapters(chapters, chapterMap = {}, existingNameSet = null) {
  const jobs = [];
  let skippedDuplicates = 0;
  const skippedDuplicateFiles = [];

  for (const chapter of chapters) {
    const chapterId = chapter.name ? chapterMap[chapter.name] || null : null;

    if (chapter.cover) {
      jobs.push({
        path: chapter.cover,
        chapterId,
        isChapterCover: Boolean(chapterId),
      });
    }

    for (const photoPath of chapter.photos) {
      const nameLower = path.basename(photoPath).toLowerCase();
      if (existingNameSet && existingNameSet.has(nameLower)) {
        skippedDuplicates += 1;
        skippedDuplicateFiles.push(
          chapter.name ? `${chapter.name}/${path.basename(photoPath)}` : path.basename(photoPath),
        );
        continue;
      }

      jobs.push({
        path: photoPath,
        chapterId,
        isChapterCover: false,
      });
    }
  }

  return { jobs, skippedDuplicates, skippedDuplicateFiles };
}

function applyChapterCovers(chapters, coverUpdates) {
  for (const upd of coverUpdates) {
    const chapter = chapters.find((c) => c.id === upd.chapterId);
    if (!chapter) {
      continue;
    }

    chapter.coverPhotoId = upd.photoId;
    chapter.coverPhotoUrl = upd.url;
  }

  return chapters;
}

function countPhotosInChapters(chapters) {
  return chapters.reduce(
    (sum, chapter) => sum + (chapter.photos ? chapter.photos.length : 0) + (chapter.cover ? 1 : 0),
    0,
  );
}

async function uploadJobs({
  galleryId,
  galleryName,
  galleryCode,
  jobs,
  skippedDuplicates,
  skippedDuplicateFiles = [],
  foundPhotos = 0,
  duplicates = 0,
  toUploadPhotos = 0,
  cancelToken,
  onProgress,
}) {
  const { db } = initFirebase();
  const counter = {
    done: 0,
    total: jobs.length,
    completedUnits: 0,
    totalUnits: jobs.length * 2,
    compressedDone: 0,
    uploadedDone: 0,
  };
  const etaFor = createEtaTracker(counter.totalUnits);
  const errors = [];
  const coverUpdates = [];

  const snapshot = () => ({
    done: counter.done,
    total: counter.total,
    doneFiles: counter.done,
    totalFiles: counter.total,
    completedUnits: counter.completedUnits,
    totalUnits: counter.totalUnits,
    progressPercent: computeProgressPercent(counter.completedUnits, counter.totalUnits),
    etaSeconds: etaFor(counter.completedUnits),
    compressedDone: counter.compressedDone,
    uploadedDone: counter.uploadedDone,
    queuedFiles: Math.max(0, counter.total - counter.compressedDone),
    inUploadFiles: Math.max(0, counter.compressedDone - counter.uploadedDone),
  });

  onProgress?.({
    type: "start",
    galleryId,
    galleryName,
    galleryCode,
    foundPhotos,
    duplicates,
    toUploadPhotos,
    skippedDuplicates,
    skippedDuplicateFiles,
    ...snapshot(),
  });

  await runPool(
    jobs,
    async (job) => {
      assertNotCancelled(cancelToken);
      let jobUnitsDone = 0;
      try {
        const uploaded = await uploadPhoto(job.path, galleryId, job.chapterId, (stage, currentFile) => {
          if (stage === "compression_done" || stage === "upload_done") {
            jobUnitsDone += 1;
            counter.completedUnits += 1;
          }
          if (stage === "compression_done") {
            counter.compressedDone += 1;
          }
          if (stage === "upload_done") {
            counter.uploadedDone += 1;
          }

          onProgress?.({
            type: "phase",
            phase: stage,
            currentFile: currentFile || path.basename(job.path),
            skippedDuplicates,
            ...snapshot(),
          });
        });

        if (job.isChapterCover && job.chapterId) {
          coverUpdates.push({
            chapterId: job.chapterId,
            photoId: uploaded.id,
            url: uploaded.url,
          });
        }

        counter.done += 1;

        onProgress?.({
          type: "progress",
          currentFile: path.basename(job.path),
          skippedDuplicates,
          ...snapshot(),
        });
      } catch (err) {
        const uncountedUnits = Math.max(0, 2 - jobUnitsDone);
        if (uncountedUnits > 0) {
          counter.completedUnits += uncountedUnits;
        }
        const message = err && err.message ? err.message : String(err);
        errors.push({ file: path.basename(job.path), error: message });
        onProgress?.({
          type: "error",
          file: path.basename(job.path),
          error: message,
          ...snapshot(),
        });
      }
    },
    MAX_PARALLEL,
    cancelToken,
  );

  await withRetry(() =>
    db.collection("galleries").doc(galleryId).update({
      photoCount: FieldValue.increment(counter.done),
      updatedAt: FieldValue.serverTimestamp(),
    }),
  );

  return {
    uploaded: counter.done,
    total: counter.total,
    foundPhotos,
    duplicates,
    toUploadPhotos,
    errors,
    skippedDuplicates,
    skippedDuplicateFiles,
    coverUpdates,
    galleryUrl: `${GALLERY_URL}/${galleryCode}`,
  };
}

function createFsChaptersFromScan(chapters) {
  const named = chapters.filter((c) => c.name);
  const fsChapters = named.map((chapter) => ({
    id: nanoid(10),
    titolo: chapter.name,
    descrizione: chapter.description || "",
    ordine: chapter.ordine,
    excludeFromSelection: chapter.excludeFromSelection === true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  return fsChapters;
}

function applyChapterSettings(chapters, chapterSettings, { allowDuplicateTitles = false } = {}) {
  if (!Array.isArray(chapterSettings) || !chapterSettings.length) {
    return chapters;
  }

  const settingsBySource = new Map(
    chapterSettings.map((item, index) => [String(item.sourceName || ""), { ...item, index }]),
  );
  const seenTitles = new Set();

  return chapters
    .map((chapter, originalIndex) => {
      if (!chapter.name) {
        return { ...chapter, ordine: Number.MAX_SAFE_INTEGER, originalIndex };
      }
      const setting = settingsBySource.get(String(chapter.name));
      const title = String(setting?.title || chapter.name).trim();
      if (!title) {
        throw new Error(`Il capitolo "${chapter.name}" deve avere un titolo.`);
      }
      const titleKey = normalizeSearchText(title);
      if (!allowDuplicateTitles && seenTitles.has(titleKey)) {
        throw new Error(`Titolo capitolo duplicato: "${title}".`);
      }
      seenTitles.add(titleKey);
      return {
        ...chapter,
        name: title,
        description: String(setting?.description || "").trim(),
        excludeFromSelection: setting?.excludeFromSelection === true,
        ordine: Number.isFinite(setting?.order) ? setting.order : originalIndex,
        originalIndex,
      };
    })
    .sort((a, b) => a.ordine - b.ordine || a.originalIndex - b.originalIndex)
    .map((chapter, index) => {
      const { originalIndex, ...clean } = chapter;
      return { ...clean, ordine: index };
    });
}

function mergeChaptersByName(chapters) {
  const merged = [];
  const byName = new Map();
  for (const chapter of chapters) {
    if (!chapter.name) {
      merged.push(chapter);
      continue;
    }
    const key = normalizeSearchText(chapter.name);
    const existing = byName.get(key);
    if (!existing) {
      const copy = { ...chapter, photos: [...chapter.photos] };
      byName.set(key, copy);
      merged.push(copy);
      continue;
    }
    existing.photos.push(...chapter.photos);
    if (chapter.cover) {
      if (!existing.cover) existing.cover = chapter.cover;
      else existing.photos.push(chapter.cover);
    }
    existing.excludeFromSelection = existing.excludeFromSelection || chapter.excludeFromSelection;
    if (!existing.description && chapter.description) existing.description = chapter.description;
  }
  return merged.map((chapter, index) => ({ ...chapter, ordine: index }));
}

function analyzeUploadFolders({ folder, folders } = {}) {
  const chapters = scanUploadFolders({ folder, folders });
  return {
    totalPhotos: countPhotosInChapters(chapters),
    chapters: chapters.filter((chapter) => chapter.name).map((chapter, index) => ({
      sourceName: chapter.name,
      title: chapter.name,
      description: "",
      order: index,
      photoCount: chapter.photos.length + (chapter.cover ? 1 : 0),
      hasCover: Boolean(chapter.cover),
    })),
    rootPhotoCount: chapters
      .filter((chapter) => !chapter.name)
      .reduce((sum, chapter) => sum + chapter.photos.length + (chapter.cover ? 1 : 0), 0),
  };
}

async function syncExistingChapters(galleryId, existingChapters, incomingChapters) {
  const { db } = initFirebase();
  const chapterMap = Object.fromEntries(existingChapters.map((c) => [c.titolo, c.id]));
  const newChapters = [];

  for (const chapter of incomingChapters.filter((c) => c.name)) {
    if (!chapterMap[chapter.name]) {
      const id = nanoid(10);
      chapterMap[chapter.name] = id;
      newChapters.push({
        id,
        titolo: chapter.name,
        descrizione: chapter.description || "",
        ordine: existingChapters.length + newChapters.length,
        excludeFromSelection: chapter.excludeFromSelection === true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  const allChapters = [...existingChapters, ...newChapters];

  if (newChapters.length) {
    await withRetry(() =>
      db.collection("galleries").doc(galleryId).update({
        chapters: allChapters,
        chaptersEnabled: true,
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
  }

  return {
    chapterMap,
    allChapters,
    newChaptersCount: newChapters.length,
  };
}

async function createAndUploadNewGallery({
  name,
  date = "",
  location = "",
  description = "",
  folder,
  folders,
  access = { mode: "public" },
  selection = { selectionEnabled: false },
  youtubeUrls = [],
  client = {},
  jobId = "",
  customCovers = {},
  chapterSettings = [],
  cancelToken,
  onProgress,
}) {
  const chapters = applyChapterSettings(scanUploadFolders({ folder, folders }), chapterSettings);
  if (!chapters.length) {
    throw new Error("Nessuna immagine trovata nella cartella selezionata.");
  }
  const foundPhotos = countPhotosInChapters(chapters);

  const cleanName = String(name || "").trim();
  if (!cleanName) {
    throw new Error("Nome galleria obbligatorio.");
  }

  const normalizedAccess = await normalizeAccess(access);
  const normalizedSelection = normalizeSelection(selection);
  const normalizedYoutube = normalizeYoutubeUrls(youtubeUrls);

  const { db } = initFirebase();
  const galleryId = db.collection("galleries").doc().id;
  const galleryCode = nanoid(8);

  const fsChapters = createFsChaptersFromScan(chapters);

  const normalizedClient = {
    clienteId: String(client.clienteId || "").trim(),
    clientEmail: String(client.clientEmail || "").trim(),
    clientName: String(client.clientName || "").trim(),
    clientPhone: String(client.clientPhone || "").trim(),
  };

  let resolvedJobId = String(jobId || "").trim();
  if (!resolvedJobId && normalizedClient.clienteId) {
    const suggested = await suggestJobForClient({
      clienteId: normalizedClient.clienteId,
      clientEmail: normalizedClient.clientEmail,
      clientName: normalizedClient.clientName,
    });
    if (suggested) {
      resolvedJobId = suggested.id;
    }
  }

  const { galleryData, secretsData } = createGalleryDocuments({
    name: cleanName,
    date,
    location,
    description,
    userId: "script-upload",
    code: galleryCode,
    access: normalizedAccess,
    selection: normalizedSelection,
    youtubeUrls: normalizedYoutube,
    client: normalizedClient,
    jobId: resolvedJobId,
  });

  galleryData.chapters = fsChapters;
  galleryData.chaptersEnabled = fsChapters.length > 0;

  let jobRef = null;
  if (resolvedJobId) {
    jobRef = db.collection("jobs").doc(resolvedJobId);
    const jobSnap = await withRetry(() => jobRef.get());
    if (!jobSnap.exists) {
      throw new Error("Il job selezionato non esiste piu. Aggiorna l'elenco e riprova.");
    }
  }

  await withRetry(() => {
    const batch = db.batch();
    batch.set(db.collection("galleries").doc(galleryId), galleryData);
    batch.set(db.collection("gallerySecrets").doc(galleryId), {
      galleryId,
      ...secretsData,
    });
    if (jobRef) {
      batch.update(jobRef, {
      galleryIds: FieldValue.arrayUnion(galleryId),
      });
    }
    return batch.commit();
  });

  const galleryCovers = await resolveGalleryCoverUrls(galleryId, chapters, customCovers).catch(() => null);
  if (galleryCovers) {
    try {
      await withRetry(() =>
        db.collection("galleries").doc(galleryId).update({
          coverImageUrl: galleryCovers.coverImageUrl,
          coverImageMobile: galleryCovers.coverImageMobile,
          coverImageDesktop: galleryCovers.coverImageDesktop,
        }),
      );
    } catch (_err) {
      // non blocchiamo l'upload delle foto se la copertina fallisce
    }
  }

  const chapterMap = Object.fromEntries(fsChapters.map((c) => [c.titolo, c.id]));
  const { jobs, skippedDuplicateFiles } = buildJobsFromChapters(chapters, chapterMap, null);

  const result = await uploadJobs({
    galleryId,
    galleryName: cleanName,
    galleryCode,
    jobs,
    foundPhotos,
    duplicates: 0,
    toUploadPhotos: foundPhotos,
    skippedDuplicates: 0,
    skippedDuplicateFiles,
    cancelToken,
    onProgress,
  });

  if (result.coverUpdates.length) {
    const updatedChapters = applyChapterCovers(fsChapters, result.coverUpdates);
    await withRetry(() =>
      db.collection("galleries").doc(galleryId).update({
        chapters: updatedChapters,
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
  }
  invalidateExistingPhotoNamesCache(galleryId);

  return {
    mode: "new",
    galleryId,
    galleryCode,
    galleryName: cleanName,
    access: normalizedAccess,
    clientName: normalizedClient.clientName,
    clientPhone: normalizedClient.clientPhone,
    ...result,
  };
}

async function addPhotosToExistingGallery({
  galleryId,
  folder,
  folders,
  skipDuplicates = true,
  customCovers = {},
  chapterSettings = [],
  cancelToken,
  onProgress,
}) {
  const { db } = initFirebase();
  const gallery = await fetchGalleryById(galleryId);
  const hasCustomDesktop = Boolean(customCovers && String(customCovers.desktopPath || "").trim());
  const hasCustomMobile = Boolean(customCovers && String(customCovers.mobilePath || "").trim());
  const coversOnlyMode = !hasUploadFolders(folder, folders) && (hasCustomDesktop || hasCustomMobile);

  const chapters = coversOnlyMode
    ? []
    : mergeChaptersByName(
        applyChapterSettings(scanUploadFolders({ folder, folders }), chapterSettings, { allowDuplicateTitles: true }),
      );
  if (!coversOnlyMode && !chapters.length) {
    throw new Error("Nessuna immagine trovata nella cartella selezionata.");
  }

  const galleryCovers = await resolveGalleryCoverUrls(galleryId, chapters, customCovers).catch(() => null);
  if (galleryCovers) {
    try {
      await withRetry(() =>
        db.collection("galleries").doc(galleryId).update({
          coverImageUrl: galleryCovers.coverImageUrl,
          coverImageMobile: galleryCovers.coverImageMobile,
          coverImageDesktop: galleryCovers.coverImageDesktop,
        }),
      );
    } catch (_err) {
      // non blocchiamo l'upload delle foto se la copertina fallisce
    }
  }

  if (coversOnlyMode) {
    await withRetry(() =>
      db.collection("galleries").doc(galleryId).update({
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
    return {
      mode: "existing",
      galleryId,
      galleryCode: gallery.code,
      galleryName: gallery.name,
      newChaptersCount: 0,
      uploaded: 0,
      total: 0,
      errors: [],
      skippedDuplicates: 0,
      coverUpdates: [],
      galleryUrl: `${GALLERY_URL}/${gallery.code}`,
      coversOnly: true,
    };
  }

  const { chapterMap, allChapters, newChaptersCount } = await syncExistingChapters(galleryId, gallery.chapters || [], chapters);

  const existingNames = skipDuplicates ? await getExistingPhotoNames(galleryId) : null;
  const { jobs, skippedDuplicates, skippedDuplicateFiles } = buildJobsFromChapters(chapters, chapterMap, existingNames);
  const foundPhotos = countPhotosInChapters(chapters);

  const result = await uploadJobs({
    galleryId,
    galleryName: gallery.name,
    galleryCode: gallery.code,
    jobs,
    foundPhotos,
    duplicates: skippedDuplicates,
    toUploadPhotos: Math.max(0, foundPhotos - skippedDuplicates),
    skippedDuplicates,
    skippedDuplicateFiles,
    cancelToken,
    onProgress,
  });

  if (result.coverUpdates.length) {
    const updatedChapters = applyChapterCovers(allChapters, result.coverUpdates);
    await withRetry(() =>
      db.collection("galleries").doc(galleryId).update({
        chapters: updatedChapters,
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
  }
  invalidateExistingPhotoNamesCache(galleryId);

  return {
    mode: "existing",
    galleryId,
    galleryCode: gallery.code,
    galleryName: gallery.name,
    newChaptersCount,
    ...result,
  };
}

async function analyzeExistingUploadPlan({ galleryId, folder, folders }) {
  if (!galleryId) {
    throw new Error("galleryId mancante.");
  }

  const chapters = scanUploadFolders({ folder, folders });
  if (!chapters.length) {
    throw new Error("Nessuna immagine trovata nella cartella selezionata.");
  }

  const existingNames = await getExistingPhotoNames(galleryId);
  const { skippedDuplicates, skippedDuplicateFiles } = buildJobsFromChapters(chapters, {}, existingNames);
  const foundPhotos = countPhotosInChapters(chapters);

  return {
    foundPhotos,
    duplicates: skippedDuplicates,
    toUploadPhotos: Math.max(0, foundPhotos - skippedDuplicates),
    skippedDuplicateFiles,
    skippedDuplicateFilePaths: resolveSkippedDuplicateFilePaths(folder, folders, skippedDuplicateFiles),
  };
}

function formatPhoneForWhatsApp(phone) {
  if (!phone) {
    return "";
  }

  let cleaned = String(phone).replace(/\D/g, "");
  if (!cleaned) {
    return "";
  }

  if (cleaned.startsWith("00")) {
    cleaned = cleaned.slice(2);
  }

  if (cleaned.startsWith("39") && cleaned.length >= 11 && cleaned[2] === "3") {
    return cleaned;
  }

  if (cleaned.startsWith("3") && cleaned.length >= 9 && cleaned.length <= 10) {
    return `39${cleaned}`;
  }

  return cleaned;
}

function buildWhatsAppMessage({ galleryName, code, password, specialPin, clientName }) {
  const url = `${GALLERY_URL}/${code}`;
  let message = clientName
    ? `Ciao ${clientName}! Ecco il link alla tua galleria fotografica "${galleryName}":\n\n${url}`
    : `Ecco il link alla galleria fotografica "${galleryName}":\n\n${url}`;

  if (password) {
    message += `\n\nPassword: ${password}`;
  }

  if (specialPin) {
    message += `\n\nPIN di accesso: ${specialPin}`;
  }

  return message;
}

async function buildWhatsAppShareForGallery(galleryId) {
  const { db } = initFirebase();
  const gallerySnap = await withRetry(() => db.collection("galleries").doc(galleryId).get());
  if (!gallerySnap.exists) {
    throw new Error("Galleria non trovata.");
  }

  const gallery = gallerySnap.data();
  const code = gallery.code || "";
  const galleryName = gallery.name || "Galleria";

  const secretsSnap = await withRetry(() => db.collection("gallerySecrets").doc(galleryId).get());
  const secrets = secretsSnap.exists ? secretsSnap.data() : {};

  let clientName = gallery.clientName || "";
  let clientPhone = gallery.clientPhone || "";

  if (gallery.clienteId) {
    const clientSnap = await withRetry(() => db.collection("clienti").doc(gallery.clienteId).get());
    if (clientSnap.exists) {
      const c = clientSnap.data();
      clientPhone = extractClientPhone(c) || clientPhone;
      if (!clientName) {
        clientName = `${c.nome || ""} ${c.cognome || ""}`.trim();
      }
    }
  }

  const message = buildWhatsAppMessage({
    galleryName,
    code,
    password: secrets.password || null,
    specialPin: secrets.specialPin || null,
    clientName,
  });

  const formattedPhone = formatPhoneForWhatsApp(clientPhone);
  const waUrl = formattedPhone
    ? `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;

  return {
    galleryId,
    galleryName,
    code,
    message,
    waUrl,
    clientName,
    clientPhone,
    password: secrets.password || null,
    specialPin: secrets.specialPin || null,
    galleryUrl: `${GALLERY_URL}/${code}`,
  };
}

module.exports = {
  THEMES,
  UploadCancelledError,
  createCancelToken,
  listGalleries,
  searchGalleries,
  getGalleryDetails,
  listGalleryPhotos,
  updateGalleryChapters,
  moveGalleryPhotos,
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
  scanFolder,
  ensureFolderExists,
  _test: {
    normalizeStoredChapter,
    applyChapterSettings,
    mergeChaptersByName,
  },
};
