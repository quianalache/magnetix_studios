"use client";

import type { PageTemplateConnections, PageTemplateSummary } from "@/types/page-templates";
import type { PageGoal } from "@/types/pages-funnels";

/** Browser helpers for /api/pages-funnels/templates (Saved Page Templates, 2026-11-16). */

const ENDPOINT = "/api/pages-funnels/templates";

async function post<T>(body: Record<string, unknown>, fallback: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach Magnetix. Check your connection and try again.");
  }
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? fallback);
  return json;
}

export async function listPageTemplates(subAccountId: string): Promise<PageTemplateSummary[]> {
  const res = await fetch(`${ENDPOINT}?sa=${encodeURIComponent(subAccountId)}`, { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { templates?: PageTemplateSummary[]; error?: string };
  if (!res.ok) throw new Error(json.error ?? "Couldn't load your templates.");
  return json.templates ?? [];
}

export async function savePageTemplate(input: {
  pageId: string;
  name: string;
  description: string;
  requestId: string;
  current?: { data: unknown; popups: unknown } | null;
}): Promise<PageTemplateSummary> {
  const json = await post<{ template: PageTemplateSummary }>({ action: "save", ...input }, "Couldn't save the template. Try again.");
  return json.template;
}

export async function renamePageTemplate(subAccountId: string, templateId: string, name: string, description?: string): Promise<PageTemplateSummary> {
  const json = await post<{ template: PageTemplateSummary }>(
    { action: "rename", subAccountId, templateId, name, ...(description !== undefined ? { description } : {}) },
    "Couldn't rename the template.",
  );
  return json.template;
}

export async function deletePageTemplate(subAccountId: string, templateId: string): Promise<void> {
  await post({ action: "delete", subAccountId, templateId }, "Couldn't delete the template.");
}

export async function createPageFromTemplate(input: {
  subAccountId: string;
  templateId: string;
  name: string;
  goal: PageGoal;
}): Promise<{ pageId: string; connections: PageTemplateConnections; clearedCheckouts: number }> {
  return post({ action: "create", ...input }, "Couldn't create the page. Try again.");
}

export const templatePreviewHref = (templateId: string) => `/page-template-preview?t=${encodeURIComponent(templateId)}`;

export function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}
