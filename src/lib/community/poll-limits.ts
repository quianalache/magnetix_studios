/** Client-safe poll bounds — no `server-only` import, unlike
 *  normalize-poll.ts, which imports these FROM here (same split as
 *  community-image-mime.ts/community-file-mime.ts: caps live somewhere
 *  both the client draft UI and the server validator can import without
 *  pulling `server-only` into a client bundle). */
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 5;
export const MAX_POLL_OPTION_LENGTH = 120;
