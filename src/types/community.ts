import type { Timestamp, FieldValue } from "firebase/firestore";
import type { MediaAttachment } from "./media-attachment";

/**
 * Community + Courses (Skool-style) — shared types.
 *
 * Unlike the affiliate program, Community is a product feature available to
 * EVERY buyer (not gated on LANDING_VARIANT). It is gated per sub-account by
 * the agency owner via `communityEnabledByAgency` (see {@link
 * "@/types/tenancy".SubAccountDoc}).
 *
 * Identity vs membership (important):
 *  - A {@link Member} is the IDENTITY a person logs in as. It is scoped to ONE
 *    sub-account and lives at `subAccounts/{saId}/members/{memberId}`. One
 *    magic-link login spans every group in that sub-account.
 *  - Group membership (which groups a member has joined, their role/points) is
 *    a SEPARATE record added in a later slice. Creating an identity is harmless
 *    — a member sees no group content until they join one.
 *
 * Members are NOT Firebase Auth users. They authenticate with the same
 * HMAC session-cookie model the affiliate portal uses (see
 * `src/lib/community/member-auth.ts`). Password login is stored directly on
 * this tenant-scoped member identity; magic links remain as an alternative.
 * This keeps the member surface fully separate from staff RBAC — a member
 * session can never reach `/sa/*`.
 */

export type MemberStatus = "active" | "removed";

export interface Member {
  id: string;
  /** Tenancy — the sub-account this identity belongs to. */
  subAccountId: string;
  agencyId: string;
  /** Normalized (trimmed + lowercased) login email. Unique per sub-account. */
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** Short member bio shown on their profile + the members directory. */
  bio: string;
  /** Captured at instant-signup (Standalone Courses). Null for members
   *  created via magic-link, which never collects a phone number. */
  phone: string | null;
  /** Captured at instant-signup when a Course Offer's checkout has "Collect
   *  address" enabled. Null otherwise. */
  address: string | null;
  /**
   * The CRM contact this member is reconciled to. Set at creation — joining
   * the community doubles as lead capture. Null only if reconciliation failed.
   */
  contactId: string | null;
  /**
   * MyMagnetix foundation (2026-08-14) — the person-identity (`people/{id}`)
   * this tenant-specific Member relationship belongs to, linked lazily on
   * authentication (see person-identity-service.ts). Optional/absent on
   * members not yet reconciled; this Member doc itself is never merged or
   * migrated — `personId` is purely a pointer to the human above it.
   */
  personId?: string | null;
  /** Scrypt hash for member password auth. Null/absent for legacy passwordless members. */
  passwordHash?: string | null;
  passwordUpdatedAt?: Timestamp | FieldValue | null;
  status: MemberStatus;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  /** Stamped on each successful session load; powers "online"/"last active". */
  lastSeenAt: Timestamp | FieldValue | null;
}

/**
 * A group is one Skool-style space: a Community feed + a Classroom + a
 * leaderboard, served at `/c/[saId]/[slug]`. A sub-account may run several.
 * Lives at `subAccounts/{saId}/communityGroups/{groupId}`.
 */
export type GroupAccess = "free" | "paid";
export type GroupJoinPolicy = "open" | "approval";
export type GroupStatus = "draft" | "published";
export type CommunityAboutMediaType = "image" | "video";
export type CommunityBillingInterval = "one_time" | "month" | "year";

export interface CommunityAboutMediaItem {
  id: string;
  type: CommunityAboutMediaType;
  url: string;
  /** Optional display eyebrow/label for the About gallery card. */
  label?: string;
  title: string;
  /** Optional click-through URL for a media card. */
  linkUrl?: string | null;
  /** Optional explicit featured marker; legacy data uses the first item. */
  featured?: boolean;
  thumbnailUrl: string | null;
  provider: VideoProvider | null;
  videoId: string | null;
  order: number;
}

/**
 * Community Settings → Branding. A small, deliberately-limited set of color
 * ROLES a normal business owner can reason about ("what does this affect?"),
 * not a dump of internal CSS custom properties — see
 * community-theme-presets.ts for the actual preset values and the Branding
 * workspace's module comment for which of these currently reach the real
 * Community UI vs. remain preview-only.
 */
export interface CommunityThemeColors {
  /** Primary / Brand — the community's main identity color. */
  primary: string;
  /** Primary Actions / Buttons. */
  primaryAction: string;
  /** Accent / Highlights. */
  accent: string;
  /** Page Background. */
  background: string;
  /** Surface / Cards. */
  surface: string;
  /** Text / Links. */
  text: string;
}

export type CommunityThemePresetKey =
  | "magnetix-purple"
  | "ocean-blue"
  | "forest-green"
  | "sunset-orange"
  | "rose-pink"
  | "royal-blue"
  | "slate-gray"
  | "deep-teal"
  | "custom";

/**
 * Independent Light/Dark color sets (Part 7 — "do not assume Light and Dark
 * must share every exact value"), plus which preset (if any) they currently
 * came from, so the Branding UI can show the right card as selected without
 * re-deriving it from the color values themselves.
 */
export interface CommunityTheme {
  preset: CommunityThemePresetKey;
  light: CommunityThemeColors;
  dark: CommunityThemeColors;
}

export interface CommunityGroup {
  id: string;
  subAccountId: string;
  agencyId: string;
  createdByUid: string;
  name: string;
  /** URL slug, unique within the sub-account. */
  slug: string;
  /** Long-form rich-text "about" copy shown on the public landing page. */
  about: string;
  /** Short one-line tagline shown under the logo in the join card (≤100 chars). */
  tagline: string;
  /** Hero/cover image on the public About page (left column). */
  coverUrl: string | null;
  /** Image at the top of the right-hand join card (falls back to cover). */
  cardImageUrl: string | null;
  /** Purpose-built About media gallery. First/featured item renders large. */
  aboutMedia: CommunityAboutMediaItem[];
  /** Rich-text About body. Kept to the same 1,000-character text budget. */
  aboutHtml: string;
  /** Small brand mark shown in the page header (falls back to cover). */
  logoUrl: string | null;
  /**
   * Browser-tab icon (Community Settings → General, added alongside Logo/
   * Cover). Persisted here so it travels with the rest of the community's
   * identity assets; see the community layout `generateMetadata` for
   * whether/how it's actually applied to the real browser tab.
   */
  faviconUrl: string | null;
  /**
   * Hex accent that themes the member surface — primary buttons/accents use
   * this instead of Skool amber, so the community wears the agency's brand.
   * Null falls back to a neutral default. Kept as the single source of
   * truth real Community surfaces already read (see every `brand`/
   * `brandColor` prop threaded through this codebase) — Branding's richer
   * `theme` below is layered ON TOP of this, not a replacement for it:
   * saving a theme also derives this field from `theme.light.primary`, so
   * every existing surface picks up the new primary color for free without
   * needing its own theme-awareness.
   */
  brandColor: string | null;
  /**
   * Community Settings → Branding (theme presets / custom colors / light &
   * dark). Absent = community has never configured Branding — every reader
   * must treat that as "use default Magnetix styling" (Part 11's explicit
   * backward-compatibility requirement), never assume this is present.
   * Only `theme.light.primary` currently has any effect on the real,
   * production Community surface (via `brandColor` above) — see the
   * Branding workspace's own module comment for exactly what's real vs.
   * preview-only, and why.
   */
  theme?: CommunityTheme;
  access: GroupAccess;
  /** One-time price in cents when `access === "paid"`. */
  priceCents: number | null;
  currency: string | null;
  joinPolicy: GroupJoinPolicy;
  /** Gamification master switch for the group. */
  pointsEnabled: boolean;
  /** Feed categories (the pill row). Always includes at least "General". */
  categories: string[];
  /** Admin-added links shown in the feed right-rail info card. */
  links: ResourceLink[];
  /**
   * Community Home right-rail: compact rules/expectations copy shown via the
   * "Community Guidelines" card. Sanitized rich text, same convention as
   * {@link CommunityGroup.aboutHtml}. Empty string = not configured, card
   * renders nothing (Part 10 — no hardcoded fallback copy).
   */
  guidelinesHtml: string;
  /**
   * Up to {@link "@/config/community".SIDEBAR_CARDS_MAX} owner-configurable
   * promo/resource cards shown near the bottom of the Home right rail (Part
   * 6). Deliberately a small, self-contained shape — reuses the same
   * `ImageUpload`/`ColorInput` primitives as the Course block system's CTA
   * block rather than importing that system's full block/editor machinery
   * (see the 2026-08-17 content-block investigation report). Not a general
   * block system: fixed image+heading+body+button shape only.
   */
  sidebarCards: CommunitySidebarCard[];
  status: GroupStatus;
  /** Denormalized count of active memberships; bumped on join/leave. */
  memberCount: number;
  /** Denormalized active review count for the About page. */
  reviewCount: number;
  /** Denormalized average rating, 1–5. Null until the first active review. */
  averageRating: number | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/**
 * Tier / plan foundation for a Community group. Lives at
 * `subAccounts/{saId}/communityGroups/{groupId}/tiers/{tierId}`.
 * This is deliberately separate from one-time group access so Community does
 * not get locked into a yes/no membership architecture.
 */
export interface CommunityTier {
  id: string;
  subAccountId: string;
  agencyId: string;
  groupId: string;
  name: string;
  description: string;
  priceCents: number | null;
  currency: string | null;
  billingInterval: CommunityBillingInterval | null;
  displayOrder: number;
  active: boolean;
  entitlementMetadata: Record<string, unknown>;
  checkoutUrl: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/**
 * A member's membership IN a specific group (separate from their sub-account
 * identity {@link Member}). Doc id = memberId, at
 * `subAccounts/{saId}/communityGroups/{groupId}/memberships/{memberId}`.
 */
export type GroupMembershipRole = "member" | "moderator";
export type GroupMembershipStatus = "active" | "pending" | "removed" | "banned";

export interface GroupMembership {
  id: string;
  subAccountId: string;
  agencyId: string;
  groupId: string;
  memberId: string;
  role: GroupMembershipRole;
  status: GroupMembershipStatus;
  /** Gamification points (1 like = 1 point), per-group. */
  points: number;
  /** Derived 1–9 level from {@link points}; stored for cheap leaderboard reads. */
  level: number;
  /** Current tier/plan for tier-aware CTAs. Null for legacy/free members. */
  tierId?: string | null;
  joinedAt: Timestamp | FieldValue | null;
}

/**
 * One active review per member per Community group. Doc id = memberId, at
 * `subAccounts/{saId}/communityGroups/{groupId}/reviews/{memberId}`.
 */
export interface CommunityReview {
  id: string;
  subAccountId: string;
  agencyId: string;
  groupId: string;
  memberId: string;
  rating: number;
  body: string;
  status: "active" | "removed";
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  removedAt?: Timestamp | FieldValue | null;
  removedByUid?: string | null;
}

export interface CommunityReviewView extends CommunityReview {
  reviewerName: string;
  reviewerAvatarUrl: string | null;
  createdAtMs: number | null;
  updatedAtMs: number | null;
}

/**
 * A feed post, at
 * `subAccounts/{saId}/communityGroups/{groupId}/posts/{postId}`. Likes live as
 * doc-per-liker in a `likes/{memberId}` subcollection (idempotent toggle);
 * comments in a `comments/{commentId}` subcollection.
 */
export interface CommunityPost {
  id: string;
  subAccountId: string;
  agencyId: string;
  groupId: string;
  authorMemberId: string;
  title: string;
  body: string;
  /** Phase C — image/voice attachments, rendered below the rich-text body,
   *  never inline inside it. Optional/additive: every post written before
   *  this field existed is still a fully valid CommunityPost with
   *  `attachments` simply absent. See src/types/media-attachment.ts. */
  attachments?: MediaAttachment[];
  category: string | null;
  pinned: boolean;
  likeCount: number;
  commentCount: number;
  /** Phase D — author-controlled "allow comments/replies" toggle. Absent
   *  (undefined) means comments are allowed — same additive convention as
   *  `attachments`, so every post written before this field existed stays
   *  valid with comments enabled by default. Disabling this does NOT hide
   *  existing comments; it only blocks NEW ones (enforced server-side in
   *  the comments POST route, not merely hidden in the UI). */
  commentsDisabled?: boolean;
  /** Polls (2026-08-20) — moderator/admin-only, created together with the
   *  post (or added during an edit) via the composer's Poll action. The
   *  post's own title/body IS the poll's question/context — there is no
   *  separate `pollQuestion` field, matching both the GoCollab reference
   *  (its Create Poll sheet collects only options + settings, no question
   *  field) and this composer's existing model of "one thing being
   *  composed," not two disconnected forms glued together. Stored directly
   *  on the post rather than as a `MediaAttachment` — a poll is structured,
   *  queryable, mutable-with-rules data (vote counts, settings, an
   *  immutability rule once votes exist), nothing like the write-once
   *  media kinds `MediaAttachment` represents. `optionCounts`/`voterCount`
   *  are denormalized here (updated transactionally by
   *  `voteOnPollServerSide`) so rendering results never requires reading
   *  the entire `pollVotes` subcollection — but this raw doc is NEVER sent
   *  to a client directly; every read path funnels it through
   *  `buildFeedPoll`, which redacts `optionCounts`/`voterCount` per-viewer
   *  based on `showResults` (see `FeedPoll`). Deleting the parent post
   *  recursively deletes `pollVotes` along with it (same `recursiveDelete`
   *  call `deletePostServerSide` already made) — no separate retention
   *  step needed, and (deliberately, per explicit product instruction) NOT
   *  the same "outlives its parent" convention `forms/{id}` submissions
   *  currently have; see the Polls report for that discovered
   *  inconsistency. */
  poll?: CommunityPoll;
  /** Denormalized `!!poll` for cheap querying (e.g. the admin-side
   *  Community Polls list under Forms & Quizzes) without a nested-field
   *  inequality filter. Absent/false on every post without a poll. */
  hasPoll?: boolean;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface CommunityPollOption {
  id: string;
  text: string;
}

export interface CommunityPoll {
  options: CommunityPollOption[];
  /** OFF by default — one selection per member. */
  allowMultiple: boolean;
  /** "Allow members to see results." OFF by default — only the poll's
   *  moderator/admin can see aggregate results while this is off; the
   *  voting member can always see their OWN selection regardless (see
   *  `FeedPoll.viewerSelection`). */
  showResults: boolean;
  /** Optional close time. Null/undefined = never closes on its own.
   *  Enforced server-side in `voteOnPollServerSide` (a vote after this
   *  time is rejected), not merely a disabled button. */
  endsAt: Timestamp | FieldValue | null;
  /** Distinct members who have voted — NOT total selections (a member
   *  choosing 3 options in an allowMultiple poll still counts once here). */
  voterCount: number;
  /** option id -> selection count, across every voter. */
  optionCounts: Record<string, number>;
}

/** The safe, per-viewer poll view every read path (`listFeed`,
 *  `getFeedPost`) computes via `buildFeedPoll` — never the raw
 *  `CommunityPoll` doc. `optionCounts`/`voterCount` are present only when
 *  `resultsVisible` is true for THIS viewer; a member who hasn't voted and
 *  isn't a moderator on a `showResults: false` poll gets neither, so
 *  totals/percentages can never leak through the API response even to a
 *  technically-inspectable network tab. */
export interface FeedPoll {
  options: CommunityPollOption[];
  allowMultiple: boolean;
  /** The raw "allow members to see results" setting — safe to expose to
   *  everyone (it's configuration, not the data it gates); distinct from
   *  `resultsVisible` below, which is THIS viewer's actual computed
   *  permission right now (always true for a moderator regardless of this
   *  setting). Needed so a moderator's "Edit poll" sheet can show/change
   *  the real toggle state instead of the always-true value they'd
   *  otherwise see for their own results. */
  showResults: boolean;
  endsAtMs: number | null;
  closed: boolean;
  resultsVisible: boolean;
  optionCounts: Record<string, number> | null;
  voterCount: number | null;
  /** This viewer's own current selection — always populated once they've
   *  voted, regardless of `resultsVisible` ("show the member's selection
   *  clearly" is independent of results visibility). Empty array = hasn't
   *  voted yet. */
  viewerSelection: string[];
  /** True for the poll's own moderator/admin group — drives the "Edit
   *  poll" affordance, which reuses the existing Edit Post flow. */
  canManage: boolean;
}

export interface CommunityComment {
  id: string;
  groupId: string;
  postId: string;
  authorMemberId: string;
  /** Sanitized HTML (2026-08-19) — a much tighter allowlist than post
   *  bodies: no formatting marks/nodes at all, just paragraphs/line
   *  breaks, links, and @mention spans (never #channelRef — comments
   *  don't offer that). See sanitizeCommunityCommentHtml (post-html.ts).
   *  Every comment written before this existed is still valid: plain
   *  text is promoted to a `<p>` on read, exactly like legacy post
   *  bodies already were — no migration required. */
  body: string;
  likeCount: number;
  /** Top-level comment id when this is a reply; null for a top-level comment.
   *  Threads are exactly two visual levels (Skool-style) — replying to a
   *  reply is resolved server-side to the SAME top-level parent
   *  (createCommentServerSide), not merely assumed by the client, so a
   *  comment whose parentId points at another reply can never actually be
   *  created. */
  parentId: string | null;
  /** Comments & Replies (2026-08-19) — additive, same MediaAttachment
   *  union posts use (image/voice/file/gif; never video-link — comments
   *  don't offer that kind). Absent on every comment written before this
   *  existed, same "optional = none" convention as CommunityPost.attachments. */
  attachments?: MediaAttachment[];
  /** Set on successful edit; absent on a never-edited comment (including
   *  every comment written before editing existed). Drives the "Edited"
   *  label — no exact-timestamp UI, so no separate display formatting
   *  needed beyond existence-check. */
  editedAt?: Timestamp | FieldValue | null;
  createdAt: Timestamp | FieldValue | null;
}

/**
 * Denormalized author view hydrated for rendering (the post/comment docs only
 * store `authorMemberId`). Combines the {@link Member} identity with their
 * per-group {@link GroupMembership} level.
 */
export interface AuthorView {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
  level: number;
}

/** A post hydrated with its author + the viewer's like state, for rendering. */
export interface FeedPost extends Omit<CommunityPost, "poll"> {
  author: AuthorView;
  likedByViewer: boolean;
  /** Computed by `buildFeedPoll` — the safe, per-viewer view of the raw
   *  `CommunityPost.poll` doc (never sent to the client directly). Present
   *  only when the post has a poll. */
  poll?: FeedPoll;
}

export interface FeedComment extends CommunityComment {
  author: AuthorView;
  likedByViewer: boolean;
}

/* ------------------------------ Direct messages ----------------------- */

export interface DmMessageView {
  id: string;
  senderId: string;
  body: string;
  createdAtMs: number;
}
export interface DmMemberView {
  memberId: string;
  displayName: string;
  avatarUrl: string | null;
}
export interface DmInboxItem {
  threadId: string;
  other: DmMemberView;
  lastBody: string;
  lastAtMs: number | null;
  unread: boolean;
}

/* ----------------------------- Classroom ------------------------------ */

/**
 * A course. Access modes beyond `open` (level-locked / one-time purchase) are
 * enforced in the access-controls slice; the fields are stored here so the
 * builder can set them. Lives at
 * `subAccounts/{saId}/communityGroups/{groupId}/courses/{courseId}`. Sections
 * + lessons are subcollections; lessons are flat (each carries a `sectionId`).
 */
export type CourseAccess = "open" | "level" | "purchase";

export interface Course {
  id: string;
  subAccountId: string;
  agencyId: string;
  groupId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  order: number;
  published: boolean;
  access: CourseAccess;
  /** Required group level when `access === "level"`. */
  requiredLevel: number | null;
  /** One-time price (cents) when `access === "purchase"`. */
  priceCents: number | null;
  currency: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

export interface CourseSection {
  id: string;
  title: string;
  order: number;
}

export type VideoProvider = "youtube" | "vimeo" | "loom" | "descript";

export interface ResourceLink {
  label: string;
  url: string;
}

/**
 * One owner-configurable Home sidebar card (Part 6). See
 * {@link CommunityGroup.sidebarCards}.
 */
export interface CommunitySidebarCard {
  id: string;
  heading: string;
  body: string;
  imageUrl: string | null;
  buttonLabel: string;
  buttonUrl: string;
  /** Falls back to the group's `brandColor` (then the neutral default) when null. */
  accentColor: string | null;
  order: number;
}

export interface Lesson {
  id: string;
  sectionId: string | null;
  title: string;
  order: number;
  published: boolean;
  videoUrl: string | null;
  videoProvider: VideoProvider | null;
  videoId: string | null;
  bodyHtml: string;
  resourceLinks: ResourceLink[];
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}

/**
 * A member's enrollment + progress in a course, at
 * `courses/{courseId}/enrollments/{memberId}`. Completed lessons are stored as
 * an id array (bounded ≤200/course) so progress is one read, no subcollection.
 */
export interface Enrollment {
  id: string;
  memberId: string;
  courseId: string;
  status: "enrolled" | "completed";
  completedLessonIds: string[];
  progressPct: number;
  enrolledAt: Timestamp | FieldValue | null;
  completedAt: Timestamp | FieldValue | null;
}

/**
 * A one-time PayPal purchase for group access or a single course, at
 * `subAccounts/{saId}/communityGroups/{groupId}/purchases/{purchaseId}`. v1 is
 * manual-reconcile (admin marks paid) — the doc is shaped so Stripe auto-grant
 * can slot in later by flipping `status` from a webhook instead of by hand.
 */
export type PurchaseScope = "group" | "course";
export type PurchaseStatus = "pending" | "paid" | "void";

export interface Purchase {
  id: string;
  subAccountId: string;
  agencyId: string;
  groupId: string;
  memberId: string;
  scope: PurchaseScope;
  /** groupId (scope=group) or courseId (scope=course). */
  targetId: string;
  amountCents: number;
  currency: string;
  paypalUrl: string;
  status: PurchaseStatus;
  grantedByUid: string | null;
  requestedAt: Timestamp | FieldValue | null;
  paidAt: Timestamp | FieldValue | null;
}

/** A catalog card for the member-facing classroom. */
export interface CourseCardView {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  lessonCount: number;
  progressPct: number;
  /** Lock reason for the viewer, or null when accessible. `purchasable` is
   *  true when the lock clears with a one-time purchase (vs a level unlock). */
  locked: { reason: string; purchasable: boolean } | null;
  firstLessonId: string | null;
}
