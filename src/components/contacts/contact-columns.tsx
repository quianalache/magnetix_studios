import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/contacts/source-badge";
import { getStage, type PipelineStage } from "@/types/deals";
import type { ContactRow, ContactSortField } from "@/types/contact-search";
import type { ContactSource } from "@/types/contacts";
import type { CustomFieldDef } from "@/types/custom-fields";
import type { TerritoryDoc } from "@/types";

/**
 * Column catalog for the Contacts list (Contacts redesign, 2026-09-25) —
 * the table, its mobile cards and the "Customize columns" menu all read
 * this one list. Name is always shown; everything else is optional.
 */

export interface ColumnContext {
  stages: PipelineStage[];
  territoryById: Map<string, TerritoryDoc>;
}

export interface ContactColumn {
  id: string;
  label: string;
  /** Server sort key when the header is clickable. */
  sort?: ContactSortField;
  /** Tailwind width hint for the <th>. */
  className?: string;
  render: (row: ContactRow, ctx: ColumnContext) => ReactNode;
}

const muted = <span className="text-xs text-muted-foreground">—</span>;

function text(v: string | null | undefined): ReactNode {
  const t = (v ?? "").trim();
  return t ? <span className="text-sm">{t}</span> : muted;
}

function date(iso: string | null): ReactNode {
  if (!iso) return muted;
  const d = new Date(iso);
  return (
    <time dateTime={iso} title={d.toLocaleString()} className="text-sm text-muted-foreground">
      {d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
    </time>
  );
}

export function tagsCell(tags: string[], max = 3): ReactNode {
  if (tags.length === 0) return muted;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, max).map((t) => (
        <Badge key={t} variant="outline" className="h-5 max-w-[9rem] truncate px-1.5 text-[11px]">
          {t}
        </Badge>
      ))}
      {tags.length > max && (
        <span className="text-[11px] text-muted-foreground" title={tags.slice(max).join(", ")}>
          +{tags.length - max}
        </span>
      )}
    </div>
  );
}

export function buildContactColumns(opts: {
  showTerritory: boolean;
  customFields: CustomFieldDef[];
}): ContactColumn[] {
  const cols: ContactColumn[] = [
    { id: "email", label: "Email", sort: "email", render: (r) => text(r.email) },
    { id: "phone", label: "Phone", sort: "phone", render: (r) => text(r.phone) },
    { id: "company", label: "Company", sort: "company", render: (r) => text(r.company) },
    { id: "tags", label: "Tags", className: "min-w-[10rem]", render: (r) => tagsCell(r.tags) },
    {
      id: "source",
      label: "Source",
      sort: "source",
      render: (r) => (r.source ? <SourceBadge source={r.source as ContactSource} /> : muted),
    },
    { id: "createdAt", label: "Created", sort: "createdAt", render: (r) => date(r.createdAt) },
    { id: "updatedAt", label: "Last updated", sort: "updatedAt", render: (r) => date(r.updatedAt) },
    { id: "firstName", label: "First name", render: (r) => text(r.firstName) },
    { id: "lastName", label: "Last name", render: (r) => text(r.lastName) },
    {
      id: "pipelineStage",
      label: "Pipeline stage",
      render: (r, ctx) => {
        if (!r.pipelineStage) return muted;
        const stage = getStage(r.pipelineStage, ctx.stages);
        return (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${stage.tone}`}>
            {stage.label}
          </span>
        );
      },
    },
    { id: "city", label: "City", render: (r) => text(r.city) },
    { id: "state", label: "State / Region", render: (r) => text(r.state) },
    { id: "postalCode", label: "Postal code", render: (r) => text(r.postalCode) },
    { id: "country", label: "Country", render: (r) => text(r.country) },
  ];
  if (opts.showTerritory) {
    cols.push({
      id: "territory",
      label: "Territory",
      render: (r, ctx) => {
        const t = r.territoryId ? ctx.territoryById.get(r.territoryId) : null;
        // No explicit territory resolves to Global — the shared floor.
        return (
          <span className="text-sm">
            {t ? t.name : "Global"}
            {t?.status === "archived" && (
              <span className="ml-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                archived
              </span>
            )}
          </span>
        );
      },
    });
  }
  for (const def of opts.customFields) {
    cols.push({
      id: `cf:${def.key}`,
      label: def.label,
      render: (r) => {
        const v = r.customFields?.[def.key];
        if (v === null || v === undefined || v === "") return muted;
        if (Array.isArray(v)) return tagsCell(v.map(String), 2);
        if (typeof v === "boolean") return <span className="text-sm">{v ? "Yes" : "No"}</span>;
        return <span className="text-sm">{String(v)}</span>;
      },
    });
  }
  return cols;
}
