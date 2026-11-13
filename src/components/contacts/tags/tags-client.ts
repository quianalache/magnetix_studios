"use client";

import { FileText, ListFilter, Send, ShoppingCart, Sparkles, Workflow, type LucideIcon, TrendingUp } from "lucide-react";
import { TAG_USAGE_LABELS, type TagSummary, type TagUsageType } from "@/types/contact-tags";

/** Error from a /contact-tags call, with the server's code + extras. */
export class TagApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string | null,
    public extra: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function tagsFetch<T>(
  subAccountId: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`/api/sub-accounts/${subAccountId}/contact-tags${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const { error, code, ...extra } = body;
    throw new TagApiError(
      typeof error === "string" ? error : "Something went wrong. Try again.",
      res.status,
      typeof code === "string" ? code : null,
      extra,
    );
  }
  return body as T;
}

export const USAGE_ICONS: Record<TagUsageType, LucideIcon> = {
  workflow: Workflow,
  form: FileText,
  checkout: ShoppingCart,
  reading_tool: Sparkles,
  broadcast_draft: Send,
  contact_list: ListFilter,
  funnel_step: TrendingUp,
};

export function usageLabel(type: TagUsageType, n: number): string {
  const l = TAG_USAGE_LABELS[type];
  return `${n} ${n === 1 ? l.one : l.many}`;
}

export function contactsLabel(n: number): string {
  return `${n.toLocaleString()} ${n === 1 ? "contact" : "contacts"}`;
}

export function usedInSummary(tag: TagSummary): string {
  return tag.usageCount === 0 ? "Not used in settings" : `Used in ${tag.usageCount} ${tag.usageCount === 1 ? "place" : "places"}`;
}

export function formatUpdated(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export type TagSort = "name" | "contacts" | "usage" | "updated";

export const TAG_SORT_OPTIONS: { value: TagSort; label: string }[] = [
  { value: "name", label: "Name A → Z" },
  { value: "contacts", label: "Most contacts" },
  { value: "usage", label: "Most used" },
  { value: "updated", label: "Recently updated" },
];

export function sortTags(tags: TagSummary[], sort: TagSort): TagSummary[] {
  const byName = (a: TagSummary, b: TagSummary) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const list = [...tags];
  if (sort === "contacts") return list.sort((a, b) => b.contactCount - a.contactCount || byName(a, b));
  if (sort === "usage") return list.sort((a, b) => b.usageCount - a.usageCount || byName(a, b));
  if (sort === "updated") return list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || byName(a, b));
  return list.sort(byName);
}

/** Bottom sheet on phones, centred dialog from `sm` up. */
export const SHEET_ON_MOBILE =
  "max-sm:top-auto max-sm:bottom-0 max-sm:max-w-full max-sm:translate-y-0 max-sm:rounded-b-none max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]";
