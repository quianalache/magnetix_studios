"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { contactInitials } from "@/lib/contacts/names";
import { SearchField } from "@/components/system/search-field";
import type { Contact } from "@/types/contacts";

export function contactDisplayLabel(c: Contact): string {
  return c.name || c.email || c.phone || "(unnamed contact)";
}

function contactSecondary(c: Contact): string {
  if (c.name && c.email) return c.email;
  if (c.name && c.phone) return c.phone;
  return "";
}

/**
 * Existing-contact picker for the Energetic Decoder (Wave 2 follow-up,
 * 2026-10-15) — shared by the New Reading "who is this for?" step and the
 * legacy-reading "Link contact" repair, so both pick contacts the same way.
 * Search field + a contained, scrolling list of compact rows (initial, name,
 * email). Filtering is client-side over the contacts the caller passes in.
 */
export function DecoderContactPicker({
  contacts,
  onPick,
  busyId,
  selectedId,
  disabled,
  autoFocusSearch,
  label = "Existing contacts",
}: {
  contacts: Contact[];
  onPick: (contact: Contact) => void;
  /** Row currently being opened/linked — shows a spinner there. */
  busyId?: string | null;
  /** Row picked but not yet confirmed (e.g. Link contact) — check mark + tint. */
  selectedId?: string | null;
  disabled?: boolean;
  autoFocusSearch?: boolean;
  label?: string;
}) {
  const [search, setSearch] = useState("");
  const searchWrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocusSearch) searchWrap.current?.querySelector("input")?.focus();
  }, [autoFocusSearch]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const sorted = [...contacts].sort((a, b) =>
      contactDisplayLabel(a).localeCompare(contactDisplayLabel(b), undefined, { sensitivity: "base" }),
    );
    if (!term) return sorted;
    return sorted.filter((c) =>
      [c.name, c.email, c.phone].some((v) => (v ?? "").toLowerCase().includes(term)),
    );
  }, [contacts, search]);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-overline font-semibold tracking-[0.12em] text-ink-tertiary uppercase">{label}</span>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
        <span className="text-caption text-ink-tertiary tabular-nums">{filtered.length}</span>
      </div>
      <div ref={searchWrap}>
        <SearchField value={search} onChange={setSearch} placeholder="Search by name, email or phone…" aria-label="Search existing contacts" />
      </div>
      <div
        role="listbox"
        aria-label={label}
        className="max-h-[min(18rem,42dvh)] min-h-0 overflow-y-auto overscroll-contain rounded-control border border-border bg-card"
      >
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
            <Users className="size-5 text-ink-tertiary" aria-hidden="true" />
            <p className="text-caption text-muted-foreground">{contacts.length === 0 ? "No contacts yet." : "No contacts match."}</p>
          </div>
        ) : (
          filtered.map((c) => {
            const secondary = contactSecondary(c);
            const busy = busyId === c.id;
            const picked = selectedId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={busy || picked}
                disabled={disabled}
                onClick={() => onPick(c)}
                className={cn(
                  "flex w-full min-w-0 items-center gap-3 border-b border-border-subtle px-3 py-2 text-left transition-colors last:border-0",
                  "hover:bg-tint-violet focus-visible:bg-tint-violet focus-visible:outline-none disabled:opacity-60",
                  (busy || picked) && "bg-tint-violet",
                )}
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tag-violet-bg text-caption font-semibold text-tag-violet-fg"
                >
                  {contactInitials(c)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium text-foreground">{contactDisplayLabel(c)}</span>
                  {secondary ? <span className="block truncate text-caption text-muted-foreground">{secondary}</span> : null}
                </span>
                {busy ? (
                  <Loader2 className="size-4 shrink-0 animate-spin text-ink-tertiary" aria-hidden="true" />
                ) : picked ? (
                  <Check className="size-4 shrink-0 text-link" aria-hidden="true" />
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
