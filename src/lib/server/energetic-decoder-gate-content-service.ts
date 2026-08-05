import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { DEFAULT_GATE_CONTENT, defaultGateContent } from "@/lib/energetics/gate-content-defaults";

export interface ResolvedGateContent {
  gate: number;
  showsUp: string;
  giftText: string;
  isCustom: boolean;
}

/**
 * All 64 gates, each resolved to the sub-account's own override if they've
 * written one, falling back to the shipped default otherwise — powers the
 * per-gate content editor (shows every gate, flags which ones are
 * customized) and reading generation (which just needs the resolved text,
 * doesn't care whether it's custom or default).
 */
export async function listResolvedGateContent(
  subAccountId: string,
): Promise<ResolvedGateContent[]> {
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/energeticDecoderGateContent`)
    .get();
  const overrides = new Map<number, { showsUp: string; giftText: string }>();
  for (const doc of snap.docs) {
    const gate = Number(doc.id);
    const data = doc.data();
    overrides.set(gate, { showsUp: data.showsUp ?? "", giftText: data.giftText ?? "" });
  }

  return DEFAULT_GATE_CONTENT.map((d) => {
    const override = overrides.get(d.gate);
    return override
      ? { gate: d.gate, showsUp: override.showsUp, giftText: override.giftText, isCustom: true }
      : { gate: d.gate, showsUp: d.showsUp, giftText: d.giftText, isCustom: false };
  });
}

/** Single-gate resolve, used by reading generation — cheaper than listing all 64 when only one is needed. */
export async function resolveGateContent(
  subAccountId: string,
  gate: number,
): Promise<{ showsUp: string; giftText: string }> {
  const snap = await getAdminDb()
    .doc(`subAccounts/${subAccountId}/energeticDecoderGateContent/${gate}`)
    .get();
  if (snap.exists) {
    const data = snap.data()!;
    return { showsUp: data.showsUp ?? "", giftText: data.giftText ?? "" };
  }
  const d = defaultGateContent(gate);
  return { showsUp: d.showsUp, giftText: d.giftText };
}

export async function saveGateContentOverride(
  subAccountId: string,
  gate: number,
  content: { showsUp: string; giftText: string },
): Promise<void> {
  await getAdminDb()
    .doc(`subAccounts/${subAccountId}/energeticDecoderGateContent/${gate}`)
    .set({ ...content, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

/** Reset a gate back to the shipped default by deleting the override doc. */
export async function resetGateContent(subAccountId: string, gate: number): Promise<void> {
  await getAdminDb()
    .doc(`subAccounts/${subAccountId}/energeticDecoderGateContent/${gate}`)
    .delete();
}
