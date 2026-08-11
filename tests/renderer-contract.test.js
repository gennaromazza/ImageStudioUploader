"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const projectRoot = path.join(__dirname, "..");

test("la UI espone link, gestione capitoli e organizer", () => {
  const html = fs.readFileSync(path.join(projectRoot, "electron", "renderer", "index.html"), "utf8");
  for (const id of [
    "selected-gallery-url",
    "existing-chapters-editor",
    "save-existing-chapters",
    "photo-organizer-grid",
    "move-selected-photos",
    "existing-upload-chapters",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test("IPC e preload espongono soltanto le operazioni previste", () => {
  const preload = fs.readFileSync(path.join(projectRoot, "electron", "preload.js"), "utf8");
  const main = fs.readFileSync(path.join(projectRoot, "electron", "main.js"), "utf8");
  for (const channel of ["gallery:details", "gallery:photos", "gallery:update-chapters", "gallery:move-photos"] ) {
    assert.match(main, new RegExp(channel.replace(":", "\\:")));
    assert.match(preload, new RegExp(channel.replace(":", "\\:")));
  }
});
