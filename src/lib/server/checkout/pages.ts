import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/** Pages & Funnels pages in a workspace, for step and destination pickers. */
export async function listWorkspacePages(subAccountId: string): Promise<Array<{ id: string; name: string; status: string }>> {
  const snap = await getAdminDb().collection("pages").where("subAccountId", "==", subAccountId).select("name", "status").get();
  return snap.docs
    .map((d) => ({ id: d.id, name: (d.data().name as string) || "Untitled page", status: (d.data().status as string) ?? "draft" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
