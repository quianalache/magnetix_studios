import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { emitWorkflowEvent } from "@/lib/workflows/events";
import { findMemberByEmail } from "@/lib/community/member-account";
import { ensurePersonLinkForMember } from "@/lib/server/person-identity-service";
import { notifyCommunityAccessGranted } from "@/lib/server/notification-producers";
import {
  approveMembershipServerSide,
  getGroupById,
  isStaffEmail,
  listGroupsForSubAccount,
  setMembershipStatusServerSide,
} from "@/lib/server/community-service";
import {
  enrollInStandaloneCourseServerSide,
  getStandaloneCourse,
  listStandaloneCourses,
  revokeLinkedCommunityAccessServerSide,
} from "@/lib/server/standalone-course-service";
import { hasPaidStandaloneCourse } from "@/lib/server/standalone-course-purchase-service";
import { hasActiveComplimentaryAccess } from "@/lib/standalone-courses/complimentary";
import { getCourseOffer, listCourseOffers } from "@/lib/server/course-offer-service";
import { enrollAllCoursesForFreeOfferServerSide } from "@/lib/server/course-offer-purchase-service";
import { recordContactActivity } from "@/lib/server/contact-activity";
import { resolveAuthorNames } from "@/lib/server/contact-route-guard";
import { parseAccessKey } from "@/lib/segmentation/access-index";
import { toEpochMs } from "@/lib/segmentation/eval-condition-group";
import type { Contact } from "@/types/contacts";
import type {
  AccessCatalog,
  AccessCatalogItem,
  AccessSourceLabel,
  ContactAccessSummary,
  ContactAccessView,
  ContactPurchaseView,
} from "@/types/contact-access";

/**
 * Contact profile → Purchases & Access (Contacts redesign, 2026-09-25).
 *
 * READ: projects the existing entitlement records for the contact's member
 * identity — course-offer / standalone-course / community purchases,
 * standalone-course enrollments, community memberships (+ their access
 * sources) — into one view. Nothing is copied or cached.
 *
 * GRANT / REVOKE (complimentary access), reusing the existing services and
 * entitlement safeguards — never creating a purchase or payment record:
 *
 *   - Community group (free, approval-gated or PAID): an ACTIVE membership
 *     is exactly what community access means (member-context.ts), so a
 *     staff grant creates/reactivates the membership with `origin: "staff"`
 *     and records a `staff:contact-grant` access source (kind "staff") that
 *     remembers the membership's prior state. Revoking only ever removes a
 *     membership that has no independent reason to exist: a paid group
 *     purchase or an active linked-Product source keeps access (origin is
 *     handed back to that reason) — see `revokeComplimentaryAccessForContact`.
 *   - Paid standalone course (owner-approved 2026-09-25): the enrollment
 *     gets an explicit `complimentaryAccess` grant (see
 *     StandaloneEnrollment) which the classroom guard accepts in place of a
 *     paid purchase — no purchase record, no payment, no price change.
 *     Revoking flips only that grant; a paid purchase for the same course
 *     keeps access (and its linked communities) exactly as before.
 *   - Open standalone course / free Course Offer: enrolls via the existing
 *     enrollment paths (anyone can already enroll in these, so there is
 *     nothing to revoke).
 *   - Paid Course Offer: not grantable as a bundle — an offer also carries
 *     booking bundles, project templates and upsells that are tied to a
 *     purchase. Its courses can each be granted individually instead.
 *
 * Identity: a contact reaches access through its Member (`members/{id}
 * .contactId`). A contact with no member gets one created ONLY at grant
 * time, linked to THIS contact explicitly — never by email-matching some
 * other contact (unlike `ensureMember`), and never by adopting an existing
 * member that belongs to a different contact.
 */

export class ContactAccessError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const STAFF_SOURCE_ID = "staff:contact-grant";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function iso(v: unknown): string | null {
  const ms = toEpochMs(v);
  return ms === null ? null : new Date(ms).toISOString();
}

function membersCol(subAccountId: string) {
  return getAdminDb().collection(`subAccounts/${subAccountId}/members`);
}

function membershipRef(subAccountId: string, groupId: string, memberId: string) {
  return getAdminDb().doc(
    `subAccounts/${subAccountId}/communityGroups/${groupId}/memberships/${memberId}`,
  );
}

function staffSourceRef(subAccountId: string, groupId: string, memberId: string) {
  return membershipRef(subAccountId, groupId, memberId)
    .collection("accessSources")
    .doc(STAFF_SOURCE_ID);
}

/* ------------------------------- Members -------------------------------- */

interface LinkedMember {
  id: string;
  email: string;
  status: string;
  displayName: string | null;
  personId?: string | null;
}

export async function membersForContact(
  subAccountId: string,
  contactId: string,
): Promise<LinkedMember[]> {
  const snap = await membersCol(subAccountId).where("contactId", "==", contactId).get();
  return snap.docs.map((d) => ({
    id: d.id,
    email: (d.get("email") as string) ?? "",
    status: (d.get("status") as string) ?? "active",
    displayName: (d.get("displayName") as string | null) ?? null,
    personId: (d.get("personId") as string | null | undefined) ?? null,
  }));
}

/**
 * The single member identity to grant against. Creates one (linked to this
 * contact) only when none exists and the email isn't already some other
 * identity's; otherwise explains what needs resolving first.
 */
async function memberForGrant(contact: Contact): Promise<LinkedMember> {
  const linked = await membersForContact(contact.subAccountId, contact.id);
  const email = (contact.email ?? "").trim().toLowerCase();
  if (linked.length > 1) {
    const byEmail = linked.find((m) => m.email === email);
    if (!byEmail) {
      throw new ContactAccessError(
        "This contact is linked to more than one member account. Merge or unlink the extra accounts before granting access.",
        409,
      );
    }
    return byEmail;
  }
  if (linked.length === 1) {
    if (linked[0].status !== "active") {
      throw new ContactAccessError(
        "This contact's member account is deactivated, so access can't be granted.",
        409,
      );
    }
    return linked[0];
  }

  if (!EMAIL_RE.test(email)) {
    throw new ContactAccessError(
      "Add an email address to this contact first — member accounts are identified by email.",
      400,
    );
  }
  const existing = await findMemberByEmail(contact.subAccountId, email);
  if (existing) {
    throw new ContactAccessError(
      existing.contactId
        ? "A member account with this email already belongs to a different contact. Merge the duplicate contacts first, then grant access."
        : "A member account with this email exists but isn't linked to any contact. Ask your developer to link it rather than creating a duplicate.",
      409,
    );
  }

  // Same member doc shape ensureMember writes — but linked to THIS contact.
  const subSnap = await getAdminDb().doc(`subAccounts/${contact.subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? contact.agencyId ?? "";
  const ref = await membersCol(contact.subAccountId).add({
    subAccountId: contact.subAccountId,
    agencyId,
    email,
    displayName: contact.name?.trim() || null,
    avatarUrl: null,
    bio: "",
    phone: contact.phone?.trim() || null,
    address: contact.address?.trim() || null,
    contactId: contact.id,
    passwordHash: null,
    passwordUpdatedAt: null,
    status: "active",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastSeenAt: null,
  });
  // MyMagnetix identity link — the same lazy, idempotent step every new
  // Member gets at creation (person-identity-service.ts).
  const personId = await ensurePersonLinkForMember(contact.subAccountId, {
    id: ref.id,
    email,
    personId: null,
  }).catch(() => null);
  return {
    id: ref.id,
    email,
    status: "active",
    displayName: contact.name?.trim() || null,
    personId: personId ?? null,
  };
}

/* ------------------------------- Catalog -------------------------------- */

export async function getAccessCatalog(subAccountId: string): Promise<AccessCatalog> {
  const [groups, courses, offers] = await Promise.all([
    listGroupsForSubAccount(subAccountId).catch(() => []),
    listStandaloneCourses(subAccountId).catch(() => []),
    listCourseOffers(subAccountId).catch(() => []),
  ]);

  const communities: AccessCatalogItem[] = groups
    .filter((g) => g.ownerScope !== "agency")
    .map((g) => ({
      key: `community:${g.id}`,
      kind: "community" as const,
      id: g.id,
      name: g.name || "Untitled community",
      published: g.status === "published",
      paid: g.access === "paid",
      grantable: true,
      grantBlockedReason: null,
    }));

  const courseItems: AccessCatalogItem[] = courses.map((c) => {
    // Price never restricts eligibility — a paid course is granted as
    // complimentary access (no purchase, no payment).
    const paid = c.access === "purchase";
    const reason = !c.published ? "Publish this course before enrolling people." : null;
    return {
      key: `course:${c.id}`,
      kind: "course" as const,
      id: c.id,
      name: c.title || "Untitled course",
      published: !!c.published,
      paid,
      grantable: !reason,
      grantBlockedReason: reason,
    };
  });

  const offerItems: AccessCatalogItem[] = offers.map((o) => {
    const paid = o.type !== "free";
    const reason = paid
      ? "Paid offers bundle purchase-only extras (bookings, projects, upsells). Grant the courses it includes individually instead."
      : o.visibility !== "published"
        ? "Publish this offer before granting it."
        : null;
    return {
      key: `offer:${o.id}`,
      kind: "offer" as const,
      id: o.id,
      name: o.title || "Untitled offer",
      published: o.visibility === "published",
      paid,
      grantable: !reason,
      grantBlockedReason: reason,
    };
  });

  return { communities, courses: courseItems, offers: offerItems };
}

/* -------------------------------- Summary ------------------------------- */

function purchaseScopeFromPath(
  path: string,
  subAccountId: string,
): { scope: "offer" | "course" | "community"; parentId: string } | null {
  const parts = path.split("/");
  // subAccounts/{sa}/{collection}/{parentId}/purchases/{purchaseId}
  if (parts.length !== 6 || parts[0] !== "subAccounts" || parts[1] !== subAccountId) {
    return null;
  }
  if (parts[4] !== "purchases") return null;
  if (parts[2] === "courseOffers") return { scope: "offer", parentId: parts[3] };
  if (parts[2] === "standaloneCourses") return { scope: "course", parentId: parts[3] };
  if (parts[2] === "communityGroups") return { scope: "community", parentId: parts[3] };
  return null;
}

export async function getContactAccessSummary(
  contact: Contact,
): Promise<ContactAccessSummary> {
  const subAccountId = contact.subAccountId;
  const members = await membersForContact(subAccountId, contact.id);
  if (members.length === 0) {
    return { members: [], purchases: [], access: [] };
  }
  const memberIds = members.map((m) => m.id).slice(0, 30);
  const db = getAdminDb();

  const [groups, courses, offers, purchaseSnap] = await Promise.all([
    listGroupsForSubAccount(subAccountId).catch(() => []),
    listStandaloneCourses(subAccountId).catch(() => []),
    listCourseOffers(subAccountId).catch(() => []),
    // One query per member identity, shaped to hit the EXISTING composite
    // index purchases(subAccountId, memberId, status) exactly: equality,
    // equality, `in` over every purchase status any purchase type uses.
    Promise.all(
      memberIds.map((memberId) =>
        db
          .collectionGroup("purchases")
          .where("subAccountId", "==", subAccountId)
          .where("memberId", "==", memberId)
          .where("status", "in", ["pending", "paid", "canceled", "void"])
          .get(),
      ),
    ),
  ]);
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const offerById = new Map(offers.map((o) => [o.id, o]));

  /* Purchases */
  const purchases: ContactPurchaseView[] = [];
  const paidGroupIds = new Set<string>();
  const paidCourseIds = new Set<string>();
  const paidOfferIds = new Set<string>();
  for (const d of purchaseSnap.flatMap((snap) => snap.docs)) {
    const where = purchaseScopeFromPath(d.ref.path, subAccountId);
    if (!where) continue;
    const p = d.data();
    const status = (p.status as string) ?? "pending";
    let targetId = where.parentId;
    let targetName = "";
    if (where.scope === "offer") {
      targetName = offerById.get(targetId)?.title ?? "Offer";
      if (status === "paid") paidOfferIds.add(targetId);
    } else if (where.scope === "course") {
      targetName = courseById.get(targetId)?.title ?? "Course";
      if (status === "paid") paidCourseIds.add(targetId);
    } else {
      const group = groupById.get(where.parentId);
      if (p.scope === "course" && typeof p.targetId === "string") {
        targetId = p.targetId;
        targetName = `${group?.name ?? "Community"} course`;
      } else {
        targetName = group?.name ?? "Community";
        if (status === "paid") paidGroupIds.add(where.parentId);
      }
    }
    const offerMarker = where.scope === "course" && !!p.offerId && (p.amountCents ?? 0) === 0;
    purchases.push({
      id: d.id,
      scope: where.scope,
      targetId,
      targetName,
      status,
      amountCents: typeof p.amountCents === "number" ? p.amountCents : 0,
      currency: (p.currency as string) || "USD",
      method: (p.method as string) || "paypal",
      offerMarker,
      markedPaidByStaff: status === "paid" && !!p.grantedByUid,
      requestedAt: iso(p.requestedAt),
      paidAt: iso(p.paidAt),
    });
  }
  purchases.sort(
    (a, b) =>
      (toEpochMs(b.paidAt ?? b.requestedAt) ?? 0) -
      (toEpochMs(a.paidAt ?? a.requestedAt) ?? 0),
  );

  /* Community memberships (one doc read per group × member). */
  const access: ContactAccessView[] = [];
  const membershipRefs = groups
    .filter((g) => g.ownerScope !== "agency")
    .flatMap((g) => memberIds.map((mid) => ({ g, mid, ref: membershipRef(subAccountId, g.id, mid) })));
  const membershipSnaps = membershipRefs.length
    ? await db.getAll(...membershipRefs.map((r) => r.ref))
    : [];
  const existingMemberships = membershipRefs
    .map((r, i) => ({ ...r, snap: membershipSnaps[i] }))
    .filter((r) => r.snap.exists);

  const sourceSnaps = await Promise.all(
    existingMemberships.map((r) =>
      r.ref.collection("accessSources").get().catch(() => null),
    ),
  );
  const grantorUids: string[] = [];
  sourceSnaps.forEach((s) =>
    s?.docs.forEach((d) => {
      if (d.id === STAFF_SOURCE_ID && d.get("status") === "active") {
        grantorUids.push(d.get("grantedByUid") as string);
      }
    }),
  );
  const grantors = await resolveAuthorNames(subAccountId, grantorUids);

  existingMemberships.forEach((r, i) => {
    const m = r.snap.data() ?? {};
    const status = (m.status as string) ?? "active";
    if (status === "removed") return;
    const sources: AccessSourceLabel[] = [];
    const docs = sourceSnaps[i]?.docs ?? [];
    const staff = docs.find((d) => d.id === STAFF_SOURCE_ID && d.get("status") === "active");
    const activeProduct = docs.some((d) => d.get("kind") === "product" && d.get("status") === "active");
    if (paidGroupIds.has(r.g.id) || m.origin === "purchase") sources.push("purchase");
    if (activeProduct) sources.push("product");
    if (staff) sources.push("complimentary");
    else if (m.origin === "staff") sources.push("staff");
    if (m.origin === "import") sources.push("imported");
    if ((m.origin === "manual" || !m.origin) && sources.length === 0) sources.push("joined");

    const revocable = !!staff && status === "active";
    let managedNote: string | null = null;
    if (!revocable) {
      if (sources.includes("purchase")) managedNote = "Paid access — managed by the purchase.";
      else if (sources.includes("product")) managedNote = "Included with a product purchase.";
      else if (status === "banned") managedNote = "Banned — manage this in the community's Members page.";
      else managedNote = "Manage this membership in the community's Members page.";
    }
    const grantor = staff ? grantors.get(staff.get("grantedByUid") as string) : null;
    access.push({
      key: `community:${r.g.id}`,
      kind: "community",
      targetId: r.g.id,
      name: r.g.name || "Community",
      status,
      sources,
      since: iso(m.joinedAt),
      complimentary: staff
        ? { grantedAt: iso(staff.get("grantedAt")), grantedByName: grantor?.name ?? null }
        : null,
      revocable,
      managedNote,
    });
  });

  /* Standalone course enrollments. */
  const enrollmentRefs = courses.flatMap((c) =>
    memberIds.map((mid) => ({
      c,
      ref: db.doc(`subAccounts/${subAccountId}/standaloneCourses/${c.id}/enrollments/${mid}`),
    })),
  );
  const enrollmentSnaps = enrollmentRefs.length
    ? await db.getAll(...enrollmentRefs.map((r) => r.ref))
    : [];
  const courseGrantors = await resolveAuthorNames(
    subAccountId,
    enrollmentSnaps
      .filter((s) => s.exists && hasActiveComplimentaryAccess(s.data()))
      .map((s) => s.get("complimentaryAccess.grantedByUid") as string),
  );
  enrollmentRefs.forEach((r, i) => {
    const snap = enrollmentSnaps[i];
    if (!snap.exists) return;
    const e = snap.data() ?? {};
    const comp = hasActiveComplimentaryAccess(e) ? e.complimentaryAccess : null;
    const expiresAt = toEpochMs(e.accessExpiresAt);
    // A complimentary grant isn't subject to a purchase-derived access
    // window (the classroom guard accepts it first).
    const expired = !comp && expiresAt !== null && expiresAt <= Date.now();
    const paid = r.c.access === "purchase";
    const purchased = paidCourseIds.has(r.c.id);
    const sources: AccessSourceLabel[] = [];
    if (paid && purchased) sources.push("purchase");
    if (!paid) sources.push("free");
    if (comp) sources.push("complimentary");
    const revokedComp = !comp && e.complimentaryAccess?.status === "revoked";
    access.push({
      key: `course:${r.c.id}`,
      kind: "course",
      targetId: r.c.id,
      name: r.c.title || "Course",
      status: expired
        ? "expired"
        : paid && !purchased && !comp
          ? "locked"
          : ((e.status as string) ?? "enrolled"),
      sources,
      since: iso(e.enrolledAt),
      complimentary: comp
        ? {
            grantedAt: iso(comp.grantedAt),
            grantedByName: courseGrantors.get(comp.grantedByUid as string)?.name ?? null,
          }
        : null,
      revocable: !!comp,
      managedNote: comp
        ? null
        : paid
          ? purchased
            ? "Access comes from a purchase."
            : revokedComp
              ? "Complimentary access was revoked — the lessons are locked (progress is kept)."
              : "Enrolled, but this paid course needs a purchase or a complimentary grant before the lessons unlock."
          : "Open course — any member can access it.",
    });
  });

  /* Paid offers. */
  for (const offerId of paidOfferIds) {
    access.push({
      key: `offer:${offerId}`,
      kind: "offer",
      targetId: offerId,
      name: offerById.get(offerId)?.title ?? "Offer",
      status: "active",
      sources: ["purchase"],
      since: purchases.find((p) => p.scope === "offer" && p.targetId === offerId)?.paidAt ?? null,
      complimentary: null,
      revocable: false,
      managedNote: "Purchased offer — subscriptions and access windows are managed by the purchase.",
    });
  }

  return {
    members: members.map((m) => ({ id: m.id, email: m.email, status: m.status })),
    purchases,
    access,
  };
}

/* --------------------------------- Grant -------------------------------- */

export type GrantOutcome =
  | { status: "granted"; message: string }
  | { status: "already"; message: string };

export async function grantAccessForContact(opts: {
  contact: Contact;
  key: string;
  staffUid: string;
}): Promise<GrantOutcome> {
  const parsed = parseAccessKey(opts.key);
  if (!parsed) throw new ContactAccessError("Choose what to grant.", 400);
  const catalog = await getAccessCatalog(opts.contact.subAccountId);
  const item = [...catalog.communities, ...catalog.courses, ...catalog.offers].find(
    (i) => i.key === opts.key,
  );
  if (!item) throw new ContactAccessError("That item no longer exists.", 404);
  if (!item.grantable) {
    throw new ContactAccessError(item.grantBlockedReason ?? "This can't be granted here.", 400);
  }

  const member = await memberForGrant(opts.contact);
  if (parsed.kind === "community") {
    return grantComplimentaryCommunityAccess({
      contact: opts.contact,
      groupId: parsed.id,
      memberId: member.id,
      memberEmail: member.email,
      staffUid: opts.staffUid,
    });
  }

  const subSnap = await getAdminDb().doc(`subAccounts/${opts.contact.subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? opts.contact.agencyId ?? "";

  if (parsed.kind === "course") {
    const course = await getStandaloneCourse(opts.contact.subAccountId, parsed.id);
    if (!course) throw new ContactAccessError("That course no longer exists.", 404);
    // Owner-approved (2026-09-25): paid courses are granted as explicit
    // complimentary access on the enrollment — no purchase, no payment.
    if (course.access === "purchase") {
      return grantComplimentaryCourseAccess({
        contact: opts.contact,
        agencyId,
        courseId: course.id,
        courseTitle: course.title,
        memberId: member.id,
        staffUid: opts.staffUid,
      });
    }
    const existing = await getAdminDb()
      .doc(`subAccounts/${opts.contact.subAccountId}/standaloneCourses/${parsed.id}/enrollments/${member.id}`)
      .get();
    if (existing.exists) {
      return { status: "already", message: `Already enrolled in "${course.title}".` };
    }
    await enrollInStandaloneCourseServerSide({
      subAccountId: opts.contact.subAccountId,
      agencyId,
      courseId: parsed.id,
      memberId: member.id,
      grantedByUid: opts.staffUid,
    });
    return { status: "granted", message: `Enrolled in "${course.title}".` };
  }

  // Free Course Offer — the existing free-offer path (course enrollment +
  // booking-bundle email + project templates), same as a public free signup.
  const offer = await getCourseOffer(opts.contact.subAccountId, parsed.id);
  if (!offer || offer.type !== "free") {
    throw new ContactAccessError("Only free offers can be granted from Contacts.", 400);
  }
  const enrollSnaps = offer.courseIds.length
    ? await getAdminDb().getAll(
        ...offer.courseIds.map((cid) =>
          getAdminDb().doc(
            `subAccounts/${opts.contact.subAccountId}/standaloneCourses/${cid}/enrollments/${member.id}`,
          ),
        ),
      )
    : [];
  if (offer.courseIds.length > 0 && enrollSnaps.every((s) => s.exists)) {
    return { status: "already", message: `Already has everything in "${offer.title}".` };
  }
  await enrollAllCoursesForFreeOfferServerSide({
    subAccountId: opts.contact.subAccountId,
    agencyId,
    courseIds: offer.courseIds,
    memberId: member.id,
    offerTitle: offer.title,
    booking: offer.booking,
    offerId: offer.id,
    projectTemplates: offer.projectTemplates ?? [],
  });
  return { status: "granted", message: `Granted "${offer.title}".` };
}

async function grantComplimentaryCommunityAccess(opts: {
  contact: Contact;
  groupId: string;
  memberId: string;
  memberEmail: string;
  staffUid: string;
}): Promise<GrantOutcome> {
  const { contact, groupId, memberId } = opts;
  const subAccountId = contact.subAccountId;
  const group = await getGroupById(subAccountId, groupId);
  if (!group || group.ownerScope === "agency") {
    throw new ContactAccessError("That community no longer exists.", 404);
  }
  const db = getAdminDb();
  const memRef = membershipRef(subAccountId, groupId, memberId);
  const existing = await memRef.get();
  const prior = existing.exists ? ((existing.get("status") as string) ?? "active") : "none";
  const priorOrigin = existing.exists ? ((existing.get("origin") as string | undefined) ?? null) : null;

  if (prior === "active") {
    return { status: "already", message: `Already has access to "${group.name}".` };
  }
  if (prior === "banned") {
    throw new ContactAccessError(
      `This person is banned from "${group.name}". Unban them in the community's Members page first.`,
      409,
    );
  }

  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  const agencyId = (subSnap.data()?.agencyId as string) ?? contact.agencyId ?? "";

  if (prior === "none") {
    const staff = !!opts.memberEmail && (await isStaffEmail(subAccountId, opts.memberEmail));
    try {
      await memRef.create({
        subAccountId,
        agencyId,
        groupId,
        memberId,
        role: staff ? "moderator" : "member",
        status: "active",
        points: 0,
        level: 1,
        joinedAt: FieldValue.serverTimestamp(),
        tierId: null,
        origin: "staff",
      });
    } catch (err) {
      const code = (err as { code?: unknown })?.code;
      if (code === 6 || code === "already-exists") {
        return { status: "already", message: `Already has access to "${group.name}".` };
      }
      throw err;
    }
    await db
      .doc(`subAccounts/${subAccountId}/communityGroups/${groupId}`)
      .update({ memberCount: FieldValue.increment(1) });
    void emitWebhookEvent({
      subAccountId,
      agencyId,
      mode: "live",
      type: "community.member.joined",
      payload: { groupId, memberId, via: "staff-grant" },
    });
    emitWorkflowEvent({
      eventType: "community.member.joined",
      eventId: `${groupId}:${memberId}:joined`,
      agencyId,
      subAccountId,
      contactId: contact.id,
      source: "community",
      payload: { groupId, memberId },
    });
    await notifyCommunityAccessGranted({ subAccountId, groupId, memberId }).catch((err) =>
      console.error("[contact-access] notification failed", err),
    );
    await recordContactActivity({
      subAccountId,
      contactId: contact.id,
      type: "community_access_granted",
      content: `Granted complimentary access to the "${group.name}" community`,
      meta: { groupId, memberId, via: "complimentary" },
      createdBy: opts.staffUid,
    });
  } else if (prior === "pending") {
    await approveMembershipServerSide({
      subAccountId,
      groupId,
      memberId,
      agencyId,
      complimentaryGrantByUid: opts.staffUid,
    });
    await memRef.update({ origin: "staff" });
  } else {
    // "removed" → reactivate through the existing status path (stamps
    // origin "staff", fixes memberCount, writes the activity row).
    await setMembershipStatusServerSide({
      subAccountId,
      groupId,
      memberId,
      status: "active",
      actor: "complimentary_granted",
      actorUid: opts.staffUid,
    });
  }

  await staffSourceRef(subAccountId, groupId, memberId).set({
    kind: "staff",
    refId: opts.staffUid,
    status: "active",
    grantedAt: FieldValue.serverTimestamp(),
    grantedByUid: opts.staffUid,
    revokedAt: null,
    revokedByUid: null,
    priorStatus: prior,
    priorOrigin,
    contactId: contact.id,
  });
  return { status: "granted", message: `Granted access to "${group.name}".` };
}

function enrollmentRef(subAccountId: string, courseId: string, memberId: string) {
  return getAdminDb().doc(
    `subAccounts/${subAccountId}/standaloneCourses/${courseId}/enrollments/${memberId}`,
  );
}

/**
 * Complimentary access to a PAID standalone course. Enrolls through the
 * existing path when needed (which also grants the course's linked
 * communities, exactly as a purchase would), then stamps an explicit
 * `complimentaryAccess` grant on the enrollment — the thing the classroom
 * guard accepts in place of a paid purchase. Writes no purchase, charges
 * nothing, touches no price, and leaves any existing purchase untouched.
 */
async function grantComplimentaryCourseAccess(opts: {
  contact: Contact;
  agencyId: string;
  courseId: string;
  courseTitle: string;
  memberId: string;
  staffUid: string;
}): Promise<GrantOutcome> {
  const { contact, courseId, memberId } = opts;
  const subAccountId = contact.subAccountId;
  const ref = enrollmentRef(subAccountId, courseId, memberId);
  const before = await ref.get();
  if (before.exists && hasActiveComplimentaryAccess(before.data())) {
    return { status: "already", message: `Already has complimentary access to "${opts.courseTitle}".` };
  }

  // Creates the enrollment if missing (course.enrolled events +
  // notification) and (re)grants linked communities either way — both
  // idempotent. Its own "enrolled" activity row is suppressed in favour of
  // the more specific row below.
  await enrollInStandaloneCourseServerSide({
    subAccountId,
    agencyId: opts.agencyId,
    courseId,
    memberId,
    grantedByUid: opts.staffUid,
    recordActivity: false,
  });

  const granted = await getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new ContactAccessError("Enrollment couldn't be created — try again.", 500);
    if (hasActiveComplimentaryAccess(snap.data())) return false;
    tx.update(ref, {
      complimentaryAccess: {
        status: "active",
        grantedByUid: opts.staffUid,
        grantedAt: FieldValue.serverTimestamp(),
        revokedByUid: null,
        revokedAt: null,
        contactId: contact.id,
      },
    });
    return true;
  });
  if (!granted) {
    return { status: "already", message: `Already has complimentary access to "${opts.courseTitle}".` };
  }

  const alsoPaid = await hasPaidStandaloneCourse(subAccountId, courseId, memberId);
  await recordContactActivity({
    subAccountId,
    contactId: contact.id,
    type: "course_access_granted",
    content: `Granted complimentary access to the "${opts.courseTitle}" course`,
    meta: { courseId, memberId, via: "complimentary", alsoPaid },
    createdBy: opts.staffUid,
  });
  return {
    status: "granted",
    message: alsoPaid
      ? `Granted complimentary access to "${opts.courseTitle}". They also have paid access, which is unchanged.`
      : `Granted complimentary access to "${opts.courseTitle}".`,
  };
}

/**
 * Revoke ONLY the complimentary grant on a paid course. A paid purchase for
 * the same course keeps the member's access — and the linked communities it
 * justifies — exactly as it was. Without one, the enrollment stays (progress
 * kept) but the lessons lock, and the course's linked-community source is
 * revoked through the existing reconcile path (which never removes a
 * membership that has any other reason to exist).
 */
async function revokeComplimentaryCourseAccess(opts: {
  contact: Contact;
  courseId: string;
  staffUid: string;
}): Promise<{ message: string; accessRetained: boolean }> {
  const { contact, courseId } = opts;
  const subAccountId = contact.subAccountId;
  const members = await membersForContact(subAccountId, contact.id);
  const snaps = members.length
    ? await getAdminDb().getAll(...members.map((m) => enrollmentRef(subAccountId, courseId, m.id)))
    : [];
  const hit = snaps.find((s) => s.exists && hasActiveComplimentaryAccess(s.data()));
  if (!hit) {
    throw new ContactAccessError(
      "There's no complimentary grant to revoke here — this access comes from somewhere else.",
      409,
    );
  }
  const memberId = hit.id;
  const revoked = await getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(hit.ref);
    if (!snap.exists || !hasActiveComplimentaryAccess(snap.data())) return false;
    tx.update(hit.ref, {
      "complimentaryAccess.status": "revoked",
      "complimentaryAccess.revokedAt": FieldValue.serverTimestamp(),
      "complimentaryAccess.revokedByUid": opts.staffUid,
    });
    return true;
  });
  const course = await getStandaloneCourse(subAccountId, courseId);
  const title = course?.title ?? "course";
  if (!revoked) {
    return { message: `Complimentary access to "${title}" was already revoked.`, accessRetained: false };
  }

  const paid = await hasPaidStandaloneCourse(subAccountId, courseId, memberId);
  if (!paid) {
    // The grant is now revoked, so this proceeds (it skips while a grant
    // is active) — and still only ever removes Product-only memberships.
    await revokeLinkedCommunityAccessServerSide({ subAccountId, courseId, memberId });
  }
  await recordContactActivity({
    subAccountId,
    contactId: contact.id,
    type: "course_access_revoked",
    content: paid
      ? `Complimentary access to the "${title}" course removed — their paid purchase still gives them access`
      : `Complimentary access to the "${title}" course revoked`,
    meta: { courseId, memberId, via: "complimentary_revoked", accessRetained: paid },
    createdBy: opts.staffUid,
  });
  return {
    message: paid
      ? `Complimentary grant removed. They keep access through their paid purchase.`
      : `Access to "${title}" revoked. Their progress is kept if access is granted again.`,
    accessRetained: paid,
  };
}

/* --------------------------------- Revoke ------------------------------- */

export async function revokeComplimentaryAccessForContact(opts: {
  contact: Contact;
  key: string;
  staffUid: string;
}): Promise<{ message: string; accessRetained: boolean }> {
  const parsed = parseAccessKey(opts.key);
  if (parsed?.kind === "course") {
    return revokeComplimentaryCourseAccess({
      contact: opts.contact,
      courseId: parsed.id,
      staffUid: opts.staffUid,
    });
  }
  if (!parsed || parsed.kind !== "community") {
    throw new ContactAccessError(
      "Only complimentary course or community access can be revoked from Contacts.",
      400,
    );
  }
  const { contact } = opts;
  const subAccountId = contact.subAccountId;
  const groupId = parsed.id;
  const members = await membersForContact(subAccountId, contact.id);
  const db = getAdminDb();

  // Find the member whose membership carries an active complimentary grant.
  let memberId: string | null = null;
  for (const m of members) {
    const src = await staffSourceRef(subAccountId, groupId, m.id).get();
    if (src.exists && src.get("status") === "active") {
      memberId = m.id;
      break;
    }
  }
  if (!memberId) {
    throw new ContactAccessError(
      "There's no complimentary grant to revoke here — this access comes from somewhere else.",
      409,
    );
  }
  const group = await getGroupById(subAccountId, groupId);
  const groupName = group?.name ?? "community";
  const memRef = membershipRef(subAccountId, groupId, memberId);

  await staffSourceRef(subAccountId, groupId, memberId).set(
    {
      status: "revoked",
      revokedAt: FieldValue.serverTimestamp(),
      revokedByUid: opts.staffUid,
    },
    { merge: true },
  );

  const memSnap = await memRef.get();
  if (!memSnap.exists || memSnap.get("status") !== "active") {
    return { message: `Complimentary grant to "${groupName}" removed.`, accessRetained: false };
  }

  // Independent reasons that must survive this revoke.
  const [paidPurchase, activeProduct] = await Promise.all([
    db
      .collection(`subAccounts/${subAccountId}/communityGroups/${groupId}/purchases`)
      .where("memberId", "==", memberId)
      .where("status", "==", "paid")
      .get(),
    memRef
      .collection("accessSources")
      .where("kind", "==", "product")
      .where("status", "==", "active")
      .limit(1)
      .get(),
  ]);
  const paidGroup = paidPurchase.docs.some((d) => (d.get("scope") ?? "group") === "group");

  if (paidGroup || !activeProduct.empty) {
    const origin = paidGroup ? "purchase" : "product";
    await memRef.update({ origin });
    await recordContactActivity({
      subAccountId,
      contactId: contact.id,
      type: "community_access_revoked",
      content: `Complimentary access to the "${groupName}" community removed — ${
        paidGroup ? "their paid purchase" : "a product they bought"
      } still gives them access`,
      meta: { groupId, memberId, via: "complimentary_revoked", accessRetained: true },
      createdBy: opts.staffUid,
    });
    return {
      message: `Complimentary grant removed. They keep access through ${
        paidGroup ? "their paid purchase" : "a product they bought"
      }.`,
      accessRetained: true,
    };
  }

  await setMembershipStatusServerSide({
    subAccountId,
    groupId,
    memberId,
    status: "removed",
    actor: "complimentary_revoked",
    actorUid: opts.staffUid,
  });
  return { message: `Access to "${groupName}" revoked.`, accessRetained: false };
}
