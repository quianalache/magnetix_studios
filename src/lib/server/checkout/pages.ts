import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

const millis = (v: unknown): number | null => {
  if (typeof v === "number") return v;
  const t = v as { toMillis?: () => number } | null | undefined;
  return typeof t?.toMillis === "function" ? t.toMillis() : null;
};

/** Pages & Funnels pages in a workspace, for step and destination pickers. */
export async function listWorkspacePages(subAccountId: string): Promise<Array<{ id: string; name: string; status: string; updatedAt: number | null }>> {
  const snap = await getAdminDb().collection("pages").where("subAccountId", "==", subAccountId).select("name", "status", "updatedAt").get();
  return snap.docs
    .map((d) => ({ id: d.id, name: (d.data().name as string) || "Untitled page", status: (d.data().status as string) ?? "draft", updatedAt: millis(d.data().updatedAt) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
