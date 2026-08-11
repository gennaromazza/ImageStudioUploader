"use strict";

const readline = require("readline");
const { exec } = require("child_process");
const {
  THEMES,
  createAndUploadNewGallery,
  addPhotosToExistingGallery,
  listGalleries,
  searchClients,
  listJobs,
  suggestJobForClient,
  buildWhatsAppShareForGallery,
  createCancelToken,
} = require("./core/uploader-core");

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function yes(answer) {
  const a = String(answer || "").trim().toLowerCase();
  return a === "s" || a === "si" || a === "sì";
}

function parseItDateToIso(input) {
  const s = String(input || "").trim();
  if (!s) {
    return null;
  }

  const parts = s.split("/").map((x) => parseInt(x, 10));
  if (parts.length !== 3 || parts.some((x) => Number.isNaN(x))) {
    return null;
  }

  const [d, m, y] = parts;
  const dt = new Date(y, m - 1, d, 23, 59, 59);
  if (Number.isNaN(dt.getTime())) {
    return null;
  }

  return dt.toISOString();
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

function openBrowser(url) {
  if (process.platform === "win32") {
    exec(`start "" "${url}"`);
    return;
  }
  if (process.platform === "darwin") {
    exec(`open "${url}"`);
    return;
  }
  exec(`xdg-open "${url}"`);
}

function printBanner() {
  console.log("\n========================================================");
  console.log("   Image Studio - Uploader Gallerie v3");
  console.log("========================================================\n");
}

function printProgress(evt) {
  if (evt.type === "phase") {
    if (evt.phase === "compression_start") {
      process.stdout.write(`\r  Compressione: ${evt.currentFile || ""}                     `);
    }
    if (evt.phase === "upload_start") {
      process.stdout.write(`\r  Upload:       ${evt.currentFile || ""}                     `);
    }
  }

  if (evt.type === "progress") {
    const eta = evt.etaSeconds == null ? "--" : `${evt.etaSeconds}s`;
    process.stdout.write(
      `\r  ${String(evt.doneFiles).padStart(4)}/${evt.totalFiles}  ${String(evt.progressPercent).padStart(3)}%  ETA ${eta}  `,
    );
  }

  if (evt.type === "error") {
    process.stdout.write("\n");
    console.log(`  Errore su ${evt.file}: ${evt.error}`);
  }
}

async function selectClientCli() {
  console.log("\nRicerca cliente (invio per saltare)");
  const query = await ask("Nome/cognome/email: ");
  if (!query) {
    return null;
  }

  const results = await searchClients(query, { limit: 8 });
  if (!results.length) {
    console.log("Nessun cliente trovato.");
    return null;
  }

  results.forEach((c, i) => {
    const name = `${c.nome || ""} ${c.cognome || ""}`.trim();
    const email = c.email ? ` <${c.email}>` : "";
    console.log(`  ${i + 1}. ${name}${email}`);
  });

  const n = parseInt(await ask("Numero cliente (invio per saltare): "), 10);
  if (!n || n < 1 || n > results.length) {
    return null;
  }

  return results[n - 1];
}

async function selectJobCli() {
  const use = await ask("Associare un Job? (s/n, invio=no): ");
  if (!yes(use)) {
    return "";
  }

  const jobs = await listJobs({ limit: 150 });
  jobs.forEach((j) => {
    console.log(`  ${String(j.n).padStart(3)}. ${j.title}${j.date ? ` (${j.date})` : ""}`);
  });

  const n = parseInt(await ask("Numero job (invio per saltare): "), 10);
  if (!n || n < 1 || n > jobs.length) {
    return "";
  }

  return jobs[n - 1].id;
}

async function askAccessCli() {
  console.log("\nAccesso galleria:");
  console.log("  1. Pubblica");
  console.log("  2. Password");
  console.log("  3. Tema + PIN");
  const choice = await ask("Scelta (1/2/3, invio=1): ");

  if (choice === "2") {
    const password = await ask("Password: ");
    return { mode: "password", password };
  }

  if (choice === "3") {
    THEMES.forEach((t, i) => console.log(`  ${i + 1}. ${t.label}`));
    const n = parseInt(await ask("Numero tema: "), 10);
    if (!n || n < 1 || n > THEMES.length) {
      return { mode: "public" };
    }

    const pin = await ask("PIN (almeno 4 alfanumerici): ");
    return {
      mode: "theme",
      specialTheme: THEMES[n - 1].id,
      specialPin: pin,
    };
  }

  return { mode: "public" };
}

async function askSelectionCli() {
  const enabled = await ask("Abilitare selezione foto? (s/n, invio=no): ");
  if (!yes(enabled)) {
    return { selectionEnabled: false };
  }

  const modeChoice = await ask("Modalita selezione: 1=Like, 2=Dislike (invio=1): ");
  const unlimitedChoice = await ask("Selezione illimitata? (s/n, invio=no): ");
  const unlimited = yes(unlimitedChoice);

  let requiredPhotoCount = 0;
  if (!unlimited) {
    requiredPhotoCount = parseInt(await ask("Numero foto da selezionare (invio=0): "), 10) || 0;
  }

  const deadlineIt = await ask("Scadenza (gg/mm/aaaa, invio per saltare): ");
  const selectionDeadline = parseItDateToIso(deadlineIt);

  return {
    selectionEnabled: true,
    selectionMode: modeChoice === "2" ? "dislike" : "like",
    unlimitedSelection: unlimited,
    requiredPhotoCount,
    selectionDeadline,
  };
}

async function askYoutubeCli() {
  const add = await ask("Aggiungere URL YouTube? (s/n, invio=no): ");
  if (!yes(add)) {
    return [];
  }

  const urls = [];
  while (true) {
    const url = await ask(`URL video ${urls.length + 1} (invio per finire): `);
    if (!url) {
      break;
    }
    urls.push(url);
  }
  return urls;
}

async function shareOnWhatsappCli(galleryId) {
  const doShare = await ask("Condividere su WhatsApp ora? (s/n, invio=si): ");
  if (String(doShare).trim().toLowerCase() === "n") {
    return;
  }

  const data = await buildWhatsAppShareForGallery(galleryId);
  console.log("\nAnteprima messaggio:");
  console.log("--------------------------------------------------");
  console.log(data.message);
  console.log("--------------------------------------------------");

  let phone = data.clientPhone || "";
  if (phone) {
    const use = await ask(`Numero cliente trovato (${phone}). Usarlo? (s/n, invio=si): `);
    if (String(use).trim().toLowerCase() === "n") {
      phone = await ask("Nuovo numero WhatsApp: ");
    }
  } else {
    phone = await ask("Numero WhatsApp (invio per aprire senza numero): ");
  }

  const formatted = formatPhoneForWhatsApp(phone);
  const waUrl = formatted
    ? `https://wa.me/${formatted}?text=${encodeURIComponent(data.message)}`
    : `https://wa.me/?text=${encodeURIComponent(data.message)}`;

  const open = await ask("Aprire WhatsApp nel browser? (s/n, invio=si): ");
  if (String(open).trim().toLowerCase() !== "n") {
    openBrowser(waUrl);
    console.log("WhatsApp aperto nel browser.");
  } else {
    console.log("Link WhatsApp:");
    console.log(waUrl);
  }
}

async function createNewFromCli() {
  console.log("\n--- NUOVA GALLERIA ---\n");

  const name = await ask("Nome galleria *: ");
  const date = await ask("Data evento (gg/mm/aaaa, invio per saltare): ");
  const location = await ask("Luogo (invio per saltare): ");
  const description = await ask("Descrizione (invio per saltare): ");

  const clientChoice = await selectClientCli();
  const client = {
    clienteId: clientChoice ? clientChoice.id : "",
    clientName: clientChoice ? `${clientChoice.nome || ""} ${clientChoice.cognome || ""}`.trim() : "",
    clientEmail: clientChoice ? clientChoice.email || "" : "",
    clientPhone: clientChoice ? clientChoice.phone || clientChoice.whatsapp || clientChoice.cellulare1 || "" : "",
  };

  if (!client.clientEmail) {
    client.clientEmail = await ask("Email cliente (invio per saltare): ");
  }
  if (!client.clientName && client.clientEmail) {
    client.clientName = await ask("Nome cliente: ");
  }

  const jobId = await selectJobCli();
  let resolvedJobId = jobId;
  if (!resolvedJobId && client.clienteId) {
    const suggested = await suggestJobForClient({
      clienteId: client.clienteId,
      clientEmail: client.clientEmail,
      clientName: client.clientName,
    });
    if (suggested) {
      resolvedJobId = suggested.id;
      console.log(`Job associato automaticamente: ${suggested.title}${suggested.date ? ` (${suggested.date})` : ""}`);
    }
  }
  const access = await askAccessCli();
  const selection = await askSelectionCli();
  const youtubeUrls = await askYoutubeCli();

  const folder = (await ask("Percorso cartella foto *: ")).replace(/^"|"$/g, "");

  const ok = await ask("Procedere con il caricamento? (s/n): ");
  if (!yes(ok)) {
    console.log("Annullato.");
    return;
  }

  const result = await createAndUploadNewGallery({
    name,
    date,
    location,
    description,
    folder,
    access,
    selection,
    youtubeUrls,
    client,
    jobId: resolvedJobId,
    cancelToken: createCancelToken(),
    onProgress: printProgress,
  });

  process.stdout.write("\n\n");
  console.log(`Upload completato: ${result.uploaded}/${result.total}`);
  if (result.errors.length) {
    console.log("Errori:");
    for (const err of result.errors) {
      console.log(` - ${err.file}: ${err.error}`);
    }
  }
  console.log(`Link galleria: ${result.galleryUrl}\n`);

  await shareOnWhatsappCli(result.galleryId);
}

async function addToExistingFromCli() {
  console.log("\n--- AGGIUNGI FOTO A GALLERIA ESISTENTE ---\n");
  const galleries = await listGalleries();
  galleries.forEach((g) => {
    const label = `${g.name}${g.date ? ` (${g.date})` : ""}`;
    console.log(` ${String(g.n).padStart(3)}. ${label.padEnd(50)} [${g.count} foto]`);
  });

  const num = parseInt(await ask("\nNumero galleria: "), 10);
  if (!num || num < 1 || num > galleries.length) {
    throw new Error("Numero non valido.");
  }

  const gallery = galleries[num - 1];
  const folder = (await ask("Percorso cartella foto *: ")).replace(/^"|"$/g, "");
  const skipDup = await ask("Saltare duplicati per nome file? (s/n, invio=si): ");
  const ok = await ask("Procedere? (s/n): ");
  if (!yes(ok)) {
    console.log("Annullato.");
    return;
  }

  const result = await addPhotosToExistingGallery({
    galleryId: gallery.id,
    folder,
    skipDuplicates: String(skipDup).trim().toLowerCase() !== "n",
    cancelToken: createCancelToken(),
    onProgress: printProgress,
  });

  process.stdout.write("\n\n");
  console.log(`Upload completato: ${result.uploaded}/${result.total}`);
  if (result.skippedDuplicates) {
    console.log(`Duplicati saltati: ${result.skippedDuplicates}`);
    if (Array.isArray(result.skippedDuplicateFiles) && result.skippedDuplicateFiles.length) {
      console.log("File saltati:");
      for (const file of result.skippedDuplicateFiles) {
        console.log(` - ${file}`);
      }
    }
  }
  if (result.newChaptersCount) {
    console.log(`Nuovi capitoli aggiunti: ${result.newChaptersCount}`);
  }
  if (result.errors.length) {
    console.log("Errori:");
    for (const err of result.errors) {
      console.log(` - ${err.file}: ${err.error}`);
    }
  }
  console.log(`Link galleria: ${result.galleryUrl}\n`);

  await shareOnWhatsappCli(gallery.id);
}

async function main() {
  printBanner();
  const choice = await ask("Cosa vuoi fare?\n  1. Crea nuova galleria\n  2. Aggiungi foto a galleria esistente\n\nScelta (1 o 2): ");

  if (choice === "1") {
    await createNewFromCli();
  } else if (choice === "2") {
    await addToExistingFromCli();
  } else {
    throw new Error("Scelta non valida.");
  }
}

main().catch((err) => {
  console.error(`\nErrore: ${err.message}`);
  process.exit(1);
});
