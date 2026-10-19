// Test-only require-hook: `swisseph-wasm` is ESM-only and can't load under
// the CommonJS script runner. Readings already treat its two consumers
// (Variables, Chiron) as best-effort, so a stub that fails on use lets
// emulator checks create real Readings without them.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "swisseph-wasm" || request.startsWith("swisseph-wasm/")) {
    return {
      default: function SwissEph() {
        throw new Error("swisseph-wasm is stubbed in emulator checks");
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
