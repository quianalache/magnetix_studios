import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentPerson } from "@/lib/server/person-session";
import { personHasStaffAccess } from "@/lib/server/person-identity-service";
import { listPersonMemberships, listAttentionForPerson } from "@/lib/server/mymagnetix-service";
import { countUnreadForPerson } from "@/lib/server/notification-service";
import { MEMBER_SESSION_COOKIE } from "@/lib/community/member-auth";
import { MyMagnetixHeader } from "@/components/mymagnetix/header";
import { MyMagnetixSidebarNav } from "@/components/mymagnetix/sidebar-nav";
import { MyMagnetixInstallBanner } from "@/components/mymagnetix/install-banner";
import { MyMagnetixIdentity } from "@/components/mymagnetix/identity";
import { CrmScope } from "@/components/theme/crm-scope";

export const dynamic = "force-dynamic";

// The MyMagnetix manifest override (start_url: /my) lives at the segment
// root — src/app/my/layout.tsx — so it covers /my/login and /my/gateway
// too, not just this authenticated group. Nothing to add here.

/**
 * MyMagnetix application shell — left navigation + header, applied to every
 * `/my/*` page. Gates on the global `mm_session` only (getCurrentPerson);
 * every page underneath still independently scopes its own reads to that
 * person's real relationships (see mymagnetix-service.ts) rather than
 * trusting anything from this layout.
 */
export default async function MyMagnetixLayout({ children }: { children: ReactNode }) {
  const person = await getCurrentPerson();
  if (!person) {
    // Portal Member -> MyMagnetix bridge (2026-08-16): a visitor already
    // holding a valid tenant Member session shouldn't be asked to log
    // into MyMagnetix again. A Server Component can't mint the mm_session
    // cookie itself (Next only allows cookie writes in a Route Handler/
    // Server Action), so this only checks CHEAP cookie *presence* here —
    // the actual verify + mint happens in the bridge route, which fails
    // safely back to /my/login if the token turns out to be invalid.
    const cookieStore = await cookies();
    const hasMemberCookie = !!cookieStore.get(MEMBER_SESSION_COOKIE)?.value;
    // Lands on Home after bridging rather than preserving the exact
    // sub-path (Next's App Router layout has no reliable server-side
    // "current pathname" accessor without a middleware-injected header)
    // — a minor UX nicety traded for not adding new middleware surface.
    if (hasMemberCookie) redirect("/api/my/bridge-from-member?next=%2Fmy");
    redirect("/my/login");
  }
  // Bell state — the header is shared by every /my/* page, so these small
  // extra reads (attention items reused exactly by the Home page's own
  // richer fetch; unread notification count a single Firestore aggregate
  // query) happen once per navigation. Real, non-fabricated numbers.
  const [hasStaffAccess, memberships] = await Promise.all([
    personHasStaffAccess(person.id),
    listPersonMemberships(person.id),
  ]);
  const [attentionItems, unreadNotificationCount] = await Promise.all([
    listAttentionForPerson(memberships),
    person.emailVerified ? countUnreadForPerson(person.id) : 0,
  ]);

  return (
    // MyMagnetix is Magnetix-owned, so it uses the Visual Direction 2 token
    // scope (CrmScope) — with its own lighter member layout, not the CRM's
    // plum sidebar. Tenant pages it links into keep their own branding.
    <CrmScope>
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-[1440px]">
        <aside id="mymagnetix-sidebar" className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card px-3 py-5 lg:flex">
          <MyMagnetixIdentity className="mb-6 px-2.5" />
          <MyMagnetixSidebarNav />
        </aside>
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          {/*
            Only serializable props (strings/booleans) cross the Server ->
            Client boundary here — the Lucide icon COMPONENT REFERENCES
            used above are functions, which Next.js cannot serialize
            across that boundary. Passing them as a prop to a "use client"
            component throws server-side on every request under this
            layout (caught live: crm.magnetixstudios.com/my returned 500
            despite still streaming a mostly-complete page). Fixed by
            giving MyMagnetixHeader its own local icon lookup, fed only by
            the plain-data MYMAGNETIX_NAV_ITEMS import (href/label/icon
            KEY strings — no component references cross the boundary).
          */}
          <MyMagnetixHeader
            primaryEmail={person.primaryEmail}
            hasStaffAccess={hasStaffAccess}
            attentionItems={attentionItems}
            unreadNotificationCount={unreadNotificationCount}
          />
          <MyMagnetixInstallBanner />
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
    </CrmScope>
  );
}
