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
  createdAt: string | null;
  updatedAt: string | null;
}
