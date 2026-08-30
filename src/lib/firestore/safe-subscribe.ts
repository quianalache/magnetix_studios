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
  onError: (err: unknown) => void,
): (() => void) | undefined {
  try {
    return register();
  } catch (err) {
    onError(err);
    return undefined;
  }
}
