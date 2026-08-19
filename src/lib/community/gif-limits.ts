/**
 * Client-safe GIF attachment caps — same convention as poll-limits.ts:
 * a tiny, framework-agnostic constants module both the server-side
 * validator (normalize-post-attachments.ts) and client-side composer UI
 * import, so the two can never drift out of sync. Split out of the GIPHY
 * SDK wrapper (giphy-client.ts) specifically so importing a limit doesn't
 * drag in `@giphy/js-fetch-api` anywhere that only needs the number.
 */
export const MAX_GIFS_PER_POST = 1;
export const MAX_GIFS_PER_COMMENT = 1;
