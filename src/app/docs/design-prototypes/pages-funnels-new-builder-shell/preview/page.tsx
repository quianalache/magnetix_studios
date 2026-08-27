"use client";

import { useEffect, useState } from "react";
import { Render } from "@puckeditor/core";
import type { Data } from "@puckeditor/core";
import { AlertTriangle, Loader2 } from "lucide-react";
import { serverPuckConfig } from "@/components/pages-funnels/puck/server-config";
import { collectPuckFormIds } from "@/lib/pages-funnels/puck/resolve";
import { previewStorageKey } from "@/lib/pages-funnels/puck/preview-session";
import type { PuckPageMetadata } from "@/types/pages-funnels-puck";
import type { LeadForm } from "@/types/forms";

/**
 * QA-ONLY twin of the real `.../new-builder/preview` route (see that
 * file's own doc comment for the full mechanism this mirrors) — exists for
 * exactly the same reason the rest of this docs harness does: the real
 * route lives under an authenticated `(builder)/sa/[subAccountId]/...`
 * path this session has no real Firebase Auth session to reach. Hardcodes
 * the same fixture `pageId`/`subAccountId`
 * (`"qa-fixture-page"`/`"qa-fixture-subaccount"`) the sibling
 * `pages-funnels-new-builder-shell/page.tsx` harness already uses for its
 * `MagnetixPuckEditorShell`, so a Preview click there hands off to this
 * route under the exact same `sessionStorage` key the real flow would use.
 * No Firestore reads/writes, unlinked from any nav — same isolation
 * convention as every other file in this docs/design-prototypes tree.
 */
const FIXTURE_PAGE_ID = "qa-fixture-page";
const FIXTURE_SUB_ACCOUNT_ID = "qa-fixture-subaccount";

export default function NewBuilderShellPreviewQaPage() {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "missing" }
    | { status: "ready"; data: Data; metadata: PuckPageMetadata }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const raw = sessionStorage.getItem(previewStorageKey(FIXTURE_PAGE_ID));
      if (!raw) {
        setState({ status: "missing" });
        return;
      }

      let data: Data;
      try {
        data = JSON.parse(raw) as Data;
      } catch {
        setState({ status: "missing" });
        return;
      }

      const formIds = collectPuckFormIds(data);
      const resolvedForms: Record<string, LeadForm | null> = {};
      await Promise.all(
        formIds.map(async (formId) => {
          try {
            const res = await fetch(
              `/api/pages-funnels/puck/resolve-form?formId=${encodeURIComponent(formId)}`
            );
            resolvedForms[formId] = res.ok
              ? ((await res.json()) as LeadForm | null)
              : null;
          } catch {
            resolvedForms[formId] = null;
          }
        })
      );

      if (cancelled) return;
      setState({
        status: "ready",
        data,
        metadata: { subAccountId: FIXTURE_SUB_ACCOUNT_ID, resolvedForms },
      });
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center">
        <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (state.status === "missing") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle className="text-muted-foreground h-6 w-6" />
        <p className="text-foreground text-sm font-medium">
          No preview data found.
        </p>
        <p className="text-muted-foreground max-w-sm text-sm">
          Open Preview from the QA harness editor — this tab only shows whatever
          was on the canvas the moment you clicked it.
        </p>
        <a
          href="/docs/design-prototypes/pages-funnels-new-builder-shell"
          className="text-primary text-sm font-medium underline"
        >
          Go to the QA harness editor
        </a>
      </div>
    );
  }

  return (
    <Render
      config={serverPuckConfig}
      data={state.data}
      metadata={state.metadata}
    />
  );
}
