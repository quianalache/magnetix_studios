import { PublicForm } from "@/components/forms/public-form";
import type { PuckPageMetadata } from "@/types/pages-funnels-puck";

/**
 * SERVER/PUBLIC variant of the Form element (master spec §10/§11) — used
 * only by `serverPuckConfig` (config.tsx), i.e. the future `<Render>`-based
 * public page route. Pure, hook-free, no fetch: reads the already-resolved
 * `LeadForm` from `puck.metadata.resolvedForms`, which the calling server
 * route must populate via a direct Admin SDK read BEFORE calling
 * `<Render>` — same pattern `/p/[pageId]`'s `SectionTreeView` caller
 * already uses (Admin SDK, bypassing `/forms/{formId}`'s member-only rule
 * the same intentional way `/f/[formId]` does), not this file's job to
 * fetch. See `form-client.tsx` for why the editor/client variant is a
 * separate component instead of one shared implementation: that one fetches
 * on demand (a client component, interactive canvas); this one must not —
 * `<Render>` has no request lifecycle to fetch inside of, and section
 * §10 requires the server config to make "no browser-only assumptions."
 *
 * Renders the real, unmodified `PublicForm` — no duplicated field schema,
 * no duplicated submission logic (master spec §9/§11).
 */
export function FormElementServerRender({
  formId,
  formName,
  metadata,
}: {
  formId: string;
  formName: string;
  metadata?: PuckPageMetadata;
}) {
  if (!formId) {
    return (
      <div className="border-border bg-muted text-muted-foreground flex h-24 items-center justify-center rounded-2xl border border-dashed text-sm">
        No form selected
      </div>
    );
  }

  const resolved = metadata?.resolvedForms?.[formId];

  if (resolved === undefined) {
    // The calling route never resolved this formId at all — a real
    // integration gap (the route's `collectPuckFormIds` walk should have
    // found it), distinct from "resolved to null" (form legitimately
    // doesn't exist). Rendered as a visibly-different placeholder so the
    // two failure modes aren't silently confused with each other.
    return (
      <div className="flex h-24 items-center justify-center rounded-2xl border border-dashed border-amber-500/50 bg-amber-500/10 text-sm text-amber-700">
        Form &ldquo;{formName || formId}&rdquo; was not resolved by the server.
      </div>
    );
  }

  if (resolved === null) {
    return (
      <div className="border-destructive/50 bg-destructive/10 text-destructive flex h-24 items-center justify-center rounded-2xl border border-dashed text-sm">
        Form &ldquo;{formName || formId}&rdquo; not found.
      </div>
    );
  }

  return (
    <div className="border-border bg-card rounded-2xl border p-4 shadow-sm">
      <PublicForm form={resolved} />
    </div>
  );
}
