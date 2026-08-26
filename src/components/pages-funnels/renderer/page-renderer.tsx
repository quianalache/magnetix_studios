"use client";

import { useEffect, useState } from "react";
import { getForm } from "@/lib/firestore/forms";
import { BlockView } from "@/components/pages-funnels/renderer/block-view";
import type { PageBlock } from "@/types/pages-funnels";
import type { LeadForm } from "@/types/forms";

/**
 * Renders an ordered list of blocks as an actual page — shared by the editor
 * canvas, the isolated public preview route (`/p/[pageId]`), and eventually
 * template/AI previews. Deliberately takes just `blocks`, not a whole
 * `PageDoc`, so callers (like the editor, which edits an in-memory draft)
 * don't need a persisted document to render a preview.
 */
export function PageRenderer({ blocks }: { blocks: PageBlock[] }) {
  const [forms, setForms] = useState<Record<string, LeadForm | null>>({});

  const formIds = blocks
    .filter((b): b is Extract<PageBlock, { type: "form" }> => b.type === "form")
    .map((b) => b.content.formId)
    .filter((id): id is string => !!id);
  const formIdsKey = formIds.join(",");

  useEffect(() => {
    let cancelled = false;
    for (const id of formIds) {
      if (id in forms) continue;
      getForm(id).then((form) => {
        if (!cancelled) setForms((prev) => ({ ...prev, [id]: form }));
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formIdsKey]);

  if (blocks.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        This page has no blocks yet.
      </div>
    );
  }

  return (
    <div>
      {blocks.map((block) => (
        <BlockView
          key={block.id}
          block={block}
          resolvedForm={block.type === "form" && block.content.formId ? forms[block.content.formId] : undefined}
        />
      ))}
    </div>
  );
}
