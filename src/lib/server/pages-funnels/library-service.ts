import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { Funnel, FunnelStep } from "@/types/checkout";
import type { PageFunnelUse, PagesLibraryFunnel } from "@/lib/pages-funnels/library";

/**
 * Pages & Funnels home data (2026-11): the workspace's funnels and, for
 * every page, which funnel steps use it. Derived from the real
 * `funnels/{id}/steps` records (the source of truth for step → page links) —
 * NOT from the unused `PageDoc.funnelId` placeholder. One call per library
 * visit, scoped to one workspace; archived funnels are left out like the
 * funnel list itself does.
 */
export async function loadPagesLibrary(subAccountId: string): Promise<{ funnels: PagesLibraryFunnel[]; usage: Record<string, PageFunnelUse[]> }> {
  const db = getAdminDb();
  const snap = await db.collection("funnels").where("subAccountId", "==", subAccountId).get();
  const funnels = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<Funnel, "id">) }))
    .filter((f) => f.status !== "archived" && f.subAccountId === subAccountId);
  const stepLists = await Promise.all(
    funnels.map(async (f) =>
      (await db.collection(`funnels/${f.id}/steps`).get()).docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<FunnelStep, "id">) }))
        .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt),
    ),
  );
  const usage: Record<string, PageFunnelUse[]> = {};
  funnels.forEach((f, i) => {
    for (const step of stepLists[i]) {
      if (!step.pageId) continue;
      (usage[step.pageId] ??= []).push({
        funnelId: f.id,
        funnelName: f.name,
        funnelStatus: f.status,
        stepId: step.id,
        stepName: step.name,
        stepType: step.type,
        stepNumber: step.order + 1,
      });
    }
  });
  const rows: PagesLibraryFunnel[] = funnels
    .map((f, i) => ({ id: f.id, name: f.name, status: f.status, updatedAt: f.updatedAt, createdAt: f.createdAt, stepCount: stepLists[i].length }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return { funnels: rows, usage };
}
