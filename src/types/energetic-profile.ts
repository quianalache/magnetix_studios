/**
 * EnergeticProfile — Phase 3 Task 1 (2026-08-13), data layer only. Sits
 * between Contact and Reading per the approved architecture (Decision
 * Brief Decisions 1, 7, 9): a Contact is the CRM relationship record; a
 * Profile is the actual person whose birth data/chart gets calculated.
 * One Contact may have several Profiles (Decision 7) — e.g. a parent
 * Contact with Profiles for themselves and their kids — without forcing
 * every chart subject into its own separate CRM Contact.
 *
 * Deliberately narrow: identity + birth data only. Computed results
 * (Gene Keys spheres, Human Design, Astrology) stay on Reading, not
 * duplicated here — a Profile doesn't own a chart, it owns who the chart
 * is for. Reading will gain a `profileId` field in a later task; nothing
 * reads or writes it yet, and nothing in this task touches
 * EnergeticDecoderReading, Contact UI, or the New Reading flow.
 *
 * `relationshipLabel` is optional free text (Decision 11, approved
 * 2026-08-13) — "Child," "Partner," "Self," "Client," or nothing at all.
 * No fixed taxonomy, not required.
 *
 * `hdChartDesignId`/`mandalaChartDesignId`/`astrologyChartDesignId`
 * (2026-08-15, Bodygraph gap closure — the audit's own "practitioner
 * picks a saved chart design from the individual person's chart
 * experience") — optional per-Profile overrides of which saved
 * ChartDesign renders THIS person's chart, one per system, all
 * independently nullable. `null`/absent means "use the sub-account's
 * current default for that system," the exact behavior every Profile
 * already had before this field existed — purely additive, zero
 * migration. Deliberately a reference (a ChartDesign id), never a copy —
 * no ChartDesign content is duplicated onto the Profile. Deliberately
 * scoped to Profile, not Reading or GeneratedReport: this is a live
 * presentation preference ("how do I want to see this person's chart"),
 * matching how the existing sub-account-wide default already behaves
 * (changing it already retroactively re-styles every past reading's
 * live view — this was never a frozen-at-creation-time property).
 * GeneratedReport's own frozen snapshot behavior is completely
 * unaffected — its content is already resolved and frozen at generation
 * time, unrelated to this field.
 */
export interface EnergeticProfile {
  id: string;
  subAccountId: string;
  agencyId: string;
  contactId: string;
  name: string;
  relationshipLabel: string | null;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  timeZone: string;
  /** Persisted explicitly (unlike today's Reading, which re-geocodes birthPlace text at creation time) so a later Regenerate Reading action can recompute deterministically without re-resolving the place name. Null until geocoded. */
  lat: number | null;
  lng: number | null;
  /** Saved Human Design (Traditional) ChartDesign override for this Profile — null/absent falls back to the sub-account default. */
  hdChartDesignId?: string | null;
  /** Saved Mandala ChartDesign override for this Profile — null/absent falls back to the sub-account default. */
  mandalaChartDesignId?: string | null;
  /** Saved Astrology ChartDesign override for this Profile — null/absent falls back to the sub-account default. */
  astrologyChartDesignId?: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}
