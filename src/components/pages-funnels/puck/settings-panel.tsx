"use client";

import {
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createUsePuck } from "@puckeditor/core";
import { BLOCK_ICONS } from "@/components/pages-funnels/puck/block-icons";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const useTypedPuck = createUsePuck();

/**
 * Every component's shared System A styling field is named `style` or
 * `styleConfig` (see elements.tsx/config.tsx for why two names — Button
 * and Divider already had a legacy field literally named `style`); the
 * shared background field is always named `background`. This one set
 * covers every component in the registry uniformly, without needing to
 * special-case each component type — a field belongs under "Styles" if
 * (and only if) its name is one of these three, everywhere.
 */
const STYLE_FIELD_NAMES = new Set(["style", "styleConfig", "background"]);

/**
 * Persisted OUTSIDE React's fiber tree entirely (module scope), not in
 * component state.
 *
 * Live QA for this closeout task (master spec §24.5-6, unlinked
 * spacing/independent radius) surfaced a real bug: every genuine Puck data
 * edit inside the Styles tab (e.g. toggling "Linked sides" off) caused the
 * settings panel to silently jump back to the General tab, right as the
 * user's next input landed — so a value meant for the Styles tab's Margin
 * field was instead typed into General's legacy Padding field. Root cause:
 * Puck's Fields panel does not guarantee `MagnetixSettingsPanel`'s React
 * fiber survives every field-value change (consistent with the
 * already-documented "ghost duplicate" rendering quirks elsewhere in this
 * panel) — an uncontrolled `<Tabs defaultValue="general">` only seeds its
 * initial tab once per mount, so a remount forces it back to "general"
 * regardless of what the user had selected. Module-scope state survives a
 * remount (it lives outside the component instance being torn down), so
 * seeding local state from it on every mount reproduces the user's last
 * choice instead of resetting.
 */
let lastActiveSettingsTab = "general";

/**
 * Splits Puck's own rendered Fields `children` into General vs. Styles
 * buckets, purely via each field's React element `key` (a standard,
 * public `ReactElement` property — not a private Puck internal) matching
 * `STYLE_FIELD_NAMES`.
 *
 * WHY THIS IS SAFE TO DO (master spec §24 System A closeout task,
 * "investigate the actual supported customization surface before
 * treating [the literal 3-tab split] as a permanent limitation"):
 * confirmed by reading the installed `@puckeditor/core@0.23.0` bundle
 * directly (`dist/chunk-55V3NZVF.mjs`) — the Fields panel constructs
 * `overrides.fields`'s `children` prop as exactly
 * `fieldNames.map((fieldName) => <FieldsChildMemo fieldName={fieldName}
 * key={fieldName} />)`, i.e. a genuine flat JS array with ONE React
 * element per field, keyed by that field's own name (the same string
 * used as its object key in `config.tsx`'s `fields: {...}`). This
 * function only relies on the PUBLIC `overrides.fields` override point
 * (a first-class, documented Config option — not underscore-prefixed/
 * experimental) and the PUBLIC `ReactElement.key` property — it never
 * reaches into Puck's DOM, private state, or any undocumented API. The
 * ONE thing that isn't part of Puck's documented type contract (`children:
 * ReactNode`, opaque) is Puck's own internal CHOICE to structure that
 * `ReactNode` as a flat per-field array — that's an implementation
 * detail confirmed by reading this specific version's source, not a
 * guarantee. If a future Puck upgrade changes it, `Array.isArray(children)`
 * below will be `false` and this function returns `null`, which
 * `MagnetixSettingsPanel` treats as "fall back to the flat, untabbed
 * layout" — a graceful degrade, not a crash. Re-verify this file's own
 * doc comment against the installed bundle after any Puck version bump.
 */
function splitFieldsByGroup(
  children: ReactNode
): { general: ReactElement[]; styles: ReactElement[] } | null {
  if (!Array.isArray(children)) return null;

  const general: ReactElement[] = [];
  const styles: ReactElement[] = [];
  for (const child of children) {
    if (!isValidElement(child)) continue;
    const key = typeof child.key === "string" ? child.key : null;
    if (key && STYLE_FIELD_NAMES.has(key)) {
      styles.push(child);
    } else {
      general.push(child);
    }
  }
  return { general, styles };
}

/**
 * Magnetix wrapper around Puck's native Fields content — Phase 2B task §8
 * (header identifying what's selected) plus System A closeout's
 * General/Styles/Animations organization (master spec §24.2): the header
 * is unchanged; below it, Puck's own real field inputs (never modified,
 * never duplicated) are split into General and Styles tabs via
 * `splitFieldsByGroup` above, with a third Animations tab that's honestly
 * empty this task (System A explicitly excludes animation controls — see
 * §21 of the animations spec section). Uses the public `createUsePuck()`
 * hook (`selectedItem`) exactly as Phase 2B already did — see that
 * function's own doc history for why `createUsePuck()` over the bare
 * `usePuck()`.
 */
export function MagnetixSettingsPanel({ children }: { children: ReactNode }) {
  const selectedItem = useTypedPuck((s) => s.selectedItem);
  const type = selectedItem?.type;
  const Icon = type ? BLOCK_ICONS[type] : undefined;

  const groups = splitFieldsByGroup(children);

  // See `lastActiveSettingsTab`'s doc comment: seed from module state (not
  // a hardcoded "general") so a Puck-triggered remount of this component
  // reproduces the user's last tab choice instead of silently resetting it.
  const [activeTab, setActiveTab] = useState(lastActiveSettingsTab);

  return (
    <div className="flex h-full flex-col">
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        {Icon && (
          <span className="bg-primary/10 text-primary flex h-6 w-6 items-center justify-center rounded-md">
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
        <p className="text-foreground text-sm font-semibold">
          {type ?? "Page"} Settings
        </p>
      </div>

      {groups ? (
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            if (typeof value !== "string") return;
            lastActiveSettingsTab = value;
            setActiveTab(value);
          }}
          className="min-h-0 flex-1 gap-0"
        >
          <TabsList className="mx-4 mt-3 self-start">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="styles">Styles</TabsTrigger>
            <TabsTrigger value="animations">Animations</TabsTrigger>
          </TabsList>
          <TabsContent
            value="general"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {groups.general.length > 0 ? (
              groups.general
            ) : (
              <EmptyTabNote>No general fields for this element.</EmptyTabNote>
            )}
          </TabsContent>
          <TabsContent
            value="styles"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {groups.styles.length > 0 ? (
              groups.styles
            ) : (
              <EmptyTabNote>This element has no style controls.</EmptyTabNote>
            )}
          </TabsContent>
          <TabsContent
            value="animations"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <EmptyTabNote>
              No animation controls yet — Very Soon (master spec §24.19).
            </EmptyTabNote>
          </TabsContent>
        </Tabs>
      ) : (
        // Fallback: Puck's Fields `children` weren't the flat per-field
        // array this version's source confirmed — render everything
        // exactly as Phase 2B did, rather than a broken/empty tab set.
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      )}
    </div>
  );
}

function EmptyTabNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground px-4 py-6 text-center text-sm">
      {children}
    </p>
  );
}
