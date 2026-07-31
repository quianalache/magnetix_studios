"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import {
  Home,
  Users,
  GitBranch,
  Calendar,
  CalendarClock,
  CheckSquare,
  FileText,
  FileSignature,
  BarChart3,
  Settings,
  LogOut,
  Building2,
  Workflow,
  Globe,
  Compass,
  Lock,
  Send,
  Bot,
  Package,
  ScrollText,
  MessagesSquare,
  Radar,
  Share2,
  GraduationCap,
  BookOpen,
  Sparkles,
  CreditCard,
  FlaskConical,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronRight,
  QrCode,
} from "lucide-react";
import { getFirebaseDb } from "@/lib/firebase/client";
import { GET_LEADS_PARKED } from "@/lib/get-leads/business-types";
import { signOutUser } from "@/lib/firebase/auth";
import { useDueTodayCount } from "@/hooks/use-due-today";
import { useUnreadConversationsCount } from "@/hooks/use-unread-conversations";
import { useAuth } from "@/hooks/use-auth";
import { useAgency } from "@/hooks/use-agency";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo-mark";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Home;
  enabled: boolean;
  badgeKey?: "dueToday" | "unreadConversations";
  matchPrefix?: string;
}

interface NavGroup {
  /** Section header shown above the group — null renders the items with no
   *  header (Dashboard at the top, Sub-Account Settings at the bottom). */
  label: string | null;
  items: NavItem[];
}

/**
 * Per-sub-account nav, grouped into categories (CRM / Calendar / Marketing /
 * Sales / AI / Memberships / Insights) matching the agency's own mental
 * model of the product, rather than one long flat list. `href` is templated
 * with the active sub-account id at render time; `matchPrefix` is the stem
 * used to highlight the active link.
 */
const SUB_ACCOUNT_NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [{ href: "/dashboard", label: "Dashboard", icon: Home, enabled: true }],
  },
  {
    label: "CRM",
    items: [
      {
        href: "/conversations",
        label: "Conversations",
        icon: MessagesSquare,
        enabled: true,
        badgeKey: "unreadConversations",
      },
      { href: "/contacts", label: "Contacts", icon: Users, enabled: true },
      // Get Leads is PARKED — entry hidden while the flag is on. Lives in
      // CRM once unparked, alongside Contacts.
      ...(GET_LEADS_PARKED
        ? []
        : [{ href: "/get-leads", label: "Get Leads", icon: Radar, enabled: true }]),
      { href: "/pipeline", label: "Pipeline", icon: GitBranch, enabled: true },
      {
        href: "/tasks",
        label: "Tasks",
        icon: CheckSquare,
        enabled: true,
        badgeKey: "dueToday",
      },
    ],
  },
  {
    label: "Calendar",
    items: [
      { href: "/calendar", label: "Calendar", icon: Calendar, enabled: true },
      { href: "/booking", label: "Booking", icon: CalendarClock, enabled: true },
    ],
  },
  {
    label: "Marketing",
    items: [
      { href: "/forms", label: "Forms", icon: FileText, enabled: true },
      { href: "/website", label: "Website", icon: Globe, enabled: true },
      { href: "/workflows", label: "Workflows", icon: Workflow, enabled: true },
      { href: "/broadcasts", label: "Broadcasts", icon: Send, enabled: true },
      { href: "/templates", label: "Templates", icon: FileText, enabled: true },
      { href: "/social", label: "Social Planner", icon: Share2, enabled: true },
      { href: "/qr-codes", label: "QR Codes", icon: QrCode, enabled: true },
    ],
  },
  {
    label: "Sales",
    items: [
      { href: "/products", label: "Products", icon: Package, enabled: true },
      { href: "/quotes", label: "Quotes", icon: FileSignature, enabled: true },
    ],
  },
  {
    label: "AI",
    items: [
      { href: "/ai-suite", label: "Workspace Assistant", icon: Sparkles, enabled: true },
      { href: "/ai-agents", label: "AI Agents", icon: Bot, enabled: true },
    ],
  },
  {
    label: "Memberships",
    items: [
      { href: "/community", label: "Community", icon: GraduationCap, enabled: true },
      { href: "/courses", label: "Courses", icon: BookOpen, enabled: true },
    ],
  },
  {
    label: "Insights",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3, enabled: true },
      { href: "/logs", label: "Logs", icon: ScrollText, enabled: true },
      // Labs — the gated container for PRE-RELEASE features (agency opt-in
      // per sub-account via labsEnabledByAgency; hidden-by-default when off).
      { href: "/labs", label: "Labs", icon: FlaskConical, enabled: true },
    ],
  },
  {
    label: null,
    items: [
      {
        href: "/dashboard/settings",
        label: "Sub-Account Settings",
        icon: Settings,
        enabled: true,
      },
    ],
  },
];

const COLLAPSE_STORAGE_KEY = "ls_sidebar_collapsed";
/** Which of the 7 category groups (CRM, Calendar, Marketing, Sales, AI,
 *  Memberships, Insights) are collapsed — stored as a JSON array of group
 *  labels. The Dashboard/Sub-Account Settings entries and the Agency/
 *  Sub-account identity sections are never collapsible, per product
 *  decision — only the named category groups get an expand/collapse. */
const GROUP_COLLAPSE_STORAGE_KEY = "ls_sidebar_collapsed_groups";

interface SidebarProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function activeSubAccountFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/sa\/([^/]+)/);
  return match ? match[1] : null;
}

function SidebarContent({
  collapsed = false,
  onToggleCollapsed,
}: {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const dueToday = useDueTodayCount();
  const unreadConversations = useUnreadConversationsCount();
  const { agencyRole, memberships, loading } = useAuth();
  const agency = useAgency();
  const activeSubId = activeSubAccountFromPath(pathname);
  const subRoot = activeSubId ? `/sa/${activeSubId}` : null;

  // Subscribe to the active sub-account's agency-level feature gates so
  // the sidebar can render locked entries when the agency owner has
  // disabled a feature. `null` = unknown (still loading) — we optimistic-
  // render as enabled until we hear back. Tracking just `broadcasts`
  // for now; other gates (api, email) lock their own sections rather
  // than the sidebar entry.
  const [broadcastsGate, setBroadcastsGate] = useState<boolean | null>(null);
  const [websiteGate, setWebsiteGate] = useState<boolean | null>(null);
  const [socialGate, setSocialGate] = useState<boolean | null>(null);
  const [communityGate, setCommunityGate] = useState<boolean | null>(null);
  const [standaloneCoursesGate, setStandaloneCoursesGate] = useState<
    boolean | null
  >(null);
  const [aiSuiteGate, setAiSuiteGate] = useState<boolean | null>(null);
  const [getLeadsGate, setGetLeadsGate] = useState<boolean | null>(null);
  const [labsGate, setLabsGate] = useState<boolean | null>(null);
  // Per-feature "hide vs. show as Locked" flag. Only consulted when the
  // matching gate is off. HIDDEN IS THE DEFAULT — a disabled feature is omitted
  // entirely so the tenant never knows it exists; the agency owner has to opt a
  // feature into the greyed "Locked" row (by setting the field to `false`).
  const [broadcastsHidden, setBroadcastsHidden] = useState(false);
  const [websiteHidden, setWebsiteHidden] = useState(false);
  const [socialHidden, setSocialHidden] = useState(false);
  const [communityHidden, setCommunityHidden] = useState(false);
  const [standaloneCoursesHidden, setStandaloneCoursesHidden] = useState(false);
  const [getLeadsHidden, setGetLeadsHidden] = useState(false);
  const [aiSuiteHidden, setAiSuiteHidden] = useState(false);
  const [labsHidden, setLabsHidden] = useState(false);

  // Per-group collapse (CRM / Calendar / Marketing / Sales / AI /
  // Memberships / Insights only — Dashboard and Sub-Account Settings stay
  // fixed). Hydrated from localStorage after mount, same pattern as the
  // whole-sidebar collapse, to avoid an SSR/client markup mismatch.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(GROUP_COLLAPSE_STORAGE_KEY);
      if (stored) setCollapsedGroups(new Set(JSON.parse(stored) as string[]));
    } catch {
      // Malformed/legacy value — fall back to "all expanded".
    }
  }, []);
  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      window.localStorage.setItem(
        GROUP_COLLAPSE_STORAGE_KEY,
        JSON.stringify([...next]),
      );
      return next;
    });
  }

  useEffect(() => {
    const linkSubIdLocal = activeSubId ?? memberships[0]?.subAccountId ?? null;
    if (!linkSubIdLocal) {
      setBroadcastsGate(null);
      setWebsiteGate(null);
      setSocialGate(null);
      setCommunityGate(null);
      setStandaloneCoursesGate(null);
      setAiSuiteGate(null);
      setGetLeadsGate(null);
      setLabsGate(null);
      return;
    }
    return onSnapshot(
      doc(getFirebaseDb(), "subAccounts", linkSubIdLocal),
      (snap) => {
        const data = snap.data();
        setBroadcastsGate(data?.broadcastsEnabledByAgency === true);
        setWebsiteGate(data?.websiteEnabledByAgency === true);
        setSocialGate(data?.socialPlannerEnabledByAgency === true);
        setCommunityGate(data?.communityEnabledByAgency === true);
        setStandaloneCoursesGate(
          data?.standaloneCoursesEnabledByAgency === true,
        );
        // Workspace Assistant is opt-in like the other gates — off unless the
        // agency owner explicitly enabled it (legacy/unset reads as off).
        setAiSuiteGate(data?.aiSuiteEnabledByAgency === true);
        setGetLeadsGate(data?.getLeadsEnabledByAgency === true);
        setLabsGate(data?.labsEnabledByAgency === true);
        // Default (unset) → hidden. Only an explicit `false` shows the Locked row.
        setBroadcastsHidden(data?.broadcastsHiddenWhenDisabled !== false);
        setWebsiteHidden(data?.websiteHiddenWhenDisabled !== false);
        setSocialHidden(data?.socialPlannerHiddenWhenDisabled !== false);
        setCommunityHidden(data?.communityHiddenWhenDisabled !== false);
        setStandaloneCoursesHidden(
          data?.standaloneCoursesHiddenWhenDisabled !== false,
        );
        setGetLeadsHidden(data?.getLeadsHiddenWhenDisabled !== false);
        setAiSuiteHidden(data?.aiSuiteHiddenWhenDisabled !== false);
        setLabsHidden(data?.labsHiddenWhenDisabled !== false);
      },
      () => {
        setBroadcastsGate(null);
        setWebsiteGate(null);
        setSocialGate(null);
        setCommunityGate(null);
        setStandaloneCoursesGate(null);
        setAiSuiteGate(null);
        setGetLeadsGate(null);
        setLabsGate(null);
      },
    );
  }, [activeSubId, memberships]);

  // When no sub-account is active (agency-level pages), fall back to the
  // user's first membership for sub-account-scoped link templating.
  const fallbackSub = memberships[0]?.subAccountId ?? null;
  const linkSubId = activeSubId ?? fallbackSub;
  const showSubNav = !!linkSubId;
  const activeMembership = activeSubId
    ? memberships.find((m) => m.subAccountId === activeSubId)
    : null;
  // Header label for the SUB-ACCOUNT nav section. Reinforces which workspace
  // the user is operating inside, e.g. "SUB-ACCOUNT-1001 · SLACK INC".
  const subSectionLabel = activeMembership
    ? activeMembership.accountNumber !== undefined
      ? `Sub-account-${activeMembership.accountNumber} · ${activeMembership.name || ""}`.trim()
      : (activeMembership.name ?? "Sub-account")
    : "Sub-account";

  function renderNavItem(item: NavItem) {
    const fullHref = `${subRoot ?? `/sa/${linkSubId}`}${item.href}`;
    const isActive =
      pathname === fullHref ||
      (item.href !== "/dashboard" && pathname.startsWith(fullHref));
    // Agency-level gate lock. We DO render it when the gate is unknown
    // (gate === null) — assumption: legitimate sub-accounts are enabled,
    // and flashing "Locked" → "Enabled" is worse UX than a brief window
    // where a disabled tenant can click. The underlying routes 403 either way.
    const gateLocked =
      (item.href === "/broadcasts" && broadcastsGate === false) ||
      (item.href === "/website" && websiteGate === false) ||
      (item.href === "/social" && socialGate === false) ||
      (item.href === "/community" && communityGate === false) ||
      (item.href === "/courses" && standaloneCoursesGate === false) ||
      (item.href === "/ai-suite" && aiSuiteGate === false) ||
      (item.href === "/get-leads" && getLeadsGate === false) ||
      (item.href === "/labs" && labsGate === false);
    // When the agency owner opted to hide (not just lock) a disabled
    // feature, omit the entry entirely so the tenant never sees it.
    const gateHidden =
      (item.href === "/broadcasts" && broadcastsGate === false && broadcastsHidden) ||
      (item.href === "/website" && websiteGate === false && websiteHidden) ||
      (item.href === "/social" && socialGate === false && socialHidden) ||
      (item.href === "/community" && communityGate === false && communityHidden) ||
      (item.href === "/courses" &&
        standaloneCoursesGate === false &&
        standaloneCoursesHidden) ||
      (item.href === "/get-leads" && getLeadsGate === false && getLeadsHidden) ||
      (item.href === "/ai-suite" && aiSuiteGate === false && aiSuiteHidden) ||
      (item.href === "/labs" && labsGate === false && labsHidden);
    if (gateHidden) return null;

    if (!item.enabled || gateLocked) {
      const lockedByGate = gateLocked;
      return (
        <div
          key={item.href}
          title={
            collapsed
              ? item.label
              : lockedByGate
                ? "Disabled by your agency administrator"
                : "Coming soon"
          }
          className={cn(
            "flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-sidebar-foreground/55",
            collapsed ? "justify-center" : "justify-between",
          )}
        >
          <span className="flex items-center gap-2.5">
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && item.label}
          </span>
          {!collapsed && (
            <span className="flex items-center gap-1 rounded-full border border-sidebar-border/40 px-1.5 text-[10px] uppercase tracking-wide text-sidebar-foreground/70">
              {lockedByGate && <Lock className="h-2.5 w-2.5" />}
              {lockedByGate ? "Locked" : "Soon"}
            </span>
          )}
        </div>
      );
    }

    const badge =
      item.badgeKey === "dueToday" && dueToday > 0
        ? dueToday
        : item.badgeKey === "unreadConversations" && unreadConversations > 0
          ? unreadConversations
          : null;

    return (
      <Link
        key={item.href}
        href={fullHref}
        title={collapsed ? item.label : undefined}
        className={cn(
          "relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
          collapsed ? "justify-center" : "justify-between",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground"
            : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
      >
        {isActive && !collapsed && (
          <span
            className="absolute -left-1 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-[linear-gradient(180deg,var(--mx-rose-quartz,transparent),var(--mx-aqua-glow,transparent))]"
            aria-hidden
          />
        )}
        <span className="flex items-center gap-2.5">
          <item.icon className="h-4 w-4 shrink-0" />
          {!collapsed && item.label}
        </span>
        {!collapsed && badge !== null && (
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
              isActive
                ? "bg-primary text-primary-foreground"
                : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
            )}
          >
            {badge}
          </span>
        )}
        {collapsed && badge !== null && (
          <span className="absolute ml-5 h-1.5 w-1.5 rounded-full bg-amber-500" />
        )}
      </Link>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "flex h-14 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "justify-between px-4",
        )}
      >
        <Link href="/" className="flex items-center gap-2 text-lg font-bold">
          {agency.logoUrl && !collapsed ? (
            // Custom agency logo. Constrained to 24px tall, auto width;
            // the agency hosts the asset so we render whatever they paste.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agency.logoUrl}
              alt={agency.name}
              className="h-6 w-auto max-w-[120px] object-contain"
            />
          ) : (
            <LogoMark size={20} idSuffix="-sidebar" />
          )}
          {!collapsed && (
            <span className="truncate rounded-full bg-sidebar-accent px-2.5 py-1 text-sm">
              {agency.name}
            </span>
          )}
        </Link>
        {!collapsed && onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            title="Collapse menu"
            className="rounded-md p-1.5 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <ChevronsLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {collapsed && onToggleCollapsed && (
        <button
          onClick={onToggleCollapsed}
          title="Expand menu"
          className="flex items-center justify-center border-b border-sidebar-border py-2 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      )}

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {/* Agency-level nav — visible to agency owners always; everyone with
            access to /agency sees the entry. */}
        {(agencyRole === "owner" || memberships.length > 1) && (
          <div className="mb-3">
            {!collapsed && (
              <p className="mb-1 px-3 text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
                Agency
              </p>
            )}
            {agencyRole === "owner" && (
              <Link
                href="/agency/get-started"
                title={collapsed ? "Get started" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  collapsed && "justify-center",
                  pathname.startsWith("/agency/get-started")
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <Compass className="h-4 w-4 shrink-0" />
                {!collapsed && "Get started"}
              </Link>
            )}
            <Link
              href="/agency"
              title={collapsed ? "Agency home" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                collapsed && "justify-center",
                pathname === "/agency"
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <Building2 className="h-4 w-4 shrink-0" />
              {!collapsed && "Agency home"}
            </Link>
            {agencyRole === "owner" && (
              <Link
                href="/agency/sub-accounts"
                title={collapsed ? "Sub-accounts" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  collapsed && "justify-center",
                  pathname.startsWith("/agency/sub-accounts")
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <Users className="h-4 w-4 shrink-0" />
                {!collapsed && "Sub-accounts"}
              </Link>
            )}
            {agencyRole === "owner" && (
              <Link
                href="/agency/billing"
                title={collapsed ? "Client billing" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  collapsed && "justify-center",
                  pathname.startsWith("/agency/billing")
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <CreditCard className="h-4 w-4 shrink-0" />
                {!collapsed && "Client billing"}
              </Link>
            )}
            {/* Hidden until the owner enables it under Agency → Settings —
                the Agency Assistant ships OFF by default. */}
            {agencyRole === "owner" && agency.agencyAssistantEnabled && (
              <Link
                href="/agency/ai-suite"
                title={collapsed ? "Agency Assistant" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  collapsed && "justify-center",
                  pathname.startsWith("/agency/ai-suite")
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <Sparkles className="h-4 w-4 shrink-0" />
                {!collapsed && "Agency Assistant"}
              </Link>
            )}
            {agencyRole === "owner" && (
              <Link
                href="/agency/settings"
                title={collapsed ? "Settings Agency" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                  collapsed && "justify-center",
                  pathname.startsWith("/agency/settings")
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <Settings className="h-4 w-4 shrink-0" />
                {!collapsed && "Settings Agency"}
              </Link>
            )}
          </div>
        )}

        {showSubNav && (
          <div>
            {(agencyRole === "owner" || memberships.length > 1) && !collapsed && (
              <p
                className="mb-1 truncate px-3 text-[10px] uppercase tracking-wider text-sidebar-foreground/60"
                title={subSectionLabel}
              >
                {subSectionLabel}
              </p>
            )}
            {SUB_ACCOUNT_NAV_GROUPS.map((group, groupIdx) => {
              const visibleItems = group.items;
              if (visibleItems.length === 0) return null;

              // Dashboard / Sub-Account Settings (label === null) always
              // show their item(s) — no toggle, per product decision.
              // When the whole sidebar is in icon-only rail mode, per-group
              // state is moot (no labels to click) — always show every icon.
              const isGroupCollapsed =
                !!group.label && !collapsed && collapsedGroups.has(group.label);

              return (
                <div key={group.label ?? `ungrouped-${groupIdx}`} className="mb-3">
                  {group.label && !collapsed && (
                    <button
                      onClick={() => toggleGroup(group.label!)}
                      className="mb-1 flex w-full items-center gap-1 px-3 text-[10px] uppercase tracking-wider text-sidebar-foreground/60 hover:text-sidebar-foreground"
                    >
                      {isGroupCollapsed ? (
                        <ChevronRight className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                      {group.label}
                    </button>
                  )}
                  {!isGroupCollapsed && visibleItems.map(renderNavItem)}
                </div>
              );
            })}
          </div>
        )}

        {!showSubNav && !loading && !collapsed && (
          <p className="rounded-md border border-dashed border-sidebar-border/40 px-3 py-3 text-xs text-sidebar-foreground/80">
            Pick a sub-account from{" "}
            <Link href="/agency" className="text-sidebar-foreground underline">
              Agency home
            </Link>{" "}
            to see its data.
          </p>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <Button
          variant="ghost"
          title={collapsed ? "Sign Out" : undefined}
          className={cn(
            "w-full gap-2.5 text-[13px] text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            collapsed ? "justify-center" : "justify-start",
          )}
          onClick={() => signOutUser()}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && "Sign Out"}
        </Button>
      </div>
    </div>
  );
}

export function Sidebar({ open, onOpenChange }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Hydrate the collapse preference from localStorage after mount (avoids
  // an SSR/client markup mismatch — the server always renders expanded).
  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  // Close the mobile drawer whenever navigation happens — tapping a menu
  // item should reveal the destination, not leave the sheet covering it.
  // No-op when already closed; the desktop <aside> isn't affected.
  useEffect(() => {
    onOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <>
      <aside
        className={cn(
          "app-sidebar hidden shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-150 md:block",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      {/* The drawer shows the exact same full nav as the desktop <aside> —
          installed-PWA use and regular browser use see identical menus. The
          collapse-to-icons feature is desktop-only; the drawer always shows
          full labels since it's an overlay you dismiss, not a persistent rail. */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="left"
          className="app-sidebar w-56 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent />
        </SheetContent>
      </Sheet>
    </>
  );
}
