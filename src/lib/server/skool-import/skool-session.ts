import "server-only";

import { CdpBrowserTransport, type SkoolTransport } from "./cdp-browser-transport";

/**
 * A Skool session is "something that can fetch a URL as an authenticated
 * Skool user." How that authentication was established is deliberately
 * decoupled from everything downstream (skool-client.ts only ever calls
 * `session.transport.fetchText(url)`) — this is the one seam a future
 * self-service login flow needs to fill.
 *
 * Credential handling (explicit product requirement):
 *  - Nothing in this module ever sees, stores, or logs a Skool password.
 *    There is no password field anywhere in this type.
 *  - For THIS run, the transport is `CdpBrowserTransport` — the real Chrome
 *    tab Quiana authenticated in herself. Every request is made by that
 *    real browser's own `fetch`, inheriting its real cookies; this code
 *    never reads or handles the session cookie value directly (see that
 *    module's comment for why: Skool's WAF blocks a bare server-side
 *    fetch, confirmed live, so routing through the real browser isn't just
 *    the safer choice, it's the only one that reliably works today).
 *  - A future self-service `PasswordSkoolSessionProvider` would perform its
 *    own login (almost certainly needing a real headless-browser session
 *    for the same WAF reason) and hand back a `SkoolSession` with a
 *    different `SkoolTransport` implementation — `skool-client.ts` and
 *    every layer above it needs zero changes when that lands.
 */
export interface SkoolSession {
  transport: SkoolTransport;
}

/**
 * TEMPORARY first-run bridge: wraps the already-open, already-authenticated
 * Chrome tab (opened for the manual-login investigation phase) as a
 * `SkoolSession`. `cdpPort`/`tabId` identify that tab — this run's ops
 * detail, not something a future self-service UI would ever need to know.
 */
export function createBrowserBridgedSkoolSession(cdpPort: number, tabId: string): SkoolSession {
  return { transport: new CdpBrowserTransport(cdpPort, tabId) };
}
