import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Home, BookOpen, MessagesSquare, Sparkles } from "lucide-react";
import { getCurrentPerson } from "@/lib/server/person-session";
import { personHasStaffAccess } from "@/lib/server/person-identity-service";
import { MyMagnetixHeader } from "@/components/mymagnetix/header";

export const dynamic = "force-dynamic";

const NAV_ITEMS = [
  { href: "/my", label: "Home", icon: Home },
  { href: "/my/courses", label: "My Courses", icon: BookOpen },
  { href: "/my/communities", label: "My Communities", icon: MessagesSquare },
];

/**
 * MyMagnetix application shell — left navigation + header, applied to every
 * `/my/*` page. Gates on the global `mm_session` only (getCurrentPerson);
 * every page underneath still independently scopes its own reads to that
 * person's real relationships (see mymagnetix-service.ts) rather than
 * trusting anything from this layout.
 */
export default async function MyMagnetixLayout({ children }: { children: ReactNode }) {
  const person = await getCurrentPerson();
  if (!person) redirect("/my/login");
  const hasStaffAccess = await personHasStaffAccess(person.id);

  return (
    <div className="min-h-screen bg-[#F8F7F5]">
      <div className="mx-auto flex w-full max-w-7xl">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-[#E4E4E4] bg-white px-4 py-6 lg:flex">
          <div className="mb-8 flex items-center gap-2 px-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-bold text-white"
              style={{ background: "#5E2574" }}
            >
              MM
            </div>
            <span className="font-serif text-[16px] font-semibold text-[#202124]">MyMagnetix</span>
          </div>
          <nav className="flex flex-1 flex-col gap-0.5">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium text-[#5B5B62] transition-colors hover:bg-[#F3E4F0] hover:text-[#5E2574]"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto rounded-xl bg-[#F3E4F0] p-4 text-left">
            <Sparkles className="h-4 w-4 text-[#5E2574]" />
            <p className="mt-2 text-[12px] font-semibold text-[#5E2574]">Discover</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#5E2574]/80">
              Explore Communities &amp; Courses across Magnetix. Coming soon.
            </p>
          </div>
        </aside>
        <div className="flex min-h-screen flex-1 flex-col">
          {/*
            Only serializable props (strings/booleans) cross the Server ->
            Client boundary here — the Lucide icon COMPONENT REFERENCES in
            NAV_ITEMS above are functions, which Next.js cannot serialize
            across that boundary. Passing them as a prop to a "use client"
            component throws server-side on every request under this
            layout (caught live: crm.magnetixstudios.com/my returned 500
            despite still streaming a mostly-complete page). Fixed by
            giving MyMagnetixHeader its own local copy of the nav items
            (same hrefs/labels, icons imported directly in that client
            file) instead of receiving them as a prop.
          */}
          <MyMagnetixHeader
            primaryEmail={person.primaryEmail}
            hasStaffAccess={hasStaffAccess}
          />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
