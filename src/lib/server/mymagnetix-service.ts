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
import {
  resolveFirstAgencyId,
  resolveBrandName,
} from "@/lib/landing/resolve-brand";
import {
  listGroupsForAgency,
  getAgencyMembershipForPerson,
} from "@/lib/server/community-agency-service";
import { listCommunityEventsServerSide } from "@/lib/server/community-event-service";
import { listAgencyEventsServerSide } from "@/lib/server/agency-community-event-service";
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

/**
 * First-name-only variant of `resolvePersonDisplayName`, for the Home
 * page's "Good afternoon, X!" greeting specifically (2026-09-16 owner QA:
 * "Good afternoon, quianalache!" reads like a username, not a person).
 * Reuses the exact same resolution chain (Member displayName -> staff
 * displayName -> email local-part) — no new data source, no schema change
 * — and takes just the first whitespace-separated token, so "Sarah
 * Johnson" greets as "Sarah" instead of the full name.
 *
 * Deliberately does NOT truncate further when the resolved value already
 * IS the email local-part (the final-fallback case: there is genuinely no
 * real name anywhere in the chain yet for this Person) — splitting an
 * email handle like "quianalache" wouldn't produce a first name, it would
 * just mangle a username. That's a real data-propagation gap (no Contact/
 * Member/staff record carries this Person's actual first name yet), not
 * something to guess around here; `resolvePersonDisplayName` itself is
 * untouched and still used as-is everywhere else (e.g. /gateway's "Welcome
 * back," which wants the fuller name, not a truncated one).
 */
export async function resolvePersonFirstName(
  personId: string,
  primaryEmail: string,
  memberships?: PersonMembership[]
): Promise<string> {
  const full = await resolvePersonDisplayName(
    personId,
    primaryEmail,
    memberships
  );
  const emailLocalPart = primaryEmail.split("@")[0]?.trim() ?? "";
  if (
    emailLocalPart &&
    full.trim().toLowerCase() === emailLocalPart.toLowerCase()
  ) {
    return full;
  }
  const firstToken = full.trim().split(/\s+/)[0];
  return firstToken || full;
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
        // Deliberately the platform-domain `/portal/{slug}` path, NOT
        // buildPortalHomeUrl's custom-domain-aware pretty URL: the
        // ls_member_session cookie /api/my/enter mints is only ever set
        // on the CURRENT (platform) domain, so redirecting straight to a
        // business's own custom domain here would leave the visitor
        // cookie-less there and bounce them to a login screen anyway.
        // Branded Space URLs (2026-09-16): uses the sub-account's
        // canonical slug rather than its raw id for the URL PATH — the
        // `subAccountId` QUERY PARAM stays the real id (that's what
        // /api/my/enter's own logic reads to resolve the bridge). The old
        // `/portal/{id}` form still resolves via PortalHomeView's own
        // redirect-to-canonical-slug handling, so this is never a broken
        // link even for a sub-account somehow still missing a slug.
        enterHref: `/api/my/enter?subAccountId=${sub.id}&next=${encodeURIComponent(`/portal/${sub.slug || sub.id}`)}`,
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
  /** Present only for a tenant Community — absent for an Agency-owned one.
   *  Mirrors `CommunityGroup.subAccountId`'s own "absent = agency" contract
   *  (types/community.ts) — never populate this with an agency id or any
   *  other stand-in value for an Agency community; that's exactly the
   *  "fake subAccountId" the Shared-First Architecture rules forbid. */
  subAccountId?: string;
  businessName: string;
  enterHref: string;
  pinKey: string;
}

/** Every tenant Community this Person belongs to, across every business
 *  (via their tenant Member links). See `listAgencyCommunitiesForPerson`
 *  for the Agency-scope sibling — kept separate rather than merged into
 *  one function since the identity fan-out source is genuinely different
 *  (tenant `PersonMembership[]` vs the single platform agency's roster),
 *  though both return the SAME `PersonCommunityItem` shape so callers
 *  (My Communities, the switcher) can combine the two lists directly. */
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

/**
 * Every Agency Community this Person has an ACTIVE roster membership in —
 * the Agency-scope sibling of `listCommunitiesForPerson`, added so "My
 * Communities" shows both without a separate Agency-only portal product
 * (Shared-First Architecture: one card model, scope-specific data source).
 * Unlike the tenant fan-out (one query per sub-account relationship), a
 * Person's Agency membership isn't indexed by a pre-known groupId, so this
 * lists the platform's own (single) agency's published groups and checks
 * membership per group — bounded and cheap in practice (a handful of
 * Agency-owned communities, not hundreds). No bridge/session-minting is
 * needed for `enterHref` — unlike a tenant Member, a Person IS already the
 * real identity `/my/community/[groupId]` authenticates with (see
 * agency-community-access.ts) — so it's the group's own `href` unchanged.
 */
export async function listAgencyCommunitiesForPerson(
  personId: string
): Promise<PersonCommunityItem[]> {
  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) return [];

  const [groups, businessName] = await Promise.all([
    listGroupsForAgency(agencyId),
    resolveBrandName(),
  ]);
  const published = groups.filter((g) => g.status === "published");

  const items = await Promise.all(
    published.map(async (group): Promise<PersonCommunityItem | null> => {
      const membership = await getAgencyMembershipForPerson(
        agencyId,
        group.id,
        personId
      );
      if (!membership || membership.status !== "active") return null;
      const href = `/my/community/${group.id}`;
      return {
        groupId: group.id,
        name: group.name,
        slug: group.slug,
        tagline: group.tagline,
        logoUrl: group.logoUrl ?? null,
        memberStatus: membership.status,
        role: "member",
        level: membership.level ?? 1,
        points: membership.points ?? 0,
        href,
        businessName,
        enterHref: href,
        pinKey: `community:agency:${agencyId}:${group.id}`,
      };
    })
  );
  return items.filter((i): i is PersonCommunityItem => i !== null);
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

export interface PersonUpcomingCommunityEventItem {
  key: string;
  eventId: string;
  groupId: string;
  title: string;
  startAt: Date;
  businessName: string;
  communityName: string;
  enterHref: string;
}

function eventStartMillis(value: unknown): number {
  const v = value as { toMillis?: () => number; seconds?: number } | null;
  if (typeof v?.toMillis === "function") return v.toMillis();
  return typeof v?.seconds === "number" ? v.seconds * 1000 : 0;
}

/**
 * Community Product Finish Pass (2026-09-19) — the next upcoming event per
 * Community this Person belongs to, across BOTH scopes, feeding the SAME
 * "Coming Up" home feed real appointments/renewals already use (see
 * `listComingUpForPerson`) rather than a separate widget. Takes the
 * already-resolved community lists (tenant `listCommunitiesForPerson` +
 * Agency `listAgencyCommunitiesForPerson`) so this never re-derives
 * membership itself — one shared shape (`PersonUpcomingCommunityEventItem`)
 * regardless of which scope a given Community happens to be. `enterHref`
 * needs no `/api/my/enter` bridge for an Agency event (same reasoning as
 * `listAgencyCommunitiesForPerson`'s own `enterHref`).
 */
export async function listUpcomingCommunityEventsForPerson(
  tenantCommunities: PersonCommunityItem[],
  agencyCommunities: PersonCommunityItem[],
  limit = 3
): Promise<PersonUpcomingCommunityEventItem[]> {
  const now = Date.now();

  const tenantItems = await Promise.all(
    tenantCommunities.map(
      async (c): Promise<PersonUpcomingCommunityEventItem | null> => {
        if (!c.subAccountId) return null;
        const events = await listCommunityEventsServerSide(
          c.subAccountId,
          c.groupId
        );
        const next = events.find(
          (e) => e.status !== "canceled" && eventStartMillis(e.startAt) > now
        );
        if (!next) return null;
        return {
          key: `event:${c.subAccountId}:${c.groupId}:${next.id}`,
          eventId: next.id,
          groupId: c.groupId,
          title: next.title,
          startAt: new Date(eventStartMillis(next.startAt)),
          businessName: c.businessName,
          communityName: c.name,
          enterHref: `/api/my/enter?subAccountId=${c.subAccountId}&next=${encodeURIComponent(`/c/${c.subAccountId}/${c.slug}/events/${next.id}`)}`,
        };
      }
    )
  );

  const agencyId =
    agencyCommunities.length > 0 ? await resolveFirstAgencyId() : null;
  const agencyItems = await Promise.all(
    agencyCommunities.map(
      async (c): Promise<PersonUpcomingCommunityEventItem | null> => {
        if (!agencyId) return null;
        const events = await listAgencyEventsServerSide(agencyId, c.groupId);
        const next = events.find(
          (e) => e.status !== "canceled" && eventStartMillis(e.startAt) > now
        );
        if (!next) return null;
        return {
          key: `event:agency:${agencyId}:${c.groupId}:${next.id}`,
          eventId: next.id,
          groupId: c.groupId,
          title: next.title,
          startAt: new Date(eventStartMillis(next.startAt)),
          businessName: c.businessName,
          communityName: c.name,
          enterHref: `/my/community/${c.groupId}/events/${next.id}`,
        };
      }
    )
  );

  return [...tenantItems, ...agencyItems]
    .filter((i): i is PersonUpcomingCommunityEventItem => i !== null)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
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
