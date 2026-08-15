/**
 * Shared MyMagnetix sidebar/nav data — hrefs, labels, and an `icon` KEY
 * (a string, not a component reference) so this same list can be imported
 * by both the layout (Server Component) and the header (Client Component)
 * without crossing the Server->Client boundary with a function value (see
 * the RSC-serialization bug fixed 2026-08-15 in the Build Log). Each side
 * maps `icon` to its own locally-imported Lucide component.
 *
 * `disabled` items are visually present (per the approved mockup's full
 * sidebar) but not real destinations yet — Messages/Projects/Purchases/
 * Saved have no backend in this build; rendering them as honest
 * disabled/"soon" rows instead of dead links or, worse, fabricated pages.
 */
export interface MyMagnetixNavItem {
  href: string;
  label: string;
  icon: "home" | "courses" | "communities" | "messages" | "projects" | "spaces" | "purchases" | "saved";
  disabled?: boolean;
}

export const MYMAGNETIX_NAV_ITEMS: MyMagnetixNavItem[] = [
  { href: "/my", label: "Home", icon: "home" },
  { href: "/my/courses", label: "Courses", icon: "courses" },
  { href: "/my/communities", label: "Communities", icon: "communities" },
  { href: "/my#messages", label: "Messages", icon: "messages", disabled: true },
  { href: "/my#projects", label: "Projects", icon: "projects", disabled: true },
  { href: "/my#spaces", label: "My Spaces", icon: "spaces" },
  { href: "/my#purchases", label: "Purchases", icon: "purchases", disabled: true },
  { href: "/my#saved", label: "Saved", icon: "saved", disabled: true },
];
