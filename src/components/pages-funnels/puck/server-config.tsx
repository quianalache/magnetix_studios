import { createPuckConfig } from "@/components/pages-funnels/puck/config";
import { FormElementServerRender } from "@/components/pages-funnels/puck/form-server";

/**
 * Production SERVER/PUBLIC Puck config (master spec §10) — the one to pass
 * to `<Render config={serverPuckConfig} .../>` in a Server Component (the
 * future public page route). No browser-only assumptions: the only
 * component that differs from `clientPuckConfig` is Form, which reads
 * pre-resolved data from `puck.metadata` instead of fetching (see
 * form-server.tsx). Deliberately has NO "use client" directive — safe to
 * import from a Server Component, matching how the POC's `render/page.tsx`
 * proved a hook-free config can serve both a client editor and a server
 * `<Render>` pass.
 */
export const serverPuckConfig = createPuckConfig(FormElementServerRender);
