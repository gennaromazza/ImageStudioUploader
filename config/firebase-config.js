"use strict";

const fs = require("fs");
const path = require("path");

function normalizePrivateKey(account) {
  if (!account || typeof account !== "object") {
    return account;
  }

  if (typeof account.private_key === "string" && account.private_key.includes("\\n")) {
    return {
      ...account,
      private_key: account.private_key.replace(/\\n/g, "\n"),
    };
  }

  return account;
}

function parseJsonOrNull(raw) {
  try {
    return JSON.parse(raw);
  } catch (_err) {
    return null;
  }
}

function loadFromInlineJson() {
  const inline = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!inline) {
    return null;
  }

  const parsed = parseJsonOrNull(inline);
  if (!parsed) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON non e un JSON valido.");
  }
  return normalizePrivateKey(parsed);
}

function loadFromFileCandidates() {
  const programData = process.env.PROGRAMDATA || "";
  const localAppData = process.env.LOCALAPPDATA || "";

  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_FILE,
    programData ? path.join(programData, "ImageStudioUploader", "firebase-service-account.json") : null,
    localAppData ? path.join(localAppData, "ImageStudioUploader", "firebase-service-account.json") : null,
    path.join(process.cwd(), "firebase-service-account.json"),
    path.join(process.cwd(), "config", "firebase-service-account.json"),
    path.join(path.dirname(process.execPath), "firebase-service-account.json"),
    process.resourcesPath ? path.join(process.resourcesPath, "firebase-service-account.json") : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }

    const parsed = parseJsonOrNull(fs.readFileSync(candidate, "utf8"));
    if (!parsed) {
      throw new Error(`Service account JSON non valido: ${candidate}`);
    }
    return normalizePrivateKey(parsed);
  }

  return null;
}

function loadServiceAccount() {
  const account = loadFromInlineJson() || loadFromFileCandidates();
  if (account && account.project_id && account.client_email && account.private_key) {
    return account;
  }

  throw new Error(
    [
      "Credenziali Firebase mancanti.",
      "Imposta FIREBASE_SERVICE_ACCOUNT_FILE o FIREBASE_SERVICE_ACCOUNT_JSON.",
      "Oppure crea firebase-service-account.json accanto all'eseguibile.",
    ].join(" "),
  );
}

const SERVICE_ACCOUNT = loadServiceAccount();
const PROJECT_ID = SERVICE_ACCOUNT.project_id;
const BUCKET = `${PROJECT_ID}.firebasestorage.app`;
const GALLERY_URL = process.env.GALLERY_URL || "https://imagestudiofotografico.com/gallery";

module.exports = {
  SERVICE_ACCOUNT,
  PROJECT_ID,
  BUCKET,
  GALLERY_URL,
};
