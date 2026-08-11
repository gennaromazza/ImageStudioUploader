# Piano di compatibilita con Memoriesospese

## Scopo

Questo documento definisce il lavoro necessario per migliorare Image Studio
Uploader mantenendo piena compatibilita con l'applicazione web che legge e
gestisce le gallerie pubblicate.

L'obiettivo non e riscrivere l'upload, che e gia operativo, ma aggiungere le
funzioni mancanti senza interrompere le gallerie esistenti.

## Fonte ufficiale

L'applicazione web di riferimento e:

- repository: <https://github.com/gennaromazza/memoriesospese>
- branch di riferimento: `main`
- commit analizzato: `d997f5f7537db7bd5a10decf2f4a11cbe06cfb66`
- data della verifica: 11 agosto 2026

Quando questo documento e il codice web risultano in disaccordo, prevalgono il
codice effettivamente pubblicato e il contratto Firebase verificato. Prima di
implementare o collaudare una funzione si deve aggiornare il riferimento a
`memoriesospese/main` e annotare il nuovo commit analizzato.

## Strategia dei repository

`memoriesospese` non viene copiato dentro `H:\sync_gallery` e non viene aggiunto
come sottocartella versionata o submodule. I due prodotti hanno cicli di vita e
dipendenze differenti; inserirne uno nell'altro aumenterebbe il rischio di:

- commit accidentali di file estranei all'uploader;
- dipendenze e build confuse;
- copie non aggiornate considerate per errore autorevoli;
- installer contenenti sorgenti dell'applicazione web.

Per le analisi si usa un clone temporaneo esterno al repository, oppure GitHub:

```powershell
git clone --depth 1 --branch main https://github.com/gennaromazza/memoriesospese.git "$env:TEMP\memoriesospese-reference"
```

Per aggiornare un clone gia esistente:

```powershell
git -C "$env:TEMP\memoriesospese-reference" pull --ff-only origin main
```

Il clone e solo un riferimento in lettura. Le modifiche dell'uploader restano
in `H:\sync_gallery`.

## Responsabilita dei componenti

### Memoriesospese

Definisce il comportamento osservabile online:

- accesso pubblico alle gallerie tramite codice;
- visualizzazione e ordinamento delle foto;
- capitoli e foto non assegnate;
- selezioni del cliente;
- struttura dei documenti Firestore letti dal sito;
- collegamenti fra gallerie, fotografie e interazioni.

### Image Studio Uploader

Deve produrre e aggiornare dati leggibili da Memoriesospese:

- creare gallerie e relativi segreti;
- caricare immagini e copertine;
- associare clienti e job;
- creare, ordinare e aggiornare capitoli;
- assegnare fotografie ai capitoli;
- configurare accesso e selezioni;
- esporre link e azioni per le gallerie esistenti.

## Stato rilevato

L'uploader dispone gia di:

- ricerca e selezione di gallerie esistenti;
- creazione di nuove gallerie;
- upload concorrente, compressione, avanzamento ed ETA;
- rilevamento dei duplicati per nome file;
- creazione di capitoli dalle sottocartelle;
- rinomina, descrizione e ordinamento dei capitoli prima dell'upload;
- gestione delle copertine desktop e mobile;
- associazione cliente e job;
- configurazione di accesso e selezione cliente;
- link nel riepilogo finale e condivisione WhatsApp.

Lacune principali:

- il link non e mostrato subito selezionando una galleria esistente;
- manca la gestione completa dei capitoli gia presenti;
- manca un organizer per spostare foto fra capitoli;
- non e esposta l'esclusione dei capitoli dalle selezioni;
- il modulo di upload presenta troppe sezioni contemporaneamente.

Nel commit web analizzato sono presenti `chapterId`, `chapterPosition` e il
servizio `assignPhotoToChapter`. Esiste anche codice storico per visualizzare
capitoli e foto non assegnate. Nel `main` analizzato non e stato individuato un
campo inequivocabile per escludere un intero capitolo dalla selezione. Nome e
semantica del campo devono essere verificati sui documenti Firebase reali o
nella versione web distribuita prima dell'implementazione.

## Contratto dati da congelare

Prima delle modifiche funzionali occorre documentare esempi anonimizzati di:

### `galleries/{galleryId}`

- `name`, `code`, `date`, `location`, `description`;
- `photoCount`, `active`;
- `chaptersEnabled`, `chapters`;
- impostazioni della selezione;
- riferimenti a cliente e job;
- copertine e URL video.

### `photos/{photoId}`

- `galleryId`, `name`, `url`;
- `chapterId` e valore usato per una foto non assegnata;
- `position` e `chapterPosition`;
- metadati necessari al sito e alle selezioni.

### Normalizzazione capitoli

| Concetto | Variante uploader | Variante web |
| --- | --- | --- |
| Titolo | `titolo` | `title` |
| Descrizione | `descrizione` | `description` |
| Ordinamento | `ordine` | `position` |
| Associazione foto | `chapterId` | `chapterId` |
| Posizione nel capitolo | da verificare | `chapterPosition` |

La lettura dovra tollerare i formati storici; la scrittura dovra usare un solo
formato canonico confermato dal sito pubblicato.

## Piano di implementazione

### Fase 1 - Audit Firebase e contratto condiviso

1. Leggere esempi reali e anonimizzati di gallerie con e senza capitoli.
2. Leggere foto assegnate e non assegnate.
3. Verificare una galleria con selezione attiva.
4. Identificare il campo reale di esclusione dalla selezione.
5. Definire funzioni di normalizzazione e tipi interni.
6. Aggiungere test con fixture prive di credenziali e dati personali.

Criterio di accettazione: lo stesso modello interno deve leggere senza perdita
una galleria vecchia, una recente e una priva di capitoli.

### Fase 2 - Scheda della galleria esistente

Alla selezione di una galleria mostrare:

- nome, codice, data, conteggio foto e capitoli;
- URL completo costruito dal codice pubblico;
- `Apri galleria` nel browser;
- `Copia link` negli appunti;
- `Condividi su WhatsApp`;
- messaggio chiaro se il codice pubblico e assente.

Criterio di accettazione: il link deve essere disponibile prima di scegliere
una cartella o avviare un upload e deve aprire la galleria corretta sul sito.

### Fase 3 - Gestione dei capitoli esistenti

Implementare API e interfaccia per:

- caricare i capitoli della galleria selezionata;
- creare un capitolo;
- modificare titolo e descrizione;
- cambiare ordine;
- visualizzare il numero di foto assegnate;
- eliminare soltanto capitoli vuoti, previa conferma;
- mantenere una sezione esplicita `Foto non assegnate`.

Le modifiche ai metadati devono essere indipendenti dall'upload di nuovi file.

Criterio di accettazione: dopo salvataggio e riavvio, ordine, testi e conteggi
devono coincidere con Firestore e con il sito.

### Fase 4 - Esclusione dalle selezioni

Esporre per ogni capitolo un controllo come `Includi nella selezione cliente`.
La rappresentazione Firebase dipendera dall'audit della Fase 1.

Comportamento richiesto:

- le foto escluse restano visibili nella galleria;
- non sono selezionabili dal cliente;
- non alterano il numero di fotografie richieste;
- l'assenza del campo mantiene il comportamento storico;
- la modifica e possibile anche dopo l'upload.

Criterio di accettazione: sito e uploader devono mostrare lo stesso stato e il
conteggio deve ignorare esattamente le foto escluse.

### Fase 5 - Organizer delle fotografie

Creare un pannello visuale con:

- miniature paginabili o virtualizzate;
- filtro per capitolo e area `Non assegnate`;
- ricerca per nome file;
- selezione singola, multipla e di tutte le foto filtrate;
- comando `Sposta nel capitolo...`;
- comando `Rimuovi dal capitolo`;
- aggiornamento di `chapterId` e `chapterPosition`;
- indicazione delle modifiche non salvate;
- rollback visuale in caso di errore Firebase.

La prima versione usera selezione multipla e menu di destinazione. Il drag and
drop potra essere aggiunto dopo aver verificato prestazioni e accessibilita con
gallerie numerose.

Criterio di accettazione: un gruppo di foto spostato deve apparire nel capitolo
corretto sul sito dopo il refresh.

### Fase 6 - Destinazione delle nuove fotografie

Per l'aggiunta a una galleria esistente consentire di scegliere:

- capitolo esistente;
- nuovo capitolo;
- associazione automatica per nome cartella;
- foto non assegnate.

Prima dell'upload mostrare un riepilogo `cartella -> capitolo -> numero foto`.
Il confronto dei nomi deve impedire duplicati come `Cerimonia` e `cerimonia`.

Criterio di accettazione: il riepilogo preventivo deve coincidere con il
risultato finale e nessuna foto deve finire nel capitolo sbagliato.

### Fase 7 - Riorganizzazione dell'interfaccia

#### Nuova galleria

1. Informazioni galleria.
2. Cartelle e fotografie.
3. Capitoli e destinazioni.
4. Copertine.
5. Cliente e job.
6. Accesso e sicurezza.
7. Selezione cliente e video.
8. Riepilogo e avvio upload.

#### Galleria esistente

1. Ricerca e selezione.
2. Link e azioni rapide.
3. Cliente e job.
4. Capitoli esistenti.
5. Smistamento fotografie.
6. Nuove fotografie.
7. Copertine.
8. Riepilogo e upload.

Le sezioni secondarie saranno richiudibili. Galleria selezionata, sorgente,
riepilogo e stato upload resteranno sempre visibili.

Criterio di accettazione: deve essere sempre chiaro quale galleria viene
modificata, cosa verra salvato e cosa verra caricato.

### Fase 8 - Affidabilita

- usare scritture batch per le operazioni correlate;
- impedire doppi salvataggi e comandi concorrenti;
- confermare le operazioni distruttive;
- non eliminare fotografie durante lo smistamento;
- segnalare modifiche non salvate;
- registrare errori senza credenziali o dati sensibili;
- non bloccare un upload valido per un errore secondario dell'interfaccia.

### Fase 9 - Collaudo e build

1. Test di normalizzazione e costruzione URL.
2. Test con fixture di gallerie vecchie e nuove.
3. Test di assegnazione singola e multipla.
4. Test dei capitoli esclusi dalla selezione.
5. Test di upload in capitolo nuovo, esistente e non assegnato.
6. Regressione cliente, job, copertine, duplicati e WhatsApp.
7. Prova end-to-end su una galleria non critica.
8. Build installer Windows.
9. Verifica EXE, icona della barra applicazioni e installazione pulita.

## Ordine consigliato delle consegne

1. Contratto dati e test.
2. Link e scheda galleria esistente.
3. Riorganizzazione strutturale dell'interfaccia.
4. Gestione dei metadati dei capitoli.
5. Esclusione dalle selezioni.
6. Organizer e smistamento foto.
7. Destinazione delle nuove foto.
8. Test end-to-end, documentazione e build.

Ogni fase dovra preservare il flusso di upload esistente e potra essere
collaudata prima di procedere alla successiva.

## Decisioni ancora da confermare

- campo Firebase canonico per escludere un capitolo dalle selezioni;
- possibilita di modificare anche il sito se il campo non e supportato dal
  frontend pubblicato;
- regola per le foto non assegnate in presenza di capitoli esclusi;
- necessita del riordinamento manuale delle singole foto;
- dimensione massima prevista delle gallerie, per scegliere paginazione o
  virtualizzazione delle miniature.

## Stato di attuazione

Release `3.1.0`:

- contratto Firebase verificato: `excludeFromSelection` e il campo canonico;
- link e azioni rapide implementati;
- gestione capitoli esistenti implementata;
- organizer e smistamento atomico implementati;
- destinazione delle cartelle verso capitoli esistenti o nuovi implementata;
- interfaccia riorganizzata in passaggi progressivi;
- test automatici, smoke test renderer e CSP aggiunti;
- workflow release Windows e sito download aggiunti.

Il riferimento Memoriesospese resta il commit indicato nella sezione Fonte
ufficiale. Il contratto e stato inoltre confrontato in sola lettura con i
documenti Firebase reali l'11 agosto 2026, senza registrare dati personali nelle
fixture o nella documentazione.
