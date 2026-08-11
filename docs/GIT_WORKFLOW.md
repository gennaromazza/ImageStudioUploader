# Workflow Git e release

## Repository

- Uploader: <https://github.com/gennaromazza/ImageStudioUploader>
- Applicazione web di riferimento: <https://github.com/gennaromazza/memoriesospese>
- Branch stabile: `main`

## Modifiche ordinarie

1. Aggiornare `main` con `git pull --ff-only`.
2. Creare un branch `agent/<descrizione>`.
3. Eseguire test e build pertinenti.
4. Aprire una pull request verso `main`.
5. Unire soltanto con controlli verdi.

Un push diretto su `main` e consentito quando il proprietario lo richiede
esplicitamente e la working tree contiene soltanto le modifiche approvate.

## Versioni

Image Studio Uploader usa versionamento semantico. Versione, `package.json` e
`package-lock.json` devono coincidere. Il tag e namespaced:

```text
image-studio-uploader-vX.Y.Z
```

## Contratto di release

Una release dell'uploader deve costruire soltanto questo tool e includere:

- `Image Studio Uploader Setup X.Y.Z.exe`;
- `Image Studio Uploader Setup X.Y.Z.exe.blockmap`;
- aggiornamento di `docs/stable.json` oppure `docs/beta.json`;
- changelog, istruzioni e runbook aggiornati;
- checksum SHA-256 verificati;
- workflow Windows e GitHub Pages completati;
- URL del feed e degli asset verificati da remoto.

Il workflow Windows ricostruisce e conserva un artifact indipendente come
controllo riproducibile. Gli asset definitivi della GitHub Release sono quelli
costruiti e verificati localmente, i cui checksum sono registrati nel feed.

`latest.yml` non viene pubblicato: e riservato alla Suite.
