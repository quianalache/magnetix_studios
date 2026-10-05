import type { ChartDesign, ChartDesignSystem } from "./chart-design";

/**
 * A unified Chart Design (2026-10, approved Unified Chart Designs plan) —
 * one named design holding the visual configuration for every chart
 * system. Implemented as a grouping layer: each system's settings stay in
 * its own `chartDesigns/{id}` record (unchanged renderers, unchanged field
 * shapes) and this record references them.
 *
 * Invariants (enforced by chart-design-set-service.ts and checked by
 * chart-design-set-integrity.ts):
 *  - every member record belongs to THIS set (`ownerSetId === set.id`) —
 *    members are never shared between sets, so editing one design can't
 *    change another;
 *  - every member is in the same sub-account and has the matching system;
 *  - exactly one default set per migrated sub-account, and the per-system
 *    `isDefault` flags on the member records mirror it (old readers keep
 *    working during the transition).
 *
 * Server-only collection `chartDesignSets` (no Firestore rule = default
 * deny), read and written only through the Admin SDK routes.
 */
export interface ChartDesignSet {
  id: string;
  subAccountId: string;
  agencyId: string;
  name: string;
  isDefault: boolean;
  members: ChartDesignSetMembers;
  /** Present on sets created by the one-time migration (audit + rollback). */
  migration?: ChartDesignSetMigrationInfo | null;
  /**
   * Present on the ready-made designs (Magnetix Violet, Monochrome, Warm
   * Sunset, Midnight — see chart-design-starters.ts). Bookkeeping only: they
   * are ordinary, fully editable designs. Never copied to a duplicate.
   */
  starter?: { key: string; version: number } | null;
  createdAt: string | null;
  updatedAt: string | null;
}

/** The chart systems a unified design holds a record for. Frequency is reserved: not designable yet, always null. */
export interface ChartDesignSetMembers {
  humanDesign: string;
  mandala: string;
  astrology: string;
  frequency: null;
}

export interface ChartDesignSetMigrationInfo {
  version: 1;
  /** "default" = the sub-account's three default records; "named" = existing custom record(s); "profile-mix" = a Profile whose legacy overrides spanned several designs. */
  source: "default" | "named" | "profile-mix";
  /** Systems filled with an independent copy of another record (missing from the original group). */
  copiedSystems: ChartDesignSystem[];
  migratedAt: string;
}

/** A set with its member records loaded (null = member missing/invalid — reported by the integrity checker, never expected). */
export interface ChartDesignSetWithMembers extends ChartDesignSet {
  designs: Record<ChartDesignSystem, ChartDesign | null>;
}

export const CHART_DESIGN_SET_SYSTEMS: readonly ChartDesignSystem[] = ["humanDesign", "mandala", "astrology"];
