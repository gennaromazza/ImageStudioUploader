"use strict";

const state = {
  selectedGalleryId: null,
  selectedRow: null,
  currentUploadId: null,
  activeTab: "existing",
  folderSelections: {
    existing: [],
    new: [],
  },
  clients: [],
  existingClients: [],
  selectedGallery: null,
  jobs: [],
  themes: [],
  chapterSettings: [],
  chapterAnalysisKey: "",
  galleryDetails: null,
  galleryPhotos: [],
  galleryPhotosLoaded: false,
  selectedPhotoIds: new Set(),
  existingChapterSettings: [],
  existingChapterAnalysisKey: "",
};

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif", ".heic", ".heif", ".avif"]);

const els = {
  tabButtons: document.querySelectorAll(".tab-button"),
  tabExisting: document.getElementById("tab-existing"),
  tabNew: document.getElementById("tab-new"),

  gallerySearch: document.getElementById("gallery-search"),
  refreshGalleries: document.getElementById("refresh-galleries"),
  galleryList: document.getElementById("gallery-list"),
  selectedGalleryCard: document.getElementById("selected-gallery-card"),
  selectedGalleryName: document.getElementById("selected-gallery-name"),
  selectedGalleryMeta: document.getElementById("selected-gallery-meta"),
  selectedGalleryUrl: document.getElementById("selected-gallery-url"),
  openExistingGallery: document.getElementById("open-existing-gallery"),
  copyExistingGalleryLink: document.getElementById("copy-existing-gallery-link"),
  shareExistingWhatsappTop: document.getElementById("share-existing-whatsapp-top"),
  existingChaptersSummary: document.getElementById("existing-chapters-summary"),
  existingChaptersEditor: document.getElementById("existing-chapters-editor"),
  addExistingChapter: document.getElementById("add-existing-chapter"),
  saveExistingChapters: document.getElementById("save-existing-chapters"),
  loadGalleryPhotos: document.getElementById("load-gallery-photos"),
  photoOrganizerSummary: document.getElementById("photo-organizer-summary"),
  photoSearch: document.getElementById("photo-search"),
  photoChapterFilter: document.getElementById("photo-chapter-filter"),
  selectVisiblePhotos: document.getElementById("select-visible-photos"),
  clearPhotoSelection: document.getElementById("clear-photo-selection"),
  photoTargetChapter: document.getElementById("photo-target-chapter"),
  moveSelectedPhotos: document.getElementById("move-selected-photos"),
  photoOrganizerGrid: document.getElementById("photo-organizer-grid"),

  existingFolder: document.getElementById("existing-folder"),
  analyzeExistingFolders: document.getElementById("analyze-existing-folders"),
  existingUploadChaptersSummary: document.getElementById("existing-upload-chapters-summary"),
  existingUploadChapters: document.getElementById("existing-upload-chapters"),
  pickExistingFolder: document.getElementById("pick-existing-folder"),
  existingCoverDesktop: document.getElementById("existing-cover-desktop"),
  existingCoverMobile: document.getElementById("existing-cover-mobile"),
  existingCoverDesktopPreview: document.getElementById("existing-cover-desktop-preview"),
  existingCoverMobilePreview: document.getElementById("existing-cover-mobile-preview"),
  pickExistingCoverDesktop: document.getElementById("pick-existing-cover-desktop"),
  pickExistingCoverMobile: document.getElementById("pick-existing-cover-mobile"),
  skipDuplicates: document.getElementById("skip-duplicates"),
  uploadExisting: document.getElementById("upload-existing"),
  shareExistingWhatsapp: document.getElementById("share-existing-whatsapp"),
  existingClientSearch: document.getElementById("existing-client-search"),
  existingSearchClientBtn: document.getElementById("existing-search-client-btn"),
  existingClientResults: document.getElementById("existing-client-results"),
  existingClientName: document.getElementById("existing-client-name"),
  existingClientEmail: document.getElementById("existing-client-email"),
  existingClientPhone: document.getElementById("existing-client-phone"),
  existingJobSelect: document.getElementById("existing-job-select"),
  existingJobFilterStatus: document.getElementById("existing-job-filter-status"),
  saveExistingAssociations: document.getElementById("save-existing-associations"),

  newName: document.getElementById("new-name"),
  newDate: document.getElementById("new-date"),
  newLocation: document.getElementById("new-location"),
  newDescription: document.getElementById("new-description"),
  newFolder: document.getElementById("new-folder"),
  pickNewFolder: document.getElementById("pick-new-folder"),
  newCoverDesktop: document.getElementById("new-cover-desktop"),
  newCoverMobile: document.getElementById("new-cover-mobile"),
  newCoverDesktopPreview: document.getElementById("new-cover-desktop-preview"),
  newCoverMobilePreview: document.getElementById("new-cover-mobile-preview"),
  pickNewCoverDesktop: document.getElementById("pick-new-cover-desktop"),
  pickNewCoverMobile: document.getElementById("pick-new-cover-mobile"),
  uploadNew: document.getElementById("upload-new"),
  analyzeNewFolders: document.getElementById("analyze-new-folders"),
  chaptersSummary: document.getElementById("chapters-summary"),
  chaptersEditor: document.getElementById("chapters-editor"),

  accessMode: document.getElementById("access-mode"),
  accessPassword: document.getElementById("access-password"),
  accessTheme: document.getElementById("access-theme"),
  accessPin: document.getElementById("access-pin"),

  clientSearch: document.getElementById("client-search"),
  searchClientBtn: document.getElementById("search-client-btn"),
  clientResults: document.getElementById("client-results"),
  clientName: document.getElementById("client-name"),
  clientEmail: document.getElementById("client-email"),
  clientPhone: document.getElementById("client-phone"),
  jobSelect: document.getElementById("job-select"),
  jobFilterStatus: document.getElementById("job-filter-status"),

  selectionEnabled: document.getElementById("selection-enabled"),
  selectionMode: document.getElementById("selection-mode"),
  selectionUnlimited: document.getElementById("selection-unlimited"),
  selectionCount: document.getElementById("selection-count"),
  selectionDeadline: document.getElementById("selection-deadline"),
  youtubeUrls: document.getElementById("youtube-urls"),

  cancelUpload: document.getElementById("cancel-upload"),
  statusText: document.getElementById("status-text"),
  phaseText: document.getElementById("phase-text"),
  progressBar: document.getElementById("progress-bar"),
  progressStats: document.getElementById("progress-stats"),
  etaText: document.getElementById("eta-text"),
  timelineCompressed: document.getElementById("timeline-compressed"),
  timelineUploaded: document.getElementById("timeline-uploaded"),
  timelineQueued: document.getElementById("timeline-queued"),
  errorList: document.getElementById("error-list"),
  summary: document.getElementById("summary"),
  duplicateModal: document.getElementById("duplicate-modal"),
  duplicateModalSummary: document.getElementById("duplicate-modal-summary"),
  duplicateModalGrid: document.getElementById("duplicate-modal-grid"),
  duplicateModalList: document.getElementById("duplicate-modal-list"),
  duplicateCancel: document.getElementById("duplicate-cancel"),
  duplicateUploadAll: document.getElementById("duplicate-upload-all"),
  duplicateSkip: document.getElementById("duplicate-skip"),
};

const guidedFlows = {};

function createWizardItem(label, value) {
  const item = document.createElement("div");
  item.className = "wizard-review-item";
  const key = document.createElement("span");
  key.textContent = label;
  const text = document.createElement("strong");
  text.textContent = value;
  item.append(key, text);
  return item;
}

function updateGuidedReview(mode) {
  const flow = guidedFlows[mode];
  if (!flow) return;
  const review = flow.review;
  review.replaceChildren();
  const title = document.createElement("h3");
  title.textContent = "Pronto per il caricamento";
  const intro = document.createElement("p");
  intro.className = "muted compact-text";
  intro.textContent = "Controlla questi dati essenziali prima di avviare l’upload.";
  const list = document.createElement("div");
  list.className = "wizard-review-list";

  if (mode === "existing") {
    const gallery = state.selectedGallery || {};
    const folders = getFolderSelection(els.existingFolder);
    list.append(
      createWizardItem("Galleria", gallery.name || "Da selezionare"),
      createWizardItem("Cartelle foto", folders.length ? folders.length + " selezionata/e" : "Da selezionare"),
      createWizardItem("Capitoli rilevati", String(state.existingChapterSettings.length || 0)),
      createWizardItem("Duplicati", els.skipDuplicates.checked ? "Saranno saltati" : "Saranno caricati")
    );
  } else {
    const folders = getFolderSelection(els.newFolder);
    list.append(
      createWizardItem("Nome galleria", els.newName.value.trim() || "Da compilare"),
      createWizardItem("Cartelle foto", folders.length ? folders.length + " selezionata/e" : "Da selezionare"),
      createWizardItem("Capitoli rilevati", String(state.chapterSettings.length || 0)),
      createWizardItem("Copertine", (els.newCoverDesktop.value || els.newCoverMobile.value) ? "Personalizzate" : "Automatiche")
    );
  }
  review.append(title, intro, list);
}

function showGuidedMessage(mode, message) {
  const flow = guidedFlows[mode];
  if (flow) flow.message.textContent = message || "";
}

function canAdvanceGuidedFlow(mode, step) {
  if (mode === "existing" && step === 0 && !state.selectedGalleryId) {
    showGuidedMessage(mode, "Prima scegli una galleria dall’elenco.");
    return false;
  }
  if (mode === "existing" && step === 1 && !getFolderSelection(els.existingFolder).length) {
    showGuidedMessage(mode, "Seleziona almeno una cartella di foto per continuare.");
    return false;
  }
  if (mode === "new" && step === 0 && !els.newName.value.trim()) {
    showGuidedMessage(mode, "Inserisci il nome della nuova galleria.");
    return false;
  }
  if (mode === "new" && step === 0 && !getFolderSelection(els.newFolder).length) {
    showGuidedMessage(mode, "Seleziona almeno una cartella di foto per continuare.");
    return false;
  }
  return true;
}

function renderGuidedFlow(mode, requestedStep) {
  const flow = guidedFlows[mode];
  if (!flow) return;
  if (Number.isInteger(requestedStep)) flow.current = Math.max(0, Math.min(requestedStep, flow.steps.length - 1));
  flow.steps.forEach((step, index) => {
    const active = index === flow.current;
    step.panel.hidden = !active;
    step.nav.classList.toggle("active", active);
    step.nav.classList.toggle("complete", index < flow.current);
    step.nav.disabled = index > flow.current;
    step.nav.setAttribute("aria-current", active ? "step" : "false");
  });
  showGuidedMessage(mode, "");
  if (flow.current === flow.steps.length - 1) updateGuidedReview(mode);
}

function setupGuidedFlow(tab, mode, steps) {
  if (!tab || guidedFlows[mode]) return;
  const flow = { mode, current: 0, steps: [], review: document.createElement("section"), message: null };
  const shell = document.createElement("div");
  shell.className = "guided-flow";
  const heading = document.createElement("div");
  heading.className = "guided-flow-heading";
  const title = document.createElement("h2");
  title.textContent = mode === "existing" ? "Aggiungi foto a una galleria" : "Crea una nuova galleria";
  const subtitle = document.createElement("p");
  subtitle.className = "muted";
  subtitle.textContent = "Segui un passaggio alla volta: le impostazioni meno frequenti restano disponibili, senza rallentarti.";
  heading.append(title, subtitle);
  const progress = document.createElement("nav");
  progress.className = "wizard-progress";
  progress.setAttribute("aria-label", "Avanzamento procedura");
  const message = document.createElement("p");
  message.className = "wizard-message";
  flow.message = message;
  const content = document.createElement("div");
  content.className = "wizard-content";
  shell.append(heading, progress, message, content);

  steps.forEach((definition, index) => {
    const nav = document.createElement("button");
    nav.type = "button";
    nav.className = "wizard-progress-item";
    nav.innerHTML = "<span>" + (index + 1) + "</span><strong>" + definition.title + "</strong>";
    nav.addEventListener("click", () => { if (index <= flow.current) renderGuidedFlow(mode, index); });
    progress.appendChild(nav);

    const panel = document.createElement("section");
    panel.className = "wizard-step";
    const panelHeading = document.createElement("div");
    panelHeading.className = "wizard-step-heading";
    panelHeading.innerHTML = "<p class=\"eyebrow\">PASSAGGIO " + (index + 1) + "</p><h2>" + definition.title + "</h2><p class=\"muted\">" + definition.description + "</p>";
    panel.appendChild(panelHeading);
    if (index === steps.length - 1) {
      flow.review.className = "wizard-review";
      panel.appendChild(flow.review);
    }
    definition.nodes.filter(Boolean).forEach((node) => panel.appendChild(node));
    const controls = document.createElement("div");
    controls.className = "wizard-controls";
    if (index > 0) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "btn secondary";
      back.textContent = "Indietro";
      back.addEventListener("click", () => renderGuidedFlow(mode, index - 1));
      controls.appendChild(back);
    }
    if (index < steps.length - 1) {
      const next = document.createElement("button");
      next.type = "button";
      next.className = "btn primary";
      next.textContent = "Continua";
      next.addEventListener("click", () => { if (canAdvanceGuidedFlow(mode, index)) renderGuidedFlow(mode, index + 1); });
      controls.appendChild(next);
    }
    panel.appendChild(controls);
    content.appendChild(panel);
    flow.steps.push({ panel, nav });
  });

  tab.replaceChildren(shell);
  guidedFlows[mode] = flow;
  renderGuidedFlow(mode, 0);
}

function setupGuidedFlows() {
  const existingWorkflow = els.existingChaptersEditor.closest(".workflow-section");
  const existingWorkflowSummary = existingWorkflow && existingWorkflow.querySelector("summary");
  if (existingWorkflowSummary) existingWorkflowSummary.innerHTML = "<strong>Gestisci le foto già presenti</strong><span>Facoltativo: capitoli e spostamenti di foto già caricate.</span>";
  if (existingWorkflow) existingWorkflow.removeAttribute("open");

  const existingFolderRow = els.existingFolder.closest(".row.split");
  const existingMapping = els.existingUploadChapters.closest(".subpanel");
  const existingCovers = els.existingCoverDesktop.closest(".subpanel");
  const existingAssociations = els.existingClientSearch.closest(".subpanel");
  const existingActions = els.uploadExisting.closest(".actions");
  setupGuidedFlow(els.tabExisting, "existing", [
    { title: "Scegli la galleria", description: "Cerca e seleziona la galleria che vuoi aggiornare.", nodes: [els.gallerySearch.closest(".toolbar"), els.galleryList.closest(".table-wrap"), els.selectedGalleryCard] },
    { title: "Scegli le foto", description: "Seleziona le cartelle da caricare. Le cartelle diventano capitoli in automatico.", nodes: [existingFolderRow, existingMapping] },
    { title: "Personalizza (facoltativo)", description: "Usa queste opzioni solo quando ti servono: non sono necessarie per caricare le foto.", nodes: [existingWorkflow, existingCovers, existingAssociations] },
    { title: "Controlla e carica", description: "Rivedi i dati essenziali e avvia l’upload.", nodes: [existingActions] },
  ]);

  const newForm = els.newName.closest(".form-grid");
  const newChapters = els.chaptersEditor.closest(".subpanel");
  const newActions = els.uploadNew.closest(".actions");
  const optionalNewNodes = Array.from(els.tabNew.children).filter((node) => node !== newForm && node !== newChapters && node !== newActions);
  setupGuidedFlow(els.tabNew, "new", [
    { title: "Dati e fotografie", description: "Inserisci il nome della galleria e scegli la cartella delle foto.", nodes: [newForm] },
    { title: "Capitoli", description: "Controlla i capitoli creati dalle sottocartelle. Puoi anche lasciarli così come sono.", nodes: [newChapters] },
    { title: "Impostazioni facoltative", description: "Copertine, cliente, accesso e selezione foto sono disponibili solo se ti servono.", nodes: optionalNewNodes },
    { title: "Controlla e crea", description: "Rivedi i dati essenziali e crea la galleria con le foto.", nodes: [newActions] },
  ]);
}

function switchTab(tabName) {
  state.activeTab = tabName;

  for (const btn of els.tabButtons) {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  }

  els.tabExisting.classList.toggle("active", tabName === "existing");
  els.tabNew.classList.toggle("active", tabName === "new");
  renderGuidedFlow(tabName);
}

function resetSummary() {
  els.summary.classList.add("hidden");
  els.summary.innerHTML = "";
}

function appendError(text) {
  const li = document.createElement("li");
  li.textContent = text;
  els.errorList.prepend(li);
}

function setUploadUIBusy(busy) {
  els.cancelUpload.disabled = !busy;
  els.uploadExisting.disabled = busy;
  els.uploadNew.disabled = busy;
  els.pickExistingFolder.disabled = busy;
  els.pickNewFolder.disabled = busy;
  els.pickExistingCoverDesktop.disabled = busy;
  els.pickExistingCoverMobile.disabled = busy;
  els.pickNewCoverDesktop.disabled = busy;
  els.pickNewCoverMobile.disabled = busy;
  els.refreshGalleries.disabled = busy;
  els.shareExistingWhatsapp.disabled = busy;
  els.saveExistingAssociations.disabled = busy;
  els.saveExistingChapters.disabled = busy;
  els.moveSelectedPhotos.disabled = busy;
}

function updateProgress(done, total, percentOverride = null) {
  const safeTotal = total || 0;
  const percent =
    percentOverride !== null && percentOverride !== undefined
      ? Math.max(0, Math.min(100, percentOverride))
      : safeTotal
        ? Math.round((done / safeTotal) * 100)
        : 0;
  els.progressBar.style.width = `${percent}%`;
  els.progressStats.textContent = `${done} / ${safeTotal} (${percent}%)`;
}

function formatEta(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return "--";
  }

  if (seconds <= 0) {
    return "0s";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const min = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${min}m ${sec}s`;
}

function updateTimeline(compressed, uploaded, queued) {
  els.timelineCompressed.textContent = String(Math.max(0, compressed || 0));
  els.timelineUploaded.textContent = String(Math.max(0, uploaded || 0));
  els.timelineQueued.textContent = String(Math.max(0, queued || 0));
}

function debounce(fn, waitMs) {
  let timeoutId = null;
  return (...args) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), waitMs);
  };
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderGalleries(galleries) {
  els.galleryList.innerHTML = "";

  if (!galleries.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="4">Nessuna galleria trovata.</td>';
    els.galleryList.appendChild(tr);
    return;
  }

  for (const gallery of galleries) {
    const tr = document.createElement("tr");
    tr.dataset.galleryId = gallery.id;
    tr.innerHTML = `
      <td>${escapeHtml(gallery.name)}</td>
      <td>${escapeHtml(gallery.date || "-")}</td>
      <td>${escapeHtml(gallery.code || "-")}</td>
      <td>${gallery.count || 0}</td>
    `;

    tr.addEventListener("click", async () => {
      if (state.selectedRow) {
        state.selectedRow.classList.remove("selected");
      }
      state.selectedRow = tr;
      state.selectedGalleryId = gallery.id;
      state.selectedGallery = gallery;
      tr.classList.add("selected");
      els.statusText.textContent = `Galleria selezionata: ${gallery.name}`;
      populateExistingAssociationEditor(gallery).catch((err) => {
        appendError(`Associazioni galleria: ${err.message || err}`);
      });
      try {
        await loadSelectedGalleryDetails();
      } catch (err) {
        appendError(`Dettagli galleria: ${err.message || err}`);
      }
    });

    els.galleryList.appendChild(tr);
  }
}

function renderSelectedGalleryCard() {
  const details = state.galleryDetails;
  if (!details) {
    els.selectedGalleryCard.classList.add("hidden");
    return;
  }
  els.selectedGalleryCard.classList.remove("hidden");
  els.selectedGalleryName.textContent = details.name || "Galleria senza nome";
  els.selectedGalleryMeta.textContent = `${details.photoCount || 0} foto · ${details.chapters.length} capitoli · codice ${details.code || "mancante"}`;
  els.selectedGalleryUrl.textContent = details.galleryUrl || "Link non disponibile: codice galleria mancante";
  els.selectedGalleryUrl.dataset.url = details.galleryUrl || "";
  els.openExistingGallery.disabled = !details.galleryUrl;
  els.copyExistingGalleryLink.disabled = !details.galleryUrl;
}

function renderExistingChapters() {
  const chapters = state.galleryDetails?.chapters || [];
  els.existingChaptersEditor.innerHTML = "";
  els.existingChaptersSummary.textContent = chapters.length
    ? `${chapters.length} capitoli. Il campo “Escludi dalla selezione” e compatibile con Memoriesospese.`
    : "Nessun capitolo: puoi crearne uno oppure lasciare le foto non assegnate.";

  chapters.forEach((chapter, index) => {
    const count = state.galleryPhotos.filter((photo) => photo.chapterId === chapter.id).length;
    const countLabel = state.galleryPhotosLoaded ? `${count} foto caricate` : "Conteggio disponibile dopo il caricamento miniature";
    const card = document.createElement("div");
    card.className = "chapter-card existing-chapter-card";
    card.innerHTML = `
      <div class="chapter-order">
        <button type="button" class="btn secondary chapter-up" ${index === 0 ? "disabled" : ""}>↑</button>
        <strong>${index + 1}</strong>
        <button type="button" class="btn secondary chapter-down" ${index === chapters.length - 1 ? "disabled" : ""}>↓</button>
      </div>
      <div class="chapter-fields">
        <label>Titolo<input class="chapter-title" type="text" value="${escapeHtml(chapter.titolo)}" /></label>
        <label>Descrizione<input class="chapter-description" type="text" value="${escapeHtml(chapter.descrizione || "")}" /></label>
        <label class="checkbox-row chapter-selection-toggle">
          <input class="chapter-exclude" type="checkbox" ${chapter.excludeFromSelection ? "checked" : ""} />
          <span>Escludi questo capitolo dalla selezione cliente</span>
        </label>
        <div class="chapter-meta">${countLabel}</div>
        <button type="button" class="btn danger chapter-delete" ${state.galleryPhotosLoaded ? "" : "disabled"}>Elimina capitolo vuoto</button>
      </div>`;
    card.querySelector(".chapter-title").addEventListener("input", (event) => { chapter.titolo = event.target.value; });
    card.querySelector(".chapter-description").addEventListener("input", (event) => { chapter.descrizione = event.target.value; });
    card.querySelector(".chapter-exclude").addEventListener("change", (event) => { chapter.excludeFromSelection = event.target.checked; });
    card.querySelector(".chapter-up").addEventListener("click", () => moveExistingChapter(index, -1));
    card.querySelector(".chapter-down").addEventListener("click", () => moveExistingChapter(index, 1));
    card.querySelector(".chapter-delete").addEventListener("click", () => {
      if (count > 0) {
        alert("Questo capitolo contiene foto. Spostale prima in un altro capitolo.");
        return;
      }
      if (confirm(`Eliminare il capitolo “${chapter.titolo}”?`)) {
        chapters.splice(index, 1);
        renderExistingChapters();
        renderOrganizerChapterOptions();
      }
    });
    els.existingChaptersEditor.appendChild(card);
  });
  renderOrganizerChapterOptions();
}

function moveExistingChapter(index, direction) {
  const chapters = state.galleryDetails?.chapters || [];
  const target = index + direction;
  if (target < 0 || target >= chapters.length) return;
  const [chapter] = chapters.splice(index, 1);
  chapters.splice(target, 0, chapter);
  renderExistingChapters();
}

function renderOrganizerChapterOptions() {
  const chapters = state.galleryDetails?.chapters || [];
  const filterValue = els.photoChapterFilter.value || "all";
  const targetValue = els.photoTargetChapter.value || "";
  els.photoChapterFilter.innerHTML = '<option value="all">Tutti i capitoli</option><option value="unassigned">Foto non assegnate</option>';
  els.photoTargetChapter.innerHTML = '<option value="">Foto non assegnate</option>';
  for (const chapter of chapters) {
    const filter = document.createElement("option");
    filter.value = chapter.id;
    filter.textContent = chapter.titolo;
    els.photoChapterFilter.appendChild(filter);
    const target = filter.cloneNode(true);
    els.photoTargetChapter.appendChild(target);
  }
  if ([...els.photoChapterFilter.options].some((item) => item.value === filterValue)) els.photoChapterFilter.value = filterValue;
  if ([...els.photoTargetChapter.options].some((item) => item.value === targetValue)) els.photoTargetChapter.value = targetValue;
}

function getVisibleOrganizerPhotos() {
  const query = els.photoSearch.value.trim().toLowerCase();
  const chapterFilter = els.photoChapterFilter.value;
  return state.galleryPhotos.filter((photo) => {
    if (query && !String(photo.name || "").toLowerCase().includes(query)) return false;
    if (chapterFilter === "unassigned" && photo.chapterId) return false;
    if (chapterFilter !== "all" && chapterFilter !== "unassigned" && photo.chapterId !== chapterFilter) return false;
    return true;
  });
}

function renderPhotoOrganizer() {
  const visible = getVisibleOrganizerPhotos();
  els.photoOrganizerGrid.innerHTML = "";
  els.photoOrganizerSummary.textContent = `${state.galleryPhotos.length} foto caricate · ${visible.length} visibili · ${state.selectedPhotoIds.size} selezionate`;
  for (const photo of visible) {
    const item = document.createElement("label");
    item.className = `organizer-photo${state.selectedPhotoIds.has(photo.id) ? " selected" : ""}`;
    item.innerHTML = `
      <input type="checkbox" ${state.selectedPhotoIds.has(photo.id) ? "checked" : ""} />
      <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.name || "Foto")}" loading="lazy" />
      <span title="${escapeHtml(photo.name || "")}">${escapeHtml(photo.name || "Senza nome")}</span>`;
    item.querySelector("input").addEventListener("change", (event) => {
      if (event.target.checked) state.selectedPhotoIds.add(photo.id);
      else state.selectedPhotoIds.delete(photo.id);
      renderPhotoOrganizer();
    });
    els.photoOrganizerGrid.appendChild(item);
  }
}

async function loadSelectedGalleryDetails() {
  if (!state.selectedGalleryId) return;
  state.galleryDetails = await window.galleryApi.getGalleryDetails(state.selectedGalleryId);
  state.galleryPhotos = [];
  state.galleryPhotosLoaded = false;
  state.selectedPhotoIds.clear();
  renderSelectedGalleryCard();
  renderExistingChapters();
  renderExistingUploadChapterMapping();
  renderPhotoOrganizer();
}

async function loadSelectedGalleryPhotos() {
  if (!state.selectedGalleryId) throw new Error("Seleziona prima una galleria.");
  els.photoOrganizerSummary.textContent = "Caricamento miniature in corso...";
  state.galleryPhotos = await window.galleryApi.listGalleryPhotos({ galleryId: state.selectedGalleryId, limit: 5000 });
  state.galleryPhotosLoaded = true;
  state.selectedPhotoIds.clear();
  renderExistingChapters();
  renderPhotoOrganizer();
}

function renderThemes() {
  els.accessTheme.innerHTML = "";
  if (!state.themes.length) {
    const op = document.createElement("option");
    op.value = "";
    op.textContent = "Nessun tema";
    els.accessTheme.appendChild(op);
    return;
  }

  for (const t of state.themes) {
    const op = document.createElement("option");
    op.value = t.id;
    op.textContent = t.label;
    els.accessTheme.appendChild(op);
  }
}

function renderJobs() {
  els.jobSelect.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "Nessun job";
  els.jobSelect.appendChild(empty);

  for (const j of state.jobs) {
    const op = document.createElement("option");
    op.value = j.id;
    op.textContent = j.date ? `${j.title} (${j.date})` : j.title;
    els.jobSelect.appendChild(op);
  }
}

function renderChapterEditor() {
  els.chaptersEditor.innerHTML = "";
  if (!state.chapterSettings.length) {
    return;
  }

  state.chapterSettings.forEach((chapter, index) => {
    const card = document.createElement("div");
    card.className = "chapter-card";
    card.innerHTML = `
      <div class="chapter-order">
        <button type="button" class="btn secondary chapter-up" ${index === 0 ? "disabled" : ""} aria-label="Sposta su">↑</button>
        <strong>${index + 1}</strong>
        <button type="button" class="btn secondary chapter-down" ${index === state.chapterSettings.length - 1 ? "disabled" : ""} aria-label="Sposta giu">↓</button>
      </div>
      <div class="chapter-fields">
        <label>Titolo
          <input class="chapter-title" type="text" value="${escapeHtml(chapter.title)}" />
        </label>
        <label>Descrizione
          <input class="chapter-description" type="text" value="${escapeHtml(chapter.description || "")}" placeholder="Descrizione facoltativa" />
        </label>
        <label class="checkbox-row chapter-selection-toggle">
          <input class="chapter-exclude" type="checkbox" ${chapter.excludeFromSelection ? "checked" : ""} />
          <span>Escludi dalla selezione cliente</span>
        </label>
        <div class="chapter-meta">Cartella: ${escapeHtml(chapter.sourceName)} · ${chapter.photoCount} foto${chapter.hasCover ? " · copertina trovata" : ""}</div>
      </div>
    `;

    card.querySelector(".chapter-title").addEventListener("input", (event) => {
      chapter.title = event.target.value;
    });
    card.querySelector(".chapter-description").addEventListener("input", (event) => {
      chapter.description = event.target.value;
    });
    card.querySelector(".chapter-exclude").addEventListener("change", (event) => {
      chapter.excludeFromSelection = event.target.checked;
    });
    card.querySelector(".chapter-up").addEventListener("click", () => moveChapter(index, -1));
    card.querySelector(".chapter-down").addEventListener("click", () => moveChapter(index, 1));
    els.chaptersEditor.appendChild(card);
  });
}

function moveChapter(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= state.chapterSettings.length) {
    return;
  }
  const [chapter] = state.chapterSettings.splice(index, 1);
  state.chapterSettings.splice(target, 0, chapter);
  renderChapterEditor();
}

async function analyzeNewFolders() {
  const selectedFolders = getFolderSelection(els.newFolder);
  if (!selectedFolders.length) {
    state.chapterSettings = [];
    state.chapterAnalysisKey = "";
    els.chaptersSummary.textContent = "Seleziona una o piu cartelle per vedere i capitoli.";
    renderChapterEditor();
    return;
  }

  els.chaptersSummary.textContent = "Analisi cartelle in corso...";
  const analysis = await window.galleryApi.analyzeUploadFolders({
    folder: selectedFolders[0] || "",
    folders: selectedFolders,
  });
  state.chapterSettings = Array.isArray(analysis.chapters) ? analysis.chapters : [];
  state.chapterAnalysisKey = selectedFolders.join("|").toLowerCase();
  const rootInfo = analysis.rootPhotoCount ? `, ${analysis.rootPhotoCount} foto senza capitolo` : "";
  els.chaptersSummary.textContent = `${analysis.totalPhotos || 0} foto totali, ${state.chapterSettings.length} capitoli${rootInfo}.`;
  renderChapterEditor();
}

function renderExistingUploadChapterMapping() {
  els.existingUploadChapters.innerHTML = "";
  const existing = state.galleryDetails?.chapters || [];
  state.existingChapterSettings.forEach((chapter, index) => {
    const card = document.createElement("div");
    card.className = "chapter-card upload-mapping-card";
    const options = existing
      .map((item) => `<option value="${escapeHtml(item.titolo)}">Capitolo esistente: ${escapeHtml(item.titolo)}</option>`)
      .join("");
    card.innerHTML = `
      <div class="chapter-order"><strong>${index + 1}</strong></div>
      <div class="chapter-fields">
        <label>Cartella<input type="text" value="${escapeHtml(chapter.sourceName)}" readonly /></label>
        <label>Destinazione
          <select class="chapter-destination">
            <option value="${escapeHtml(chapter.sourceName)}">Nuovo capitolo: ${escapeHtml(chapter.sourceName)}</option>
            ${options}
          </select>
        </label>
        <label>Descrizione<input class="chapter-description" type="text" value="${escapeHtml(chapter.description || "")}" /></label>
        <label class="checkbox-row chapter-selection-toggle">
          <input class="chapter-exclude" type="checkbox" ${chapter.excludeFromSelection ? "checked" : ""} />
          <span>Escludi dalla selezione cliente</span>
        </label>
        <div class="chapter-meta">${chapter.photoCount || 0} foto${chapter.hasCover ? " · copertina trovata" : ""}</div>
      </div>`;
    const select = card.querySelector(".chapter-destination");
    if ([...select.options].some((option) => option.value === chapter.title)) select.value = chapter.title;
    select.addEventListener("change", (event) => { chapter.title = event.target.value; });
    card.querySelector(".chapter-description").addEventListener("input", (event) => { chapter.description = event.target.value; });
    card.querySelector(".chapter-exclude").addEventListener("change", (event) => { chapter.excludeFromSelection = event.target.checked; });
    els.existingUploadChapters.appendChild(card);
  });
}

async function analyzeExistingFoldersForMapping() {
  const selectedFolders = getFolderSelection(els.existingFolder);
  if (!selectedFolders.length) {
    state.existingChapterSettings = [];
    state.existingChapterAnalysisKey = "";
    els.existingUploadChaptersSummary.textContent = "Seleziona le cartelle per decidere in quali capitoli caricarle.";
    renderExistingUploadChapterMapping();
    return;
  }
  const analysis = await window.galleryApi.analyzeUploadFolders({
    folder: selectedFolders[0] || "",
    folders: selectedFolders,
  });
  state.existingChapterSettings = (analysis.chapters || []).map((chapter) => ({ ...chapter }));
  state.existingChapterAnalysisKey = selectedFolders.join("|").toLowerCase();
  const rootInfo = analysis.rootPhotoCount ? ` · ${analysis.rootPhotoCount} foto non assegnate` : "";
  els.existingUploadChaptersSummary.textContent = `${analysis.totalPhotos || 0} foto · ${state.existingChapterSettings.length} cartelle/capitoli${rootInfo}`;
  renderExistingUploadChapterMapping();
}

async function loadJobsForClient(client) {
  if (!client) {
    state.jobs = await window.galleryApi.listJobs(150);
    els.jobFilterStatus.textContent = "Elenco completo dei job.";
  } else {
    const clientName = `${client.nome || ""} ${client.cognome || ""}`.trim();
    state.jobs = await window.galleryApi.listJobsForClient({
      clienteId: client.id,
      clientEmail: client.email || "",
      clientName,
      limit: 150,
    });
    els.jobFilterStatus.textContent = state.jobs.length
      ? `${state.jobs.length} job associati al cliente selezionato.`
      : "Nessun job associato al cliente selezionato.";
  }
  renderJobs();
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
