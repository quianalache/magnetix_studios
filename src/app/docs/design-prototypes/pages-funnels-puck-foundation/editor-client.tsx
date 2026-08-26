"use client";

import { useMemo, useState } from "react";
import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import type { Data } from "@puckeditor/core";
import { clientPuckConfig } from "@/components/pages-funnels/puck/client-config";
import { VIEWPORTS, IFRAME_CONFIG } from "@/lib/pages-funnels/puck/constants";
import { buildHeroSection } from "@/lib/pages-funnels/puck/presets/hero";
import type { PuckPageMetadata } from "@/types/pages-funnels-puck";

/**
 * PRODUCTION-FIDELITY HARNESS — master spec §18 ("prove that the production
 * config itself works before touching the live builder"). Uses the REAL
 * production `clientPuckConfig`/registry/constants, NOT the POC's isolated
 * copies under puck-poc/ — this is what actually exercises
 * src/lib/pages-funnels/puck/ and src/components/pages-funnels/puck/.
 *
 * Not linked from any production nav, no Firestore writes, no PageDoc —
 * same isolation convention the POC and every other docs/design-prototypes
 * route in this repo already follows. `<Puck>` still requires client-only
 * rendering (see page.tsx's next/dynamic ssr:false wrapper — this is a
 * hard Puck constraint, not something this harness works around).
 */

const INITIAL_DATA: Data = { content: [], root: { props: {} } };

export default function PagesFunnelsPuckFoundationEditor() {
  const [data, setData] = useState<Data>(INITIAL_DATA);

  // Context-dependent (subAccountId would come from the route in a real
  // dashboard-authenticated editor) — `useMemo`, not a fresh literal on
  // every render, for the exact reason IFRAME_CONFIG is a module-level
  // constant instead: master spec §3/§12, the Insert Undo Blocker fix.
  const metadata: PuckPageMetadata = useMemo(
    () => ({ subAccountId: "puck-foundation-harness" }),
    []
  );

  return (
    <div className="bg-background text-foreground flex h-dvh flex-col">
      <div className="border-border bg-muted flex items-center justify-between gap-4 border-b px-4 py-2">
        <div>
          <p className="text-sm font-semibold">
            Pages &amp; Funnels — Puck Production Foundation Harness
          </p>
          <p className="text-muted-foreground text-xs">
            src/app/docs/design-prototypes/pages-funnels-puck-foundation —
            exercises the REAL production config/registry, not the POC&apos;s.
            No Firestore writes, nothing linked from app nav.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <Puck
          config={clientPuckConfig}
          data={data}
          onChange={setData}
          viewports={VIEWPORTS}
          iframe={IFRAME_CONFIG}
          metadata={metadata}
          height="calc(100vh - 60px)"
          renderHeaderActions={({ dispatch }) => (
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: "setData",
                  recordHistory: true,
                  data: (prev) => ({
                    content: [buildHeroSection(), ...prev.content],
                  }),
                })
              }
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-4 py-1.5 text-sm font-semibold"
            >
              + Insert Hero Section
            </button>
          )}
        />
      </div>

      <details className="border-border bg-foreground text-background border-t">
        <summary className="cursor-pointer px-4 py-2 text-xs font-semibold tracking-wide uppercase opacity-70">
          Serialized Puck Data (JSON) — click to expand
        </summary>
        <pre className="max-h-64 overflow-auto px-4 pb-4 text-[11px] leading-relaxed">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}
