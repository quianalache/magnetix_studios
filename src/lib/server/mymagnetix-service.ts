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
export async function listPersonMemberships(personId: string): Promise<PersonMembership[]> {
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
  memberships?: PersonMembership[],
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
}

/** The businesses this Person has a relationship with — "Your Spaces." */
export async function listSpacesForPerson(memberships: PersonMembership[]): Promise<PersonSpace[]> {
  const spaces = await Promise.all(
    memberships.map(async (m): Promise<PersonSpace | null> => {
      const subSnap = await getAdminDb().doc(`subAccounts/${m.subAccountId}`).get();
      if (!subSnap.exists) return null;
      const sub = { id: subSnap.id, ...(subSnap.data() as Omit<SubAccountDoc, "id">) };
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
      };
    }),
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
export async function listCoursesForPerson(memberships: PersonMembership[]): Promise<PersonCourseItem[]> {
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
        }),
      );
    }),
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
export async function listCommunitiesForPerson(memberships: PersonMembership[]): Promise<PersonCommunityItem[]> {
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
        }),
      );
    }),
  );
  return items.flat();
}

export interface PersonUpcomingItem extends PortalBooking {
  subAccountId: string;
  businessName: string;
  enterHref: string;
}

/** Next few real scheduled appointments, across every business — "Coming Up." */
export async function listComingUpForPerson(memberships: PersonMembership[], limit = 5): Promise<PersonUpcomingItem[]> {
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
        }),
      );
    }),
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
export async function listAttentionForPerson(memberships: PersonMembership[]): Promise<AttentionItem[]> {
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
    }),
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
export async function listPaymentsForPerson(memberships: PersonMembership[]): Promise<UpcomingPayment[]> {
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
            opts,
          );
          if (subscription.status !== "active" && subscription.status !== "trialing") continue;
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
    }),
  );

  return perMember.flat().sort((a, b) => a.renewsAt.getTime() - b.renewsAt.getTime());
}

// ── Person-scoped preferences (pinning) ─────────────────────────────────
// Stored under `people/{personId}/pins/{pinKey}` — a private preference
// about how THIS person wants their own index sorted, never written onto
// any tenant-owned Course/Community doc.

export async function listPinnedKeys(personId: string): Promise<Set<string>> {
  const snap = await getAdminDb().collection(`people/${personId}/pins`).get();
  return new Set(snap.docs.map((d) => d.id));
}

export async function setPinned(personId: string, pinKey: string, pinned: boolean): Promise<void> {
  const ref = getAdminDb().doc(`people/${personId}/pins/${pinKey}`);
  if (pinned) {
    await ref.set({ pinnedAt: new Date() });
  } else {
    await ref.delete();
  }
}
