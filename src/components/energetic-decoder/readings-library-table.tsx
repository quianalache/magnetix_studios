"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsUpDown, ArrowDown, ArrowUp, Loader2, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ZODIAC_ELEMENT, ZODIAC_GLYPH, ZODIAC_GLYPH_FONT, type ZodiacElement } from "@/lib/energetics/mandala-spec";
import {
  libraryPageWindow,
  type ReadingsLibraryPage,
  type ReadingsLibraryRow,
  type ReadingsLibrarySort,
} from "@/lib/energetic-decoder/readings-library";

/**
 * Readings library table (2026-10-07, owner-approved mockup A) — one row
 * per person (Energetic Profile): Name · Energy Type · Profile · Sun Sign,
 * plus edit / delete / open. Presentational only: readings-tab.tsx owns the
 * fetching and the URL.
 *
 * Privacy is structural: `ReadingsLibraryRow` has no birth date/time/place,
 * time zone, coordinates or relationship label, so nothing here can render
 * them on any screen size.
 */

const ENERGY_TYPE_TONE: Record<string, string> = {
  Generator: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "Manifesting Generator": "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  Projector: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  Manifestor: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Reflector: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
};

const ELEMENT_TONE: Record<ZodiacElement, string> = {
  fire: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
  earth: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  air: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  water: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300",
};

const AVATAR_TONES = [
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
];

function avatarTone(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

/** Text-presentation glyph (U+FE0E) in a symbol font, so it never renders as an emoji tile. */
function SunSignCell({ sign }: { sign: ReadingsLibraryRow["sunSign"] }) {
  if (!sign) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2" data-sun-sign={sign}>
      <span
        aria-hidden
        className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm", ELEMENT_TONE[ZODIAC_ELEMENT[sign]])}
        style={{ fontFamily: ZODIAC_GLYPH_FONT }}
      >
        {ZODIAC_GLYPH[sign]}
        {"︎"}
      </span>
      <span className="truncate text-sm">{sign}</span>
    </span>
  );
}

function EnergyTypeCell({ row }: { row: ReadingsLibraryRow }) {
  if (!row.latestReadingId) return <span className="text-xs text-muted-foreground">No reading yet</span>;
  if (!row.energyType) return <span className="text-sm text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-block max-w-full rounded-full px-2.5 py-0.5 text-xs font-medium md:truncate",
        ENERGY_TYPE_TONE[row.energyType] ?? "bg-muted text-muted-foreground",
      )}
    >
      {row.energyType}
    </span>
  );
}

function ProfileCell({ value }: { value: string | null }) {
  if (!value) return <span className="text-sm text-muted-foreground">—</span>;
  return <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-primary">{value}</span>;
}

export interface ReadingsLibraryTableProps {
  data: ReadingsLibraryPage | null;
  loading: boolean;
  searching: boolean;
  sort: ReadingsLibrarySort;
  hrefFor: (row: ReadingsLibraryRow) => string;
  onOpen: (row: ReadingsLibraryRow) => void;
  onEdit: (row: ReadingsLibraryRow) => void;
  onDelete: (row: ReadingsLibraryRow) => void;
  onSortByName: () => void;
  onPage: (page: number) => void;
  busyRowId: string | null;
}

export function ReadingsLibraryTable({
  data,
  loading,
  searching,
  sort,
  hrefFor,
  onOpen,
  onEdit,
  onDelete,
  onSortByName,
  onPage,
  busyRowId,
}: ReadingsLibraryTableProps) {
  const SortIcon = sort === "name_asc" ? ArrowUp : sort === "name_desc" ? ArrowDown : ChevronsUpDown;
  const rows = data?.rows ?? [];
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? from + rows.length - (rows.length > 0 ? 1 : 0) : 0;

  return (
    <div className="overflow-hidden rounded-2xl border bg-background" data-readings-library>
      {/* Column headings — desktop/tablet only; phones get stacked rows. */}
      <div
        className="hidden items-center gap-4 border-b bg-card/60 px-5 py-3 text-xs font-semibold text-muted-foreground md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_7.5rem]"
        role="row"
      >
        <button
          type="button"
          onClick={onSortByName}
          className="inline-flex items-center gap-1 text-left hover:text-foreground"
          aria-label="Sort by name"
          data-column="name"
        >
          Name <SortIcon className="h-3 w-3" />
        </button>
        <span data-column="energy-type">Energy Type</span>
        <span data-column="profile">Profile</span>
        <span data-column="sun-sign">Sun Sign</span>
        <span className="sr-only">Actions</span>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading readings…
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {searching ? "No one matches that search." : "No readings saved yet — click “New reading” to generate one."}
        </p>
      ) : (
        <ul className={cn("divide-y", loading && "opacity-60")} data-readings-rows>
          {rows.map((row) => (
            <li
              key={`${row.kind}:${row.id}`}
              data-row-kind={row.kind}
              data-row-id={row.id}
              onClick={() => onOpen(row)}
              className="group flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-card/25 md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_7.5rem] md:gap-4 md:px-5 md:py-2"
            >
              {/* Name (+ the chart summary stacked underneath on phones) */}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  aria-hidden
                  className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold md:h-8 md:w-8", avatarTone(row.name))}
                >
                  {row.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <Link
                    href={hrefFor(row)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      onOpen(row);
                    }}
                    className="block truncate text-sm font-semibold hover:underline"
                  >
                    {row.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 md:hidden" data-mobile-summary>
                    <EnergyTypeCell row={row} />
                    {row.hdProfile && <ProfileCell value={row.hdProfile} />}
                    {row.sunSign && <SunSignCell sign={row.sunSign} />}
                  </div>
                </div>
              </div>
              <div className="hidden min-w-0 items-center md:flex">
                <EnergyTypeCell row={row} />
              </div>
              <div className="hidden items-center md:flex">
                <ProfileCell value={row.hdProfile} />
              </div>
              <div className="hidden min-w-0 items-center md:flex">
                <SunSignCell sign={row.sunSign} />
              </div>
              <div className="flex shrink-0 items-center justify-end gap-0.5">
                {row.kind === "profile" && (
                  <>
                    <button
                      type="button"
                      title="Edit this person"
                      aria-label={`Edit ${row.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(row);
                      }}
                      className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-primary"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete this person"
                      aria-label={`Delete ${row.name}`}
                      disabled={busyRowId === row.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(row);
                      }}
                      className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
                    >
                      {busyRowId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </>
                )}
                <ChevronRight aria-hidden className="ml-1 h-4 w-4 text-muted-foreground group-hover:text-foreground" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {data && data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 md:px-5">
          <p className="text-xs text-muted-foreground tabular-nums" data-library-range>
            Showing {from}–{to} of {data.total} {data.total === 1 ? "person" : "people"}
          </p>
          {data.pageCount > 1 && (
            <nav className="flex items-center gap-1" aria-label="Pages">
              <button
                type="button"
                aria-label="Previous page"
                disabled={data.page <= 1}
                onClick={() => onPage(data.page - 1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {libraryPageWindow(data.page, data.pageCount).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-current={n === data.page ? "page" : undefined}
                  onClick={() => onPage(n)}
                  className={cn(
                    "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm tabular-nums",
                    n === data.page ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                aria-label="Next page"
                disabled={data.page >= data.pageCount}
                onClick={() => onPage(data.page + 1)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
