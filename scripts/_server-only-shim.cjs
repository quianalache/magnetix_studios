// Companion require-hook for backfill-community-access-sources.ts (and any
// future admin script that needs to import real "server-only" application
// code outside the Next.js server build, which strips "server-only" via a
// webpack alias). Load it BEFORE tsx starts, via NODE_OPTIONS — patching
// Module._load from inside the script tsx is already executing doesn't
// intercept in time. See that script's own usage comment.
// This is a plain CJS module loaded via NODE_OPTIONS --require, not app
// code — it has to use require(), there's no ESM import equivalent here.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  return originalLoad.call(this, request, parent, isMain);
};
