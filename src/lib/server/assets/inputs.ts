import "server-only";

import { ASSET_STATUSES, type AffiliateCommissionRecurrence, type AffiliateCommissionUnit, type AffiliateLinkStatus, type AssetIncludedIn, type AssetStatus, type ResourceSourceKind } from "@/types/assets";
import type { AffiliateLinkInput, AssetInput } from "@/lib/server/asset-service";
import { loadTenantAsset, MediaLibraryError, type Tenant } from "@/lib/server/assets/media-library-service";

/** Shared, validated input parsing for the Resource and Affiliate routes (create = full, PATCH = only sent keys). */

export class AssetsInputError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function str(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function nullableStr(v: unknown): string | null {
  const s = str(v, 200);
  return s && !s.includes("/") ? s : null;
}
function tags(v: unknown): string[] {
  const list = Array.isArray(v)
    ? v.filter((t): t is string => typeof t === "string")
    : typeof v === "string"
      ? v.split(",")
      : [];
  return [...new Set(list.map((t) => t.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
}
/** http(s) only — a javascript: or data: link can't be saved. Empty is allowed. */
function url(v: unknown, field: string): string {
  const s = str(v, 1000);
  if (!s) return "";
  let parsed: URL;
  try {
    parsed = new URL(s);
  } catch {
    throw new AssetsInputError(`${field} must be a full link starting with https://`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new AssetsInputError(`${field} must start with https://`);
  }
  return s;
}
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.min(v, 1_000_000_000);
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0) return Number(v);
  return null;
}

// ── resources ────────────────────────────────────────────────────────────────

export async function parseResourceInput(
  tenant: Tenant,
  body: Record<string, unknown>,
  mode: "create" | "patch"
): Promise<Partial<AssetInput>> {
  const has = (k: string) => mode === "create" || k in body;
  const out: Partial<AssetInput> = {};
  if (has("name")) {
    out.name = str(body.name, 200);
    if (!out.name) throw new AssetsInputError("Give the resource a name.");
  }
  if (has("type")) out.type = str(body.type, 80) || "Other";
  if (has("description")) out.description = str(body.description, 5000);
  if (has("status")) {
    out.status = (ASSET_STATUSES as readonly string[]).includes(body.status as string) ? (body.status as AssetStatus) : "active";
  }
  if (has("tags")) out.tags = tags(body.tags);
  if (has("accessLevel")) out.accessLevel = str(body.accessLevel, 80);
  if (has("includedIn")) {
    out.includedIn =
      body.includedIn === "standard_membership" || body.includedIn === "premium_membership" || body.includedIn === "sold_standalone"
        ? (body.includedIn as AssetIncludedIn)
        : null;
  }
  if (has("directLink")) out.directLink = url(body.directLink, "The link");
  if (has("communitySafeLink")) out.communitySafeLink = url(body.communitySafeLink, "The community-safe link");
  if (has("landingPageLink")) out.landingPageLink = url(body.landingPageLink, "The landing page link");
  if (has("checkoutLink")) out.checkoutLink = url(body.checkoutLink, "The checkout link");
  for (const k of ["linkedProjectId", "linkedContentId", "linkedGoalId", "linkedOfferId"] as const) {
    if (has(k)) out[k] = nullableStr(body[k]);
  }
  if (has("internalNotes")) out.internalNotes = str(body.internalNotes, 5000);
  if (has("relatedArea")) out.relatedArea = str(body.relatedArea, 60);
  if (has("sourceKind")) out.sourceKind = (body.sourceKind === "internal" ? "internal" : "external") as ResourceSourceKind;
  if (has("mediaAssetId")) {
    const id = nullableStr(body.mediaAssetId);
    if (id) {
      // The file must be a live Media Library item of THIS sub-account.
      try {
        await loadTenantAsset(tenant, id);
      } catch (err) {
        if (err instanceof MediaLibraryError) throw new AssetsInputError("That file isn't in this workspace's Media Library.");
        throw err;
      }
    }
    out.mediaAssetId = id;
  }
  if (mode === "create") {
    if (out.sourceKind === "internal" && !out.mediaAssetId) throw new AssetsInputError("Choose or upload the file for this resource.");
    if (out.sourceKind !== "internal" && !out.directLink) throw new AssetsInputError("Add the link to the resource.");
    if (out.sourceKind !== "internal") out.mediaAssetId = null;
  }
  return out;
}

// ── affiliate programs ───────────────────────────────────────────────────────

export function parseAffiliateInput(body: Record<string, unknown>, mode: "create" | "patch"): Partial<AffiliateLinkInput> {
  const has = (k: string) => mode === "create" || k in body;
  const out: Partial<AffiliateLinkInput> = {};
  if (has("programName")) {
    out.programName = str(body.programName, 200);
    if (!out.programName) throw new AssetsInputError("Give the program a name.");
  }
  if (has("companyName")) out.companyName = str(body.companyName, 200);
  if (has("description")) out.description = str(body.description, 5000);
  if (has("category")) out.category = str(body.category, 80);
  if (has("status")) {
    out.status = (body.status === "inactive" || body.status === "archived" ? body.status : "active") as AffiliateLinkStatus;
  }
  if (has("affiliateLink")) {
    out.affiliateLink = url(body.affiliateLink, "The affiliate link");
    if (!out.affiliateLink) throw new AssetsInputError("Add your affiliate link.");
  }
  if (has("publicLandingLink")) out.publicLandingLink = url(body.publicLandingLink, "The landing page link");
  if (has("loginDashboardLink")) out.loginDashboardLink = url(body.loginDashboardLink, "The dashboard link");
  if (has("notes")) out.notes = str(body.notes, 5000);
  if (has("commissionType")) out.commissionType = str(body.commissionType, 80);
  if (has("commissionAmount")) out.commissionAmount = num(body.commissionAmount);
  if (has("commissionRecurrence")) {
    out.commissionRecurrence =
      body.commissionRecurrence === "recurring" || body.commissionRecurrence === "one_time"
        ? (body.commissionRecurrence as AffiliateCommissionRecurrence)
        : null;
  }
  if (has("commissionUnit")) {
    out.commissionUnit =
      body.commissionUnit === "percent" || body.commissionUnit === "flat" ? (body.commissionUnit as AffiliateCommissionUnit) : null;
  }
  if (has("payoutStructure")) out.payoutStructure = str(body.payoutStructure, 80);
  if (has("payoutPlatform")) out.payoutPlatform = str(body.payoutPlatform, 80);
  if (has("payoutThreshold")) out.payoutThreshold = num(body.payoutThreshold);
  if (has("payoutFrequency")) out.payoutFrequency = str(body.payoutFrequency, 80);
  if (has("cookieWindow")) out.cookieWindow = str(body.cookieWindow, 80);
  if (has("paymentNotes")) out.paymentNotes = str(body.paymentNotes, 5000);
  if (has("wherePromoted")) out.wherePromoted = str(body.wherePromoted, 2000);
  if (has("promoNotes")) out.promoNotes = str(body.promoNotes, 5000);
  if (has("contentIdeas")) out.contentIdeas = str(body.contentIdeas, 5000);
  // "Best fit for" was rejected by the owner: never written from the UI.
  // New records store an empty value; existing values are left untouched.
  if (mode === "create") out.bestFitAudience = "";
  return out;
}
