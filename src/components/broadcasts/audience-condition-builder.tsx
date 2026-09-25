"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ListFilter, Loader2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { evalConditionGroup } from "@/lib/segmentation/eval-condition-group";
import { conditionGroupHasNegation } from "@/lib/segmentation/audience-warnings";
import {
  customFieldOption,
  describeCondition,
  standardFieldOptions,
  type FieldOption,
} from "@/lib/segmentation/field-options";
import {
  ConditionRowsEditor,
  SELECT_CLASS,
  groupToRows,
  newRowId,
  rowToCondition,
  rowsToGroup,
  type ConditionRow,
} from "@/components/segmentation/condition-rows-editor";
import type { Contact } from "@/types/contacts";
import type { CustomFieldDef } from "@/types/custom-fields";
import type { ContactListView } from "@/types/contact-lists";
import type { Condition, ConditionGroup } from "@/types/workflows";
import type { BroadcastAudienceFilter } from "@/types";

/**
 * Broadcast Segmentation V1 (2026-08-27) — the multi-condition AND/OR
 * audience builder, on the SAME ConditionGroup model + evaluator the
 * Workflow Builder uses (lib/segmentation/eval-condition-group.ts).
 *
 * Contacts redesign (2026-09-25):
 *   - Field list + row editor now come from the shared
 *     lib/segmentation/field-options.ts + components/segmentation, so the
 *     Contacts filters and Broadcasts can't drift. Adds First/Last name,
 *     State/Region, Postal code, and the Created / Last updated date fields
 *     (the evaluator gained real date operators).
 *   - An audience can instead be a saved Contact List (`kind: "list"`).
 *     Its preview is computed SERVER-side by the exact send-time resolver
 *     (/api/broadcasts/audience-preview) because lists may hold access
 *     conditions only the server can evaluate. Opt-out / missing-email
 *     pre-flight and every send safeguard apply unchanged.
 *
 * Exports keep their original names/shapes so broadcast-composer.tsx needed
 * no changes.
 */

export type AudienceConditionRow = ConditionRow;

export interface AudienceFilterState {
  match: "all" | "any";
  conditions: AudienceConditionRow[];
  /** Set when the audience is a saved Contact List (conditions unused). */
  listId?: string | null;
  listName?: string | null;
  /** Snapshot of the list's definition — drives the negation warning only;
   *  the server always resolves the live list. */
  listGroup?: ConditionGroup | null;
}

export function defaultAudienceFilterState(): AudienceFilterState {
  return { match: "all", conditions: [] };
}

function isListMode(state: AudienceFilterState): boolean {
  return state.listId !== undefined && state.listId !== null;
}

function stateToGroup(state: AudienceFilterState): ConditionGroup | undefined {
  if (isListMode(state)) return state.listGroup ?? undefined;
  if (state.conditions.length === 0) return undefined;
  return rowsToGroup(state);
}

/**
 * Negation/broad-filter warning (2026-08-26 production safety controls) —
 * true when any completed condition uses a negation operator. Advisory
 * only; never blocks sending. For a Contact List, checks the list's
 * definition.
 */
export function audienceStateHasNegation(state: AudienceFilterState): boolean {
  return conditionGroupHasNegation(stateToGroup(state));
}

/**
 * `null` when any added row is still incomplete (or no list is picked yet)
 * — the "invalid blocks sending" contract `canSend` relies on.
 */
export function audienceFilterToApiShape(
  state: AudienceFilterState,
): BroadcastAudienceFilter | null {
  if (isListMode(state)) {
    if (!state.listId) return null;
    return {
      kind: "list",
      listId: state.listId,
      listName: state.listName ?? null,
      group: state.listGroup ?? null,
    };
  }
  if (state.conditions.length === 0) return { kind: "all" };
  const all: Condition[] = [];
  for (const row of state.conditions) {
    const c = rowToCondition(row);
    if (!c) return null;
    all.push(c);
  }
  return { kind: "conditions", group: { match: state.match, all } };
}

/**
 * Persistent Broadcast Drafts V1 (2026-08-27) — the reverse of
 * `audienceFilterToApiShape`, used to hydrate the builder when reopening a
 * saved draft. Handles every `BroadcastAudienceFilter` shape.
 */
export function audienceFilterFromApiShape(
  filter: BroadcastAudienceFilter | null | undefined,
): AudienceFilterState {
  if (!filter || filter.kind === "all") return defaultAudienceFilterState();
  if (filter.kind === "tag") {
    return {
      match: "all",
      conditions: [{ id: newRowId(), field: "tags", op: "has_tag", value: filter.tag }],
    };
  }
  if (filter.kind === "pipeline_stage") {
    return {
      match: "all",
      conditions: [{ id: newRowId(), field: "pipelineStage", op: "equals", value: filter.stage }],
    };
  }
  if (filter.kind === "list") {
    return {
      match: "all",
      conditions: [],
      listId: filter.listId,
      listName: filter.listName ?? null,
      listGroup: filter.group ?? null,
    };
  }
  return groupToRows(filter.group);
}

interface ServerPreview {
  recipients: number;
  skipped: number;
  matching: number;
  recipientIds: string[];
}

// One in-flight/recent request per (sub-account, list, contact count) —
// the composer and the builder both call useAudiencePreview.
const previewCache = new Map<string, { at: number; promise: Promise<ServerPreview> }>();

function fetchListPreview(subAccountId: string, listId: string, key: string): Promise<ServerPreview> {
  const hit = previewCache.get(key);
  if (hit && Date.now() - hit.at < 10_000) return hit.promise;
  const promise = fetch("/api/broadcasts/audience-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subAccountId, audienceFilter: { kind: "list", listId } }),
  }).then(async (res) => {
    const data = (await res.json().catch(() => ({}))) as Partial<ServerPreview> & { error?: string };
    if (!res.ok) throw new Error(data.error ?? "Couldn't count this list.");
    return {
      recipients: data.recipients ?? 0,
      skipped: data.skipped ?? 0,
      matching: data.matching ?? 0,
      recipientIds: data.recipientIds ?? [],
    };
  });
  previewCache.set(key, { at: Date.now(), promise });
  promise.catch(() => previewCache.delete(key));
  return promise;
}

/**
 * Live preview. Plain conditions: evaluated client-side against the
 * already-loaded contacts (unchanged). Contact List: counted server-side by
 * the send-time resolver (see the module comment). Either way the send route
 * independently re-resolves and compares against the confirmed count.
 */
export function useAudiencePreview(
  contacts: Contact[],
  state: AudienceFilterState,
): {
  recipients: number;
  skipped: number;
  matching: number;
  recipientContacts: Contact[];
  loading?: boolean;
  error?: string | null;
} {
  const { subAccountId } = useSubAccount();
  const listId = isListMode(state) ? state.listId || null : null;
  const listMode = isListMode(state);
  const [server, setServer] = useState<{
    key: string;
    data: ServerPreview | null;
    error: string | null;
  } | null>(null);
  const key = listId ? `${subAccountId}:${listId}:${contacts.length}` : "";

  useEffect(() => {
    if (!listId || !subAccountId) return;
    let cancelled = false;
    fetchListPreview(subAccountId, listId, key)
      .then((data) => {
        if (!cancelled) setServer({ key, data, error: null });
      })
      .catch((err: Error) => {
        if (!cancelled) setServer({ key, data: null, error: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [listId, subAccountId, key]);

  const clientPreview = useMemo(() => {
    if (listMode) return null;
    const group = stateToGroup(state);
    const matching = contacts.filter((c) => evalConditionGroup(group, c));
    let skipped = 0;
    const recipientContacts: Contact[] = [];
    for (const c of matching) {
      if (c.emailOptedOut) {
        skipped += 1;
        continue;
      }
      if (!c.email || !c.email.includes("@")) {
        skipped += 1;
        continue;
      }
      recipientContacts.push(c);
    }
    return {
      recipients: recipientContacts.length,
      skipped,
      matching: matching.length,
      recipientContacts,
    };
  }, [contacts, state, listMode]);

  return useMemo(() => {
    if (clientPreview) return clientPreview;
    if (!listId) {
      return { recipients: 0, skipped: 0, matching: 0, recipientContacts: [], loading: false, error: null };
    }
    const current = server && server.key === key ? server : null;
    if (!current || !current.data) {
      return {
        recipients: 0,
        skipped: 0,
        matching: 0,
        recipientContacts: [],
        loading: !current,
        error: current?.error ?? null,
      };
    }
    const ids = new Set(current.data.recipientIds);
    return {
      recipients: current.data.recipients,
      skipped: current.data.skipped,
      matching: current.data.matching,
      recipientContacts: contacts.filter((c) => ids.has(c.id)),
      loading: false,
      error: null,
    };
  }, [clientPreview, server, key, contacts, listId]);
}

export function AudienceConditionBuilder({
  contacts,
  value,
  onChange,
  subAccountId,
}: {
  contacts: Contact[];
  value: AudienceFilterState;
  onChange: (next: AudienceFilterState) => void;
  subAccountId: string;
}) {
  const { saPath } = useSubAccount();
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);
  const [lists, setLists] = useState<ContactListView[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sub-accounts/${subAccountId}/custom-fields?entity=contact`)
      .then((r) => r.json())
      .then((data: { ok?: boolean; fields?: CustomFieldDef[] }) => {
        if (!cancelled && data.ok && Array.isArray(data.fields)) {
          setCustomFieldDefs(data.fields);
        }
      })
      .catch(() => {
        // Custom fields are additive to the picker — a fetch hiccup just
        // means fewer field options, never blocks the rest of the builder.
      });
    fetch(`/api/sub-accounts/${subAccountId}/contact-lists`)
      .then((r) => r.json())
      .then((data: { lists?: ContactListView[] }) => {
        if (!cancelled) setLists(Array.isArray(data.lists) ? data.lists : []);
      })
      .catch(() => {
        if (!cancelled) setLists([]);
      });
    return () => {
      cancelled = true;
    };
  }, [subAccountId]);

  const fieldOptions = useMemo<FieldOption[]>(
    () => [...standardFieldOptions(), ...customFieldDefs.map(customFieldOption)],
    [customFieldDefs],
  );

  const preview = useAudiencePreview(contacts, value);
  const mode: "conditions" | "list" = isListMode(value) ? "list" : "conditions";
  const selectedList = lists?.find((l) => l.id === value.listId) ?? null;

  function chooseMode(next: "conditions" | "list") {
    if (next === mode) return;
    if (next === "conditions") {
      onChange(defaultAudienceFilterState());
    } else {
      const first = lists?.[0];
      onChange({
        match: "all",
        conditions: [],
        listId: first?.id ?? "",
        listName: first?.name ?? null,
        listGroup: first?.group ?? null,
      });
    }
  }

  function chooseList(listId: string) {
    const list = lists?.find((l) => l.id === listId);
    onChange({
      match: "all",
      conditions: [],
      listId,
      listName: list?.name ?? null,
      listGroup: list?.group ?? null,
    });
  }

  return (
    <div className="space-y-3">
      <div
        className="inline-flex rounded-lg border bg-muted/30 p-0.5 text-xs"
        role="tablist"
        aria-label="Audience type"
      >
        {(["conditions", "list"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => chooseMode(m)}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              mode === m
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "conditions" ? "Build conditions" : "Use a Contact List"}
          </button>
        ))}
      </div>

      {mode === "conditions" ? (
        <ConditionRowsEditor
          value={value}
          onChange={(next) => onChange({ ...next, listId: null, listName: null, listGroup: null })}
          fieldOptions={fieldOptions}
          emptyText="No conditions — this broadcast will send to every contact in this sub-account (minus anyone unsubscribed from marketing email)."
        />
      ) : lists === null ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Loading Contact Lists…
        </p>
      ) : lists.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          No Contact Lists yet.{" "}
          <Link href={saPath("/contacts")} className="font-medium text-primary hover:underline">
            Create one in Contacts
          </Link>{" "}
          by filtering and choosing &ldquo;Save as list&rdquo;.
        </p>
      ) : (
        <div className="space-y-2">
          <select
            value={value.listId ?? ""}
            onChange={(e) => chooseList(e.target.value)}
            className={SELECT_CLASS}
            aria-label="Contact List"
          >
            <option value="" disabled>
              Choose a Contact List…
            </option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          {value.listId && !selectedList && (
            <p className="text-xs text-destructive">
              This draft&apos;s Contact List no longer exists. Choose another audience.
            </p>
          )}
          {selectedList && (
            <div className="rounded-lg border bg-muted/20 p-2.5 text-xs">
              <p className="flex items-center gap-1.5 font-medium">
                <ListFilter className="h-3.5 w-3.5 text-muted-foreground" />
                Contacts who match {selectedList.group.match === "any" ? "any" : "all"} of:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                {selectedList.group.all.map((c, i) => (
                  <li key={i}>{describeCondition(c, fieldOptions)}</li>
                ))}
              </ul>
              <p className="mt-1.5 text-muted-foreground">
                The list updates automatically — it&apos;s evaluated against current contact
                data when you send.
              </p>
            </div>
          )}
        </div>
      )}

      {audienceStateHasNegation(value) && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
          This audience uses a &quot;not&quot;/&quot;doesn&apos;t have&quot; rule, which
          can match most contacts in your CRM (everyone except the
          exception). Review the count below before sending.
        </p>
      )}

      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        {preview.error ? (
          <p className="text-xs text-destructive">{preview.error}</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Will receive email</span>
              <span className="font-mono font-semibold">
                {preview.loading ? (
                  <Loader2 className="inline h-3.5 w-3.5 animate-spin" />
                ) : (
                  preview.recipients
                )}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Skipped (unsubscribed / no email)</span>
              <span className="font-mono">{preview.skipped}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Total matching</span>
              <span className="font-mono">{preview.matching}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
