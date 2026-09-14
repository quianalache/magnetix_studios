import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import {
  listPortalCourses,
  listPortalCommunities,
  listPortalProjects,
  listPortalQuotes,
  listPortalUpcomingBookings,
  type PortalCourse,
  type PortalCommunity,
  type PortalBooking,
} from "@/lib/server/portal-service";
import { resolvePortalBranding } from "@/types/portal-branding";
import { projectProgressPct } from "@/types/projects";
import type { SubAccountDoc } from "@/types/tenancy";
import type { Member } from "@/types/community";
import type { CourseOfferPurchase } from "@/types/course-offers";
import { listExternalSubscriptionsForContact } from "@/lib/server/external-billing-service";
import { listExternalPaymentsForContact } from "@/lib/server/external-payment-service";
import type {
  ExternalBillingProvider,
  ExternalPaymentStatus,
  ExternalPaymentType,
  ExternalSubscription,
  ExternalSubscriptionStatus,
} from "@/types/external-billing";

/**
 * MyMagnetix cross-business read model. Every function here fans out from
 * a global Person to the real, existing tenant relationships that belong
 * to it, then reuses the SAME per-tenant service functions the Client
 * Portal already uses (portal-service.ts) — this file adds no new data
 * storage of its own and copies nothing into a "global" database. It is a
 * READ/INDEX layer only.
 *
 * Isolation contract, load-bearing throughout this file: every list below
 * starts from `collectionGroup("members").where("personId", "==", personId)`
 * — the one collection-group index built for the identity foundation. A
 * Member doc only carries a `personId` once a real login/reconciliation
 * event legitimately linked it (see person-identity-service.ts). There is
 * no path in this file that lets a caller pass an arbitrary personId +
 * subAccountId and get data back without that link actually existing in
 * Firestore — the membership list itself IS the entitlement check.
 */

export interface PersonMembership {
  subAccountId: string;
  memberId: string;
  contactId: string | null;
  email: string;
  displayName: string | null;
}

/** Every ACTIVE tenant relationship this Person has, across every sub-account. */
export async function listPersonMemberships(
  personId: string
): Promise<PersonMembership[]> {
  const snap = await getAdminDb()
    .collectionGroup("members")
    .where("personId", "==", personId)
    .get();

  return snap.docs
    .map((doc) => {
      const data = doc.data() as Omit<Member, "id">;
      const subAccountId = doc.ref.parent.parent?.id ?? null;
      if (!subAccountId) return null;
      if (data.status !== "active") return null;
      return {
        subAccountId,
        memberId: doc.id,
        contactId: data.contactId,
        email: data.email,
        displayName: data.displayName,
      } satisfies PersonMembership;
    })
    .filter((m): m is PersonMembership => m !== null);
}

/**
 * Best-effort greeting name. The `people/{id}` doc deliberately stores no
 * name of its own (identity-only, per the foundation's design) — this
 * derives one from whichever real record has it first: a Member's
 * displayName, then a staff `users/{uid}` doc's displayName, then the
 * email's local-part as a last resort. Never written back anywhere.
 */
export async function resolvePersonDisplayName(
  personId: string,
  primaryEmail: string,
  memberships?: PersonMembership[]
): Promise<string> {
  const list = memberships ?? (await listPersonMemberships(personId));
  const fromMember = list.find((m) => m.displayName?.trim())?.displayName;
  if (fromMember) return fromMember;

  const userSnap = await getAdminDb()
    .collection("users")
    .where("personId", "==", personId)
    .limit(1)
    .get();
  const fromStaff = userSnap.docs[0]?.data()?.displayName as string | undefined;
  if (fromStaff?.trim()) return fromStaff;

  return primaryEmail.split("@")[0] ?? "there";
}

export interface PersonSpace {
  subAccountId: string;
  name: string;
  logoUrl: string | null;
  accentColor: string;
  enterHref: string;
  pinKey: string;
}

/** The businesses this Person has a relationship with — "Your Spaces." */
export async function listSpacesForPerson(
  memberships: PersonMembership[]
): Promise<PersonSpace[]> {
  const spaces = await Promise.all(
    memberships.map(async (m): Promise<PersonSpace | null> => {
      const subSnap = await getAdminDb()
        .doc(`subAccounts/${m.subAccountId}`)
        .get();
      if (!subSnap.exists) return null;
      const sub = {
        id: subSnap.id,
        ...(subSnap.data() as Omit<SubAccountDoc, "id">),
      };
      if (sub.status !== "active") return null;
      const branding = resolvePortalBranding(sub.portalBranding);
      return {
        subAccountId: sub.id,
        name: branding.portalName || sub.name,
        logoUrl: branding.logoUrl,
        accentColor: branding.accentColor,
        // Deliberately the opaque `/portal/{id}` path, NOT
        // buildPortalHomeUrl's custom-domain-aware pretty URL: the
        // ls_member_session cookie /api/my/enter mints is only ever set
        // on the CURRENT (platform) domain, so redirecting straight to a
        // business's own custom domain here would leave the visitor
        // cookie-less there and bounce them to a login screen anyway.
        enterHref: `/api/my/enter?subAccountId=${sub.id}&next=${encodeURIComponent(`/portal/${sub.id}`)}`,
        pinKey: `space:${sub.id}`,
      };
    })
  );
  return spaces.filter((s): s is PersonSpace => s !== null);
}

export interface PersonCourseItem extends PortalCourse {
  subAccountId: string;
  businessName: string;
  enterHref: string;
  pinKey: string;
}

/** Every Standalone Course this Person is enrolled in, across every business. */
export async function listCoursesForPerson(
  memberships: PersonMembership[]
): Promise<PersonCourseItem[]> {
  const items = await Promise.all(
    memberships.map(async (m) => {
      const [sub, courses] = await Promise.all([
        getAdminDb().doc(`subAccounts/${m.subAccountId}`).get(),
        listPortalCourses(m.subAccountId, m.memberId),
      ]);
      const businessName = (sub.data()?.name as string) || "Magnetix";
      return courses.map(
        (c): PersonCourseItem => ({
          ...c,
          subAccountId: m.subAccountId,
          businessName,
          enterHref: `/api/my/enter?subAccountId=${m.subAccountId}&next=${encodeURIComponent(c.classroomHref)}`,
          pinKey: `course:${m.subAccountId}:${c.courseId}`,
        })
      );
    })
  );
  return items.flat();
}

export interface PersonCommunityItem extends PortalCommunity {
  subAccountId: string;
  businessName: string;
  enterHref: string;
  pinKey: string;
}

/** Every Community this Person belongs to, across every business. */
export async function listCommunitiesForPerson(
  memberships: PersonMembership[]
): Promise<PersonCommunityItem[]> {
  const items = await Promise.all(
    memberships.map(async (m) => {
      const [sub, communities] = await Promise.all([
        getAdminDb().doc(`subAccounts/${m.subAccountId}`).get(),
        listPortalCommunities(m.subAccountId, m.memberId),
      ]);
      const businessName = (sub.data()?.name as string) || "Magnetix";
      return communities.map(
        (c): PersonCommunityItem => ({
          ...c,
          subAccountId: m.subAccountId,
          businessName,
          enterHref: `/api/my/enter?subAccountId=${m.subAccountId}&next=${encodeURIComponent(c.href)}`,
          pinKey: `community:${m.subAccountId}:${c.groupId}`,
        })
      );
    })
  );
  return items.flat();
}

export interface PersonUpcomingItem extends PortalBooking {
  subAccountId: string;
  businessName: string;
  enterHref: string;
}

/** Next few real scheduled appointments, across every business — "Coming Up." */
export async function listComingUpForPerson(
  memberships: PersonMembership[],
  limit = 5
): Promise<PersonUpcomingItem[]> {
  const withContact = memberships.filter((m) => m.contactId);
  const items = await Promise.all(
    withContact.map(async (m) => {
      const [sub, bookings] = await Promise.all([
        getAdminDb().doc(`subAccounts/${m.subAccountId}`).get(),
        listPortalUpcomingBookings(m.subAccountId, m.contactId as string),
      ]);
      const businessName = (sub.data()?.name as string) || "Magnetix";
      return bookings.map(
        (b): PersonUpcomingItem => ({
          ...b,
          subAccountId: m.subAccountId,
          businessName,
          enterHref: `/api/my/enter?subAccountId=${m.subAccountId}&next=${encodeURIComponent(`/portal/${m.subAccountId}/appointments`)}`,
        })
      );
    })
  );
  return items
    .flat()
    .sort((a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0))
    .slice(0, limit);
}

export interface AttentionItem {
  id: string;
  kind: "project-due" | "project-step" | "invoice";
  title: string;
  detail: string;
  businessName: string;
  subAccountId: string;
  enterHref: string;
}

function tsToDate(v: unknown): Date | null {
  if (v && typeof (v as { toDate?: () => Date }).toDate === "function") {
    return (v as { toDate: () => Date }).toDate();
  }
  return null;
}

/**
 * Real, action-oriented items only — never a fabricated count. Three real
 * sources: an active project's own `dueAt` when it's today or overdue (the
 * project itself carries a due date; individual ProjectStep docs don't, so
 * this deliberately stays project-level rather than inventing per-step
 * urgency); otherwise that project's next incomplete step, as a lower-
 * urgency nudge; and any open (sent/viewed, not yet paid) invoice.
 */
export async function listAttentionForPerson(
  memberships: PersonMembership[]
): Promise<AttentionItem[]> {
  const withContact = memberships.filter((m) => m.contactId);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const items = await Promise.all(
    withContact.map(async (m): Promise<AttentionItem[]> => {
      const [sub, projects, quotes] = await Promise.all([
        getAdminDb().doc(`subAccounts/${m.subAccountId}`).get(),
        listPortalProjects(m.subAccountId, m.contactId as string),
        listPortalQuotes(m.subAccountId, m.contactId as string),
      ]);
      const businessName = (sub.data()?.name as string) || "Magnetix";
      const out: AttentionItem[] = [];

      for (const project of projects) {
        if (projectProgressPct(project) >= 100) continue;
        const dueAt = tsToDate(project.dueAt);
        const projectHref = `/api/my/enter?subAccountId=${m.subAccountId}&next=${encodeURIComponent(`/portal/${m.subAccountId}/projects`)}`;
        if (dueAt && dueAt.getTime() <= endOfToday.getTime()) {
          const overdue = dueAt.getTime() < new Date().setHours(0, 0, 0, 0);
          out.push({
            id: `due:${project.id}`,
            kind: "project-due",
            title: project.title,
            detail: overdue ? "Overdue" : "Due today",
            businessName,
            subAccountId: m.subAccountId,
            enterHref: projectHref,
          });
          continue;
        }
        const nextStep = project.steps.find((s) => !s.done);
        if (!nextStep) continue;
        out.push({
          id: `step:${project.id}:${nextStep.id}`,
          kind: "project-step",
          title: nextStep.title,
          detail: `Next step in ${project.title}`,
          businessName,
          subAccountId: m.subAccountId,
          enterHref: projectHref,
        });
      }

      for (const q of quotes) {
        if (q.kind !== "invoice" || q.status === "paid") continue;
        out.push({
          id: `invoice:${q.id}`,
          kind: "invoice",
          title: `Invoice ${q.quoteNumber}`,
          detail: "Needs payment",
          businessName,
          subAccountId: m.subAccountId,
          enterHref: `/api/my/enter?subAccountId=${m.subAccountId}&next=${encodeURIComponent(`/portal/${m.subAccountId}/billing`)}`,
        });
      }
      return out;
    })
  );
  return items.flat();
}

export interface UpcomingPayment {
  id: string;
  label: string;
  businessName: string;
  subAccountId: string;
  amountCents: number;
  currency: string;
  renewsAt: Date;
}

/**
 * Real upcoming recurring charges, within the next 14 days, sourced from
 * REAL Stripe subscriptions this Person's purchases are tied to
 * (`CourseOfferPurchase.stripeSubscriptionId`) — no stored/cached
 * "next renewal date" field exists anywhere in Firestore today, so this
 * makes a live Stripe lookup per active recurring purchase, correctly
 * routed to the connected account that actually owns the subscription
 * (same `{ stripeAccount: id }` pattern already used by
 * course-offer-purchase-service.ts). A lookup failure for one purchase is
 * skipped, not fatal to the whole card — an honest partial result beats a
 * broken page.
 */
export async function listPaymentsForPerson(
  memberships: PersonMembership[]
): Promise<UpcomingPayment[]> {
  if (!process.env.STRIPE_SECRET_KEY?.trim()) return [];
  const db = getAdminDb();
  const now = Date.now();
  const horizon = now + 14 * 24 * 60 * 60 * 1000;

  const perMember = await Promise.all(
    memberships.map(async (m) => {
      const [sub, purchaseSnap] = await Promise.all([
        db.doc(`subAccounts/${m.subAccountId}`).get(),
        db
          .collectionGroup("purchases")
          .where("subAccountId", "==", m.subAccountId)
          .where("memberId", "==", m.memberId)
          .where("status", "==", "paid")
          .get(),
      ]);
      const businessName = (sub.data()?.name as string) || "Magnetix";
      const recurring = purchaseSnap.docs
        .map((d) => d.data() as CourseOfferPurchase)
        .filter((p) => !!p.stripeSubscriptionId);

      const results: UpcomingPayment[] = [];
      for (const purchase of recurring) {
        try {
          const stripe = getStripeServer();
          const opts = purchase.stripeConnectAccountId
            ? { stripeAccount: purchase.stripeConnectAccountId }
            : undefined;
          const subscription = await stripe.subscriptions.retrieve(
            purchase.stripeSubscriptionId as string,
            opts
          );
          if (
            subscription.status !== "active" &&
            subscription.status !== "trialing"
          )
            continue;
          // `current_period_end` moved to the subscription ITEM level in
          // this API version, not the subscription object itself.
          const periodEnd = subscription.items.data[0]?.current_period_end;
          if (!periodEnd) continue;
          const renewsAtMs = periodEnd * 1000;
          if (renewsAtMs < now || renewsAtMs > horizon) continue;
          results.push({
            id: purchase.id,
            label: purchase.booking?.bookingPageName || "Membership",
            businessName,
            subAccountId: m.subAccountId,
            amountCents: purchase.amountCents,
            currency: purchase.currency,
            renewsAt: new Date(renewsAtMs),
          });
        } catch (err) {
          console.warn("[mymagnetix-service] payment lookup skipped", err);
        }
      }
      return results;
    })
  );

  return perMember
    .flat()
    .sort((a, b) => a.renewsAt.getTime() - b.renewsAt.getTime());
}

// ── Existing-subscription billing visibility (MyMagnetix → Purchases) ──
//
// This reads the provider-neutral `ExternalSubscription`/`ExternalPayment`
// ledger built by the Stripe reconciliation/import system
// (external-billing-service.ts / external-payment-service.ts) — it is a
// READ layer only, exactly like the rest of this file: no new billing
// record is created here, no Product/Course/Community entitlement is
// granted or checked, and nothing here sends an email or fires a
// workflow/webhook event. Importing a subscription and *seeing* it here
// are deliberately separate concerns.

/** Public, UI-facing lifecycle status. A superset of the ledger's own
 *  normalized status set: the Purchases page's status switch already has a
 *  case for Stripe's real "unpaid" subscription status, but
 *  `normalizeSubscriptionStatus` in external-billing-import-service.ts
 *  doesn't currently produce it (unrecognized statuses fall through to
 *  "unknown") — widening the type here satisfies the existing UI exactly
 *  as designed without touching that normalizer, which is a separate
 *  concern outside this task. Kept as its own named type (rather than
 *  importing `ExternalSubscriptionStatus` directly into the page) so the
 *  MyMagnetix surface can diverge from the internal billing ledger's status
 *  vocabulary later without a churn-y rename across the UI. */
export type PersonPurchaseStatus = ExternalSubscriptionStatus | "unpaid";

export interface PersonSubscriptionPurchase {
  /** The `externalSubscriptions/{id}` Firestore doc id — NOT the raw Stripe
   *  subscription id. This is what `ManageSubscriptionButton` sends to
   *  `/api/my/billing/portal`, which re-resolves the real provider ids
   *  server-side rather than trusting anything from the client. */
  id: string;
  subAccountId: string;
  businessName: string;
  provider: ExternalBillingProvider;
  productName: string | null;
  priceName: string | null;
  amountCents: number | null;
  currency: string | null;
  interval: string | null;
  intervalCount: number | null;
  status: PersonPurchaseStatus;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** True only when this subscription is currently eligible for the Stripe
   *  Billing Portal — mirrors `manageableStatus()` in
   *  mymagnetix-billing-portal-service.ts (provider is Stripe, and neither
   *  the normalized nor the raw provider status is "canceled"). Duplicated
   *  as a small local check rather than imported, since that service
   *  already imports from this file and importing back would be circular. */
  canManage: boolean;
}

export interface PersonPaymentHistoryItem {
  /** The `externalPayments/{id}` Firestore doc id. */
  id: string;
  subAccountId: string;
  businessName: string;
  productName: string | null;
  description: string | null;
  paymentType: ExternalPaymentType;
  status: ExternalPaymentStatus;
  amountCents: number;
  amountRefundedCents: number;
  netAmountCents: number;
  currency: string;
  occurredAt: Date | null;
  paidAt: Date | null;
  failedAt: Date | null;
  refundedAt: Date | null;
  receiptUrl: string | null;
  invoiceHostedUrl: string | null;
  invoicePdfUrl: string | null;
  failureMessage: string | null;
}

function isManageableSubscription(subscription: ExternalSubscription): boolean {
  return (
    subscription.provider === "stripe" &&
    subscription.status !== "canceled" &&
    subscription.status !== "ended" &&
    subscription.providerStatus !== "canceled"
  );
}

/**
 * Every ExternalSubscription genuinely linked to one of this Person's real
 * memberships — across every business, like the rest of this file.
 *
 * Safety: the only way a subscription can appear here is if it was found
 * via `listExternalSubscriptionsForContact(m.subAccountId, m.contactId)`
 * for a membership already proven to belong to this Person by
 * `listPersonMemberships` (which itself only returns memberships carrying
 * this exact `personId`, per that function's own isolation contract). A
 * membership with no `contactId` contributes nothing — there is no
 * fallback to email or any other identity for this lookup.
 */
export async function listSubscriptionsForPerson(
  personId: string,
  memberships: PersonMembership[]
): Promise<PersonSubscriptionPurchase[]> {
  void personId; // kept in the signature for symmetry with the rest of this file's per-Person API and for future audit logging; the real isolation boundary is `memberships`, already scoped to this Person.
  const withContact = memberships.filter(
    (m): m is PersonMembership & { contactId: string } => !!m.contactId
  );
  const perMember = await Promise.all(
    withContact.map(async (m) => {
      const [sub, subscriptions] = await Promise.all([
        getAdminDb().doc(`subAccounts/${m.subAccountId}`).get(),
        listExternalSubscriptionsForContact(m.subAccountId, m.contactId),
      ]);
      const businessName = (sub.data()?.name as string) || "Magnetix";
      return subscriptions.map(
        (s): PersonSubscriptionPurchase => ({
          id: s.id,
          subAccountId: s.subAccountId,
          businessName,
          provider: s.provider,
          productName: s.productName,
          priceName: s.priceName,
          amountCents: s.amountCents,
          currency: s.currency,
          interval: s.interval,
          intervalCount: s.intervalCount,
          status: s.status,
          currentPeriodStart: tsToDate(s.currentPeriodStart),
          currentPeriodEnd: tsToDate(s.currentPeriodEnd),
          cancelAtPeriodEnd: s.cancelAtPeriodEnd,
          canManage: isManageableSubscription(s),
        })
      );
    })
  );
  // Deterministic order: soonest-renewing / most-recently-active first,
  // nulls last, `id` as a final tiebreak so two subscriptions with the same
  // (or missing) period-end never render in Firestore's non-deterministic
  // doc order across requests.
  return perMember.flat().sort((a, b) => {
    const aTime = a.currentPeriodEnd?.getTime() ?? -Infinity;
    const bTime = b.currentPeriodEnd?.getTime() ?? -Infinity;
    if (aTime !== bTime) return bTime - aTime;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Every ExternalPayment genuinely linked to one of this Person's real
 * memberships — same isolation contract as `listSubscriptionsForPerson`
 * above. Reads the already-synced Firestore ledger only; never calls the
 * Stripe API directly (the payments here were populated by the import/
 * backfill/webhook-sync services, which are the only writers of this
 * collection).
 */
export async function listPaymentHistoryForPerson(
  personId: string,
  memberships: PersonMembership[]
): Promise<PersonPaymentHistoryItem[]> {
  void personId; // see listSubscriptionsForPerson — `memberships` is the real boundary.
  const withContact = memberships.filter(
    (m): m is PersonMembership & { contactId: string } => !!m.contactId
  );
  const perMember = await Promise.all(
    withContact.map(async (m) => {
      const [sub, payments] = await Promise.all([
        getAdminDb().doc(`subAccounts/${m.subAccountId}`).get(),
        // Already sorted occurredAt desc within this contact; the merge
        // below re-sorts across contacts/businesses for a single feed.
        listExternalPaymentsForContact(m.subAccountId, m.contactId),
      ]);
      const businessName = (sub.data()?.name as string) || "Magnetix";
      return payments.map(
        (p): PersonPaymentHistoryItem => ({
          id: p.id,
          subAccountId: p.subAccountId,
          businessName,
          productName: p.productName,
          description: p.description,
          paymentType: p.paymentType,
          status: p.status,
          amountCents: p.amountCents,
          amountRefundedCents: p.amountRefundedCents,
          netAmountCents: p.netAmountCents,
          currency: p.currency,
          occurredAt: tsToDate(p.occurredAt),
          paidAt: tsToDate(p.paidAt),
          failedAt: tsToDate(p.failedAt),
          refundedAt: tsToDate(p.refundedAt),
          receiptUrl: p.receiptUrl,
          invoiceHostedUrl: p.invoiceHostedUrl,
          invoicePdfUrl: p.invoicePdfUrl,
          failureMessage: p.failureMessage,
        })
      );
    })
  );
  // Each per-contact list is already `externalPaymentId`-deduplicated by
  // construction (one Firestore doc per canonical provider payment id), and
  // a payment belongs to exactly one contact, so a straight merge can never
  // introduce a duplicate — just re-sort the merged feed newest-first.
  return perMember.flat().sort((a, b) => {
    const aTime = a.occurredAt?.getTime() ?? -Infinity;
    const bTime = b.occurredAt?.getTime() ?? -Infinity;
    if (aTime !== bTime) return bTime - aTime;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Security-sensitive: proves a given ExternalSubscription genuinely belongs
 * to one of the CALLER'S OWN memberships before
 * `createPersonBillingPortalSession` is allowed to mint a Stripe Billing
 * Portal session for it. Deliberately narrow and synchronous — no network
 * call, no database read, just a pure comparison against data the caller
 * already fetched via `listPersonMemberships`.
 *
 * Canonical identity only: `subAccountId` (tenant boundary) plus
 * `contactId` (the same field the import flow itself treats as the
 * subscription's owning identity — see `subscriptionChange()` in
 * external-billing-import-service.ts, which refuses to re-link a
 * subscription to a different contactId). Never falls back to email, and a
 * membership with no `contactId` can never match anything — that is
 * "ambiguous" by this function's contract, not a wildcard. When the
 * subscription also carries a `memberId`, it must additionally agree with
 * the membership's `memberId`; a mismatch there fails closed even if the
 * contactId matched, rather than trusting the weaker signal.
 */
export function subscriptionBelongsToMembership(
  subscription: Pick<
    ExternalSubscription,
    "subAccountId" | "contactId" | "memberId"
  >,
  membership: PersonMembership
): boolean {
  if (subscription.subAccountId !== membership.subAccountId) return false;
  if (!membership.contactId) return false;
  if (subscription.contactId !== membership.contactId) return false;
  if (subscription.memberId && subscription.memberId !== membership.memberId) {
    return false;
  }
  return true;
}

// ── Person-scoped preferences (pinning) ─────────────────────────────────
// Stored under `people/{personId}/pins/{pinKey}` — a private preference
// about how THIS person wants their own index sorted, never written onto
// any tenant-owned Course/Community doc.

export async function listPinnedKeys(personId: string): Promise<Set<string>> {
  const snap = await getAdminDb().collection(`people/${personId}/pins`).get();
  return new Set(snap.docs.map((d) => d.id));
}

export async function setPinned(
  personId: string,
  pinKey: string,
  pinned: boolean
): Promise<void> {
  const ref = getAdminDb().doc(`people/${personId}/pins/${pinKey}`);
  if (pinned) {
    await ref.set({ pinnedAt: new Date() });
  } else {
    await ref.delete();
  }
}
