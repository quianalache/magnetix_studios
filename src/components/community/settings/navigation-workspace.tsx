"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  GripVertical,
  Info,
  Loader2,
  MessageSquare,
  Pencil,
  Trophy,
  Users,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { communityHomeHref } from "@/lib/community/routes";
import {
  MANDATORY_NAV_KEYS,
  NAV_ITEM_META,
  normalizeNavigation,
} from "@/lib/community/community-navigation";
import { SettingsNav } from "@/components/community/settings/settings-nav";
import { RenameNavItemModal } from "@/components/community/settings/rename-nav-item-modal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { NavItem, NavItemKey } from "@/types/community";

const ROW_ICONS: Record<NavItemKey, ComponentType<{ className?: string }>> = {
  community: MessageSquare,
  classroom: BookOpen,
  events: Calendar,
  leaderboards: Trophy,
  members: Users,
  about: Info,
};

/** Verbatim from the approved mock-up's disabled-toggle tooltips (Part 5). */
const MANDATORY_TOOLTIP: Record<string, string> = {
  community: "Community is a core community tab and can't be disabled.",
  about: "About is required to provide essential community information and can't be disabled.",
};

/**
 * Community Settings → Navigation. Same page shell/save-discard shape as
 * Branding and General (local draft state, JSON-diff dirty check, Save/
 * Discard in the same header position, PATCH to the same settings
 * endpoint) — deliberately mirrored, not reinvented, per the "reuse
 * existing... unsaved-change infrastructure" instruction every Settings
 * tab in this codebase already follows.
 */
export function NavigationWorkspace({
  saId,
  pretty = false,
  groupId,
  groupSlug,
  navigation: initialNavigation,
  brand,
}: {
  saId: string;
  pretty?: boolean;
  groupId: string;
  groupSlug: string;
  navigation: NavItem[] | undefined;
  brand: string;
}) {
  const [saved, setSaved] = useState(() => normalizeNavigation(initialNavigation));
  const [draft, setDraft] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState<NavItem | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = draft.findIndex((i) => i.key === active.id);
    const newIndex = draft.findIndex((i) => i.key === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    setDraft(arrayMove(draft, oldIndex, newIndex).map((item, i) => ({ ...item, order: i })));
  }

  function toggleVisible(key: NavItemKey) {
    if (MANDATORY_NAV_KEYS.includes(key)) return; // defense in depth — the row itself is already disabled
    setDraft((d) => d.map((item) => (item.key === key ? { ...item, visible: !item.visible } : item)));
  }

  function rename(key: NavItemKey, label: string) {
    setDraft((d) => d.map((item) => (item.key === key ? { ...item, label } : item)));
  }

  function discard() {
    setDraft(saved);
    toast.success("Reverted to the last saved values.");
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ navigation: draft }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        group?: { navigation?: NavItem[] };
        error?: string;
      };
      if (!res.ok || !data.ok || !data.group) {
        throw new Error(data.error ?? "Couldn't save changes");
      }
      const next = normalizeNavigation(data.group.navigation);
      setSaved(next);
      setDraft(next);
      toast.success("Navigation saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save changes");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#202124]">Community Settings</h1>
          <Link
            href={communityHomeHref({ saId, pretty }, groupSlug)}
            className="mt-1 flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Community
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={discard}
            disabled={!dirty || saving}
            className="rounded-md border border-[#E4E4E4] px-3 py-1.5 text-sm font-medium text-[#3a3a44] disabled:opacity-50"
          >
            Discard Changes
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: brand }}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <SettingsNav brand={brand} active="navigation" link={{ saId, pretty }} groupSlug={groupSlug} />

        <section className="rounded-xl border border-[#E4E4E4] bg-white p-5">
          <h2 className="text-base font-semibold text-[#202124]">Navigation</h2>
          <p className="mt-0.5 text-sm text-[#909090]">
            Control the tabs that appear in your community and customize how they are labeled.
          </p>

          <div className="mt-5 rounded-lg border border-[#E4E4E4] p-4">
            <h3 className="text-sm font-semibold text-[#202124]">Show / Hide Tabs</h3>
            <p className="mt-0.5 text-xs text-[#909090]">Control the tabs that appear in your community.</p>

            <TooltipProvider>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={draft.map((i) => i.key)} strategy={verticalListSortingStrategy}>
                  <div className="mt-4 space-y-2">
                    {draft.map((item) => (
                      <NavRow
                        key={item.key}
                        item={item}
                        onToggle={() => toggleVisible(item.key)}
                        onRename={() => setRenaming(item)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </TooltipProvider>
          </div>
        </section>
      </div>

      {renaming && (
        <RenameNavItemModal
          open
          onOpenChange={(open) => !open && setRenaming(null)}
          icon={ROW_ICONS[renaming.key]}
          currentLabel={renaming.label}
          onSave={(label) => rename(renaming.key, label)}
        />
      )}
    </div>
  );
}

function NavRow({
  item,
  onToggle,
  onRename,
}: {
  item: NavItem;
  onToggle: () => void;
  onRename: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  const Icon = ROW_ICONS[item.key];
  const meta = NAV_ITEM_META.find((m) => m.key === item.key);
  const mandatory = MANDATORY_NAV_KEYS.includes(item.key);
  const tooltipText = MANDATORY_TOOLTIP[item.key];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-2.5 rounded-lg border border-[#E4E4E4] bg-white p-3"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="mt-0.5 shrink-0 cursor-grab text-[#c4c4c4] hover:text-[#909090] active:cursor-grabbing"
        aria-label={`Reorder ${item.label}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="mt-0.5 shrink-0 rounded-md bg-[#F5F4F2] p-1.5 text-[#3a3a44]">
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#202124]">{item.label}</p>
        <p className="text-xs text-[#909090]">{meta?.description}</p>
      </div>

      <button
        type="button"
        onClick={onRename}
        title="Rename this tab"
        aria-label={`Rename ${item.label}`}
        className="shrink-0 rounded-md p-1.5 text-[#909090] hover:bg-[#F5F4F2] hover:text-[#202124]"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      {mandatory ? (
        <Tooltip>
          {/* Deliberately NOT the native `disabled` attribute -- a truly
              disabled button can't receive keyboard focus at all, which
              would make this tooltip's explanation unreachable without a
              mouse (Part 5's explicit "don't rely on hover only" /
              keyboard-focus requirement). `aria-disabled` + no click
              handler gets the same "can't be toggled" behavior while
              staying focusable and tooltip-triggerable. */}
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-disabled="true"
                aria-label={`${item.label} can't be disabled`}
                onClick={(e) => e.preventDefault()}
                className="relative inline-flex h-5 w-9 shrink-0 cursor-not-allowed items-center rounded-full bg-[#E4E4E4] opacity-60"
              />
            }
          >
            <span className="inline-block h-4 w-4 translate-x-4 rounded-full bg-white shadow" />
          </TooltipTrigger>
          <TooltipContent>{tooltipText}</TooltipContent>
        </Tooltip>
      ) : (
        <button
          type="button"
          role="switch"
          aria-checked={item.visible}
          aria-label={`${item.visible ? "Hide" : "Show"} ${item.label}`}
          onClick={onToggle}
          className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
          style={{ backgroundColor: item.visible ? "#7C3AED" : "#E4E4E4" }}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
              item.visible ? "translate-x-4" : "translate-x-0.5",
            )}
          />
        </button>
      )}
    </div>
  );
}
