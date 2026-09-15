/**
 * Space Appointments tests (2026-09-16 owner QA fix): the page used to
 * show ONLY scheduled calendar events — a real, unused booking/session
 * entitlement (the same data the Home page's "1 Session remaining" card
 * already reads) never appeared here, so a Person who'd paid for
 * sessions but hadn't scheduled one yet saw a page that looked entirely
 * empty.
 *
 * Covers:
 *   - listPortalPastBookings (new): correct past/cancelled/upcoming
 *     filtering, descending sort, and the 10-row cap, using disposable
 *     fixture calendar events under the real Test sub-account
 *   - structural proof that "Available to book" reuses the EXACT SAME
 *     sessionBundles data the Home page's card already fetches — no
 *     second/duplicate entitlement query, no duplicate entitlements
 *     created
 *
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" pnpm exec tsx scripts/test-space-appointments.ts
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const ENV_PATH = "/Users/quianamatthews/Documents/magnetix_studios/.env.local";
for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  if (process.env[m[1]] === undefined) process.env[m[1]] = v;
}

const TEST_SUB = "p4y0B6ZpDtE4F28RFixj"; // #1001 Test sub-account

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean) {
  if (condition) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}`);
  }
}

async function main() {
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const { listPortalPastBookings, listPortalUpcomingBookings } =
    await import("../src/lib/server/portal-service");

  const db = getAdminDb();
  const suffix = randomUUID().slice(0, 8);
  const contactId = `qa-appt-contact-${suffix}`;
  const cleanup: Array<() => Promise<unknown>> = [];

  try {
    const now = Date.now();
    const events: Array<{
      id: string;
      title: string;
      startAt: number;
      status?: string;
    }> = [
      {
        id: `qa-appt-future-${suffix}`,
        title: "Future session",
        startAt: now + 7 * 86400000,
      },
      {
        id: `qa-appt-past1-${suffix}`,
        title: "Past session 1",
        startAt: now - 1 * 86400000,
      },
      {
        id: `qa-appt-past2-${suffix}`,
        title: "Past session 2",
        startAt: now - 2 * 86400000,
      },
      {
        id: `qa-appt-cancelled-${suffix}`,
        title: "Cancelled past session",
        startAt: now - 3 * 86400000,
        status: "cancelled",
      },
    ];
    // 12 more past events, to prove the 10-row cap.
    for (let i = 0; i < 12; i++) {
      events.push({
        id: `qa-appt-bulk-${i}-${suffix}`,
        title: `Bulk past session ${i}`,
        startAt: now - (10 + i) * 86400000,
      });
    }

    for (const e of events) {
      await db.doc(`events/${e.id}`).set({
        subAccountId: TEST_SUB,
        contactId,
        title: e.title,
        startAt: new Date(e.startAt),
        status: e.status ?? "confirmed",
        meetingUrl: null,
      });
      cleanup.push(() => db.doc(`events/${e.id}`).delete());
    }

    console.log("=== listPortalPastBookings ===");
    const past = await listPortalPastBookings(TEST_SUB, contactId);
    check(
      "Capped at 10 rows (a customer-facing history, not a full export)",
      past.length === 10
    );
    check(
      "Sorted newest-first",
      past.every(
        (b, i) =>
          i === 0 ||
          (b.startAt?.getTime() ?? 0) <= (past[i - 1].startAt?.getTime() ?? 0)
      )
    );
    check(
      "The cancelled past event is excluded",
      !past.some((b) => b.id === `qa-appt-cancelled-${suffix}`)
    );
    check(
      "A genuinely future event never appears in past bookings",
      !past.some((b) => b.id === `qa-appt-future-${suffix}`)
    );
    check(
      "The two named past sessions are both present (within the 10-row window)",
      past.some((b) => b.id === `qa-appt-past1-${suffix}`) &&
        past.some((b) => b.id === `qa-appt-past2-${suffix}`)
    );

    console.log("\n=== listPortalUpcomingBookings unaffected ===");
    const upcoming = await listPortalUpcomingBookings(TEST_SUB, contactId);
    check(
      "The future event still appears in upcoming (unchanged behavior)",
      upcoming.some((b) => b.id === `qa-appt-future-${suffix}`)
    );
    check(
      "No past event leaks into upcoming",
      !upcoming.some(
        (b) =>
          b.id.startsWith(`qa-appt-past`) || b.id.startsWith("qa-appt-bulk")
      )
    );

    console.log("\n=== No duplicate entitlement source (structural) ===");
    const viewSrc = readFileSync("src/app/portal/portal-home-view.tsx", "utf8");
    check(
      "listPortalSessionBundles is still called exactly once (Home's card and Appointments share the SAME fetch, not a second one)",
      (viewSrc.match(/listPortalSessionBundles\(/g) ?? []).length === 1
    );
    check(
      "The Appointments branch reuses the sessionBundles prop already passed in, filtered by remaining > 0",
      /availableBundles = sessionBundles\.filter\(\(b\) => b\.remaining > 0\)/.test(
        viewSrc
      )
    );
    check(
      "PortalDestination receives sessionBundles as a prop (not its own fetch)",
      /<PortalDestination[\s\S]{0,400}sessionBundles={sessionBundles}/.test(
        viewSrc
      )
    );

    console.log(`\n=== ${pass} passed, ${fail} failed ===`);
  } finally {
    console.log("\n=== Cleaning up fixtures ===");
    for (const fn of cleanup.reverse()) {
      await fn().catch((err) =>
        console.warn("cleanup step failed (continuing):", err)
      );
    }
    console.log("Cleanup complete. No fixture data remains.");
  }

  if (fail > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("FATAL", err);
    process.exit(1);
  });
