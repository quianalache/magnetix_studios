"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  Check,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAgency } from "@/hooks/use-agency";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface WorkspaceSwitcherProps {
  className?: string;
  onSwitched?: () => void;
}

function activeSubAccountFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/sa\/([^/]+)/);
  return match ? match[1] : null;
}

export function WorkspaceSwitcher({
  className,
  onSwitched,
}: WorkspaceSwitcherProps) {
  const { memberships, agencyRole } = useAuth();
  const agency = useAgency();
  const router = useRouter();
  const pathname = usePathname();
  const activeSubId = activeSubAccountFromPath(pathname);
  const activeMembership = memberships.find(
    (m) => m.subAccountId === activeSubId,
  );
  const isAgencyOwner = agencyRole === "owner";
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => setAuthReady(true), []);

  if (
    !authReady ||
    (!isAgencyOwner && memberships.length === 0) ||
    (!activeSubId && memberships.length <= 1 && !isAgencyOwner)
  ) {
    return null;
  }

  function handleSwitchSubAccount(targetSubId: string) {
    if (!activeSubId) {
      router.push(`/sa/${targetSubId}/dashboard`);
    } else {
      // Preserve the current section when moving between workspaces.
      const tail = pathname.replace(/^\/sa\/[^/]+/, "");
      router.push(`/sa/${targetSubId}${tail || "/dashboard"}`);
    }
    onSwitched?.();
  }

  function handleSwitchAgency() {
    router.push("/agency");
    onSwitched?.();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className={cn("gap-2", className)}
          />
        }
      >
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 truncate">
          {!activeSubId && isAgencyOwner
            ? "Agency"
            : activeMembership
              ? `${
                  activeMembership.accountNumber !== undefined
                    ? `#${activeMembership.accountNumber} `
                    : ""
                }${activeMembership.name}`
              : "Pick workspace"}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        {isAgencyOwner && (
          <>
            <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              Agency
            </div>
            <DropdownMenuItem
              onClick={handleSwitchAgency}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Building2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{agency.name}</span>
              </span>
              {!activeSubId && (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          Workspaces
        </div>
        {memberships.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No workspaces yet.
          </p>
        ) : (
          memberships.map((m) => (
            <DropdownMenuItem
              key={m.subAccountId}
              onClick={() => handleSwitchSubAccount(m.subAccountId)}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex min-w-0 items-baseline gap-2">
                {m.accountNumber !== undefined && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    #{m.accountNumber}
                  </span>
                )}
                <span className="truncate">{m.name || m.subAccountId}</span>
              </span>
              {m.subAccountId === activeSubId && (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
