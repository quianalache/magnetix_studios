import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/** Display names for the "Updated by" columns — sub-account member name, else the user profile, else null. */
export async function memberNames(subAccountId: string, uids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(uids.filter((u): u is string => typeof u === "string" && u.length > 0 && !u.includes("/")))].slice(0, 200);
  const out = new Map<string, string>();
  if (unique.length === 0) return out;
  const db = getAdminDb();
  const members = await db.getAll(...unique.map((u) => db.doc(`subAccounts/${subAccountId}/subAccountMembers/${u}`)));
  const missing: string[] = [];
  members.forEach((m, i) => {
    const d = m.data();
    const name = (d?.displayName as string) || (d?.name as string) || (d?.email as string) || "";
    if (name) out.set(unique[i], name);
    else missing.push(unique[i]);
  });
  if (missing.length) {
    const users = await db.getAll(...missing.map((u) => db.doc(`users/${u}`)));
    users.forEach((u, i) => {
      const d = u.data();
      const name = (d?.displayName as string) || (d?.name as string) || "";
      if (name) out.set(missing[i], name);
    });
  }
  return out;
}

export function isoOf(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  if (t && typeof t.toDate === "function") return t.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "string" && !Number.isNaN(Date.parse(v))) return new Date(v).toISOString();
  return null;
}
