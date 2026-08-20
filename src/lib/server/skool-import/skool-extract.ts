import "server-only";

import type { SkoolSession } from "./skool-session";
import {
  fetchSkoolFeedPage,
  fetchSkoolMembersProps,
  fetchSkoolPageProps,
  fetchSkoolComments,
} from "./skool-client";
import type { SkoolAttachment, SkoolComment, SkoolMember, SkoolPost } from "./types";

/**
 * Skool's two live sources use TWO DIFFERENT field-naming conventions for
 * what is conceptually the same "post" object — confirmed by directly
 * harvesting and comparing real payloads, not assumed:
 *  - the feed page's embedded __NEXT_DATA__ uses camelCase
 *    (`createdAt`, `userId`, `labelId`, `metadata.title`)
 *  - api2.skool.com's comment endpoint uses snake_case
 *    (`created_at`, `user_id`, `parent_id`, `root_id`)
 * Two separate parsers below, not one "shared" one — trying to force them
 * into a single shape would have been a guess, not a verified fact.
 */

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

interface RawMemberUser {
  id: string;
  name: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  createdAt?: string;
  metadata?: {
    bio?: string;
    pictureProfile?: string;
    spData?: string;
  };
  member?: {
    id?: string;
    role?: string;
    approvedAt?: string;
    createdAt?: string;
    metadata?: {
      /** Populated for SOME members (observed: a minority, correlates with
       *  paid/Stripe-checkout joins that capture a billing email) — real,
       *  but not a complete source on its own. Cross-checked against the
       *  CSV export in csv-enrichment.ts, never assumed sufficient alone. */
      mbme?: string;
      survey?: string;
    };
  };
}

function parseSpData(raw: string | undefined): { pts: number | null; lv: number | null; role: number | null } {
  if (!raw) return { pts: null, lv: null, role: null };
  try {
    const d = JSON.parse(raw) as { pts?: number; lv?: number; role?: number };
    return { pts: d.pts ?? null, lv: d.lv ?? null, role: d.role ?? null };
  } catch {
    return { pts: null, lv: null, role: null };
  }
}

/** Best-effort email recovery straight from Skool's own payload, checked
 *  BEFORE falling back to the CSV in csv-enrichment.ts. Real but partial —
 *  see the `mbme` comment above. */
export function extractEmailFromRawMember(raw: RawMemberUser): string | null {
  const mbme = raw.member?.metadata?.mbme?.trim();
  if (mbme) return mbme.toLowerCase();
  const surveyRaw = raw.member?.metadata?.survey;
  if (surveyRaw) {
    try {
      const survey = JSON.parse(surveyRaw) as { email?: string };
      if (survey.email?.trim()) return survey.email.trim().toLowerCase();
    } catch {
      // malformed survey JSON — not fatal, just no email from this source
    }
  }
  const topLevel = raw.email?.trim();
  return topLevel ? topLevel.toLowerCase() : null;
}

async function extractMembersForTab(
  groupSlug: string,
  tab: "active" | "churned" | "cancelling" | "banned",
  session: SkoolSession,
): Promise<SkoolMember[]> {
  const members: SkoolMember[] = [];
  let page = 1;
  const tabQuery = tab === "active" ? "" : `t=${tab}`;
  // Members page is itself paginated (confirmed: 68 active members across 3
  // pages of 30 in the source community) via the same page-number pattern
  // as the feed.
  for (;;) {
    const params = [tabQuery, page > 1 ? `p=${page}` : ""].filter(Boolean).join("&");
    const url = `https://www.skool.com/${groupSlug}/-/members${params ? `?${params}` : ""}`;
    const props = await fetchSkoolPageProps(url, session);
    const users = (Array.isArray(props.users) ? props.users : []) as RawMemberUser[];
    if (users.length === 0) break;

    for (const u of users) {
      const sp = parseSpData(u.metadata?.spData);
      members.push({
        skoolUserId: u.id,
        name: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.name,
        handle: u.name,
        email: extractEmailFromRawMember(u) ?? "",
        bio: u.metadata?.bio ?? "",
        avatarUrl: u.metadata?.pictureProfile ?? null,
        joinedAtIso: u.member?.approvedAt ?? u.member?.createdAt ?? u.createdAt ?? null,
        points: sp.pts,
        level: sp.lv,
        role: sp.role,
        membershipTab: tab === "active" ? "active" : "churned",
      });
    }

    const totalPages = typeof props.totalPages === "number" ? props.totalPages : 1;
    if (page >= totalPages) break;
    page += 1;
  }
  return members;
}

/**
 * Active members (real GroupMembership) PLUS churned/cancelling/banned
 * members (identity-only, so their historical posts/comments keep real
 * authorship instead of silently dropping — see `SkoolMember.membershipTab`
 * for exactly what each status gets). Found live: 3 of this Community's
 * real posts were authored by since-churned members, invisible on the
 * default "Active" tab alone.
 */
export async function extractAllMembers(
  groupSlug: string,
  session: SkoolSession,
): Promise<SkoolMember[]> {
  const [active, churned, cancelling, banned] = await Promise.all([
    extractMembersForTab(groupSlug, "active", session),
    extractMembersForTab(groupSlug, "churned", session),
    extractMembersForTab(groupSlug, "cancelling", session),
    extractMembersForTab(groupSlug, "banned", session),
  ]);
  const byId = new Map<string, SkoolMember>();
  // Active wins on id collision (shouldn't happen — the tabs are disjoint —
  // but if Skool ever double-lists someone, prefer the "real" status).
  for (const m of [...churned, ...cancelling, ...banned, ...active]) byId.set(m.skoolUserId, m);
  void fetchSkoolMembersProps; // kept exported for callers that just want page 1
  return [...byId.values()];
}

// ---------------------------------------------------------------------------
// Categories (used as Channel names) — see the module-level comment: no
// clean JSON source for the id->name mapping was found; extracted from the
// rendered filter-chip buttons instead, one real DOM read, not a guess.
// ---------------------------------------------------------------------------

export interface SkoolCategory {
  id: string;
  /** Includes the emoji, matching how Skool itself displays it — the
   *  mapping layer decides whether to split the emoji into Channel.icon. */
  label: string;
}

// ---------------------------------------------------------------------------
// Posts (feed pages, camelCase)
// ---------------------------------------------------------------------------

interface RawFeedPost {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  userId: string;
  labelId?: string;
  metadata: {
    title?: string;
    content?: string;
    pinned?: number | boolean;
    upvotes?: number;
    videoIds?: string;
    imagePreview?: string;
    /** The comments API's "short id" is this field's first 8 characters —
     *  confirmed live by testing it against 5 different real posts, all
     *  succeeding. Earlier attempts assumed it was scraped from a rendered
     *  `<a href>` on the feed page, which only covered ~3-5 posts per
     *  ~30-post page (most feed items route client-side with no real href
     *  at all) — this field is present on every post that HAS at least one
     *  comment, which is exactly the set that ever needs this id in the
     *  first place. */
    lastCommentId?: string;
  };
}

function parsePinned(v: number | boolean | undefined): boolean {
  return v === 1 || v === true;
}

function toSkoolPost(raw: RawFeedPost, categories: Map<string, string>): SkoolPost {
  const attachments: SkoolAttachment[] = [];
  if (raw.metadata.videoIds) {
    attachments.push({ kind: "video", url: raw.metadata.videoIds });
  }
  if (raw.metadata.imagePreview) {
    attachments.push({ kind: "image", url: raw.metadata.imagePreview });
  }
  // Posts with zero comments have no lastCommentId, and correctly need no
  // shortId at all — nothing to fetch either way.
  const shortId = raw.metadata.lastCommentId?.slice(0, 8) ?? "";
  return {
    skoolPostId: raw.id,
    shortId,
    title: raw.metadata.title ?? "",
    bodyHtml: raw.metadata.content ?? "",
    authorSkoolUserId: raw.userId,
    category: raw.labelId ? (categories.get(raw.labelId) ?? null) : null,
    pinned: parsePinned(raw.metadata.pinned),
    upvotes: raw.metadata.upvotes ?? 0,
    createdAtIso: raw.createdAt,
    updatedAtIso: raw.updatedAt ?? null,
    attachments,
  };
}

export async function extractAllPosts(
  groupSlug: string,
  session: SkoolSession,
  categories: Map<string, string>,
): Promise<SkoolPost[]> {
  // Deduped by skoolPostId, not a plain array — confirmed live the same
  // post (pinned posts, specifically) can appear on more than one fetched
  // feed page, since Skool re-surfaces pinned posts at the top of every
  // page rather than only page 1. A plain push() here double-counted 3 of
  // 123 raw entries as 3 distinct posts, silently inflating every
  // downstream "would create" count by however many pinned posts exist.
  const byId = new Map<string, SkoolPost>();
  // A pinned post's SECOND appearance (its natural chronological position,
  // confirmed live to sit on the SAME page as its pinned "featured" copy —
  // not just a later page) reports `pinned: undefined`, not `1`. Since
  // byId.set() below always takes whichever raw occurrence is processed
  // LAST, a pinned post's flag was silently being overwritten back to
  // false — found live checking Phase 3's actual written data (0 pinned
  // posts in Firestore vs. 3 real pinned posts on Skool). Tracked
  // independently of the Map so pinned-ness from ANY occurrence always
  // wins, regardless of which occurrence's other fields end up in byId.
  const pinnedIds = new Set<string>();
  let page = 1;
  let rawCount = 0;
  for (;;) {
    const { postTrees, total } = await fetchSkoolFeedPage(groupSlug, page, session);
    if (postTrees.length === 0) break;
    for (const tree of postTrees as { post?: RawFeedPost }[]) {
      if (!tree.post) continue;
      rawCount += 1;
      if (parsePinned(tree.post.metadata.pinned)) pinnedIds.add(tree.post.id);
      byId.set(tree.post.id, toSkoolPost(tree.post, categories));
    }
    if (byId.size >= total || rawCount >= total) break;
    page += 1;
    if (page > 200) break; // sanity guard against an infinite loop on unexpected shapes
  }
  for (const id of pinnedIds) {
    const post = byId.get(id);
    if (post && !post.pinned) post.pinned = true;
  }
  const posts = [...byId.values()];
  return posts;
}

/**
 * Best-effort image-metadata enrichment for POST-level images. Unlike
 * comment attachments (whose `attachments_data` JSON already carries
 * content-type/size/dimensions directly from Skool), the feed payload gives
 * post images as a bare URL (`metadata.imagePreview`) with nothing else —
 * but Magnetix's `ImageAttachment` requires a real `mimeType`/
 * `fileSizeBytes`. A plain HEAD request resolves both.
 *
 * This does NOT need the CDP browser transport: `assets.skool.com` (the
 * static asset CDN post images actually live on) is confirmed, live, to sit
 * OUTSIDE the CloudFront/WAF layer that blocks bare server-side `fetch()`
 * against `www.skool.com`/`api2.skool.com` — a plain Node `fetch` HEAD
 * against a real asset URL returned 200 with real `content-type`/
 * `content-length` headers.
 *
 * Best-effort by design: a failed/timed-out HEAD leaves the attachment's
 * `contentType`/`fileSizeBytes` unset — `mapSkoolAttachments` (mapping.ts)
 * has an honest fallback for exactly that case, so one flaky request can
 * never block the whole import. Deduped by URL so a request is never
 * repeated for the same asset.
 */
export async function enrichPostImageAttachments(posts: SkoolPost[]): Promise<void> {
  const attachmentsByUrl = new Map<string, SkoolAttachment[]>();
  for (const post of posts) {
    for (const a of post.attachments) {
      if (a.kind !== "image") continue;
      const list = attachmentsByUrl.get(a.url) ?? [];
      list.push(a);
      attachmentsByUrl.set(a.url, list);
    }
  }
  await Promise.all(
    [...attachmentsByUrl.entries()].map(async ([url, attachmentsForUrl]) => {
      try {
        const res = await fetch(url, { method: "HEAD" });
        if (!res.ok) return;
        const contentType = res.headers.get("content-type");
        const contentLength = res.headers.get("content-length");
        for (const a of attachmentsForUrl) {
          if (contentType) a.contentType = contentType;
          if (contentLength) a.fileSizeBytes = Number(contentLength);
        }
      } catch {
        // Best-effort only — a network hiccup here must not block extraction.
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Comments (api2.skool.com, snake_case, real nested tree)
// ---------------------------------------------------------------------------

interface RawCommentNode {
  post: {
    id: string;
    created_at: string;
    updated_at?: string;
    user_id: string;
    parent_id: string;
    root_id: string;
    metadata?: {
      content?: string;
      upvotes?: number;
      attachments_data?: string;
    };
  };
  children?: RawCommentNode[];
}

/**
 * Classifies a comment attachment's real MIME type into a
 * `SkoolAttachment.kind`. Confirmed live against the 2 real "other"-labeled
 * attachments this Community actually has (the OLD classifier's fallback
 * for anything non-image): one was `audio/webm` (a voice message — Magnetix
 * already has a `voice` MediaAttachment kind for exactly this) and one was
 * `application/pdf` (a document — Magnetix already has a `file`
 * MediaAttachment kind for exactly this). Neither was genuinely
 * unsupported; the old classifier just hadn't been taught to look. Anything
 * with NO content type at all falls through to "other" as an honest
 * "couldn't classify," not a guess.
 */
function classifyAttachmentKind(contentType: string): SkoolAttachment["kind"] {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("audio/")) return "voice";
  if (contentType.startsWith("video/")) return "video"; // deferred downstream, same as post-level video
  if (contentType) return "file"; // any other real, named content type Magnetix's FileAttachment can represent
  return "other";
}

function parseAttachmentsData(raw: string | undefined): SkoolAttachment[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as {
      metadata?: {
        content_type?: string;
        read_url?: string;
        file_name?: string;
        src_content_length?: number;
        src_width?: number;
        src_height?: number;
      };
    }[];
    return arr
      .map((a) => {
        const url = a.metadata?.read_url;
        if (!url) return null;
        const contentType = a.metadata?.content_type ?? "";
        return {
          kind: classifyAttachmentKind(contentType),
          url,
          fileName: a.metadata?.file_name,
          contentType,
          fileSizeBytes: a.metadata?.src_content_length,
          width: a.metadata?.src_width,
          height: a.metadata?.src_height,
        } as SkoolAttachment;
      })
      .filter((a): a is SkoolAttachment => a !== null);
  } catch {
    return [];
  }
}

function flattenCommentTree(nodes: RawCommentNode[], postId: string, out: SkoolComment[]): void {
  for (const node of nodes) {
    const p = node.post;
    out.push({
      skoolCommentId: p.id,
      postId,
      rawParentId: p.parent_id,
      authorSkoolUserId: p.user_id,
      bodyHtml: p.metadata?.content ?? "",
      upvotes: p.metadata?.upvotes ?? 0,
      createdAtIso: p.created_at,
      updatedAtIso: p.updated_at ?? null,
      attachments: parseAttachmentsData(p.metadata?.attachments_data),
    });
    if (node.children?.length) flattenCommentTree(node.children, postId, out);
  }
}

export async function extractCommentsForPost(
  postId: string,
  postShortId: string,
  groupId: string,
  session: SkoolSession,
): Promise<SkoolComment[]> {
  const raw = await fetchSkoolComments({ postId, postShortId, groupId, session, limit: 25 });
  const out: SkoolComment[] = [];
  const children = (raw.post_tree?.children ?? []) as RawCommentNode[];
  flattenCommentTree(children, postId, out);
  return out;
}
