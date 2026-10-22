// Companion require-hook for scripts that run real route handlers / server
// code that reads or writes cookies via `next/headers` outside a Next.js
// request. Load it with NODE_OPTIONS --require (after _server-only-shim.cjs).
// `cookies()` is backed by one in-memory jar the script controls through
// `globalThis.__testCookieJar` (a Map of name -> value); `headers()` returns
// `globalThis.__testHeaders` when a script sets it (e.g. a staff x-user-uid).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module");
const jar = new Map();
globalThis.__testCookieJar = jar;
const store = {
  get: (name) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
  getAll: () => [...jar].map(([name, value]) => ({ name, value })),
  has: (name) => jar.has(name),
  set: (name, value) => {
    if (name && typeof name === "object") jar.set(name.name, name.value);
    else jar.set(name, value);
  },
  delete: (name) => jar.delete(name),
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "next/headers") {
    return { cookies: async () => store, headers: async () => globalThis.__testHeaders ?? new Headers() };
  }
  return originalLoad.call(this, request, parent, isMain);
};
