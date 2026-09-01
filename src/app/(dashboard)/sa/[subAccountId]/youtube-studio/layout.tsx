"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { cn } from "@/lib/utils";

/**
 * YouTube Content Studio module shell — Phase 1. Final internal product
 * areas per the migration spec: Dashboard, Video Workspace, Saved Ideas,
 * Video Library, Settings. "Channel Brain" is deliberately absent here —
 * it's no longer a YTCS-owned data source (see Settings' Business Brain
 * link instead).
 */
const NAV_ITEMS = [
  { href: "", label: "Dashboard" },
  { href: "/workspace", label: "Video Workspace" },
  { href: "/ideas", label: "Saved Ideas" },
  { href: "/videos", label: "Video Library" },
  { href: "/settings", label: "Settings" },
];

export default function YtcsLayout({ children }: { children: React.ReactNode }) {
  const { saPath } = useSubAccount();
  const pathname = usePathname();
  const base = saPath("/youtube-studio");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <Clapperboard className="h-4.5 w-4.5" />
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight">YouTube Content Studio</h1>
          <p className="text-sm text-muted-foreground">
            Turn ideas into strategic YouTube videos.
          </p>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b pb-px">
        {NAV_ITEMS.map((item) => {
          const href = `${base}${item.href}`;
          const isActive = item.href === "" ? pathname === base : pathname.startsWith(href);
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "rounded-t-lg px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
