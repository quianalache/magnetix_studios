"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { GripVertical, Loader2, Palette, Plus, Trash2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { ColorInput } from "@/components/ui/color-input";
import { Input } from "@/components/ui/input";
import { SettingsSection } from "@/components/system/settings-section";
import { EmptyState } from "@/components/system/empty-state";
import { Tag, type TagColor } from "@/components/system/status-pill";
import { useSettingsForm } from "@/components/system/settings-workspace";
import {
  BRAND_COLOR_NAME_MAX,
  BRAND_HEX_EXAMPLE,
  BRAND_SWATCH_FALLBACK,
  BRAND_COLOR_ROLE_LABEL,
  BRAND_COLORS_MAX,
  brandColorRole,
  isLightOnWhite,
  newBrandColorId,
  normalizeHex,
  readBrandColors,
} from "@/lib/brand/brand-colors";
import { TENANT_ACCENT_PICKER_DEFAULT } from "@/lib/brand/tenant-brand";
import type { BrandColor, BrandColorRole } from "@/types/brand-kit";

/**
 * Settings → Workspace → Branding → Brand colors (Phase A). Up to six colors
 * saved once per workspace; order sets the role (1st Primary, 2nd Secondary,
 * the rest Accent). Not applied to any surface yet — later phases read them
 * through `getTenantBrandColors`.
 */

const ROLE_TAG: Record<BrandColorRole, TagColor> = { primary: "violet", secondary: "blue", accent: "gray" };

interface Draft {
  id: string;
  /** As typed — may be mid-edit and not yet a valid hex. */
  hex: string;
  name: string;
}

const toDraft = (c: BrandColor): Draft => ({ id: c.id, hex: c.hex, name: c.name ?? "" });
const fingerprint = (rows: Draft[]) =>
  JSON.stringify(rows.map((r) => [r.id, normalizeHex(r.hex) ?? r.hex.trim(), r.name.trim()]));

export function SubAccountBrandColorsSection() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [rows, setRows] = useState<Draft[]>([]);
  const [saved, setSaved] = useState<Draft[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);

  // Hydrate once from the workspace doc; later snapshots (our own save echo)
  // must not overwrite edits in progress.
  useEffect(() => {
    if (!hydrated && subAccount) {
      const initial = readBrandColors(subAccount.brandKit).map(toDraft);
      setRows(initial);
      setSaved(initial);
      setHydrated(true);
    }
  }, [hydrated, subAccount]);

  const invalidIndex = rows.findIndex((r) => !normalizeHex(r.hex));
  const dirty = hydrated && fingerprint(rows) !== fingerprint(saved);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);

  async function save(): Promise<boolean> {
    if (invalidIndex >= 0) {
      toast.error(`Color ${invalidIndex + 1} needs a hex value like ${BRAND_HEX_EXAMPLE}.`);
      return false;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/branding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandColors: rows.map((r) => ({ id: r.id, hex: normalizeHex(r.hex), name: r.name.trim() || undefined })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; brandColors?: BrandColor[] };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't save brand colors.");
      const next = (data.brandColors ?? []).map(toDraft);
      setRows(next);
      setSaved(next);
      toast.success("Brand colors saved.");
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save brand colors.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const managed = useSettingsForm("brand-colors", {
    label: "Brand colors",
    dirty: isAdmin && dirty,
    save,
    discard: () => setRows(saved),
  });

  if (!isAdmin) return null;

  const update = (id: string, patch: Partial<Draft>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));
  const add = () =>
    setRows((prev) =>
      prev.length >= BRAND_COLORS_MAX ? prev : [...prev, { id: newBrandColorId(), hex: TENANT_ACCENT_PICKER_DEFAULT, name: "" }],
    );
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const from = prev.findIndex((r) => r.id === active.id);
      const to = prev.findIndex((r) => r.id === over.id);
      return from < 0 || to < 0 ? prev : arrayMove(prev, from, to);
    });
  }

  const full = rows.length >= BRAND_COLORS_MAX;

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void save();
      }}
      noValidate
    >
      <SettingsSection
        title="Brand colors"
        description="Up to 6. Drag to reorder: the first color is your Primary, the second your Secondary."
        action={rows.length > 0 ? <Tag color="gray">{`${rows.length} of ${BRAND_COLORS_MAX}`}</Tag> : null}
        footer={
          managed ? undefined : (
            <Button type="submit" disabled={saving || !dirty}>
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                "Save brand colors"
              )}
            </Button>
          )
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            compact
            icon={Palette}
            title="No brand colors yet"
            description="Save your brand colors once so you can reuse them across pages and other Magnetix tools."
            action={
              <Button type="button" variant="secondary" onClick={add} disabled={!hydrated}>
                <Plus className="size-4" aria-hidden="true" />
                Add color
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                <ul className="m-0 flex list-none flex-col p-0" aria-label="Brand colors">
                  {rows.map((row, index) => (
                    <BrandColorRow
                      key={row.id}
                      row={row}
                      index={index}
                      disabled={saving}
                      onChange={(patch) => update(row.id, patch)}
                      onRemove={() => remove(row.id)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" onClick={add} disabled={full || saving}>
                <Plus className="size-4" aria-hidden="true" />
                Add color
              </Button>
              {full ? <span className="text-caption text-muted-foreground">That&apos;s the maximum of 6.</span> : null}
            </div>
          </div>
        )}
        <p className="text-caption text-muted-foreground">
          Brand colors are saved for this workspace. They don&apos;t change any existing page, booking, form, portal or
          community colors.
        </p>
      </SettingsSection>
    </form>
  );
}

function BrandColorRow({
  row,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  row: Draft;
  index: number;
  disabled: boolean;
  onChange: (patch: Partial<Draft>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id, disabled });
  const role = brandColorRole(index);
  const valid = normalizeHex(row.hex);
  const label = row.name.trim() || `${BRAND_COLOR_ROLE_LABEL[role]} color`;
  const hexId = `brand-hex-${row.id}`;
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }}
      className="flex flex-col gap-1.5 border-b border-border-subtle py-3 last:border-b-0"
      data-brand-color={row.id}
    >
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          disabled={disabled}
          className="text-muted-foreground hover:text-foreground flex size-8 shrink-0 cursor-grab items-center justify-center rounded-lg touch-none disabled:cursor-not-allowed"
          aria-label={`Reorder ${label} (position ${index + 1})`}
        >
          <GripVertical className="size-4" aria-hidden="true" />
        </button>
        <ColorInput value={valid ?? BRAND_SWATCH_FALLBACK} onChange={(hex) => onChange({ hex })} className="shrink-0" />
        <Input
          value={row.name}
          onChange={(e) => onChange({ name: e.target.value.slice(0, BRAND_COLOR_NAME_MAX) })}
          placeholder="Name (optional)"
          aria-label={`Name for color ${index + 1}`}
          disabled={disabled}
          className="min-w-32 flex-1"
        />
        <Input
          id={hexId}
          value={row.hex}
          onChange={(e) => onChange({ hex: e.target.value })}
          onBlur={() => valid && onChange({ hex: valid })}
          aria-label={`Hex value for color ${index + 1}`}
          aria-invalid={!valid || undefined}
          aria-describedby={!valid ? `${hexId}-err` : undefined}
          disabled={disabled}
          className="w-28 font-mono text-caption uppercase"
        />
        <span className="w-20 shrink-0 text-center">
          <Tag color={ROLE_TAG[role]}>{BRAND_COLOR_ROLE_LABEL[role]}</Tag>
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${label}`}
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {!valid ? (
        <p id={`${hexId}-err`} className="text-caption text-destructive sm:pl-11">
          Enter a hex color like {BRAND_HEX_EXAMPLE}.
        </p>
      ) : isLightOnWhite(valid) ? (
        <p className="text-caption text-muted-foreground sm:pl-11">Light colors can be hard to see on white.</p>
      ) : null}
    </li>
  );
}
