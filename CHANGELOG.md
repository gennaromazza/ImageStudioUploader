# Changelog

Tutte le modifiche rilevanti di Image Studio Uploader sono documentate qui.

## [3.1.0] - 2026-08-11

### Aggiunto

- Scheda immediata della galleria selezionata con link apribile e copiabile.
- Gestione dei capitoli esistenti: creazione, rinomina, descrizione, ordine ed
  eliminazione dei soli capitoli vuoti.
- Supporto al campo canonico `excludeFromSelection` usato da Memoriesospese.
- Organizer con miniature, ricerca, filtro, selezione multipla e spostamento
  atomico delle fotografie fra capitoli o nell'area non assegnata.
- Mappatura delle cartelle locali verso capitoli esistenti o nuovi prima
  dell'upload.
- Test automatici del contratto, dell'interfaccia, della sintassi e smoke test
  del renderer Electron.
- Content Security Policy per il renderer.
- Workflow GitHub per release Windows e pubblicazione del sito download.
- Aggiornamenti di sicurezza a Electron 43.3.0, Firebase Admin 14.2.0 e Sharp
  0.35.3; eliminate le advisory alte e critiche note.

### Modificato

- Interfaccia delle gallerie esistenti organizzata in passaggi progressivi.
- Lettura retrocompatibile dei campi capitolo italiani e inglesi.
- Lettura paginata fino a 5.000 fotografie per galleria.

### Corretto

- Icona personalizzata incorporata nell'EXE e mostrata nella barra Windows.
- Protezione dalla cancellazione di capitoli contenenti fotografie.
- Salvataggio atomico dello smistamento, fino a 400 fotografie per operazione.

## [3.0.0] - 2026-08-11

- Prima versione pubblicata del repository Image Studio Uploader.
