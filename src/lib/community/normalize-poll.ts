import "server-only";

import type { CommunityPoll, CommunityPollOption } from "@/types/community";
import { MIN_POLL_OPTIONS, MAX_POLL_OPTIONS, MAX_POLL_OPTION_LENGTH } from "@/lib/community/poll-limits";

export { MIN_POLL_OPTIONS, MAX_POLL_OPTIONS, MAX_POLL_OPTION_LENGTH };

export interface PollDraft {
  options: { text: string }[];
  allowMultiple: boolean;
  showResults: boolean;
  /** ISO string or null — the composer's `<input type="datetime-local">`
   *  value, converted here (not client-side) so the server is the one
   *  source of truth for what "a valid end date" means. */
  endsAt: string | null;
}

/**
 * Validate + normalize a client-supplied poll draft into stored shape —
 * shared by the post-create and post-edit routes (same "one validator, two
 * call sites can never disagree" convention as
 * `normalizePostAttachments`/`normalizeCommentAttachments`). Returns `null`
 * for "no poll" (not an error) so a plain post's create/edit request needs
 * no special-casing. Throws a plain `Error` (caught by the route and
 * turned into a 400) for a genuinely malformed draft — this is NOT the
 * permission check (only a moderator may submit a non-null `poll` in the
 * first place; the route checks that BEFORE calling this, since "you're
 * not allowed to do this at all" and "what you tried to do is malformed"
 * are different, differently-worded errors).
 */
export function normalizePollDraft(raw: unknown): CommunityPoll | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") throw new Error("Invalid poll");
  const d = raw as Partial<PollDraft>;

  const rawOptions = Array.isArray(d.options) ? d.options : [];
  const options: CommunityPollOption[] = rawOptions
    .map((o, i) => {
      const text = typeof o?.text === "string" ? o.text.trim().slice(0, MAX_POLL_OPTION_LENGTH) : "";
      return text ? { id: `opt_${i}_${Math.random().toString(36).slice(2, 8)}`, text } : null;
    })
    .filter((o): o is CommunityPollOption => !!o);

  if (options.length < MIN_POLL_OPTIONS) {
    throw new Error(`A poll needs at least ${MIN_POLL_OPTIONS} options`);
  }
  if (options.length > MAX_POLL_OPTIONS) {
    throw new Error(`A poll can have at most ${MAX_POLL_OPTIONS} options`);
  }

  let endsAtDate: Date | null = null;
  if (typeof d.endsAt === "string" && d.endsAt.trim()) {
    const parsed = new Date(d.endsAt);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error("Invalid poll end date");
    }
    if (parsed.getTime() <= Date.now()) {
      throw new Error("Poll end date must be in the future");
    }
    endsAtDate = parsed;
  }

  return {
    options,
    allowMultiple: d.allowMultiple === true,
    showResults: d.showResults === true,
    // Callers pass this straight through to Firestore, which accepts a
    // real Date/Timestamp — the FieldValue.serverTimestamp() cases (for
    // `createdAt`/`updatedAt`) never apply to `endsAt`, an operator-chosen
    // time, not "now".
    endsAt: endsAtDate as unknown as CommunityPoll["endsAt"],
    voterCount: 0,
    optionCounts: Object.fromEntries(options.map((o) => [o.id, 0])),
  };
}

/**
 * Re-validate an EDIT against the poll as currently stored, enforcing the
 * "no votes yet -> edit freely; votes exist -> options/allowMultiple are
 * immutable" rule from the product spec (Part 9). Only `showResults` and
 * `endsAt` may change once `voterCount > 0` — attempting to also change
 * options/allowMultiple is rejected outright (not silently ignored) so the
 * moderator gets a clear signal rather than a confusing partial save.
 * Preserves the EXISTING `optionCounts`/`voterCount` untouched either way;
 * this function never resets vote data.
 */
export function normalizePollEdit(
  raw: unknown,
  existing: CommunityPoll | undefined,
): CommunityPoll | null | undefined {
  // `undefined` = the edit request didn't touch the poll at all (distinct
  // from `null`, which means "remove the poll"). A post without a poll
  // stays that way unless the caller explicitly sends one.
  if (raw === undefined) return undefined;
  if (raw === null) {
    if (existing && existing.voterCount > 0) {
      throw new Error("Can't remove a poll that already has votes");
    }
    return null;
  }
  const draft = normalizePollDraft(raw);
  if (!draft) return null;

  if (!existing) return draft;
  if (existing.voterCount === 0) {
    // No votes yet -- free to redefine the poll from scratch, but existing
    // vote bookkeeping (all zero anyway) carries over rather than being
    // reconstructed, for a single source of truth on the shape.
    return draft;
  }

  // Votes exist -- options/allowMultiple are locked. Compared by TEXT +
  // ORDER only, never by id: `normalizePollDraft` mints a fresh random id
  // for every option on every submission (the client never round-trips
  // the original ids), so comparing ids would spuriously reject a no-op
  // re-save. And critically, on a genuine match we return `existing`'s
  // options VERBATIM (original ids intact) rather than the freshly
  // generated `draft.options` — every stored vote's `optionIds` points at
  // the ORIGINAL ids, so silently swapping in new ones here would orphan
  // every existing vote even though nothing about the poll actually
  // changed. A reorder without a text/count change is still rejected too
  // (not just additions/removals/renames) since it changes which answer
  // "option 2" visually means, even if a stored vote's id still resolves.
  const sameOptions =
    existing.options.length === draft.options.length &&
    existing.options.every((o, i) => o.text === draft.options[i]?.text);
  if (!sameOptions || existing.allowMultiple !== draft.allowMultiple) {
    throw new Error(
      "This poll already has votes, so its options and multiple-answer setting can't be changed. You can still update results visibility and the end date.",
    );
  }

  return {
    ...existing,
    showResults: draft.showResults,
    endsAt: draft.endsAt,
  };
}
