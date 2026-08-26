import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { notifyCommunityAccessGranted } from "@/lib/server/notification-producers";
import {
  ABOUT_MAX_CHARS,
  GUIDELINES_MAX_CHARS,
  SIDEBAR_CARDS_MAX,
  SIDEBAR_CARD_BODY_MAX,
  SIDEBAR_CARD_BUTTON_LABEL_MAX,
  SIDEBAR_CARD_HEADING_MAX,
  TAGLINE_MAX_CHARS,
} from "@/config/community";
import {
  aboutHtmlToPlainText,
  aboutPlainTextLength,
  normalizeAboutHtml,
} from "@/lib/community/about-html";
import { parseVideoUrl } from "@/lib/community/video-embed";
import { awardPoints } from "@/lib/server/community-points-service";
import { normalizeNavigation } from "@/lib/community/community-navigation";
import type {
  CommunityAboutMediaItem,
  CommunityAboutMediaType,
  CommunityGroup,
  CommunityReview,
  CommunityReviewView,
  CommunitySidebarCard,
  CommunityTheme,
  CommunityTier,
  GroupAccess,
  GroupJoinPolicy,
  GroupMembership,
  GroupStatus,
  NavItem,
  ResourceLink,
} from "@/types/community";

/** Normalize an admin-entered link list: trim, drop empties, cap at 10. */
function cleanLinks(links: ResourceLink[]): ResourceLink[] {
  return links
    .filter((l) => l && l.url?.trim())
    .map((l) => ({ label: l.label?.trim() || l.url.trim(), url: l.url.trim() }))
    .slice(0, 10);
}

function cleanAboutMedia(items: CommunityAboutMediaItem[] | undefined): CommunityAboutMediaItem[] {
  return (items ?? [])
    .filter((item) => item && item.url?.trim())
    .map((item, index) => {
      const type: CommunityAboutMediaType = item.type === "video" ? "video" : "image";
      const parsed = type === "video" ? parseVideoUrl(item.url) : null;
      return {
        id: item.id?.trim() || `media-${Date.now()}-${index}`,
        type,
        url: item.url.trim(),
        label: item.label?.trim().slice(0, 40) || "",
        title: (item.title ?? "").trim().slice(0, 80),
        linkUrl: item.linkUrl?.trim() || null,
        featured: Boolean(item.featured),
        thumbnailUrl: item.thumbnailUrl?.trim() || null,
        provider: item.provider ?? parsed?.provider ?? null,
        videoId: item.videoId ?? parsed?.id ?? null,
        order: Number.isFinite(item.order) ? item.order : index,
      };
    })
    .sort((a, b) => a.order - b.order)
    .slice(0, 8)
    .map((item, index) => ({ ...item, order: index }));
}

function cleanAboutHtml(input: { about?: string; aboutHtml?: string }): string {
  const candidate = input.aboutHtml ?? input.about ?? "";
  const normalized = normalizeAboutHtml(candidate);
  return aboutPlainTextLength(normalized) <= ABOUT_MAX_CHARS
    ? normalized
    : normalizeAboutHtml(aboutHtmlToPlainText(normalized).slice(0, ABOUT_MAX_CHARS));
}

/** Same sanitize-and-cap convention as {@link cleanAboutHtml}, own length budget. */
function cleanGuidelinesHtml(candidate: string): string {
  const normalized = normalizeAboutHtml(candidate);
  return aboutPlainTextLength(normalized) <= GUIDELINES_MAX_CHARS
    ? normalized
    : normalizeAboutHtml(
        aboutHtmlToPlainText(normalized).slice(0, GUIDELINES_MAX_CHARS),
      );
}

/** Normalize admin-entered sidebar cards: trim, drop cards with no heading,
 *  cap field lengths, cap at {@link SIDEBAR_CARDS_MAX}, re-sequence order. */
function cleanSidebarCards(
  cards: CommunitySidebarCard[] | undefined,
): CommunitySidebarCard[] {
  return (cards ?? [])
    .filter((c) => c && c.heading?.trim())
    .map((c, index) => ({
      id: c.id?.trim() || `card-${Date.now()}-${index}`,
      heading: c.heading.trim().slice(0, SIDEBAR_CARD_HEADING_MAX),
      body: (c.body ?? "").trim().slice(0, SIDEBAR_CARD_BODY_MAX),
      imageUrl: c.imageUrl?.trim() || null,
      buttonLabel: (c.buttonLabel ?? "").trim().slice(0, SIDEBAR_CARD_BUTTON_LABEL_MAX),
      buttonUrl: (c.buttonUrl ?? "").trim(),
      accentColor: c.accentColor?.trim() || null,
      order: Number.isFinite(c.order) ? c.order : index,
    }))
    .sort((a, b) => a.order - b.order)
    .slice(0, SIDEBAR_CARDS_MAX)
    .map((c, index) => ({ ...c, order: index }));
}

function toMillis(v: unknown): number | null {
  if (!v) return null;
  const m = v as {
    toMillis?: () => number;
    toDate?: () => Date;
    seconds?: number;
    _seconds?: number;
  };
  if (typeof m.toMillis === "function") return m.toMillis();
  if (typeof m.toDate === "function") return m.toDate().getTime();
  if (typeof m.seconds === "number") return m.seconds * 1000;
  if (typeof m._seconds === "number") return m._seconds * 1000;
  return null;
}

/**
 * Server-side write service for Community groups + memberships — the single
 * Admin-SDK chokepoint. Members never write Firestore directly; staff actions
 * POST to /api/sub-accounts/[id]/community/* and member actions to
 * /api/community/*, both landing here. Rules keep the client write path closed.
 */

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "group"
  );
}

/**
 * Produce a slug unique within the sub-account. Appends -2, -3, … on collision.
 * `excludeGroupId` lets an update keep its own slug when the name is unchanged.
 */
async function uniqueSlug(
  subAccountId: string,
  base: string,
  excludeGroupId?: string,
): Promise<string> {
  const db = getAdminDb();
  const col = db.collection(`subAccounts/${subAccountId}/communityGroups`);
  const root = slugify(base);
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`;
    const snap = await col.where("slug", "==", candidate).limit(1).get();
    if (snap.empty || snap.docs[0].id === excludeGroupId) return candidate;
  }
  // Pathological fallback — unlikely past 49 same-named groups.
  return `${root}-${Date.now()}`;
}

export interface CreateGroupInput {
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  name: string;
  about?: string;
  aboutHtml?: string;
  tagline?: string;
  coverUrl?: string | null;
  cardImageUrl?: string | null;
  aboutMedia?: CommunityAboutMediaItem[];
  logoUrl?: string | null;
  brandColor?: string | null;
  access?: GroupAccess;
  priceCents?: number | null;
  currency?: string | null;
  joinPolicy?: GroupJoinPolicy;
  status?: GroupStatus;
}

export async function createGroupServerSide(
  input: CreateGroupInput,
): Promise<CommunityGroup> {
  const db = getAdminDb();
  const slug = await uniqueSlug(input.subAccountId, input.name);
  const access: GroupAccess = input.access ?? "free";

  const doc = {
    subAccountId: input.subAccountId,
    agencyId: input.agencyId,
    createdByUid: input.createdByUid,
    name: input.name.trim(),
    slug,
    about: aboutHtmlToPlainText(input.about ?? input.aboutHtml ?? "").slice(0, ABOUT_MAX_CHARS),
    aboutHtml: cleanAboutHtml(input),
    tagline: (input.tagline?.trim() ?? "").slice(0, TAGLINE_MAX_CHARS),
    coverUrl: input.coverUrl ?? null,
    cardImageUrl: input.cardImageUrl ?? null,
    aboutMedia: cleanAboutMedia(input.aboutMedia),
    logoUrl: input.logoUrl ?? null,
    faviconUrl: null,
    brandColor: input.brandColor ?? null,
    access,
    priceCents: access === "paid" ? (input.priceCents ?? null) : null,
    currency: access === "paid" ? (input.currency ?? "USD") : null,
    joinPolicy: input.joinPolicy ?? "open",
    pointsEnabled: true,
    categories: ["General"],
    links: [],
    guidelinesHtml: "",
    sidebarCards: [],
    status: input.status ?? "draft",
    memberCount: 0,
    reviewCount: 0,
    averageRating: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const ref = await db
    .collection(`subAccounts/${input.subAccountId}/communityGroups`)
    .add(doc);
  return { id: ref.id, ...doc } as CommunityGroup;
}

export interface UpdateGroupPatch {
  name?: string;
  /** Explicit slug edit — see the precedence note in {@link updateGroupServerSide}. */
  slug?: string;
  about?: string;
  aboutHtml?: string;
  tagline?: string;
  coverUrl?: string | null;
  cardImageUrl?: string | null;
  aboutMedia?: CommunityAboutMediaItem[];
  logoUrl?: string | null;
  faviconUrl?: string | null;
  brandColor?: string | null;
  /** Community Settings → Branding. See `CommunityGroup.theme`'s own doc
   *  comment — saving this also derives `brandColor` (below), which is
   *  what actually reaches the real, already-themed Community surfaces. */
  theme?: CommunityTheme;
  access?: GroupAccess;
  priceCents?: number | null;
  currency?: string | null;
  joinPolicy?: GroupJoinPolicy;
  status?: GroupStatus;
  categories?: string[];
  links?: ResourceLink[];
  guidelinesHtml?: string;
  sidebarCards?: CommunitySidebarCard[];
  /** Community Settings → Navigation. See `normalizeNavigation` — always
   *  sanitized server-side before it ever reaches Firestore, so a
   *  malformed or tampered payload (unknown key, mandatory tab hidden,
   *  oversized label) can never actually persist (Part 5 / Part 15). */
  navigation?: NavItem[];
}

export async function updateGroupServerSide(opts: {
  subAccountId: string;
  groupId: string;
  patch: UpdateGroupPatch;
}): Promise<CommunityGroup | null> {
  const db = getAdminDb();
  const ref = db.doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`,
  );
  const snap = await ref.get();
  if (!snap.exists) return null;

  const updates: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  const p = opts.patch;
  if (typeof p.name === "string" && p.name.trim()) {
    updates.name = p.name.trim();
    // Re-slug when the name changes, keeping uniqueness + our own slug —
    // UNLESS the caller also sent an explicit `slug` (an admin directly
    // editing the Slug field in Community Settings), which takes
    // precedence and is handled below instead.
    if (typeof p.slug !== "string" || !p.slug.trim()) {
      updates.slug = await uniqueSlug(opts.subAccountId, p.name, opts.groupId);
    }
  }
  // An explicit slug edit (Part 3, Community Settings → General). Runs
  // uniqueness through the same `uniqueSlug` helper as the name-driven path
  // — if the exact text is taken, a numeric suffix is appended just like a
  // name collision would produce; the caller gets the real, persisted slug
  // back in the response and can tell the admin if it didn't come back
  // verbatim.
  if (typeof p.slug === "string" && p.slug.trim()) {
    updates.slug = await uniqueSlug(opts.subAccountId, p.slug, opts.groupId);
  }
  if (typeof p.about === "string" || typeof p.aboutHtml === "string") {
    const aboutHtml = cleanAboutHtml(p);
    updates.aboutHtml = aboutHtml;
    updates.about = aboutHtmlToPlainText(aboutHtml).slice(0, ABOUT_MAX_CHARS);
  }
  if (typeof p.tagline === "string")
    updates.tagline = p.tagline.trim().slice(0, TAGLINE_MAX_CHARS);
  if (p.coverUrl !== undefined) updates.coverUrl = p.coverUrl;
  if (p.cardImageUrl !== undefined) updates.cardImageUrl = p.cardImageUrl;
  if (Array.isArray(p.aboutMedia)) updates.aboutMedia = cleanAboutMedia(p.aboutMedia);
  if (p.logoUrl !== undefined) updates.logoUrl = p.logoUrl;
  if (p.faviconUrl !== undefined) updates.faviconUrl = p.faviconUrl;
  if (p.brandColor !== undefined) updates.brandColor = p.brandColor;
  // Branding (Part 9) — saving a theme is also the mechanism that makes
  // Primary/Brand real on production TODAY: every existing Community
  // surface already reads `brandColor`, so deriving it here from
  // `theme.light.primary` is what lets a Branding save actually change the
  // live Community without touching every one of those surfaces. This
  // deliberately overrides an explicit `p.brandColor` sent in the SAME
  // request — Branding is the more specific/newer control for this value;
  // General's own save never sends `theme`, so this never fires there.
  if (p.theme !== undefined) {
    updates.theme = p.theme;
    updates.brandColor = p.theme.light.primary;
  }
  if (p.joinPolicy) updates.joinPolicy = p.joinPolicy;
  if (p.status) updates.status = p.status;
  if (Array.isArray(p.categories)) {
    // Normalize: trim, drop empties, dedupe, always keep "General" first.
    // Cap raised from the original 10 to 60 (Channels feature) — Channel
    // creation keeps this array in sync 1:1 with real Channel docs (see
    // community-channels-service.ts's module comment), and the old 10-cap
    // would have silently dropped a newly-created channel's name past
    // that many, leaving a real Channel doc whose posts could never
    // actually validate against `categories.includes(...)` in the post
    // create/edit routes — a real, silent-breakage risk, not just an
    // arbitrary number bump.
    const cleaned = p.categories
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    const deduped = Array.from(new Set(["General", ...cleaned]));
    updates.categories = deduped.slice(0, 60);
  }
  if (Array.isArray(p.links)) updates.links = cleanLinks(p.links);
  if (typeof p.guidelinesHtml === "string")
    updates.guidelinesHtml = cleanGuidelinesHtml(p.guidelinesHtml);
  if (Array.isArray(p.sidebarCards))
    updates.sidebarCards = cleanSidebarCards(p.sidebarCards);
  if (Array.isArray(p.navigation)) updates.navigation = normalizeNavigation(p.navigation);
  if (p.access) {
    updates.access = p.access;
    if (p.access === "paid") {
      if (p.priceCents !== undefined) updates.priceCents = p.priceCents;
      updates.currency = p.currency ?? snap.data()?.currency ?? "USD";
    } else {
      updates.priceCents = null;
      updates.currency = null;
    }
  }

  await ref.update(updates);
  const fresh = await ref.get();
  return { id: fresh.id, ...(fresh.data() as Omit<CommunityGroup, "id">) };
}

export async function getGroupBySlug(
  subAccountId: string,
  slug: string,
): Promise<CommunityGroup | null> {
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/communityGroups`)
    .where("slug", "==", slug)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<CommunityGroup, "id">) };
}

export async function getGroupById(
  subAccountId: string,
  groupId: string,
): Promise<CommunityGroup | null> {
  const snap = await getAdminDb()
    .doc(`subAccounts/${subAccountId}/communityGroups/${groupId}`)
    .get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<CommunityGroup, "id">) };
}

export async function getMembership(
  subAccountId: string,
  groupId: string,
  memberId: string,
): Promise<GroupMembership | null> {
  const snap = await getAdminDb()
    .doc(
      `subAccounts/${subAccountId}/communityGroups/${groupId}/memberships/${memberId}`,
    )
    .get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as Omit<GroupMembership, "id">) };
}

/**
 * Is this email a STAFF admin of the sub-account (a sub-account admin or the
 * agency owner)? Used to auto-elevate staff who join the community to
 * `moderator`. Community members aren't Firebase users, so a no-match (no
 * Firebase user for the email) cleanly means "not staff".
 *
 * Exported (2026-08-21) so the Skool importer's bulk membership-write path
 * can reuse this EXACT check instead of duplicating it — see the Community
 * Initialization Repair report: the importer's original direct writes
 * hardcoded `role: "member"` for every membership, including the
 * community-owning staff account's own, which is what `joinGroupServerSide`
 * below has always correctly avoided via this same function.
 */
export async function isStaffEmail(
  subAccountId: string,
  email: string,
): Promise<boolean> {
  try {
    const user = await getAdminAuth().getUserByEmail(email.trim().toLowerCase());
    const db = getAdminDb();
    const saSnap = await db.doc(`subAccounts/${subAccountId}`).get();
    const agencyId = saSnap.data()?.agencyId;
    const claims = (user.customClaims ?? {}) as {
      agencyRole?: string;
      agencyId?: string;
    };
    if (claims.agencyRole === "owner" && claims.agencyId === agencyId) {
      return true;
    }
    const memberSnap = await db
      .doc(`subAccounts/${subAccountId}/subAccountMembers/${user.uid}`)
      .get();
    const m = memberSnap.data();
    return memberSnap.exists && m?.status === "active" && m?.role === "admin";
  } catch {
    // No Firebase user for that email → a regular community member.
    return false;
  }
}

export type JoinOutcome =
  | { status: "active" }
  | { status: "pending" }
  | { status: "already"; membershipStatus: GroupMembership["status"] }
  | { status: "payment_required" };

/**
 * Join a published group. Free + open → active immediately. Approval-policy →
 * pending (admin approves later). Paid groups return `payment_required` — the
 * actual one-time PayPal flow lands in Slice 6; until then a paid group can't
 * be joined here. Idempotent: an existing membership is returned as `already`.
 *
 * The membership doc id is the memberId, so a member can only hold one
 * membership per group (natural idempotency).
 *
 * Staff/admin bypass (extended 2026-08-19 for Staff -> Member Seamless
 * Entry): a joining email that `isStaffEmail` resolves as staff/admin for
 * this sub-account was ALREADY auto-elevated to `moderator` role — this
 * just extends that same, single, existing staff-detection check to also
 * bypass the approval-pending gate and the paid-access gate. A sub-account
 * owner entering their own paid or approval-gated Community through the
 * legitimate CRM bridge must land active, not stuck pending an approval
 * they'd have to grant themselves, or asked to pay for their own product.
 * Ordinary (non-staff) members are completely unaffected — same pending/
 * payment_required behavior as before.
 */
export async function joinGroupServerSide(opts: {
  subAccountId: string;
  agencyId: string;
  groupId: string;
  memberId: string;
  /** Points & Rewards — the inviting member's memberId, if this join came
   *  through a personal invite link. Only ever takes effect on a genuinely
   *  NEW membership (see below) — an "already" outcome never overwrites an
   *  existing membership's referrer, and never re-awards a point. */
  invitedByMemberId?: string;
}): Promise<JoinOutcome> {
  const db = getAdminDb();
  const groupRef = db.doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`,
  );
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) throw new Error("Group not found");
  const group = groupSnap.data() as Omit<CommunityGroup, "id">;

  const memRef = groupRef.collection("memberships").doc(opts.memberId);
  const existing = await memRef.get();
  if (existing.exists) {
    const data = existing.data() as Omit<GroupMembership, "id">;
    if (data.status !== "removed") {
      return { status: "already", membershipStatus: data.status };
    }
  }
  const isNewJoin = !existing.exists;

  // Single staff-detection check, reused for role, the approval gate, AND
  // the paid gate below — was previously computed only for role.
  const memberSnap = await db
    .doc(`subAccounts/${opts.subAccountId}/members/${opts.memberId}`)
    .get();
  const email = memberSnap.data()?.email as string | undefined;
  const staff = !!email && (await isStaffEmail(opts.subAccountId, email));

  if (group.access === "paid" && !staff) {
    // Paid join is wired in Slice 6 (one-time PayPal + admin mark-paid).
    return { status: "payment_required" };
  }

  const becomesActive = group.joinPolicy !== "approval" || staff;
  const status: GroupMembership["status"] = becomesActive
    ? "active"
    : "pending";

  // Auto-elevate staff admins to moderator so they can moderate inline.
  const role: GroupMembership["role"] = staff ? "moderator" : "member";

  // Points & Rewards — no self-referral (same "no self-like farming" spirit
  // as toggleLikeServerSide's own self-like exclusion).
  const invitedByMemberId =
    opts.invitedByMemberId && opts.invitedByMemberId !== opts.memberId
      ? opts.invitedByMemberId
      : undefined;

  await memRef.set({
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    groupId: opts.groupId,
    memberId: opts.memberId,
    role,
    status,
    points: 0,
    level: 1,
    joinedAt: FieldValue.serverTimestamp(),
    tierId: null,
    ...(invitedByMemberId ? { invitedByMemberId } : {}),
  });

  // Points & Rewards — "Invite a new member" awards the REFERRER, only on
  // this invitee's first successful ACTIVE join. A join that lands
  // `pending` (approval-gated) is credited later instead, the moment a
  // moderator actually approves it — see `approveMembershipServerSide`,
  // which reads this same `invitedByMemberId` off the membership doc.
  // `sourceEntityId` = the INVITEE's own memberId in both places, so the
  // deterministic event id is identical either way — exactly one award
  // per invitee, however they ended up active, never both.
  if (isNewJoin && becomesActive && invitedByMemberId) {
    void awardPoints({
      subAccountId: opts.subAccountId,
      groupId: opts.groupId,
      memberId: invitedByMemberId,
      action: "invite_member",
      sourceEntityId: opts.memberId,
    }).catch((err) => {
      console.error("[joinGroupServerSide] invite_member award failed", err);
    });
  }

  if (becomesActive) {
    await groupRef.update({ memberCount: FieldValue.increment(1) });
    void emitWebhookEvent({
      subAccountId: opts.subAccountId,
      agencyId: opts.agencyId,
      mode: "live",
      type: "community.member.joined",
      payload: { groupId: opts.groupId, memberId: opts.memberId, via: staff ? "staff" : "open" },
    });
    // Reliability fix (2026-08-26): AWAITED, not void-fired. Confirmed live
    // that the void-fired form intermittently produced ZERO notification
    // docs — the serverless function can be frozen/torn down the instant
    // this route's response is sent, killing the still-in-flight Firestore
    // write with no error logged. Awaiting costs this response one more
    // write's latency; a failure is caught and logged here, never
    // propagated — the join itself is already committed above and stays
    // committed either way. (emitWebhookEvent above is intentionally left
    // void-fired — out of scope for this pass, which is specifically about
    // notification creation.)
    await notifyCommunityAccessGranted({
      subAccountId: opts.subAccountId,
      groupId: opts.groupId,
      memberId: opts.memberId,
    }).catch((err) => console.error("[joinGroupServerSide] notification failed", err));
  }

  return becomesActive ? { status: "active" } : { status: "pending" };
}

export async function listCommunityTiers(opts: {
  subAccountId: string;
  groupId: string;
  activeOnly?: boolean;
}): Promise<CommunityTier[]> {
  const snap = await getAdminDb()
    .collection(
      `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/tiers`,
    )
    .orderBy("displayOrder", "asc")
    .get();
  const tiers = snap.docs.map((doc) => ({
    id: doc.id,
    ...(doc.data() as Omit<CommunityTier, "id">),
  }));
  return opts.activeOnly ? tiers.filter((tier) => tier.active) : tiers;
}

export async function replaceCommunityTiersServerSide(opts: {
  subAccountId: string;
  groupId: string;
  tiers: Partial<CommunityTier>[];
}): Promise<CommunityTier[]> {
  const db = getAdminDb();
  const groupRef = db.doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`,
  );
  const groupSnap = await groupRef.get();
  if (!groupSnap.exists) return [];
  const group = groupSnap.data() as Omit<CommunityGroup, "id">;
  const col = groupRef.collection("tiers");
  const existing = await col.get();
  const batch = db.batch();
  const seen = new Set<string>();
  opts.tiers
    .filter((tier) => tier.name?.trim())
    .forEach((tier, index) => {
      const ref = tier.id ? col.doc(tier.id) : col.doc();
      seen.add(ref.id);
      batch.set(
        ref,
        {
          subAccountId: opts.subAccountId,
          agencyId: group.agencyId,
          groupId: opts.groupId,
          name: tier.name!.trim().slice(0, 80),
          description: (tier.description ?? "").trim().slice(0, 300),
          priceCents:
            typeof tier.priceCents === "number" && tier.priceCents >= 0
              ? Math.round(tier.priceCents)
              : null,
          currency: tier.currency?.trim() || "USD",
          billingInterval: tier.billingInterval ?? null,
          displayOrder: Number.isFinite(tier.displayOrder)
            ? tier.displayOrder
            : index,
          active: tier.active !== false,
          entitlementMetadata: tier.entitlementMetadata ?? {},
          checkoutUrl: tier.checkoutUrl?.trim() || null,
          createdAt: tier.createdAt ?? FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
  existing.docs.forEach((doc) => {
    if (!seen.has(doc.id)) batch.delete(doc.ref);
  });
  await batch.commit();
  return listCommunityTiers({ subAccountId: opts.subAccountId, groupId: opts.groupId });
}

export async function listCommunityReviews(opts: {
  subAccountId: string;
  groupId: string;
  includeRemoved?: boolean;
  limit?: number;
}): Promise<CommunityReviewView[]> {
  const snap = await getAdminDb()
    .collection(
      `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/reviews`,
    )
    .orderBy("updatedAt", "desc")
    .limit(opts.limit ?? 20)
    .get();
  const reviews = snap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<CommunityReview, "id">) }))
    .filter((review) => opts.includeRemoved || review.status === "active");
  const memberSnaps = await Promise.all(
    reviews.map((review) =>
      getAdminDb().doc(`subAccounts/${opts.subAccountId}/members/${review.memberId}`).get(),
    ),
  );
  return reviews.map((review, index) => {
    const member = memberSnaps[index].data();
    return {
      ...review,
      reviewerName:
        (member?.displayName as string | undefined)?.trim() ||
        (member?.email as string | undefined)?.split("@")[0] ||
        "Member",
      reviewerAvatarUrl: (member?.avatarUrl as string | null | undefined) ?? null,
      createdAtMs: toMillis(review.createdAt),
      updatedAtMs: toMillis(review.updatedAt),
    };
  });
}

async function recomputeReviewAggregate(subAccountId: string, groupId: string) {
  const groupRef = getAdminDb().doc(
    `subAccounts/${subAccountId}/communityGroups/${groupId}`,
  );
  const snap = await groupRef.collection("reviews").where("status", "==", "active").get();
  const ratings = snap.docs
    .map((doc) => Number(doc.data().rating))
    .filter((rating) => rating >= 1 && rating <= 5);
  const average =
    ratings.length > 0
      ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 10) / 10
      : null;
  await groupRef.update({ reviewCount: ratings.length, averageRating: average });
}

export async function upsertCommunityReviewServerSide(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  rating: number;
  body: string;
}): Promise<CommunityReview> {
  const membership = await getMembership(opts.subAccountId, opts.groupId, opts.memberId);
  if (!membership || membership.status !== "active") {
    throw new Error("Only active members can review this community.");
  }
  const group = await getGroupById(opts.subAccountId, opts.groupId);
  if (!group) throw new Error("Group not found");
  const rating = Math.max(1, Math.min(5, Math.round(opts.rating)));
  const ref = getAdminDb().doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/reviews/${opts.memberId}`,
  );
  const snap = await ref.get();
  await ref.set(
    {
      subAccountId: opts.subAccountId,
      agencyId: group.agencyId,
      groupId: opts.groupId,
      memberId: opts.memberId,
      rating,
      body: opts.body.trim().slice(0, 600),
      status: "active",
      createdAt: snap.exists ? snap.data()?.createdAt : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      removedAt: null,
      removedByUid: null,
    },
    { merge: true },
  );
  await recomputeReviewAggregate(opts.subAccountId, opts.groupId);
  const fresh = await ref.get();
  return { id: fresh.id, ...(fresh.data() as Omit<CommunityReview, "id">) };
}

export async function removeCommunityReviewServerSide(opts: {
  subAccountId: string;
  groupId: string;
  reviewId: string;
  removedByUid: string | null;
}): Promise<void> {
  const ref = getAdminDb().doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/reviews/${opts.reviewId}`,
  );
  const snap = await ref.get();
  if (!snap.exists) return;
  await ref.update({
    status: "removed",
    removedAt: FieldValue.serverTimestamp(),
    removedByUid: opts.removedByUid,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await recomputeReviewAggregate(opts.subAccountId, opts.groupId);
}

/** Staff: approve a pending join request → active membership. */
export async function approveMembershipServerSide(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  agencyId: string;
}): Promise<void> {
  const groupRef = getAdminDb().doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`,
  );
  const memRef = groupRef.collection("memberships").doc(opts.memberId);
  const snap = await memRef.get();
  if (!snap.exists || snap.data()!.status === "active") return;

  const invitedByMemberId = snap.data()!.invitedByMemberId as string | undefined;

  await memRef.update({ status: "active" });
  await groupRef.update({ memberCount: FieldValue.increment(1) });

  // Points & Rewards — `joinGroupServerSide` only awards "Invite a new
  // member" for a join that becomes active immediately; an approval-gated
  // join's referrer is credited HERE instead, on the moment it actually
  // becomes active. `sourceEntityId` = this invitee's own memberId, same
  // as the immediate-join path, so the deterministic event id is identical
  // either way — exactly one award per invitee, however they ended up active.
  if (invitedByMemberId) {
    void awardPoints({
      subAccountId: opts.subAccountId,
      groupId: opts.groupId,
      memberId: invitedByMemberId,
      action: "invite_member",
      sourceEntityId: opts.memberId,
    }).catch((err) => {
      console.error("[approveMembershipServerSide] invite_member award failed", err);
    });
  }

  void emitWebhookEvent({
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    mode: "live",
    type: "community.member.approved",
    payload: { groupId: opts.groupId, memberId: opts.memberId },
  });
  // Reliability fix (2026-08-26): AWAITED, not void-fired — same
  // request-vs-teardown race as joinGroupServerSide's call above; see that
  // comment for the live evidence. The approval itself is already
  // committed above and stays committed regardless of notification outcome.
  await notifyCommunityAccessGranted({
    subAccountId: opts.subAccountId,
    groupId: opts.groupId,
    memberId: opts.memberId,
  }).catch((err) => console.error("[approveMembershipServerSide] notification failed", err));
}

/** Staff: promote a member to moderator (inline pin/delete rights) or demote. */
export async function setMembershipRoleServerSide(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  role: GroupMembership["role"];
}): Promise<void> {
  const memRef = getAdminDb().doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}/memberships/${opts.memberId}`,
  );
  const snap = await memRef.get();
  if (!snap.exists) return;
  await memRef.update({ role: opts.role });
}

/** Staff/moderator: set a membership status (remove / ban / restore to active),
 *  keeping the group's active member count correct. */
export async function setMembershipStatusServerSide(opts: {
  subAccountId: string;
  groupId: string;
  memberId: string;
  status: "removed" | "banned" | "active";
}): Promise<void> {
  const groupRef = getAdminDb().doc(
    `subAccounts/${opts.subAccountId}/communityGroups/${opts.groupId}`,
  );
  const memRef = groupRef.collection("memberships").doc(opts.memberId);
  const snap = await memRef.get();
  if (!snap.exists) return;
  const wasActive = snap.data()!.status === "active";
  const willActive = opts.status === "active";
  await memRef.update({ status: opts.status });
  if (wasActive && !willActive) {
    await groupRef.update({ memberCount: FieldValue.increment(-1) });
  } else if (!wasActive && willActive) {
    await groupRef.update({ memberCount: FieldValue.increment(1) });
  }
}
