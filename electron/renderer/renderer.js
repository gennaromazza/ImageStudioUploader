}

function renderClients() {
  els.clientResults.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Nessun cliente selezionato";
  els.clientResults.appendChild(empty);

  for (const c of state.clients) {
    const op = document.createElement("option");
    op.value = c.id;
    op.textContent = `${c.nome || ""} ${c.cognome || ""} ${c.email ? `<${c.email}>` : ""}`.trim();
    els.clientResults.appendChild(op);
  }
}

function renderExistingClients() {
  const selectedId = state.selectedGallery?.clienteId || "";
  els.existingClientResults.innerHTML = '<option value="">Nessun cliente selezionato</option>';
  for (const client of state.existingClients) {
    const option = document.createElement("option");
    option.value = client.id;
    option.textContent = `${client.nome || ""} ${client.cognome || ""} ${client.email ? `<${client.email}>` : ""}`.trim();
    els.existingClientResults.appendChild(option);
  }
  els.existingClientResults.value = selectedId;
}

function renderExistingJobs(jobs, selectedJobId = "") {
  els.existingJobSelect.innerHTML = '<option value="">Nessun job</option>';
  for (const job of jobs) {
    const option = document.createElement("option");
    option.value = job.id;
    option.textContent = job.date ? `${job.title} (${job.date})` : job.title;
    els.existingJobSelect.appendChild(option);
  }
  if (selectedJobId && !jobs.some((job) => job.id === selectedJobId)) {
    const current = document.createElement("option");
    current.value = selectedJobId;
    current.textContent = `Job attuale (${selectedJobId})`;
    els.existingJobSelect.appendChild(current);
  }
  els.existingJobSelect.value = selectedJobId || "";
}

async function populateExistingAssociationEditor(gallery) {
  els.existingClientName.value = gallery.clientName || "";
  els.existingClientEmail.value = gallery.clientEmail || "";
  els.existingClientPhone.value = gallery.clientPhone || "";
  state.existingClients = gallery.clienteId
    ? [{
        id: gallery.clienteId,
        nome: gallery.clientName || "Cliente attuale",
        cognome: "",
        email: gallery.clientEmail || "",
        phone: gallery.clientPhone || "",
      }]
    : [];
  renderExistingClients();

  const jobs = await window.galleryApi.listJobsForClient({
    clienteId: gallery.clienteId || "",
    clientEmail: gallery.clientEmail || "",
    clientName: gallery.clientName || "",
    limit: 150,
  });
  renderExistingJobs(jobs, gallery.jobId || "");
  els.existingJobFilterStatus.textContent = gallery.clienteId
    ? `${jobs.length} job associati al cliente.`
    : "Elenco completo dei job.";
}

async function searchExistingClients() {
  const query = els.existingClientSearch.value.trim();
  const results = query ? await window.galleryApi.searchClients(query, 12) : [];
  const currentId = state.selectedGallery?.clienteId || "";
  if (currentId && !results.some((client) => client.id === currentId)) {
    results.unshift({
      id: currentId,
      nome: state.selectedGallery.clientName || "Cliente attuale",
      cognome: "",
      email: state.selectedGallery.clientEmail || "",
      phone: state.selectedGallery.clientPhone || "",
    });
  }
  state.existingClients = results;
  renderExistingClients();
}

function getSelectedExistingClient() {
  const id = els.existingClientResults.value;
  return state.existingClients.find((client) => client.id === id) || null;
}

function updateAccessFieldsState() {
  const mode = els.accessMode.value;
  const isPassword = mode === "password";
  const isTheme = mode === "theme";

  els.accessPassword.disabled = !isPassword;
  els.accessTheme.disabled = !isTheme;
  els.accessPin.disabled = !isTheme;
}

function updateSelectionFieldsState() {
  const enabled = els.selectionEnabled.checked;
  const unlimited = els.selectionUnlimited.checked;

  els.selectionMode.disabled = !enabled;
  els.selectionUnlimited.disabled = !enabled;
  els.selectionCount.disabled = !enabled || unlimited;
  els.selectionDeadline.disabled = !enabled;
}

async function loadGalleries(query = "") {
  const list = query.trim()
    ? await window.galleryApi.searchGalleries(query)
    : await window.galleryApi.listGalleries();
  renderGalleries(list);
}

const debouncedLoadGalleries = debounce((query) => {
  loadGalleries(query).catch((err) => {
    appendError(`Ricerca gallerie: ${err.message || err}`);
  });
}, 300);

async function loadThemesAndJobs() {
  state.themes = await window.galleryApi.listThemes();
  state.jobs = await window.galleryApi.listJobs(150);
  renderThemes();
  renderJobs();
  updateAccessFieldsState();
}

async function searchClientsFromInput() {
  const query = els.clientSearch.value.trim();
  if (!query) {
    state.clients = [];
    renderClients();
    return;
  }

  state.clients = await window.galleryApi.searchClients(query, 8);
  renderClients();
}

async function shareSelectedGalleryWhatsapp() {
  if (!state.selectedGalleryId) {
    alert("Seleziona prima una galleria.");
    return;
  }

  const data = await window.galleryApi.whatsappForGallery(state.selectedGalleryId);
  await window.galleryApi.openExternal(data.waUrl);
}

function getSelectedClient() {
  const id = els.clientResults.value;
  if (!id) {
    return null;
  }
  return state.clients.find((c) => c.id === id) || null;
}

async function pickFolder(targetInput) {
  const result = await window.galleryApi.pickFolder();
  if (!result.canceled) {
    setFolderSelection(targetInput, [result.folder]);
    if (targetInput === els.newFolder) {
      await analyzeNewFolders();
    }
  }
}

async function pickImage(targetInput) {
  const result = await window.galleryApi.pickImage();
  if (!result.canceled) {
    targetInput.value = result.file;
  }
}

function toFileUrl(filePath) {
  const normalized = String(filePath || "").replace(/\\/g, "/");
  return encodeURI(`file:///${normalized}`);
}

function getExtension(filePath) {
  const p = String(filePath || "").toLowerCase();
  const slash = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  const dot = p.lastIndexOf(".");
  if (dot <= slash) {
    return "";
  }
  return p.slice(dot);
}

function dirname(filePath) {
  const raw = String(filePath || "");
  const idx = Math.max(raw.lastIndexOf("/"), raw.lastIndexOf("\\"));
  return idx >= 0 ? raw.slice(0, idx) : raw;
}

async function getDroppedPaths(event) {
  const files = Array.from(event.dataTransfer?.files || []);
  const paths = [];

  for (const file of files) {
    let filePath = "";
    try {
      if (window.galleryApi.getPathForFile) {
        filePath = window.galleryApi.getPathForFile(file);
      }
    } catch (_err) {
      filePath = "";
    }
    if (!filePath && file.path) {
      filePath = file.path;
    }
    if (filePath) {
      paths.push(filePath);
    }
  }

  return paths;
}

function getFolderSelectionKey(input) {
  if (input === els.existingFolder) {
    return "existing";
  }
  if (input === els.newFolder) {
    return "new";
  }
  return null;
}

function uniquePaths(paths) {
  const out = [];
  const seen = new Set();
  for (const item of paths) {
    const clean = String(item || "").trim();
    const key = clean.toLowerCase();
    if (clean && !seen.has(key)) {
      seen.add(key);
      out.push(clean);
    }
  }
  return out;
}

function formatFolderSelection(paths) {
  if (paths.length <= 1) {
    return paths[0] || "";
  }
  return `${paths.length} cartelle: ${paths.map((p) => p.split(/[\\/]/).filter(Boolean).pop() || p).join(", ")}`;
}

function setFolderSelection(input, paths) {
  const folders = uniquePaths(paths);
  const key = getFolderSelectionKey(input);
  if (key) {
    state.folderSelections[key] = folders;
  }
  input.value = formatFolderSelection(folders);
  input.title = folders.join("\n");
}

function getFolderSelection(input) {
  const key = getFolderSelectionKey(input);
  const selected = key ? state.folderSelections[key] : [];
  return selected.length ? selected : uniquePaths([input.value]);
}

function pathsToFolderSelection(paths) {
  return uniquePaths(
    paths.map((candidate) => {
      const ext = getExtension(candidate);
      return IMAGE_EXTENSIONS.has(ext) ? dirname(candidate) : candidate;
    }),
  );
}

function bindDropTarget(container, onDropPath) {
  if (!container) {
    return;
  }
  container.classList.add("drop-target");

  container.addEventListener("dragover", (event) => {
    event.preventDefault();
    container.classList.add("dragover");
  });
  container.addEventListener("dragleave", () => container.classList.remove("dragover"));
  container.addEventListener("drop", async (event) => {
    event.preventDefault();
    container.classList.remove("dragover");
    const paths = await getDroppedPaths(event);
    if (!paths.length) {
      return;
    }
    onDropPath(paths);
  });
}

async function openDuplicateModal(analysis) {
  return new Promise((resolve) => {
    const found = analysis.foundPhotos || 0;
    const duplicates = analysis.duplicates || 0;
    const toUpload = analysis.toUploadPhotos || 0;
    const list = Array.isArray(analysis.skippedDuplicateFiles) ? analysis.skippedDuplicateFiles : [];
    const previewPaths = Array.isArray(analysis.skippedDuplicateFilePaths) ? analysis.skippedDuplicateFilePaths : [];

    els.duplicateModalSummary.textContent = `Trovate ${found} foto. ${duplicates} hanno lo stesso nome di file gia presenti in galleria. Se salti i duplicati, verranno caricate ${toUpload} foto.`;
    els.duplicateModalList.innerHTML = list.map((name) => `<li>${escapeHtml(String(name))}</li>`).join("");

    const maxPreview = 18;
    const previews = previewPaths.slice(0, maxPreview).map((p, idx) => {
      const label = list[idx] || p;
      return `
        <div class="duplicate-item">
          <img src="${escapeHtml(toFileUrl(p))}" alt="${escapeHtml(label)}" />
          <span title="${escapeHtml(label)}">${escapeHtml(label)}</span>
        </div>
      `;
    });
    if (previewPaths.length > maxPreview) {
      previews.push(`<div class="duplicate-item"><span>+${previewPaths.length - maxPreview} altri file...</span></div>`);
    }
    els.duplicateModalGrid.innerHTML = previews.join("");

    const close = (choice) => {
      els.duplicateModal.classList.add("hidden");
      els.duplicateModal.setAttribute("aria-hidden", "true");
      resolve(choice);
    };

    els.duplicateCancel.onclick = () => close("cancel");
    els.duplicateUploadAll.onclick = () => close("all");
    els.duplicateSkip.onclick = () => close("skip");
    els.duplicateModal.onclick = (event) => {
      if (event.target === els.duplicateModal) {
        close("cancel");
      }
    };

    els.duplicateModal.classList.remove("hidden");
    els.duplicateModal.setAttribute("aria-hidden", "false");
  });
}

function updateCoverPreview(inputEl, previewEl) {
  const filePath = inputEl.value.trim();
  if (!filePath) {
    previewEl.src = "";
    previewEl.classList.add("hidden");
    return;
  }
  previewEl.src = toFileUrl(filePath);
  previewEl.classList.remove("hidden");
}

async function startUpload(payload) {
  resetSummary();
  els.errorList.innerHTML = "";
  updateProgress(0, 0);
  updateTimeline(0, 0, 0);
  els.phaseText.textContent = "Fase: preparazione";
  els.etaText.textContent = "ETA: --";

  const { uploadId } = await window.galleryApi.startUpload(payload);
  state.currentUploadId = uploadId;
  setUploadUIBusy(true);
  els.statusText.textContent = "Upload avviato...";
}

function showSummary(payload) {
  if (payload.cancelled) {
    els.summary.classList.remove("hidden");
    els.summary.innerHTML = `<strong>Upload annullato.</strong> ${escapeHtml(payload.message || "")}`;
    return;
  }

  if (payload.failed) {
    els.summary.classList.remove("hidden");
    els.summary.innerHTML = `<strong>Errore:</strong> ${escapeHtml(payload.message || "Errore sconosciuto")}`;
    return;
  }

  const parts = [
    `<div><strong>Galleria:</strong> ${escapeHtml(payload.galleryName || "")}</div>`,
    `<div><strong>Caricate:</strong> ${payload.uploaded || 0} / ${payload.total || 0}</div>`,
  ];

  if (Number.isFinite(payload.foundPhotos)) {
    const duplicates = Number.isFinite(payload.duplicates) ? payload.duplicates : 0;
    const toUpload = Number.isFinite(payload.toUploadPhotos) ? payload.toUploadPhotos : payload.foundPhotos;
    parts.push(`<div><strong>Foto trovate:</strong> ${payload.foundPhotos}</div>`);
    parts.push(`<div><strong>Duplicati:</strong> ${duplicates}</div>`);
    parts.push(`<div><strong>Da caricare:</strong> ${toUpload}</div>`);
  }

  if (payload.skippedDuplicates) {
    parts.push(`<div><strong>Duplicati saltati:</strong> ${payload.skippedDuplicates}</div>`);
  }
  if (Array.isArray(payload.skippedDuplicateFiles) && payload.skippedDuplicateFiles.length) {
    const items = payload.skippedDuplicateFiles
      .map((name) => `<li>${escapeHtml(String(name))}</li>`)
      .join("");
    parts.push(
      `<details><summary><strong>File saltati (${payload.skippedDuplicateFiles.length})</strong></summary><ul>${items}</ul></details>`,
    );
  }

  if (payload.newChaptersCount) {
    parts.push(`<div><strong>Nuovi capitoli:</strong> ${payload.newChaptersCount}</div>`);
  }

  if (payload.galleryUrl) {
    parts.push(`<div><strong>Link:</strong> <a href="#" id="gallery-link">${escapeHtml(payload.galleryUrl)}</a></div>`);
  }

  parts.push(`<div><button id="summary-whatsapp" class="btn secondary">Apri WhatsApp</button></div>`);

  els.summary.classList.remove("hidden");
  els.summary.innerHTML = parts.join("");

  const link = document.getElementById("gallery-link");
  if (link) {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      await window.galleryApi.openExternal(payload.galleryUrl);
    });
  }

  const waBtn = document.getElementById("summary-whatsapp");
  if (waBtn && payload.galleryId) {
    waBtn.addEventListener("click", async () => {
      const data = await window.galleryApi.whatsappForGallery(payload.galleryId);
      await window.galleryApi.openExternal(data.waUrl);
    });
  }
}

async function buildNewUploadPayload() {
  const name = els.newName.value.trim();
  if (!name) {
    throw new Error("Il nome galleria e obbligatorio.");
  }

  if (!els.newFolder.value) {
    throw new Error("Seleziona la cartella foto.");
  }
  const selectedFolders = getFolderSelection(els.newFolder);
  const folderKey = selectedFolders.join("|").toLowerCase();
  if (state.chapterAnalysisKey !== folderKey) {
    await analyzeNewFolders();
  }

  const chapterSettings = state.chapterSettings.map((chapter, order) => ({
    sourceName: chapter.sourceName,
    title: String(chapter.title || "").trim(),
    description: String(chapter.description || "").trim(),
    excludeFromSelection: chapter.excludeFromSelection === true,
    order,
  }));
  if (chapterSettings.some((chapter) => !chapter.title)) {
    throw new Error("Tutti i capitoli devono avere un titolo.");
  }
  const uniqueChapterTitles = new Set(chapterSettings.map((chapter) => chapter.title.toLowerCase()));
  if (uniqueChapterTitles.size !== chapterSettings.length) {
    throw new Error("I titoli dei capitoli devono essere univoci.");
  }

  const accessMode = els.accessMode.value;
  const access = {
    mode: accessMode,
    password: els.accessPassword.value.trim(),
    specialTheme: els.accessTheme.value,
    specialPin: els.accessPin.value.trim(),
  };

  if (accessMode === "theme" && access.specialPin) {
    const pinCheck = await window.galleryApi.checkSpecialPin(access.specialPin);
    if (!pinCheck.unique) {
      throw new Error("PIN speciale gia usato. Scegline uno diverso.");
    }
  }

  const selectedClient = getSelectedClient();
  const client = {
    clienteId: selectedClient ? selectedClient.id : "",
    clientName: els.clientName.value.trim(),
    clientEmail: els.clientEmail.value.trim(),
    clientPhone: els.clientPhone.value.trim(),
  };

  if (selectedClient) {
    if (!client.clientName) {
      client.clientName = `${selectedClient.nome || ""} ${selectedClient.cognome || ""}`.trim();
    }
    if (!client.clientEmail) {
      client.clientEmail = selectedClient.email || "";
    }
    if (!client.clientPhone) {
      client.clientPhone = selectedClient.phone || selectedClient.whatsapp || selectedClient.cellulare1 || "";
    }
  }

  return {
    mode: "new",
    name,
    date: els.newDate.value.trim(),
    location: els.newLocation.value.trim(),
    description: els.newDescription.value.trim(),
    folder: selectedFolders[0] || "",
    folders: selectedFolders,
    chapterSettings,
    customCovers: {
      desktopPath: els.newCoverDesktop.value.trim(),
      mobilePath: els.newCoverMobile.value.trim(),
    },
    access,
    selection: {
      selectionEnabled: els.selectionEnabled.checked,
      selectionMode: els.selectionMode.value,
      unlimitedSelection: els.selectionUnlimited.checked,
      requiredPhotoCount: parseInt(els.selectionCount.value || "0", 10) || 0,
      selectionDeadline: els.selectionDeadline.value || null,
    },
    youtubeUrls: els.youtubeUrls.value
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean),
    client,
    jobId: els.jobSelect.value || "",
  };
}

function attachListeners() {
  for (const btn of els.tabButtons) {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  }

  els.refreshGalleries.addEventListener("click", () => loadGalleries(els.gallerySearch.value));
  els.gallerySearch.addEventListener("input", () => debouncedLoadGalleries(els.gallerySearch.value));

  els.pickExistingFolder.addEventListener("click", async () => {
    await pickFolder(els.existingFolder);
    await analyzeExistingFoldersForMapping();
  });
  els.pickNewFolder.addEventListener("click", () => pickFolder(els.newFolder));
  els.pickExistingCoverDesktop.addEventListener("click", async () => {
    await pickImage(els.existingCoverDesktop);
    updateCoverPreview(els.existingCoverDesktop, els.existingCoverDesktopPreview);
  });
  els.pickExistingCoverMobile.addEventListener("click", async () => {
    await pickImage(els.existingCoverMobile);
    updateCoverPreview(els.existingCoverMobile, els.existingCoverMobilePreview);
  });
  els.pickNewCoverDesktop.addEventListener("click", async () => {
    await pickImage(els.newCoverDesktop);
    updateCoverPreview(els.newCoverDesktop, els.newCoverDesktopPreview);
  });
  els.pickNewCoverMobile.addEventListener("click", async () => {
    await pickImage(els.newCoverMobile);
    updateCoverPreview(els.newCoverMobile, els.newCoverMobilePreview);
  });

  bindDropTarget(els.existingFolder.parentElement, (paths) => {
    setFolderSelection(els.existingFolder, pathsToFolderSelection(paths));
    analyzeExistingFoldersForMapping().catch((err) => appendError(`Analisi destinazioni: ${err.message || err}`));
  });
  bindDropTarget(els.newFolder.parentElement, (paths) => {
    setFolderSelection(els.newFolder, pathsToFolderSelection(paths));
    analyzeNewFolders().catch((err) => appendError(`Analisi capitoli: ${err.message || err}`));
  });
  bindDropTarget(els.existingCoverDesktop.parentElement, (paths) => {
    const candidate = paths[0];
    if (IMAGE_EXTENSIONS.has(getExtension(candidate))) {
      els.existingCoverDesktop.value = candidate;
      updateCoverPreview(els.existingCoverDesktop, els.existingCoverDesktopPreview);
    }
  });
  bindDropTarget(els.existingCoverMobile.parentElement, (paths) => {
    const candidate = paths[0];
    if (IMAGE_EXTENSIONS.has(getExtension(candidate))) {
      els.existingCoverMobile.value = candidate;
      updateCoverPreview(els.existingCoverMobile, els.existingCoverMobilePreview);
    }
  });
  bindDropTarget(els.newCoverDesktop.parentElement, (paths) => {
    const candidate = paths[0];
    if (IMAGE_EXTENSIONS.has(getExtension(candidate))) {
      els.newCoverDesktop.value = candidate;
      updateCoverPreview(els.newCoverDesktop, els.newCoverDesktopPreview);
    }
  });
  bindDropTarget(els.newCoverMobile.parentElement, (paths) => {
    const candidate = paths[0];
    if (IMAGE_EXTENSIONS.has(getExtension(candidate))) {
      els.newCoverMobile.value = candidate;
      updateCoverPreview(els.newCoverMobile, els.newCoverMobilePreview);
    }
  });
  els.shareExistingWhatsapp.addEventListener("click", shareSelectedGalleryWhatsapp);
  els.shareExistingWhatsappTop.addEventListener("click", shareSelectedGalleryWhatsapp);
  els.openExistingGallery.addEventListener("click", async () => {
    const url = state.galleryDetails?.galleryUrl;
    if (url) await window.galleryApi.openExternal(url);
  });
  els.selectedGalleryUrl.addEventListener("click", async (event) => {
    event.preventDefault();
    const url = state.galleryDetails?.galleryUrl;
    if (url) await window.galleryApi.openExternal(url);
  });
  els.copyExistingGalleryLink.addEventListener("click", async () => {
    const url = state.galleryDetails?.galleryUrl;
    if (!url) return;
    await window.galleryApi.copyText(url);
    els.statusText.textContent = "Link della galleria copiato negli appunti.";
  });
  els.addExistingChapter.addEventListener("click", () => {
    if (!state.galleryDetails) return alert("Seleziona prima una galleria.");
    state.galleryDetails.chapters.push({
      id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      titolo: "Nuovo capitolo",
      descrizione: "",
      ordine: state.galleryDetails.chapters.length,
      excludeFromSelection: false,
    });
    renderExistingChapters();
  });
  els.saveExistingChapters.addEventListener("click", async () => {
    try {
      if (!state.galleryDetails) throw new Error("Seleziona prima una galleria.");
      els.saveExistingChapters.disabled = true;
      state.galleryDetails = await window.galleryApi.updateGalleryChapters({
        galleryId: state.selectedGalleryId,
        chapters: state.galleryDetails.chapters,
      });
      renderSelectedGalleryCard();
      renderExistingChapters();
      renderPhotoOrganizer();
      els.statusText.textContent = "Capitoli salvati correttamente.";
    } catch (err) {
      alert(err.message || err);
    } finally {
      els.saveExistingChapters.disabled = false;
    }
  });
  els.loadGalleryPhotos.addEventListener("click", () => {
    loadSelectedGalleryPhotos().catch((err) => alert(err.message || err));
  });
  els.photoSearch.addEventListener("input", renderPhotoOrganizer);
  els.photoChapterFilter.addEventListener("change", renderPhotoOrganizer);
  els.selectVisiblePhotos.addEventListener("click", () => {
    for (const photo of getVisibleOrganizerPhotos()) state.selectedPhotoIds.add(photo.id);
    renderPhotoOrganizer();
  });
  els.clearPhotoSelection.addEventListener("click", () => {
    state.selectedPhotoIds.clear();
    renderPhotoOrganizer();
  });
  els.moveSelectedPhotos.addEventListener("click", async () => {
    try {
      if (!state.selectedPhotoIds.size) throw new Error("Seleziona almeno una fotografia.");
      const targetId = els.photoTargetChapter.value || null;
      const targetName = targetId
        ? state.galleryDetails.chapters.find((chapter) => chapter.id === targetId)?.titolo
        : "Foto non assegnate";
      if (!confirm(`Spostare ${state.selectedPhotoIds.size} foto in “${targetName}”?`)) return;
      els.moveSelectedPhotos.disabled = true;
      const result = await window.galleryApi.moveGalleryPhotos({
        galleryId: state.selectedGalleryId,
        photoIds: [...state.selectedPhotoIds],
        chapterId: targetId,
      });
      els.statusText.textContent = `${result.moved} foto spostate in ${targetName}.`;
      await loadSelectedGalleryPhotos();
    } catch (err) {
      alert(err.message || err);
    } finally {
      els.moveSelectedPhotos.disabled = false;
    }
  });

  els.existingSearchClientBtn.addEventListener("click", () => {
    searchExistingClients().catch((err) => alert(err.message || err));
  });
  els.existingClientSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchExistingClients().catch((err) => alert(err.message || err));
    }
  });
  els.existingClientResults.addEventListener("change", async () => {
    const client = getSelectedExistingClient();
    if (client) {
      els.existingClientName.value = `${client.nome || ""} ${client.cognome || ""}`.trim();
      els.existingClientEmail.value = client.email || "";
      els.existingClientPhone.value = client.phone || client.whatsapp || client.cellulare1 || "";
    }
    const jobs = await window.galleryApi.listJobsForClient({
      clienteId: client?.id || "",
      clientEmail: client?.email || "",
      clientName: client ? `${client.nome || ""} ${client.cognome || ""}`.trim() : "",
      limit: 150,
    });
    renderExistingJobs(jobs, "");
    els.existingJobFilterStatus.textContent = client
      ? `${jobs.length} job associati al cliente selezionato.`
      : "Elenco completo dei job.";
  });
  els.saveExistingAssociations.addEventListener("click", async () => {
    try {
      if (!state.selectedGalleryId) {
        throw new Error("Seleziona prima una galleria.");
      }
      const selectedClient = getSelectedExistingClient();
      const result = await window.galleryApi.updateGalleryAssociations({
        galleryId: state.selectedGalleryId,
        client: {
          clienteId: selectedClient?.id || "",
          clientName: els.existingClientName.value.trim(),
          clientEmail: els.existingClientEmail.value.trim(),
          clientPhone: els.existingClientPhone.value.trim(),
        },
        jobId: els.existingJobSelect.value || "",
      });
      Object.assign(state.selectedGallery, result);
      els.statusText.textContent = `Associazioni salvate per ${state.selectedGallery.name}.`;
      await loadGalleries(els.gallerySearch.value);
    } catch (err) {
      alert(err.message || err);
    }
  });

  els.searchClientBtn.addEventListener("click", searchClientsFromInput);
  els.analyzeNewFolders.addEventListener("click", () => {
    analyzeNewFolders().catch((err) => alert(err.message || err));
  });
  els.analyzeExistingFolders.addEventListener("click", () => {
    analyzeExistingFoldersForMapping().catch((err) => alert(err.message || err));
  });
  els.clientSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchClientsFromInput();
    }
  });

  els.clientResults.addEventListener("change", async () => {
    const selected = getSelectedClient();
    if (!selected) {
      await loadJobsForClient(null);
      return;
    }
    els.clientName.value = `${selected.nome || ""} ${selected.cognome || ""}`.trim();
    els.clientEmail.value = selected.email || "";
    els.clientPhone.value = selected.phone || selected.whatsapp || selected.cellulare1 || "";

    try {
      await loadJobsForClient(selected);
      if (state.jobs.length === 1) {
        els.jobSelect.value = state.jobs[0].id;
      }
    } catch (err) {
      appendError(`Caricamento job cliente: ${err.message || err}`);
    }
  });

  els.accessMode.addEventListener("change", updateAccessFieldsState);
  els.selectionEnabled.addEventListener("change", updateSelectionFieldsState);
  els.selectionUnlimited.addEventListener("change", updateSelectionFieldsState);

  els.uploadExisting.addEventListener("click", async () => {
    try {
      if (!state.selectedGalleryId) {
        throw new Error("Seleziona prima una galleria esistente.");
      }

      const selectedFolders = getFolderSelection(els.existingFolder);
      const hasFolder = selectedFolders.length > 0;
      const hasCoverDesktop = Boolean(els.existingCoverDesktop.value.trim());
      const hasCoverMobile = Boolean(els.existingCoverMobile.value.trim());
      if (!hasFolder && !hasCoverDesktop && !hasCoverMobile) {
        throw new Error("Seleziona una cartella foto oppure almeno una copertina.");
      }

      let skipDuplicates = els.skipDuplicates.checked;
      if (hasFolder) {
        const folderKey = selectedFolders.join("|").toLowerCase();
        if (state.existingChapterAnalysisKey !== folderKey) {
          await analyzeExistingFoldersForMapping();
        }
        const analysis = await window.galleryApi.analyzeExistingUpload({
          galleryId: state.selectedGalleryId,
          folder: selectedFolders[0] || "",
          folders: selectedFolders,
        });
        if ((analysis.duplicates || 0) > 0) {
          const choice = await openDuplicateModal(analysis);
          if (choice === "cancel") {
            return;
          }
          skipDuplicates = choice === "skip";
          els.skipDuplicates.checked = skipDuplicates;
        }
      }

      await startUpload({
        mode: "existing",
        galleryId: state.selectedGalleryId,
        folder: selectedFolders[0] || "",
        folders: selectedFolders,
        skipDuplicates,
        customCovers: {
          desktopPath: els.existingCoverDesktop.value.trim(),
          mobilePath: els.existingCoverMobile.value.trim(),
        },
        chapterSettings: state.existingChapterSettings.map((chapter, order) => ({
          sourceName: chapter.sourceName,
          title: String(chapter.title || chapter.sourceName || "").trim(),
          description: String(chapter.description || "").trim(),
          excludeFromSelection: chapter.excludeFromSelection === true,
          order,
        })),
      });
    } catch (err) {
      alert(err.message);
    }
  });

  els.uploadNew.addEventListener("click", async () => {
    try {
      const payload = await buildNewUploadPayload();
      await startUpload(payload);
    } catch (err) {
      alert(err.message);
    }
  });

  els.cancelUpload.addEventListener("click", async () => {
    if (!state.currentUploadId) {
      return;
    }

    await window.galleryApi.cancelUpload(state.currentUploadId);
    els.statusText.textContent = "Richiesta annullamento inviata...";
  });
}

window.galleryApi.onUploadProgress((evt) => {
  if (!state.currentUploadId || evt.uploadId !== state.currentUploadId) {
    return;
  }

  if (evt.type === "start") {
    const found = Number.isFinite(evt.foundPhotos) ? evt.foundPhotos : null;
    const duplicates = Number.isFinite(evt.duplicates) ? evt.duplicates : 0;
    const toUpload = Number.isFinite(evt.toUploadPhotos) ? evt.toUploadPhotos : null;
    els.statusText.textContent = `Upload in corso su ${evt.galleryName || "galleria"}`;
    if (found != null && toUpload != null) {
      els.phaseText.textContent = `Fase: trovate ${found} | duplicati ${duplicates} | da caricare ${toUpload}`;
    } else {
      els.phaseText.textContent = "Fase: inizializzazione";
    }
    updateProgress(evt.doneFiles || 0, evt.totalFiles || evt.total || 0, evt.progressPercent);
    els.etaText.textContent = `ETA: ${formatEta(evt.etaSeconds)}`;
    updateTimeline(evt.compressedDone || 0, evt.uploadedDone || 0, evt.queuedFiles || 0);
    return;
  }

  if (evt.type === "phase") {
    if (evt.phase === "compression_start") {
      els.phaseText.textContent = `Fase: compressione ${evt.currentFile || ""}`;
    } else if (evt.phase === "compression_done") {
      els.phaseText.textContent = `Fase: compressione completata ${evt.currentFile || ""}`;
    } else if (evt.phase === "upload_start") {
      els.phaseText.textContent = `Fase: upload ${evt.currentFile || ""}`;
    } else if (evt.phase === "upload_done") {
      els.phaseText.textContent = `Fase: upload completato ${evt.currentFile || ""}`;
    }

    updateProgress(evt.doneFiles || 0, evt.totalFiles || evt.total || 0, evt.progressPercent);
    els.etaText.textContent = `ETA: ${formatEta(evt.etaSeconds)}`;
    updateTimeline(evt.compressedDone || 0, evt.uploadedDone || 0, evt.queuedFiles || 0);
    return;
  }

  if (evt.type === "progress") {
    updateProgress(evt.doneFiles || evt.done || 0, evt.totalFiles || evt.total || 0, evt.progressPercent);
    els.statusText.textContent = `Caricamento: ${evt.currentFile || "file"}`;
    els.etaText.textContent = `ETA: ${formatEta(evt.etaSeconds)}`;
    updateTimeline(evt.compressedDone || 0, evt.uploadedDone || 0, evt.queuedFiles || 0);
    return;
  }

  if (evt.type === "error") {
    appendError(`${evt.file}: ${evt.error}`);
    updateProgress(evt.doneFiles || evt.done || 0, evt.totalFiles || evt.total || 0, evt.progressPercent);
    els.etaText.textContent = `ETA: ${formatEta(evt.etaSeconds)}`;
    updateTimeline(evt.compressedDone || 0, evt.uploadedDone || 0, evt.queuedFiles || 0);
  }
});

window.galleryApi.onUploadDone(async (evt) => {
  if (!state.currentUploadId || evt.uploadId !== state.currentUploadId) {
    return;
  }

  setUploadUIBusy(false);
  state.currentUploadId = null;

  if (evt.cancelled) {
    els.statusText.textContent = "Upload annullato.";
    els.phaseText.textContent = "Fase: annullata";
  } else if (evt.failed) {
    els.statusText.textContent = "Upload fallito.";
    els.phaseText.textContent = "Fase: errore";
  } else {
    els.statusText.textContent = "Upload completato.";
    els.phaseText.textContent = "Fase: completata";
    updateProgress(evt.uploaded || 0, evt.total || 0, 100);
  }
  els.etaText.textContent = "ETA: 0s";
  if (!evt.cancelled && !evt.failed) {
    updateTimeline(evt.total || 0, evt.uploaded || 0, 0);
  }

  showSummary(evt);
  await loadGalleries(els.gallerySearch.value);
});

async function boot() {
  setupGuidedFlows();
  attachListeners();
  switchTab("existing");
  setUploadUIBusy(false);
  els.phaseText.textContent = "Fase: inattiva";
  els.etaText.textContent = "ETA: --";
  updateTimeline(0, 0, 0);
  updateCoverPreview(els.existingCoverDesktop, els.existingCoverDesktopPreview);
  updateCoverPreview(els.existingCoverMobile, els.existingCoverMobilePreview);
  updateCoverPreview(els.newCoverDesktop, els.newCoverDesktopPreview);
  updateCoverPreview(els.newCoverMobile, els.newCoverMobilePreview);
  await loadThemesAndJobs();
  await loadGalleries();
  renderClients();
  updateSelectionFieldsState();
}

boot().catch((err) => {
  alert(`Errore inizializzazione: ${err.message}`);
});
