import type { ReactNode } from "react";
import type { Metadata } from "next";
import { LANDING_VARIANT } from "@/config/landing";

// First-time-access/PWA audit finding: the root layout links
// `/manifest.webmanifest` (start_url: /dashboard, the STAFF CRM) site-wide
// on custom-branded deployments. Overriding it here — at the SEGMENT
// ROOT, not just the authenticated `(app)` group inside it — makes every
// page under `/my` (including /my/login, /my/gateway, /my/password/reset,
// which sit outside that group) advertise the MyMagnetix-specific
// manifest instead, so "Add to Home Screen" from anywhere in MyMagnetix
// installs an app that actually opens back into MyMagnetix. See
// `src/app/my/manifest.webmanifest/route.ts`. No-op passthrough — this
// file exists only to attach metadata to the segment, not to add markup.
export const metadata: Metadata =
  LANDING_VARIANT === "custom" ? { manifest: "/my/manifest.webmanifest" } : {};

export default function MyMagnetixSegmentLayout({ children }: { children: ReactNode }) {
  return children;
}
