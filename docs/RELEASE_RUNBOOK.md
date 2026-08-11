# Runbook release Image Studio Uploader

## Preparazione

1. Verificare che `main` sia allineato a `origin/main`.
2. Confermare il commit di Memoriesospese usato come riferimento.
3. Aggiornare versione e changelog.
4. Eseguire:

```powershell
npm ci
npm test
npm run test:syntax
npm run build:win
```

## Verifica locale

- Avviare `win-unpacked/Image Studio Uploader.exe`.
- Controllare icona EXE, barra applicazioni e collegamenti installer.
- Verificare firma/checksum anche quando non e configurato un certificato di
  code signing.
- Se lo stato e `NotSigned`, indicarlo nelle note di release: l'hook di build
  aggiorna icona e metadati versione ma non sostituisce una firma Authenticode.
- Confermare che credenziali Firebase reali non siano nell'installer.

## Pubblicazione

1. Committare su `main`.
2. Pushare `main`.
3. Creare e pushare `image-studio-uploader-vX.Y.Z`.
4. Monitorare `Windows Release` e `GitHub Pages`.
5. Verificare Release, installer, blockmap e `docs/stable.json` remoti.

## Rollback

Non sovrascrivere una release esistente. In caso di difetto:

1. lasciare invariati gli asset gia pubblicati;
2. correggere su un nuovo commit;
3. incrementare la patch version;
4. pubblicare una nuova release e aggiornare `stable.json`.
