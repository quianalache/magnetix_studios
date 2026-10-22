import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { calculateReadingBody, getReadingById, loadReadingSystems } from "@/lib/server/energetic-decoder-service";
import { DEFAULT_CONTENT_SET_ID } from "@/lib/energetic-decoder/content-sets";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import type { ReadingSampleKind } from "@/types/reading-blocks";

/**
 * Builder sample Readings (2026-10-21) — a creator can't design a Reading
 * Result Page while staring at empty blocks. One fictional, deterministic
 * birth moment per Human Design Type, calculated through the SAME engine
 * and this business's own systems and default wording as a real Reading,
 * so every block looks exactly as it will for a visitor. Never saved, never
 * linked to a Contact, never counted. "latestTest" is the staff member's own
 * most recent hidden Test Reading, when there is one.
 *
 * The birth moments were found by searching the real calculator for each
 * Type (1980-1996, New York) and preferring charts with several defined
 * Channels, so the sections have something to show. Not modeled on anyone.
 */

const SAMPLE_PLACE = { lat: 40.7128, lng: -74.006, displayName: "New York, NY, USA", timeZone: "America/New_York" };

const SAMPLES: Record<Exclude<ReadingSampleKind, "latestTest">, { name: string; date: string; time: string }> = {
  projector: { name: "Sample Projector", date: "1980-12-14", time: "07:10" },
  generator: { name: "Sample Generator", date: "1980-01-05", time: "07:10" },
  manifestingGenerator: { name: "Sample Manifesting Generator", date: "1980-02-05", time: "07:10" },
  manifestor: { name: "Sample Manifestor", date: "1980-12-14", time: "11:45" },
  reflector: { name: "Sample Reflector", date: "1989-11-05", time: "07:10" },
};

/** Null when this business has no systems turned on, or (latestTest) no Test Reading yet. */
export async function buildSampleReading(
  subAccountId: string,
  kind: ReadingSampleKind,
): Promise<EnergeticDecoderReading | null> {
  if (kind === "latestTest") {
    const snap = await getAdminDb()
      .collection("energeticDecoderReadings")
      .where("subAccountId", "==", subAccountId)
      .where("test", "==", true)
      .get();
    const latest = snap.docs
      .map((d) => ({ id: d.id, at: (d.get("createdAt") as { toMillis?: () => number } | null)?.toMillis?.() ?? 0 }))
      .sort((a, b) => b.at - a.at)[0];
    return latest ? getReadingById(subAccountId, latest.id) : null;
  }
  const sample = SAMPLES[kind];
  const systems = await loadReadingSystems(subAccountId);
  if ("error" in systems) return null;
  const body = await calculateReadingBody({
    subAccountId,
    reportConfig: systems.reportConfig,
    includeFrequency: systems.includeFrequency,
    birthDate: sample.date,
    birthTime: sample.time,
    place: SAMPLE_PLACE,
    contentSetId: DEFAULT_CONTENT_SET_ID,
  });
  return {
    id: `sample-${kind}`,
    subAccountId,
    agencyId: "",
    contactId: "",
    system: "geneKeys",
    name: sample.name,
    birthDate: sample.date,
    birthTime: sample.time,
    birthPlace: SAMPLE_PLACE.displayName,
    timeZone: SAMPLE_PLACE.timeZone,
    spheres: body.spheres,
    humanDesign: body.humanDesign,
    astrology: body.astrology,
    createdAt: null,
  };
}
