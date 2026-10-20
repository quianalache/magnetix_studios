import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import {
  calculateReadingBody,
  createEnergeticDecoderReading,
  loadReadingSystems,
} from "@/lib/server/energetic-decoder-service";
import { recordEmbedReading } from "@/lib/server/embed-config-service";
import { notifyReadingReady } from "@/lib/server/notification-producers";
import { recordContactActivity } from "@/lib/server/contact-activity";
import { bumpAttributionVisit } from "@/lib/attribution-visits";
import { fireWorkflowTrigger } from "@/lib/workflows/engine";
import { geocodeBirthPlace } from "@/lib/energetics/geocode";
import { emailIsConfigured, sendTenantEmail } from "@/lib/comms/resend";
import { buildDecoderReportUrl, platformOrigin } from "@/lib/domains/public-url";
import { legacyPublicEmbed, toPublicEmbed } from "@/lib/energetic-decoder/embeds";
import { FieldValue } from "firebase-admin/firestore";
import type { EmbedConfig, ReadingConsentRecord, ReadingPlacement } from "@/types/embed-config";
import type { ContactAttribution } from "@/types/contacts";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";
import type { SubAccountDoc } from "@/types";

/**
 * Public Reading Tool submissions (Phase 1, 2026-10-19) — one place that
 * runs a submission through an Embed's configured journey:
 *
 *   live    — a visitor. Contact match-or-create (case-insensitive, never
 *             overwriting a returning Contact), Profile, a new Reading,
 *             delivery (MyMagnetix / email) per the Embed, an activity row,
 *             lifetime counts, the attribution conversion, the consent
 *             record, and the `reading.created` workflow trigger.
 *   test    — staff rehearsing the real journey: a hidden test Contact keyed
 *             to the staff member's own email, the Reading marked `test`,
 *             delivery exercised exactly as configured but only ever to the
 *             staff member. No webhooks/workflows, no counts, no attribution.
 *   preview — the real calculation and configured result, no writes at all.
 *
 * Submitting never authenticates anyone.
 */

export type PublicReadingMode = "live" | "test" | "preview";

export interface PublicReadingSubmission {
  subAccountId: string;
  agencyId: string;
  /** Null = the original Embed-less tool at /decoder/{saId}. */
  embed: EmbedConfig | null;
  mode: PublicReadingMode;
  /** Required for test/preview — the signed-in staff member. */
  staffEmail?: string | null;
  name: string;
  email: string;
  phone?: string;
  consent?: boolean;
  birthDate: string;
  birthTime: string;
  birthPlace: string;
  lat?: number;
  lng?: number;
  timeZone?: string;
  placement: ReadingPlacement | null;
  attribution: ContactAttribution | null;
  /** The visitor's IP, for the marketing-email consent audit (same as Forms). */
  ip?: string | null;
}

export interface PublicReadingResult {
  reading: EnergeticDecoderReading;
  links: {
    report: string | null;
    pdf: string | null;
    myMagnetix: string | null;
  };
  /**
   * The "Your Reading is ready" email: "sent" only when the provider
   * accepted it, "notSent" when the Embed asked for it but it didn't go out
   * (the visitor is never told it was sent), "off" when the Embed doesn't
   * email, and "preview" for Preview (nothing is ever sent).
   */
  email: "sent" | "notSent" | "off" | "preview";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function submitPublicReading(input: PublicReadingSubmission): Promise<PublicReadingResult | { error: string; status: number }> {
  const publicEmbed = input.embed ? toPublicEmbed(input.embed) : legacyPublicEmbed();
  const name = input.name.trim();
  const phone = input.phone?.trim() ?? "";

  if (!name || !input.birthDate.trim() || !input.birthTime.trim() || !input.birthPlace.trim()) {
    return { error: "Name, birth date, birth time, and birth place are all required.", status: 400 };
  }
  // Test/Preview always use the signed-in staff member's own email, so a
  // rehearsal can never reach or create a visitor's record.
  const emailAddress = input.mode === "live" ? input.email.trim() : (input.staffEmail ?? "").trim();
  if (!EMAIL_RE.test(emailAddress)) return { error: "Enter a valid email address.", status: 400 };
  if (publicEmbed.form.phone === "required" && !phone) return { error: "Phone number is required.", status: 400 };
  if (publicEmbed.form.consent.enabled && input.consent !== true) {
    return { error: "Please tick the consent box to continue.", status: 400 };
  }

  const delivery = publicEmbed.afterSubmit;
  const reportPath = (readingId: string) => `/decoder/${input.subAccountId}/report/${readingId}`;

  // ── Preview: real calculation, configured result, nothing written ──
  if (input.mode === "preview") {
    const systems = await loadReadingSystems(input.subAccountId);
    if ("error" in systems) return { error: systems.error, status: 422 };
    const place =
      typeof input.lat === "number" && typeof input.lng === "number" && input.timeZone
        ? { lat: input.lat, lng: input.lng, displayName: input.birthPlace, timeZone: input.timeZone }
        : await geocodeBirthPlace(input.birthPlace);
    if (!place) return { error: `Couldn't find "${input.birthPlace}" — try a more specific place (city, state/country).`, status: 422 };
    const body = await calculateReadingBody({
      subAccountId: input.subAccountId,
      reportConfig: systems.reportConfig,
      includeFrequency: systems.includeFrequency,
      birthDate: input.birthDate,
      birthTime: input.birthTime,
      place,
      contentSetId: input.embed?.reading.contentSetId ?? null,
    });
    const reading: EnergeticDecoderReading = {
      id: "preview",
      subAccountId: input.subAccountId,
      agencyId: input.agencyId,
      contactId: "",
      system: "geneKeys",
      name,
      birthDate: input.birthDate,
      birthTime: input.birthTime,
      birthPlace: place.displayName,
      timeZone: place.timeZone,
      spheres: body.spheres,
      humanDesign: body.humanDesign,
      astrology: body.astrology,
      createdAt: null,
    };
    // Preview links are inert — there's no saved Reading to open.
    return { reading, links: { report: null, pdf: null, myMagnetix: null }, email: "preview" };
  }

  const embed = input.embed;
  const consent: ReadingConsentRecord | null =
    embed && publicEmbed.form.consent.enabled && input.consent === true
      ? {
          given: true,
          textShown: publicEmbed.form.consent.text,
          purpose: publicEmbed.form.consent.purpose,
          consentedAt: new Date().toISOString(),
          embedId: embed.id,
          sourceUrl: input.attribution?.landingPage ?? null,
        }
      : null;
  const result = await createEnergeticDecoderReading({
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    createdByUid: input.mode === "test" ? "embed-test" : "energetic-decoder-public",
    origin: "public_decoder",
    name,
    email: emailAddress,
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    birthPlace: input.birthPlace,
    lat: input.lat,
    lng: input.lng,
    timeZone: input.timeZone,
    contentSetId: embed?.reading.contentSetId ?? null,
    embed: embed
      ? {
          id: embed.id,
          name: embed.name,
          contentSetId: embed.reading.contentSetId,
          chartDesignSetId: embed.reading.chartDesignSetId,
          views: embed.reading.views,
          pdf: embed.afterSubmit.pdf,
          myMagnetix: embed.afterSubmit.myMagnetix,
        }
      : null,
    placement: input.placement,
    attribution: input.mode === "live" ? input.attribution : null,
    test: input.mode === "test",
    publicContact: { phone, tags: embed?.contact.tags ?? [] },
    consent,
  });
  if ("error" in result) return { error: result.error, status: 422 };
  const reading = result.reading;

  // ── Delivery, exactly as the Embed is configured ──
  // The visitor is told "we've emailed you" only when the send succeeded.
  let email: PublicReadingResult["email"] = delivery.email ? "notSent" : "off";
  if (delivery.myMagnetix) {
    const outcome = await notifyReadingReady({
      subAccountId: input.subAccountId,
      readingId: reading.id,
      contactId: result.contactId,
      hasGeneKeys: reading.spheres.length > 0,
      hasHumanDesign: !!reading.humanDesign,
      hasAstrology: !!reading.astrology,
      sendEmail: delivery.email,
    }).catch((err) => {
      console.warn("[public-reading] MyMagnetix delivery failed", err);
      return null;
    });
    if (delivery.email && outcome === "sent") email = "sent";
  } else if (delivery.email) {
    const sent = await sendReadingReadyEmail({
      subAccountId: input.subAccountId,
      to: emailAddress,
      readingId: reading.id,
      readingName: name,
    }).catch((err) => {
      console.warn("[public-reading] email delivery failed", err);
      return false;
    });
    if (sent) email = "sent";
  }

  // ── Live-only bookkeeping (never for Test) ──
  if (input.mode === "live") {
    // Marketing-email permission only when the owner said the checkbox asks
    // for it — same write as a Form's email-consent field (resubscribes on an
    // explicit fresh tick, never revokes). An "agreement" tick is recorded on
    // the Reading only.
    if (consent?.purpose === "emailMarketing") {
      await getAdminDb()
        .doc(`contacts/${result.contactId}`)
        .update({
          emailOptedOut: false,
          emailConsent: {
            status: "consented",
            consentedAt: FieldValue.serverTimestamp(),
            unsubscribedAt: null,
            source: `embed:${consent.embedId}`,
            sourceUrl: consent.sourceUrl,
            textShown: consent.textShown,
            ip: input.ip ?? null,
          },
          updatedAt: FieldValue.serverTimestamp(),
        })
        .catch((err) => console.warn("[public-reading] consent write failed", err));
    }
    if (embed) {
      await recordEmbedReading(embed.id, { contactCreated: result.contactCreated });
      // Same visits→conversions rollup booking/offer pages use (Reports →
      // Attribution); visits are logged by the tool on load.
      await bumpAttributionVisit({
        subAccountId: input.subAccountId,
        agencyId: input.agencyId,
        pageType: "readingTool",
        pageId: embed.id,
        attribution: input.attribution,
        field: "conversions",
      }).catch((err) => console.warn("[public-reading] attribution bump failed", err));
    }
    await recordContactActivity({
      subAccountId: input.subAccountId,
      contactId: result.contactId,
      type: "reading_created",
      content: embed
        ? `Reading for ${name} created through the “${embed.name}” embed${placementLabel(input.placement)}.`
        : `Reading for ${name} created through the public reading tool.`,
      createdBy: "energetic-decoder-public",
      dedupeKey: `reading_created_${reading.id}`,
    });
    // Fires for every real submission — new AND returning Contacts — so
    // follow-up never depends on a tag being new. Awaited (the same
    // serverless-freeze lesson as notifications); the engine never throws.
    if (embed) {
      await fireWorkflowTrigger({
        agencyId: input.agencyId,
        subAccountId: input.subAccountId,
        type: "reading.created",
        contactId: result.contactId,
        context: {
          eventId: `reading.created:${reading.id}`,
          eventType: "reading.created",
          source: "public-reading-tool",
          readingId: reading.id,
          embedId: embed.id,
          placement: input.placement?.kind ?? "direct",
          contactCreated: result.contactCreated,
        },
      });
    }
  }

  return {
    reading,
    links: {
      report: reportPath(reading.id),
      pdf: delivery.pdf ? `/api/decoder/${input.subAccountId}/report/${reading.id}/pdf` : null,
      myMagnetix: delivery.myMagnetix ? "/my/readings" : null,
    },
    email,
  };
}

function placementLabel(p: ReadingPlacement | null): string {
  if (!p) return "";
  if (p.kind === "page") return " on a Pages & Funnels page";
  if (p.kind === "external") return p.host ? ` on ${p.host}` : " on an external website";
  return "";
}

/**
 * "Your Reading is ready" when an Embed has email on but MyMagnetix off —
 * links straight to the Reading Report. (With MyMagnetix on, the
 * MyMagnetix notification email carries this instead.) True when the
 * provider accepted the email; false when email isn't set up; throws when
 * the send fails.
 */
async function sendReadingReadyEmail(opts: {
  subAccountId: string;
  to: string;
  readingId: string;
  readingName: string;
}): Promise<boolean> {
  if (!emailIsConfigured()) return false;
  const subSnap = await getAdminDb().doc(`subAccounts/${opts.subAccountId}`).get();
  const sub = subSnap.data() as SubAccountDoc | undefined;
  const businessName = (sub?.name as string | undefined) || "Your practitioner";
  const link = buildDecoderReportUrl({ subAccount: sub, subAccountId: opts.subAccountId, readingId: opts.readingId }) || `${platformOrigin()}/decoder/${opts.subAccountId}/report/${opts.readingId}`;
  const escape = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  await sendTenantEmail({
    sub,
    to: opts.to,
    subject: "Your Reading is ready",
    text: `Hi,\n\n${businessName} has your Reading ready.\n\nView it here: ${link}\n`,
    html: `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:32px auto;padding:0 16px;color:#202124;line-height:1.6;">
  <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;">Your Reading is ready</h1>
  <p style="margin:0 0 24px;color:#3a3a44;">${escape(businessName)} has ${escape(opts.readingName)}'s Reading ready.</p>
  <p style="margin:0 0 24px;"><a href="${link}" style="display:inline-block;background:#202124;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:500;">View your Reading</a></p>
</body></html>`,
    idempotencyKey: `reading-ready-${opts.readingId}`,
  });
  return true;
}
