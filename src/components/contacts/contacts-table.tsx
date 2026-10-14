"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Copy, ExternalLink, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { DataTableShell, DATA_TABLE_HEAD_ROW, DATA_TABLE_ROW } from "@/components/system/data-table";
import { contactDisplayName, contactInitials } from "@/lib/contacts/names";
import { useSubAccount } from "@/context/sub-account-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContactColumn, ColumnContext } from "@/components/contacts/contact-columns";
import type { ContactRow, ContactSort, ContactSortField } from "@/types/contact-search";

/**
 * Contacts list table (Contacts redesign, 2026-09-25). Renders exactly one
 * server page (25 rows) — sorting is server-side via `onSort`. Name is
 * always the first column; the rest come from the user's saved column
 * choice. Below `md` the rows become cards (name + the chosen fields) so
 * the list stays usable on a phone without horizontal scrolling. Pagination
 * (`footer`) sits inside the table card, and under the cards on phones.
 */
export function ContactsTable({
  rows,
  columns,
  ctx,
  sort,
  onSort,
  busy,
  footer,
}: {
  rows: ContactRow[];
  columns: ContactColumn[];
  ctx: ColumnContext;
  sort: ContactSort;
  onSort: (field: ContactSortField) => void;
  busy?: boolean;
  /** Pagination — rendered inside the table card (and under the phone cards). */
  footer?: ReactNode;
}) {
  const { saPath } = useSubAccount();
  const router = useRouter();

  function copy(value: string, label: string) {
    void navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`${label} copied`))
      .catch(() => toast.error(`Couldn't copy ${label.toLowerCase()}`));
  }

  function sortIcon(field: ContactSortField) {
    if (sort.field !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  }

  function header(label: string, field?: ContactSortField) {
    if (!field) return label;
    return (
      <button
        type="button"
        onClick={() => onSort(field)}
        className="inline-flex items-center gap-1 uppercase hover:text-white"
        aria-label={`Sort by ${label}`}
      >
        {label}
        {sortIcon(field)}
      </button>
    );
  }

  const rowMenu = (row: ContactRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Actions for ${contactDisplayName(row)}`}
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => router.push(saPath(`/contacts/${row.id}`))}>
          <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open profile
        </DropdownMenuItem>
        {row.email && (
          <DropdownMenuItem onClick={() => copy(row.email, "Email")}>
            <Copy className="mr-2 h-3.5 w-3.5" /> Copy email
          </DropdownMenuItem>
        )}
        {row.phone && (
          <DropdownMenuItem onClick={() => copy(row.phone, "Phone")}>
            <Copy className="mr-2 h-3.5 w-3.5" /> Copy phone
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className={cn("transition-opacity", busy && "opacity-60")} aria-busy={busy}>
      {/* ≥ md: the shared table frame — the body scrolls sideways inside the
          card when many columns are chosen, never the page. The Name column
          stays pinned while scrolling. */}
      <DataTableShell className="hidden md:block" footer={footer}>
        <thead>
          <tr className={DATA_TABLE_HEAD_ROW}>
            <th scope="col" className="sticky left-0 z-[1] bg-table-head px-4 py-3">
              {header("Name", "name")}
            </th>
            {columns.map((c) => (
              <th key={c.id} scope="col" className={cn("px-3 py-3", c.className)}>
                {header(c.label, c.sort)}
              </th>
            ))}
            <th scope="col" className="w-12 px-2 py-3">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={cn(DATA_TABLE_ROW, "group cursor-pointer")} onClick={() => router.push(saPath(`/contacts/${row.id}`))}>
              <td className="sticky left-0 z-[1] bg-card px-4 py-2.5 transition-colors group-hover:bg-tint-violet">
                <Link
                  href={saPath(`/contacts/${row.id}`)}
                  className="flex min-w-44 items-center gap-2.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tag-violet-bg text-caption font-semibold text-tag-violet-fg"
                  >
                    {contactInitials(row)}
                  </span>
                  <span className="truncate text-body-sm font-semibold text-foreground hover:underline">
                    {contactDisplayName(row)}
                  </span>
                </Link>
              </td>
              {columns.map((c) => (
                <td key={c.id} className="max-w-60 truncate px-3 py-2.5 align-middle">
                  {c.render(row, ctx)}
                </td>
              ))}
              <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                {rowMenu(row)}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTableShell>

      {/* < md: cards. */}
      <ul className="space-y-2 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="rounded-card border border-border bg-card shadow-card">
            <div className="flex items-start gap-3 p-3">
              <Link href={saPath(`/contacts/${row.id}`)} className="flex min-w-0 flex-1 items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tag-violet-bg text-caption font-semibold text-tag-violet-fg"
                >
                  {contactInitials(row)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-semibold">{contactDisplayName(row)}</p>
                  <dl className="mt-1 space-y-1">
                    {columns.map((c) => (
                      <div key={c.id} className="flex min-w-0 items-start gap-2 text-caption">
                        <dt className="w-20 shrink-0 text-muted-foreground">{c.label}</dt>
                        <dd className="min-w-0 flex-1 truncate">{c.render(row, ctx)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </Link>
              {rowMenu(row)}
            </div>
          </li>
        ))}
      </ul>
      {footer ? <div className="mt-3 rounded-card border border-border bg-card px-4 py-3 shadow-card md:hidden">{footer}</div> : null}
    </div>
  );
}
