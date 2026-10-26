import type { Data, ComponentData } from "@puckeditor/core";

/**
 * Collects every unique, non-empty `formId` referenced by a `Form` element
 * anywhere in a Puck `Data` tree — a server route calls this BEFORE calling
 * `<Render>`, resolves each
 * id via the Admin SDK (mirroring `/p/[pageId]`'s pattern), and passes the
 * result as `PuckPageMetadata.resolvedForms` so `form-server.tsx` never has
 * to fetch (master spec §11).
 *
 * Deliberately a generic structural walk (any slot array holding
 * `ComponentData`-shaped items, at any prop key, any depth) rather than one
 * hardcoded to `Section.rows`/`Row.columns`/`Column.elements` — Puck's
 * `Data.content` and every nested slot share the exact same
 * `ComponentData[]` shape, so one walk covers all of them without needing
 * to know the production registry's specific component names. This also
 * means it keeps working unchanged if a future phase adds new container
 * components (e.g. a Popup wrapper) with their own slots.
 */
export function collectPuckFormIds(data: Data): string[] {
  const ids = new Set<string>();
  for (const node of data.content) walkForFormIds(node, ids);
  return [...ids];
}

function walkForFormIds(node: ComponentData, ids: Set<string>): void {
  const props = node.props as Record<string, unknown>;

  if (
    node.type === "Form" &&
    typeof props.formId === "string" &&
    props.formId
  ) {
    ids.add(props.formId);
  }

  for (const value of Object.values(props)) {
    if (isComponentDataArray(value)) {
      for (const child of value) walkForFormIds(child, ids);
    }
  }
}

function isComponentDataArray(value: unknown): value is ComponentData[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        item && typeof item === "object" && "type" in item && "props" in item
    )
  );
}

/**
 * Every Offer placed by a Featured Offer block (Reading Result Pages,
 * 2026-10-21) — resolved from the real Offers before render, client-safe so
 * the builder can refresh its preview when a block's Offer changes.
 */
export function collectPuckFeaturedOfferIds(data: Data | null | undefined): string[] {
  if (!data) return [];
  const ids = new Set<string>();
  const walk = (node: ComponentData) => {
    const props = node.props as Record<string, unknown>;
    if (node.type === "FeaturedOffer" && typeof props.offerId === "string" && props.offerId) ids.add(props.offerId);
    for (const value of Object.values(props)) {
      if (isComponentDataArray(value)) for (const child of value) walk(child);
    }
  };
  for (const node of data.content) walk(node);
  return [...ids];
}

/** Offer Summary ids are resolved through the same authoritative Offer service
 * as Reading Result Featured Offers. The page stores only this reference. */
export function collectPuckOfferSummaryIds(data: Data | null | undefined): string[] {
  if (!data) return [];
  const ids = new Set<string>();
  const walk = (node: ComponentData) => {
    const props = node.props as Record<string, unknown>;
    if (node.type === "OfferSummary" && typeof props.offerId === "string" && props.offerId) ids.add(props.offerId);
    for (const value of Object.values(props)) if (isComponentDataArray(value)) for (const child of value) walk(child);
  };
  for (const node of data.content) walk(node);
  return [...ids];
}

/**
 * Every unique Embed id placed by a Public Reading Tool block — the
 * published route resolves these (Admin SDK) into
 * `PuckPageMetadata.resolvedEmbeds` before `<Render>`, same pattern as Forms.
 */
export function collectPuckEmbedIds(data: Data): string[] {
  const ids = new Set<string>();
  const walk = (node: ComponentData) => {
    const props = node.props as Record<string, unknown>;
    if (node.type === "ReadingTool" && typeof props.embedId === "string" && props.embedId) ids.add(props.embedId);
    for (const value of Object.values(props)) {
      if (isComponentDataArray(value)) for (const child of value) walk(child);
    }
  };
  for (const node of data.content) walk(node);
  return [...ids];
}
