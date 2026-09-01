import type { Data } from "@puckeditor/core";
import { newPuckNodeId } from "@/lib/pages-funnels/puck/ids";
import { DEFAULT_BACKGROUND } from "@/lib/pages-funnels/puck/background";
import { DEFAULT_STYLE_CONFIG } from "@/lib/pages-funnels/puck/style";

/**
 * System B — Auto Hierarchy / Auto Wrapping (master spec §24.1/§6, LAUNCH:
 * "Users should NOT need to understand Section → Row → Column before
 * adding ordinary content"). Pure, hook-free tree helpers — the actual
 * live-reactive watching/dispatching lives in `auto-hierarchy-watcher.tsx`
 * (a real React component, since it needs Puck's own `dispatch`); this
 * file only decides WHAT to build, never touches Puck's runtime.
 *
 * SCOPE (confirmed by reading this config's actual `allow` restrictions
 * before writing this file, not assumed): Column's `elements` slot and
 * Row's `columns` slot are ALREADY type-restricted via Puck's own
 * `allow` list (Column only accepts real leaf elements; Row only accepts
 * "Column") — Puck's drag/drop mechanism itself enforces this, so a bare
 * leaf element or a bare Row can never actually land inside the WRONG
 * slot via real drag-and-drop in the first place. The one zone with no
 * `allow` restriction at all (this repo never registers a `root:` config
 * key) is the ROOT zone (`Data.content`) — meaning the ONLY place a
 * structural mismatch can genuinely occur is a Section/Hero/Row/Column/
 * leaf-element landing directly in `content`. This module's fix is
 * therefore scoped to exactly that reachable case (master spec §12's
 * "existing Column"/"existing Row" cases already work correctly today
 * and needed no change) — not a speculative fix for slot-restriction
 * scenarios that can't currently happen.
 */

type PuckNode = Data["content"][number];

/** Everything that is NOT already a valid top-level container
 *  (Section/Hero already produce or ARE a full root-level structure —
 *  master spec §15: "Do NOT auto-wrap prebuilt sections like Hero inside
 *  another Section... Prebuilt section factories should remain
 *  root-level insertable structures"). */
const ROOT_LEVEL_CONTAINER_TYPES = new Set(["Section", "Hero"]);

function makeAutoColumn(elements: PuckNode[]) {
  return {
    type: "Column",
    props: {
      id: newPuckNodeId(),
      background: DEFAULT_BACKGROUND,
      style: DEFAULT_STYLE_CONFIG,
      width: "full",
      alignment: "left",
      elements,
    },
  };
}

function makeAutoRow(columns: ReturnType<typeof makeAutoColumn>[]) {
  return {
    type: "Row",
    props: {
      id: newPuckNodeId(),
      background: DEFAULT_BACKGROUND,
      style: DEFAULT_STYLE_CONFIG,
      gap: 24,
      verticalAlign: "top",
      columns,
    },
  };
}

function makeAutoSection(rows: ReturnType<typeof makeAutoRow>[]) {
  return {
    type: "Section",
    props: {
      id: newPuckNodeId(),
      background: DEFAULT_BACKGROUND,
      style: DEFAULT_STYLE_CONFIG,
      maxWidth: "contained",
      fullWidthBackground: true,
      paddingTop: 64,
      paddingBottom: 64,
      rows,
    },
  };
}

/**
 * Given one top-level `Data.content` node, returns the node it should
 * actually be (unchanged if it's already a valid root-level container,
 * wrapped with the minimal necessary scaffolding otherwise — master spec
 * §12's "do not create unnecessary wrapper nesting": a bare Row gets only
 * a Section; a bare Column gets a Section + Row; a bare leaf element gets
 * the full Section → Row → Column). The original node (same id/type/
 * props, untouched) is always reused verbatim as the innermost item —
 * never cloned/recreated — so selection/focus/undo history referring to
 * that id stays valid across the wrap.
 */
export function autoWrapRootNode(node: PuckNode): PuckNode {
  if (ROOT_LEVEL_CONTAINER_TYPES.has(node.type)) return node;
  if (node.type === "Row") {
    return makeAutoSection([node as never]) as PuckNode;
  }
  if (node.type === "Column") {
    return makeAutoSection([makeAutoRow([node as never]) as never]) as PuckNode;
  }
  // Everything else is a leaf element (Heading/Text/RichText/Button/
  // Image/Video/Divider/Spacer/Accordion/Form) — wrap in the full
  // Section → Row → Column scaffolding.
  return makeAutoSection([
    makeAutoRow([makeAutoColumn([node]) as never]) as never,
  ]) as PuckNode;
}

/**
 * Scans `content` (the root zone) for the FIRST node needing a wrap and
 * returns a corrected copy of the array, or `null` if every node is
 * already a valid root-level container (the common case — this returns
 * `null` almost always, so the caller can skip dispatching a no-op
 * update). Deliberately fixes only ONE node per call, not the whole array
 * in one pass — the caller re-invokes this after each correction (the
 * watcher's own reactive `useEffect`), which self-terminates naturally
 * once nothing is left to fix and keeps each individual correction small
 * and easy to reason about/debug.
 */
export function autoWrapNextRootNode(content: PuckNode[]): PuckNode[] | null {
  const index = content.findIndex(
    (node) => !ROOT_LEVEL_CONTAINER_TYPES.has(node.type)
  );
  if (index === -1) return null;
  const next = [...content];
  next[index] = autoWrapRootNode(content[index]);
  return next;
}
