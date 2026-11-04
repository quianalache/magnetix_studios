"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createUsePuck } from "@puckeditor/core";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, ChevronDown, Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { OptionSelect } from "@/components/system/option-select";
import { useOptionalSubAccount } from "@/context/sub-account-context";
import { subscribeToPages } from "@/lib/firestore/pages-funnels";
import { ImageFieldEditor } from "@/components/pages-funnels/puck/image-field";
import { ActionFieldEditor, listSections } from "@/components/pages-funnels/puck/action-field";
import { AddBrandColorsLink, BrandColorPicker, ColorPickRow, Hint, useBrandColors } from "@/components/pages-funnels/puck/color-controls";
import {
  NAV_ALT_MAX,
  NAV_ARIA_LABEL_MAX,
  NAV_CTA_ACTION_TYPES,
  NAV_CTA_LABEL_MAX,
  NAV_CUSTOM_FALLBACK,
  NAV_LABEL_MAX,
  NAV_LINK_ACTION_TYPES,
  NAV_LOGO_HEIGHT_MAX,
  NAV_LOGO_HEIGHT_MIN,
  NAV_MAX_CHILDREN,
  NAV_MAX_ITEMS,
  NAV_PADDING_MAX,
  NAV_PADDING_MIN,
  clampNumber,
  navAction,
  newNavigationId,
  normalizeNavColor,
  normalizeNavigationCta,
  normalizeNavigationItems,
  normalizeNavigationLogo,
  normalizeNavigationMobile,
  normalizeNavigationStyle,
  type NavColorSetting,
  type NavigationCta,
  type NavigationItem,
  type NavigationLink,
  type NavigationLogo,
  type NavigationMobile,
  type NavigationStyle,
} from "@/lib/pages-funnels/navigation";
import type { PageAction } from "@/types/pages-funnels-puck";
import { cn } from "@/lib/utils";
import { getNavigationPreview, setNavigationPreview } from "@/components/pages-funnels/puck/navigation-preview";

const useTypedPuck = createUsePuck();

/**
 * Puck can remount a custom field while its value changes, so which menu
 * item is expanded lives at module scope (keyed by the Navigation block id)
 * and survives a remount instead of collapsing mid-edit.
 */
const expandedByBlock = new Map<string, string | null>();

function useExpanded(): [string | null, (id: string | null) => void] {
  const blockId = useTypedPuck((s) => (s.selectedItem?.props as { id?: string } | undefined)?.id) ?? "";
  const [expanded, setExpandedState] = useState<string | null>(() => expandedByBlock.get(blockId) ?? null);
  const setExpanded = (id: string | null) => {
    expandedByBlock.set(blockId, id);
    setExpandedState(id);
  };
  return [expanded, setExpanded];
}

function useSelectedBlockId(): string {
  return useTypedPuck((s) => (s.selectedItem?.props as { id?: string } | undefined)?.id) ?? "";
}

/** Stale-target detection for the rows: this workspace's pages and this page's Sections. */
function useTargetHealth() {
  const sub = useOptionalSubAccount();
  const data = useTypedPuck((s) => s.appState.data);
  const sectionIds = useMemo(() => new Set(listSections(data?.content ?? []).map((s) => s.id)), [data]);
  const [pageIds, setPageIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!sub?.subAccountId || !sub.agencyId) return;
    return subscribeToPages({ subAccountId: sub.subAccountId, agencyId: sub.agencyId }, (list) => setPageIds(new Set(list.map((p) => p.id))), () => setPageIds(null));
  }, [sub?.subAccountId, sub?.agencyId]);
  return (action: PageAction): string | null => {
    if (action.type === "page" && action.pageId && pageIds && !pageIds.has(action.pageId)) return "Page deleted";
    if (action.type === "scroll" && action.targetElementId && !sectionIds.has(action.targetElementId)) return "Section removed";
    if (action.type === "none") return "No link yet";
    return null;
  };
}

/** A titled settings group, matching the panel's other section headings. */
export function NavigationFieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5" data-nav-group={title}>
      <h3 className="text-foreground m-0 text-xs font-semibold tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  );
}

// ---------- Menu items ----------

export function NavigationItemsFieldEditor({ value, onChange }: { value: unknown; onChange: (items: NavigationItem[]) => void }) {
  const items = normalizeNavigationItems(value);
  const [expanded, setExpanded] = useExpanded();
  const blockId = useSelectedBlockId();
  // Expanding a dropdown's row previews it open on the canvas (builder only).
  const previewDropdown = items.find((i) => i.id === expanded && i.kind === "dropdown")?.id ?? null;
  useEffect(() => {
    setNavigationPreview(blockId, { dropdownId: previewDropdown });
  }, [blockId, previewDropdown]);
  useEffect(() => () => setNavigationPreview(blockId, { dropdownId: null }), [blockId]);
  const health = useTargetHealth();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const update = (id: string, next: NavigationItem) => onChange(items.map((item) => (item.id === id ? next : item)));
  const remove = (id: string) => onChange(items.filter((item) => item.id !== id));
  const duplicate = (item: NavigationItem) => {
    const copy: NavigationItem =
      item.kind === "link"
        ? { ...item, id: newNavigationId("item") }
        : { ...item, id: newNavigationId("item"), children: item.children.map((c) => ({ ...c, id: newNavigationId("sub") })) };
    const index = items.findIndex((i) => i.id === item.id);
    onChange([...items.slice(0, index + 1), copy, ...items.slice(index + 1)]);
  };
  const add = () => {
    const id = newNavigationId("item");
    onChange([...items, { id, kind: "link", label: "Menu item", action: { type: "none" } }]);
    setExpanded(id);
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from >= 0 && to >= 0) onChange(arrayMove(items, from, to));
  };
  const full = items.length >= NAV_MAX_ITEMS;

  return (
    <div data-nav-items-field="" className="space-y-2">
      <Label className="text-xs font-semibold">Menu items</Label>
      {items.length === 0 ? <Hint>No menu items yet.</Hint> : null}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="Menu items">
            {items.map((item, index) => (
              <SortableRow
                key={item.id}
                id={item.id}
                label={item.label}
                position={index + 1}
                badge={item.kind === "dropdown" ? String(item.children.length) : undefined}
                badgeLabel={item.kind === "dropdown" ? `Dropdown with ${item.children.length} sub-item${item.children.length === 1 ? "" : "s"}` : undefined}
                warning={item.kind === "link" ? health(item.action) : item.children.length === 0 ? "No sub-items yet" : item.children.some((c) => health(c.action)) ? "Check sub-items" : null}
                open={expanded === item.id}
                onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
                onDuplicate={full ? undefined : () => duplicate(item)}
                onRemove={() => remove(item.id)}
              >
                <ItemEditor item={item} onChange={(next) => update(item.id, next)} health={health} />
              </SortableRow>
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        onClick={add}
        disabled={full}
        data-nav-add-item=""
        className="border-border text-link hover:bg-muted flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="size-3.5" aria-hidden="true" /> Add menu item
      </button>
      {full ? <Hint>That&apos;s the maximum of {NAV_MAX_ITEMS} menu items.</Hint> : <Hint>Drag the handle (or focus it and use the arrow keys) to reorder.</Hint>}
    </div>
  );
}

function ItemEditor({ item, onChange, health }: { item: NavigationItem; onChange: (item: NavigationItem) => void; health: (a: PageAction) => string | null }) {
  const [expandedChild, setExpandedChild] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const setKind = (kind: "link" | "dropdown") => {
    if (kind === item.kind) return;
    if (kind === "dropdown") onChange({ id: item.id, kind: "dropdown", label: item.label, children: [] });
    else if (item.kind === "dropdown" && item.children.length === 0) onChange({ id: item.id, kind: "link", label: item.label, action: { type: "none" } });
  };
  return (
    <div className="space-y-3">
      <LabelInput value={item.label} onChange={(label) => onChange({ ...item, label })} max={NAV_LABEL_MAX} />
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Type</Label>
        <SegmentedControl
          value={item.kind}
          onChange={setKind}
          options={[
            { value: "link", label: "Link" },
            { value: "dropdown", label: "Dropdown" },
          ]}
        />
        {item.kind === "dropdown" && item.children.length > 0 ? <Hint>Remove its sub-items to turn it back into a link.</Hint> : null}
      </div>
      {item.kind === "link" ? (
        <ActionFieldEditor
          label="Destination"
          value={item.action}
          onChange={(action) => onChange({ ...item, action: navAction(action, NAV_LINK_ACTION_TYPES) })}
          allowedTypes={NAV_LINK_ACTION_TYPES}
          includeCurrentPage
        />
      ) : (
        <div className="space-y-2">
          <Hint>A dropdown opens its list of sub-items. The label itself doesn&apos;t link anywhere.</Hint>
          <Label className="text-xs font-semibold">Sub-items</Label>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={({ active, over }) => {
              if (!over || active.id === over.id) return;
              const from = item.children.findIndex((c) => c.id === active.id);
              const to = item.children.findIndex((c) => c.id === over.id);
              if (from >= 0 && to >= 0) onChange({ ...item, children: arrayMove(item.children, from, to) });
            }}
          >
            <SortableContext items={item.children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={`${item.label || "Dropdown"} sub-items`}>
                {item.children.map((child, index) => (
                  <SortableRow
                    key={child.id}
                    id={child.id}
                    label={child.label}
                    position={index + 1}
                    warning={health(child.action)}
                    open={expandedChild === child.id}
                    onToggle={() => setExpandedChild(expandedChild === child.id ? null : child.id)}
                    onDuplicate={item.children.length >= NAV_MAX_CHILDREN ? undefined : () => {
                      const copy = { ...child, id: newNavigationId("sub") };
                      onChange({ ...item, children: [...item.children.slice(0, index + 1), copy, ...item.children.slice(index + 1)] });
                    }}
                    onRemove={() => onChange({ ...item, children: item.children.filter((c) => c.id !== child.id) })}
                    nested
                  >
                    <ChildEditor child={child} onChange={(next) => onChange({ ...item, children: item.children.map((c) => (c.id === child.id ? next : c)) })} />
                  </SortableRow>
                ))}
              </ul>
            </SortableContext>
          </DndContext>
          <button
            type="button"
            disabled={item.children.length >= NAV_MAX_CHILDREN}
            data-nav-add-child=""
            onClick={() => {
              const id = newNavigationId("sub");
              onChange({ ...item, children: [...item.children, { id, label: "Sub-item", action: { type: "none" } }] });
              setExpandedChild(id);
            }}
            className="text-link hover:bg-muted inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="size-3.5" aria-hidden="true" /> Add sub-item
          </button>
        </div>
      )}
    </div>
  );
}

function ChildEditor({ child, onChange }: { child: NavigationLink; onChange: (child: NavigationLink) => void }) {
  return (
    <div className="space-y-3">
      <LabelInput value={child.label} onChange={(label) => onChange({ ...child, label })} max={NAV_LABEL_MAX} />
      <ActionFieldEditor
        label="Destination"
        value={child.action}
        onChange={(action) => onChange({ ...child, action: navAction(action, NAV_LINK_ACTION_TYPES) })}
        allowedTypes={NAV_LINK_ACTION_TYPES}
        includeCurrentPage
      />
    </div>
  );
}

function LabelInput({ value, onChange, max, label = "Label" }: { value: string; onChange: (v: string) => void; max: number; label?: string }) {
  const id = `nav-input-${useId().replace(/:/g, "")}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">{label}</Label>
      <Input id={id} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} className="text-caption h-8" />
    </div>
  );
}

function SortableRow({
  id,
  label,
  position,
  badge,
  badgeLabel,
  warning,
  open,
  onToggle,
  onDuplicate,
  onRemove,
  nested = false,
  children,
}: {
  id: string;
  label: string;
  position: number;
  badge?: string;
  badgeLabel?: string;
  warning?: string | null;
  open: boolean;
  onToggle: () => void;
  onDuplicate?: () => void;
  onRemove: () => void;
  nested?: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const name = label || (nested ? "Untitled sub-item" : "Untitled item");
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className={cn("border-border bg-card rounded-lg border", open && "border-border-strong")}
      data-nav-row={id}
    >
      <div className="flex items-center gap-1 py-1 pr-1 pl-0.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${name} (position ${position})`}
          className="text-muted-foreground hover:text-foreground flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md"
        >
          <GripVertical className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="text-body-sm flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 truncate rounded-md px-1 py-1 text-left"
        >
          <span className={cn("truncate", !label && "text-muted-foreground")}>{name}</span>
          {badge ? (
            <span className="text-caption text-muted-foreground border-border inline-flex shrink-0 items-center gap-0.5 rounded-full border px-1.5" title={badgeLabel}>
              <ChevronDown className="size-3" aria-hidden="true" />
              {badge}
              <span className="sr-only">{badgeLabel}</span>
            </span>
          ) : null}
          {warning ? (
            <span className="text-status-warning-fg shrink-0" title={warning} data-nav-row-warning={warning}>
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              <span className="sr-only">{warning}</span>
            </span>
          ) : null}
          <ChevronDown className={cn("text-muted-foreground ml-auto size-3.5 shrink-0 transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
        {onDuplicate ? (
          <button type="button" onClick={onDuplicate} aria-label={`Duplicate ${name}`} className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-7 shrink-0 items-center justify-center rounded-md">
            <Copy className="size-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <button type="button" onClick={onRemove} aria-label={`Delete ${name}`} className="text-muted-foreground hover:text-destructive hover:bg-muted flex size-7 shrink-0 items-center justify-center rounded-md">
          <Trash2 className="size-3.5" aria-hidden="true" />
        </button>
      </div>
      {open ? <div className="border-border-subtle border-t p-3">{children}</div> : null}
    </li>
  );
}

// ---------- Logo / brand ----------

export function NavigationLogoFieldEditor({ value, onChange }: { value: unknown; onChange: (logo: NavigationLogo) => void }) {
  const logo = normalizeNavigationLogo(value);
  return (
    <div className="space-y-3" data-nav-logo-field="">
      <ImageFieldEditor value={logo.src} onChange={(src) => onChange({ ...logo, src })} />
      {logo.src ? (
        <>
          <LabelInput label="Alt text" value={logo.alt} onChange={(alt) => onChange({ ...logo, alt })} max={NAV_ALT_MAX} />
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Logo height</Label>
            <div className="flex items-center gap-3">
              <input
                aria-label="Logo height"
                type="range"
                min={NAV_LOGO_HEIGHT_MIN}
                max={NAV_LOGO_HEIGHT_MAX}
                step={2}
                value={logo.height}
                onChange={(e) => onChange({ ...logo, height: clampNumber(Number(e.target.value), NAV_LOGO_HEIGHT_MIN, NAV_LOGO_HEIGHT_MAX, logo.height) })}
                className="accent-primary w-full"
              />
              <span className="text-muted-foreground w-12 text-right text-xs">{logo.height}px</span>
            </div>
          </div>
          <button type="button" onClick={() => onChange({ ...logo, src: "" })} className="text-destructive text-xs font-semibold hover:underline">
            Remove logo
          </button>
        </>
      ) : (
        <Hint>Without a logo, the menu still shows.</Hint>
      )}
    </div>
  );
}

// ---------- CTA ----------

export function NavigationCtaFieldEditor({ value, onChange }: { value: unknown; onChange: (cta: NavigationCta) => void }) {
  const cta = normalizeNavigationCta(value);
  return (
    <div className="space-y-3" data-nav-cta-field="">
      <label className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold">Show a button</span>
        <Switch aria-label="Show a button" checked={cta.enabled} onCheckedChange={(enabled) => onChange({ ...cta, enabled })} />
      </label>
      {cta.enabled ? (
        <>
          <LabelInput label="Button label" value={cta.label} onChange={(label) => onChange({ ...cta, label })} max={NAV_CTA_LABEL_MAX} />
          <ActionFieldEditor
            label="Destination"
            value={cta.action}
            onChange={(action) => onChange({ ...cta, action: navAction(action, NAV_CTA_ACTION_TYPES) })}
            allowedTypes={NAV_CTA_ACTION_TYPES}
            includeCurrentPage
          />
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Button style</Label>
            <SegmentedControl
              value={cta.variant}
              onChange={(variant) => onChange({ ...cta, variant })}
              options={[
                { value: "solid", label: "Solid" },
                { value: "outline", label: "Outline" },
              ]}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

// ---------- Mobile menu ----------

export function NavigationMobileFieldEditor({ value, onChange }: { value: unknown; onChange: (mobile: NavigationMobile) => void }) {
  const mobile = normalizeNavigationMobile(value);
  const blockId = useSelectedBlockId();
  const [previewOpen, setPreviewOpen] = useState(() => getNavigationPreview(blockId).mobileOpen);
  useEffect(() => () => setNavigationPreview(blockId, { mobileOpen: false }), [blockId]);
  return (
    <div className="space-y-1.5" data-nav-mobile-field="">
      <Label className="text-xs font-semibold">Use the menu button on</Label>
      <OptionSelect
        aria-label="Use the menu button on"
        value={mobile.collapseAt}
        onChange={(collapseAt) => onChange({ collapseAt: collapseAt ?? "mobile" })}
        options={[
          { value: "mobile", label: "Phones (below 768px)" },
          { value: "tablet", label: "Phones and tablets (below 1280px)" },
        ]}
        className="w-full"
      />
      <Hint>Wider screens show the full menu. Choose tablets too if your menu has many items.</Hint>
      <label className="flex items-center justify-between gap-3 pt-2">
        <span className="text-xs font-semibold">Show the open menu while editing</span>
        <Switch
          aria-label="Show the open menu while editing"
          checked={previewOpen}
          onCheckedChange={(open) => {
            setPreviewOpen(open);
            setNavigationPreview(blockId, { mobileOpen: open });
          }}
        />
      </label>
      <Hint>Editor only — switch the canvas to Mobile to see it. Visitors open it with the menu button.</Hint>
    </div>
  );
}

export function NavigationAriaLabelFieldEditor({ value, onChange }: { value: unknown; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <LabelInput label="Menu name (for screen readers)" value={typeof value === "string" ? value : "Main"} onChange={onChange} max={NAV_ARIA_LABEL_MAX} />
      <Hint>Give each menu on a page its own name, e.g. “Main” and “Footer”.</Hint>
    </div>
  );
}

// ---------- Layout & style ----------

export function NavigationStyleFieldEditor({ value, onChange }: { value: unknown; onChange: (style: NavigationStyle) => void }) {
  const style = normalizeNavigationStyle(value);
  const set = (patch: Partial<NavigationStyle>) => onChange({ ...style, ...patch });
  return (
    <div className="space-y-4" data-nav-style-field="">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Content width</Label>
        <OptionSelect
          aria-label="Content width"
          value={style.width}
          onChange={(width) => set({ width: width ?? "wide" })}
          options={[
            { value: "contained", label: "Contained (1024px)" },
            { value: "wide", label: "Wide (1280px)" },
            { value: "full", label: "Full width" },
          ]}
          className="w-full"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Menu position</Label>
        <SegmentedControl
          value={style.menuAlign}
          onChange={(menuAlign) => set({ menuAlign })}
          options={[
            { value: "left", label: "Left" },
            { value: "center", label: "Center" },
            { value: "right", label: "Right" },
          ]}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nav-padding-y" className="text-xs font-semibold">Top &amp; bottom padding (px)</Label>
        <Input
          id="nav-padding-y"
          type="number"
          min={NAV_PADDING_MIN}
          max={NAV_PADDING_MAX}
          value={style.paddingY}
          onChange={(e) => set({ paddingY: clampNumber(Number(e.target.value), NAV_PADDING_MIN, NAV_PADDING_MAX, style.paddingY) })}
          className="text-caption h-8"
        />
      </div>
      <label className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold">Bottom border</span>
        <Switch aria-label="Bottom border" checked={style.divider} onCheckedChange={(divider) => set({ divider })} />
      </label>
      <NavColorField label="Background" value={style.background} onChange={(background) => set({ background })} defaultLabel="Default (transparent)" />
      <NavColorField label="Link color" value={style.linkColor} onChange={(linkColor) => set({ linkColor })} defaultLabel="Default (page text)" />
      <NavColorField label="Button color" value={style.ctaColor} onChange={(ctaColor) => set({ ctaColor })} defaultLabel="Default (page button)" />
    </div>
  );
}

/** Default · Brand color · Custom — the existing Brand Colors controls; no other palette is offered. */
export function NavColorField({ label, value, onChange, defaultLabel }: { label: string; value: NavColorSetting; onChange: (v: NavColorSetting) => void; defaultLabel: string }) {
  const brand = useBrandColors();
  const setting = normalizeNavColor(value);
  const options = [
    { value: "default", label: defaultLabel },
    ...(brand.length > 0 || setting.source === "brand" ? [{ value: "brand", label: "Brand color" }] : []),
    { value: "custom", label: "Custom" },
  ] as { value: NavColorSetting["source"]; label: string }[];
  const picked = setting.source === "brand" ? (setting.brandColorId ? brand.find((c) => c.id === setting.brandColorId) : brand[0]) : undefined;
  const customHex = setting.custom ?? brand[0]?.hex ?? NAV_CUSTOM_FALLBACK;
  return (
    <div className="space-y-1.5" data-nav-color={label}>
      <Label className="text-xs font-semibold">{label}</Label>
      <OptionSelect
        aria-label={label}
        value={setting.source}
        onChange={(source) => {
          if (source === "brand") onChange({ source: "brand", ...(brand[0] ? { brandColorId: brand[0].id } : {}) });
          else if (source === "custom") onChange({ source: "custom", custom: customHex });
          else onChange({ source: "default" });
        }}
        options={options}
        className="w-full"
      />
      {setting.source === "brand" ? (
        <>
          <BrandColorPicker brand={brand} selectedId={picked?.id} onSelect={(id) => onChange({ source: "brand", brandColorId: id })} />
          {!picked ? <Hint tone="warning">This brand color is no longer available, so the default is used. Choose another color.</Hint> : null}
        </>
      ) : null}
      {setting.source === "custom" ? (
        <div className="mt-2">
          <ColorPickRow label="Custom" hex={customHex} onCommit={(hex) => onChange({ source: "custom", custom: hex })} brand={brand} />
        </div>
      ) : null}
      {setting.source !== "brand" && brand.length === 0 ? <AddBrandColorsLink /> : null}
    </div>
  );
}
