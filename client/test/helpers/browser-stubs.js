// just enough of the browser for the ui modules to load in node. import this
// first in every test file: es module imports run in order, so the globals
// exist before i18n.js / api.js evaluate.

import { readFile } from "node:fs/promises";

// i18n.js fetches locales/<lang>.json relative to its own file:// url
globalThis.fetch = async (url) => {
  const href = String(url);
  if (!href.startsWith("file:")) throw new Error(`unexpected fetch in a unit test: ${href}`);
  try {
    const text = await readFile(new URL(href), "utf8");
    return { ok: true, json: async () => JSON.parse(text) };
  } catch {
    return { ok: false, json: async () => ({}) };
  }
};

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
}

for (const name of ["localStorage", "sessionStorage"]) {
  Object.defineProperty(globalThis, name, { value: memoryStorage(), configurable: true, writable: true });
}

globalThis.document = {
  documentElement: { lang: "", dir: "" },
  title: "",
  querySelectorAll: () => [],
};
globalThis.window = globalThis;
globalThis.location = { protocol: "http:", hostname: "localhost", hash: "" };
