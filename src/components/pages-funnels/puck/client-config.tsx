"use client";

import { createPuckConfig } from "@/components/pages-funnels/puck/config";
import { FormElementClientRender } from "@/components/pages-funnels/puck/form-client";

/**
 * Production CLIENT/EDITOR Puck config (master spec §10) — the one to pass
 * to a controlled `<Puck config={clientPuckConfig} .../>`. Interactive,
 * `contentEditable`-capable, editor-safe. Module-level singleton (built
 * once, not per-render) — `Config` objects should generally be stable too,
 * matching the same referential-stability discipline `constants.ts` applies
 * to `iframe`/`metadata`/`viewports` (master spec §3/§12).
 */
export const clientPuckConfig = createPuckConfig(FormElementClientRender);
