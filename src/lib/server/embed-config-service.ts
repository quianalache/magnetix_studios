import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { EmbedConfig } from "@/types/embed-config";

/** Flat top-level collection, same convention as `reportDesigns`/`chartDesigns`. */
function col() {
  return getAdminDb().collection("embedConfigs");
}

function toConfig(id: string, data: FirebaseFirestore.DocumentData): EmbedConfig {
  return { id, ...(data as Omit<EmbedConfig, "id">) };
}

export async function listEmbedConfigs(subAccountId: string): Promise<EmbedConfig[]> {
  const snap = await col().where("subAccountId", "==", subAccountId).get();
  return snap.docs.map((d) => toConfig(d.id, d.data()));
}

export async function createEmbedConfig(opts: {
  agencyId: string;
  subAccountId: string;
  name: string;
  placementNote?: string;
}): Promise<EmbedConfig> {
  const doc = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    name: opts.name.trim() || "Untitled embed",
    placementNote: opts.placementNote?.trim() ?? "",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await col().add(doc);
  return toConfig(ref.id, doc);
}

export async function updateEmbedConfig(
  subAccountId: string,
  embedId: string,
  fields: Partial<Pick<EmbedConfig, "name" | "placementNote">>,
): Promise<EmbedConfig> {
  const ref = col().doc(embedId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new Error("Embed not found");
  await ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
  const updated = await ref.get();
  return toConfig(updated.id, updated.data()!);
}

export async function deleteEmbedConfig(subAccountId: string, embedId: string): Promise<void> {
  const ref = col().doc(embedId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new Error("Embed not found");
  await ref.delete();
}
