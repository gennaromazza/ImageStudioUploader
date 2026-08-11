"use strict";

const http = require("node:http");

function getPages() {
  return new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9227/json", (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => resolve(JSON.parse(body)));
    }).on("error", reject);
  });
}

async function main() {
  const page = (await getPages()).find((item) => item.type === "page");
  if (!page) throw new Error("Renderer Electron non trovato.");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let commandId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  const call = (method, params = {}) => new Promise((resolve) => {
    const id = ++commandId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });

  await call("Runtime.evaluate", { expression: "document.querySelector('#gallery-list tr')?.click()" });
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const response = await call("Runtime.evaluate", {
    expression: `JSON.stringify({
      cardVisible: !document.getElementById('selected-gallery-card').classList.contains('hidden'),
      name: document.getElementById('selected-gallery-name').textContent,
      url: document.getElementById('selected-gallery-url').textContent,
      chapterSummary: document.getElementById('existing-chapters-summary').textContent
    })`,
    returnByValue: true,
  });
  const result = JSON.parse(response.result.result.value);
  socket.close();
  if (!result.cardVisible || !result.name || !result.url.startsWith("https://")) {
    throw new Error(`Smoke test renderer fallito: ${JSON.stringify(result)}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
