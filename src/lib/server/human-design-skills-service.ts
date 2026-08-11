import "server-only";

import { geneKeyFor } from "@/lib/energetics/gate-data";
import type { HumanDesignProfile, LocalSkillEntry, LocalSkillsSection } from "@/lib/energetics/human-design";
import { listResolvedGateContent } from "@/lib/server/energetic-decoder-gate-content-service";
import { listResolvedChartContent, contentId } from "@/lib/server/energetic-decoder-chart-content-service";

/**
 * Magnetix-native Skills & Attributes — the local replacement for
 * Bodygraph's paid, proprietary BusinessCompetencesAndQualities field
 * (removed 2026-08-11 along with the rest of that integration). Not a
 * reproduction of their algorithm or wording — an original interpretation
 * built entirely from chart structure and interpretive content this app
 * already computes/owns:
 *
 *   Core Strengths    — one per defined Center. Headline = human-design-
 *                        content-data.ts's new strengthHeadline; body =
 *                        that Center's existing definedText.
 *   Signature Talents — one per defined Channel. Headline = the real
 *                        system Channel name (CHANNEL_NAMES,
 *                        human-design-data.ts); body = composed from the
 *                        channel's 2 gates' existing giftText
 *                        (gate-content-defaults.ts) — V1 deliberately
 *                        composes rather than authoring 36 new channel
 *                        descriptions from scratch.
 *   Natural Gifts     — the 4 Activation Sequence gates (Life's Work /
 *                        Evolution / Radiance / Purpose — Personality
 *                        Sun/Earth + Design Sun/Earth, same gates Gene
 *                        Keys' Activation Sequence already uses). Headline
 *                        = GENE_KEYS' single-word Gift name (gate-data.ts);
 *                        body = that same gate's giftText.
 *   framingLine       — one banner sentence: the person's real Incarnation
 *                        Cross name + a short framing blurb keyed to its
 *                        angle (Right Angle / Left Angle / Juxtaposition —
 *                        only 3 possible values, incarnation-cross-
 *                        data.ts's CROSS_ANGLE_CONTENT).
 *
 * Fully deterministic: every input (definedCenters/definedChannels/
 * personality+design activations/incarnationCrossAngle) is already
 * computed by calculateHumanDesignProfile, so the same chart always
 * produces the same Skills section — no AI, no external call, no
 * per-person randomness.
 *
 * Editable through the existing Content system everywhere it's practical:
 * Center strength headlines/text and the 3 cross-angle framing blurbs are
 * real chart-content items (energetic-decoder-chart-content-service.ts,
 * same Content tab as Type/Authority/Variables); Channel/gate text
 * inherits whatever the sub-account has already customized in the Gate
 * Content editor, automatically, since it reads the exact same resolved
 * gate content Gene Keys already uses.
 *
 * Fetches its content in 2 bulk reads (listResolvedChartContent,
 * listResolvedGateContent), not one Firestore read per Center/Channel/
 * gate — both already fetch their whole collection in one query, so
 * looping resolveOne()-style single-item resolvers here would have meant
 * re-fetching the same collection up to ~15 times per reading.
 */
export async function computeLocalSkills(
  subAccountId: string,
  profile: HumanDesignProfile,
): Promise<LocalSkillsSection> {
  const [chartContent, gateContent] = await Promise.all([
    listResolvedChartContent(subAccountId),
    listResolvedGateContent(subAccountId),
  ]);
  const chartById = new Map(chartContent.map((item) => [item.id, item]));
  const gateByNumber = new Map(gateContent.map((g) => [g.gate, g]));

  const coreStrengths: LocalSkillEntry[] = profile.definedCenters.map((center): LocalSkillEntry => {
    const fields = chartById.get(contentId("hd", "center", center))?.fields;
    return {
      headline: fields?.strengthHeadline ?? "",
      description: fields?.definedText ?? "",
    };
  });

  const signatureTalents: LocalSkillEntry[] = profile.definedChannels.map((channel): LocalSkillEntry => {
    const [a, b] = channel.gates;
    const giftA = gateByNumber.get(a)?.giftText ?? "";
    const giftB = gateByNumber.get(b)?.giftText ?? "";
    return {
      headline: channel.name ?? `Channel ${channel.key}`,
      description: `${giftA} ${giftB}`.trim(),
      meta: `Gates ${channel.key}`,
    };
  });

  // Life's Work (Personality Sun) / Evolution (Personality Earth) /
  // Radiance (Design Sun) / Purpose (Design Earth) — the same 4 gates
  // Gene Keys' own Activation Sequence uses (see gene-keys.ts), derived
  // here straight from the activations calculateHumanDesignProfile
  // already computed, not recalculated.
  const activationSequence: { sphere: string; gate: number | undefined }[] = [
    { sphere: "Life's Work", gate: profile.personality.find((a) => a.body === "sun")?.gate },
    { sphere: "Evolution", gate: profile.personality.find((a) => a.body === "earth")?.gate },
    { sphere: "Radiance", gate: profile.design.find((a) => a.body === "sun")?.gate },
    { sphere: "Purpose", gate: profile.design.find((a) => a.body === "earth")?.gate },
  ];
  const naturalGifts: LocalSkillEntry[] = activationSequence
    .filter((s): s is { sphere: string; gate: number } => typeof s.gate === "number")
    .map(({ sphere, gate }): LocalSkillEntry => ({
      headline: geneKeyFor(gate).gift,
      description: gateByNumber.get(gate)?.giftText ?? "",
      meta: sphere,
    }));

  let framingLine: string | null = null;
  if (profile.incarnationCrossName && profile.incarnationCrossAngle) {
    const framing = chartById.get(contentId("hd", "crossAngle", profile.incarnationCrossAngle))?.fields.framing;
    if (framing) framingLine = `${profile.incarnationCrossName} — ${framing}`;
  }

  return { coreStrengths, signatureTalents, naturalGifts, framingLine };
}
