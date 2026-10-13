import {
  BookOpen,
  Building2,
  Compass,
  CreditCard,
  Mail,
  MessagesSquare,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

/**
 * Agency-level navigation as data (design-system Phase 0, 2026-10-13) — the
 * single source the desktop sidebar renders today and the collapsed rail and
 * mobile drawer reuse. Same routes, labels, order and visibility as the
 * hand-written links it replaced in sidebar.tsx.
 *
 * Access is unchanged: the whole section only renders for the agency owner
 * and only outside a sub-account (sidebar.tsx keeps that guard); `visible`
 * adds per-item conditions on top.
 */
export interface AgencyNavItem {
  key: string;
  href: string;
  label: string;
  /** Collapsed-rail tooltip. */
  title: string;
  icon: LucideIcon;
  isActive: (pathname: string) => boolean;
  visible?: (ctx: AgencyNavContext) => boolean;
}

export interface AgencyNavContext {
  agencyAssistantEnabled: boolean;
}

export const AGENCY_NAV_ITEMS: AgencyNavItem[] = [
  { key: "get-started", href: "/agency/get-started", label: "Get started", title: "Get started", icon: Compass, isActive: (p) => p.startsWith("/agency/get-started") },
  { key: "home", href: "/agency", label: "Agency home", title: "Agency home", icon: Building2, isActive: (p) => p === "/agency" },
  { key: "sub-accounts", href: "/agency/sub-accounts", label: "Sub-accounts", title: "Sub-accounts", icon: Users, isActive: (p) => p.startsWith("/agency/sub-accounts") },
  { key: "billing", href: "/agency/billing", label: "Billing", title: "Billing", icon: CreditCard, isActive: (p) => p.startsWith("/agency/billing") },
  { key: "acquisition", href: "/agency/acquisition", label: "Traffic & Signups", title: "Traffic & Signups", icon: TrendingUp, isActive: (p) => p.startsWith("/agency/acquisition") },
  // Agency Community (2026-09-16) — agency-owned communities, distinct from any sub-account's own Community.
  { key: "community", href: "/agency/community", label: "Community", title: "Community", icon: MessagesSquare, isActive: (p) => p.startsWith("/agency/community") },
  // Agency Courses — Standalone Courses + Course Offers.
  {
    key: "courses",
    href: "/agency/standalone-courses",
    label: "Courses",
    title: "Courses",
    icon: BookOpen,
    isActive: (p) => p.startsWith("/agency/standalone-courses") || p.startsWith("/agency/course-offers"),
  },
  // Agency Communications (2026-09-18) — Magnetix Studios' own Broadcasts + Email Templates.
  { key: "communications", href: "/agency/communications", label: "Communications", title: "Communications", icon: Mail, isActive: (p) => p.startsWith("/agency/communications") },
  // Hidden until the owner enables it under Agency → Settings (ships OFF).
  {
    key: "ai-suite",
    href: "/agency/ai-suite",
    label: "Agency Assistant",
    title: "Agency Assistant",
    icon: Sparkles,
    isActive: (p) => p.startsWith("/agency/ai-suite"),
    visible: (ctx) => ctx.agencyAssistantEnabled,
  },
  { key: "settings", href: "/agency/settings", label: "Agency Settings", title: "Agency Settings", icon: Settings, isActive: (p) => p.startsWith("/agency/settings") },
];
