import "server-only";

import type { SkoolSession } from "./skool-session";

/**
 * Raw HTTP layer against Skool's own authenticated surfaces — nothing here
 * knows about Magnetix's data model, it just fetches and lightly parses
 * what the owner's own authenticated session legitimately has access to.
 * Two real structured sources exist (confirmed by live investigation):
 *  - every SSR page embeds a `__NEXT_DATA__` script tag with full
 *    server-fetched props (feed, members, about, course structure)
 *  - `api2.skool.com` is a separate authenticated JSON API, confirmed for
 *    comment trees (`/posts/{id}/comments/links/{shortId}`)
 *
 * No public/documented Skool API is used or assumed. No security control is
 * bypassed — every request goes through the real, already-authenticated
 * browser session (see skool-session.ts for why).
 */

/**
 * Fetch an SSR Skool page and pull out `__NEXT_DATA__.props.pageProps` — the
 * full server-fetched data for that page (feed, members, about, classroom).
 */
export async function fetchSkoolPageProps(
  url: string,
  session: SkoolSession,
): Promise<Record<string, unknown>> {
  const html = await session.transport.fetchText(url);
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
  );
  if (!match) throw new Error(`No __NEXT_DATA__ found at ${url} — page shape may have changed`);
  const parsed = JSON.parse(match[1]) as { props?: { pageProps?: Record<string, unknown> } };
  return parsed.props?.pageProps ?? {};
}

/** Community feed page, one page of posts (Skool's own `page`/`p` param, 1-based). */
export async function fetchSkoolFeedPage(
  groupSlug: string,
  page: number,
  session: SkoolSession,
): Promise<{ postTrees: unknown[]; total: number; page: number }> {
  const url = `https://www.skool.com/${groupSlug}${page > 1 ? `?p=${page}` : ""}`;
  const props = await fetchSkoolPageProps(url, session);
  return {
    postTrees: Array.isArray(props.postTrees) ? props.postTrees : [],
    total: typeof props.total === "number" ? props.total : 0,
    page: typeof props.page === "number" ? props.page : page,
  };
}

/** Members directory page — see csv-enrichment.ts for why `email` on these
 *  is almost always redacted to "" by Skool itself. */
export async function fetchSkoolMembersProps(
  groupSlug: string,
  session: SkoolSession,
): Promise<Record<string, unknown>> {
  return fetchSkoolPageProps(`https://www.skool.com/${groupSlug}/-/members`, session);
}

export async function fetchSkoolClassroomProps(
  groupSlug: string,
  session: SkoolSession,
): Promise<Record<string, unknown>> {
  return fetchSkoolPageProps(`https://www.skool.com/${groupSlug}/classroom`, session);
}

export async function fetchSkoolCourseProps(
  groupSlug: string,
  courseShortId: string,
  session: SkoolSession,
): Promise<Record<string, unknown>> {
  return fetchSkoolPageProps(
    `https://www.skool.com/${groupSlug}/classroom/${courseShortId}`,
    session,
  );
}

/**
 * Full comment tree for one post, via the real `api2.skool.com` endpoint
 * (confirmed live: `GET /posts/{postId}/comments/links/{shortId}?group-id=...`).
 * Returns the raw `post_tree` — normalization happens in skool-extract.ts.
 */
export async function fetchSkoolComments(opts: {
  postId: string;
  postShortId: string;
  groupId: string;
  session: SkoolSession;
  limit?: number;
}): Promise<{ post_tree?: { children?: unknown[] } }> {
  const url =
    `https://api2.skool.com/posts/${opts.postId}/comments/links/${opts.postShortId}` +
    `?group-id=${opts.groupId}&limit=${opts.limit ?? 100}&pinned=true`;
  const text = await opts.session.transport.fetchText(url);
  return JSON.parse(text) as { post_tree?: { children?: unknown[] } };
}
