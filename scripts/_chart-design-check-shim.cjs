// Require-hook for scripts/check-chart-design-sets.ts only (load via
// NODE_OPTIONS --require, like _server-only-shim.cjs, which it chains).
// The consolidated Energetic Decoder dispatcher statically imports every
// handler, including the chart calculator, whose "swisseph-wasm" package
// has no CommonJS export and can't load under tsx. These checks never
// calculate a chart, so the package is stubbed — any real use throws.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("./_server-only-shim.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "swisseph-wasm") {
    return class SwissEphUnavailableInChecks {
      constructor() {
        throw new Error("swisseph-wasm is stubbed in check-chart-design-sets (no chart calculation expected)");
      }
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
