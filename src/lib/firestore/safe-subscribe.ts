/**
 * 2026-08-30 CRM-wide stability pass.
 *
 * A currently-open upstream Firestore JS SDK bug (firebase-js-sdk#9267,
 * "INTERNAL ASSERTION FAILED... Unexpected state") can leave the shared
 * client Firestore instance in a corrupted state such that the NEXT
 * `onSnapshot()` registration to run on the page throws SYNCHRONOUSLY,
 * instead of routing the failure through its own `onError` callback the
 * way a well-behaved async API should. First found and fixed for
 * Community/Courses (see `useResilientList`, `SubAccountProvider`,
 * `Sidebar`); this same failure mode turned out to reach far more of the
 * app than those two routes, because several of the affected listeners
 * — `useAgency()` chief among them — are mounted in shared, layout-level
 * components that render on literally every dashboard page, above any
 * route's own `error.tsx`. An uncaught throw there takes down the WHOLE
 * app shell, not just one page's content, which is why the crash showed
 * up as "unusable" across a wide, seemingly-unrelated set of routes.
 *
 * `safeSubscribe` is the one shared primitive every listener registration
 * in this app should go through: it makes a synchronous throw behave
 * exactly like the caller's own async failure path (never reaching React
 * render), instead of every call site hand-rolling its own try/catch.
 */
export function safeSubscribe(
  register: () => (() => void) | undefined,
  onError: (err: unknown) => void
): (() => void) | undefined {
  try {
    return register();
  } catch (err) {
    onError(err);
    return undefined;
  }
}

/**
 * Recurring-regression root-cause fix (this incident, and — per the
 * evidence below — every occurrence of this class of failure back to the
 * 2026-08-30 pass above).
 *
 * `safeSubscribe` only guards the SYNCHRONOUS-THROW manifestation of the
 * underlying firebase-js-sdk#9267 bug (a corrupted listener registration
 * call throwing instead of routing through its own `onError`). That
 * commit's own message said so explicitly: "Not fixed and not fixable at
 * the app-code level... this closes every listener-registration site...
 * not a fix to the SDK's own state corruption." The SAME bug has a
 * SECOND, silent manifestation `safeSubscribe` does nothing for: the
 * listener registers without throwing, and then simply never calls
 * EITHER its success or error callback again — no crash, no error, the
 * page just spins forever. This is the exact "false-lock" behavior
 * `useResilientList`'s own doc comment already named and solved for
 * Courses/Community's LIST data — but `AuthProvider`, `SubAccountProvider`,
 * and `useAgency()` (the app's three most foundational listeners — every
 * authenticated page depends on the first two, and the CRM's saved color
 * theme depends on the third) were never given that same protection, only
 * the weaker `safeSubscribe` throw-guard. Because those three sit ABOVE
 * every dashboard route (not inside any one page's own content), a hang
 * in any of them blocks literally everything downstream simultaneously —
 * exactly the "Contacts, Conversations, Pipeline, Tasks, Projects,
 * Calendar, and Pages & Funnels are all stuck loading, and the theme
 * reverted to default, at the same time" symptom, and exactly why this
 * keeps recurring: the underlying SDK bug is still unfixed upstream, and
 * every new Firestore listener added anywhere in this app (by any of the
 * concurrent sessions working on this repo) is one more chance to trip
 * it — but only these three call sites can take the WHOLE app shell down
 * with them when it happens.
 *
 * `safeSubscribeWithTimeout` closes the silent-hang gap: `register` is
 * handed an `onSettled()` callback it MUST call from inside its own
 * success/error handler(s) (both the throw-safe path AND the "it just
 * never calls back" path are covered — this is a genuinely different,
 * stricter contract from `safeSubscribe`, so it's a new function, not a
 * behavior change to the existing one every other call site already
 * depends on unchanged). If `onSettled()` hasn't fired within `timeoutMs`,
 * `onFallback("timeout")` fires instead — the caller's job is to resolve
 * its OWN loading state from that (ideally via a one-shot, non-listener
 * read, which exercises a different SDK code path than the corrupted
 * watch stream and is therefore not expected to share the same failure
 * mode) rather than leave the UI spinning indefinitely. A late real
 * snapshot arriving AFTER a timeout fallback is harmless and expected —
 * this never unsubscribes the real listener, so if it recovers on its
 * own, the caller's state simply updates again with live data.
 */
export function safeSubscribeWithTimeout(
  register: (onSettled: () => void) => (() => void) | undefined,
  onFallback: (reason: "sync-throw" | "timeout") => void,
  timeoutMs = 8000
): (() => void) | undefined {
  let settled = false;
  const onSettled = () => {
    settled = true;
  };
  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      onFallback("timeout");
    }
  }, timeoutMs);
  try {
    const unsub = register(onSettled);
    return () => {
      clearTimeout(timer);
      unsub?.();
    };
  } catch (err) {
    clearTimeout(timer);
    if (!settled) {
      settled = true;
      onFallback("sync-throw");
    }
    console.error("[safeSubscribeWithTimeout] registration threw", err);
    return undefined;
  }
}
