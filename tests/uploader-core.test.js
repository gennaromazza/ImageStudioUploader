"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { analyzeUploadFolders, _test } = require("../core/uploader-core");

test("normalizza capitoli web storici e mantiene excludeFromSelection", () => {
  assert.deepEqual(_test.normalizeStoredChapter({
    id: "cerimonia",
    title: "Cerimonia",
    description: "In chiesa",
    position: 2,
    excludeFromSelection: true,
  }), {
    id: "cerimonia",
    titolo: "Cerimonia",
    descrizione: "In chiesa",
    ordine: 2,
    excludeFromSelection: true,
    coverPhotoId: null,
    coverPhotoUrl: null,
    coverPhotoPosition: null,
  });
});

test("unisce piu cartelle destinate allo stesso capitolo", () => {
  const merged = _test.mergeChaptersByName([
    { name: "Cerimonia", photos: ["a.jpg"], cover: null, ordine: 0 },
    { name: "cerimonia", photos: ["b.jpg"], cover: null, ordine: 1, excludeFromSelection: true },
  ]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].photos, ["a.jpg", "b.jpg"]);
  assert.equal(merged[0].excludeFromSelection, true);
});

test("analizza sottocartelle come capitoli senza caricare dati", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "image-studio-uploader-test-"));
  try {
    const chapter = path.join(root, "Preparativi");
    fs.mkdirSync(chapter);
    fs.writeFileSync(path.join(chapter, "foto.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    const result = analyzeUploadFolders({ folder: root });
    assert.equal(result.totalPhotos, 1);
    assert.equal(result.chapters.length, 1);
    assert.equal(result.chapters[0].sourceName, "Preparativi");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
