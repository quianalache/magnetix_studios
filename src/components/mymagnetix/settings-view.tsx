"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  LockKeyhole,
  MessageCircle,
  MonitorSmartphone,
  Radio,
  UserRound,
} from "lucide-react";
import type { PersonCommunityItem } from "@/lib/server/mymagnetix-service";

type DeviceState =
  | "checking"
  | "not-configured"
  | "unsupported"
  | "ios-install"
  | "blocked"
  | "ready";

function DeviceNotifications() {
  const [state, setState] = useState<DeviceState>("checking");

  useEffect(() => {
    const vapidConfigured = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    if (!vapidConfigured) return setState("not-configured");
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return setState(ios && !standalone ? "ios-install" : "unsupported");
    }
    setState(Notification.permission === "denied" ? "blocked" : "ready");
  }, []);

  const copy = {
    checking: [
      "Checking this device…",
      "Verifying browser notification support.",
    ],
    "not-configured": [
      "Device notifications are being connected",
      "Member push delivery is not configured on this deployment yet.",
    ],
    unsupported: [
      "This browser cannot receive push notifications",
      "Try an installed app or a supported browser.",
    ],
    "ios-install": [
      "Install MyMagnetix first",
      "On iPhone and iPad, add MyMagnetix to your Home Screen before enabling notifications.",
    ],
    blocked: [
      "Notifications are blocked",
      "Allow notifications in your browser settings, then return here.",
    ],
    ready: [
      "This device is ready",
      "The upcoming member push service will use this device when connected.",
    ],
  }[state];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#ECE9F5] bg-[#FBFAFE] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#EEE6FF] text-[#6D28D9]">
          <MonitorSmartphone className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[13px] font-semibold text-[#202124]">
            Push notifications (this device)
          </p>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-[#858197]">
            {copy[1]}
          </p>
        </div>
      </div>
      <span
        className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${state === "ready" ? "bg-[#E5F8ED] text-[#197A46]" : "bg-[#F1EFF7] text-[#716C85]"}`}
      >
        {copy[0]}
      </span>
    </div>
  );
}

function FutureToggle({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-[#F0EDF7] py-3 first:border-t-0">
      <div>
        <p className="text-[12px] font-semibold text-[#292535]">{label}</p>
        <p className="mt-0.5 text-[10px] text-[#918CA0]">{description}</p>
      </div>
      <span className="shrink-0 rounded-full bg-[#F1EFF7] px-2 py-1 text-[9px] font-semibold tracking-wide text-[#918CA0] uppercase">
        Coming soon
      </span>
    </div>
  );
}

export function MyMagnetixSettingsView({
  communities,
}: {
  communities: PersonCommunityItem[];
}) {
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#7C3AED] uppercase">
            MyMagnetix
          </p>
          <h1 className="mt-1 text-[26px] font-bold tracking-[-0.03em] text-[#1D1B27]">
            Settings
          </h1>
          <p className="mt-1 text-[13px] text-[#84809A]">
            Manage your account, notifications, and preferences.
          </p>
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:block lg:space-y-1">
          <div className="flex shrink-0 items-center gap-2 rounded-lg bg-[#EEE6FF] px-3 py-2 text-[12px] font-semibold text-[#5E2574]">
            <Bell className="h-4 w-4" /> Notifications
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-[#8F899F]">
            <UserRound className="h-4 w-4" /> Profile &amp; Account
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-[#8F899F]">
            <LockKeyhole className="h-4 w-4" /> Privacy &amp; Security
          </div>
        </nav>
        <div className="space-y-5">
          <section className="rounded-2xl border border-[#ECE9F5] bg-white p-4 shadow-[0_8px_30px_rgba(81,39,130,0.04)] sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EEE6FF] text-[#6D28D9]">
                <Bell className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-[15px] font-bold text-[#292535]">
                  Notifications
                </h2>
                <p className="mt-0.5 text-[11px] text-[#918CA0]">
                  Choose how and when MyMagnetix keeps you informed.
                </p>
              </div>
            </div>
            <DeviceNotifications />
            <div className="mt-5 rounded-xl border border-[#ECE9F5] bg-white p-4">
              <div className="mb-2 flex items-center gap-2">
                <Radio className="h-4 w-4 text-[#7C3AED]" />
                <h3 className="text-[13px] font-bold text-[#292535]">
                  Personal notifications
                </h3>
              </div>
              <p className="mb-2 text-[11px] text-[#918CA0]">
                Account activity independent of any one community.
              </p>
              <FutureToggle
                label="Purchases and access"
                description="Purchase confirmations and access updates"
              />
              <FutureToggle
                label="Bookings and readings"
                description="Booking confirmations, reminders, and reading results"
              />
            </div>
            <div className="mt-5 rounded-xl border border-[#ECE9F5] bg-white p-4">
              <div className="mb-1 flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-[#7C3AED]" />
                <h3 className="text-[13px] font-bold text-[#292535]">
                  Community notifications
                </h3>
              </div>
              <p className="mb-3 text-[11px] text-[#918CA0]">
                Customize notification preferences for each community you belong
                to.
              </p>
              {communities.length === 0 ? (
                <p className="rounded-lg bg-[#FBFAFE] p-3 text-[12px] text-[#918CA0]">
                  No communities yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {communities.map((community) => (
                    <div
                      key={community.pinKey}
                      className="flex items-center gap-3 rounded-lg border border-[#F0EDF7] p-2.5"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#EEE6FF] text-[12px] font-bold text-[#6D28D9]">
                        {community.logoUrl ? (
                          <img
                            src={community.logoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          community.name.slice(0, 1)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-[#292535]">
                          {community.name}
                        </p>
                        <p className="truncate text-[10px] text-[#918CA0]">
                          {community.businessName}
                        </p>
                      </div>
                      <Link
                        href={`/my/settings/community/${community.groupId}${community.subAccountId ? `?subAccountId=${encodeURIComponent(community.subAccountId)}` : ""}`}
                        className="flex shrink-0 items-center gap-1 rounded-lg bg-[#F1EBFF] px-2.5 py-2 text-[10px] font-semibold text-[#5E2574] hover:bg-[#E7DBFF]"
                      >
                        Customize <ChevronRight className="h-3 w-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-5 rounded-xl border border-dashed border-[#D9D0EA] bg-[#FBFAFE] p-4">
              <div className="flex items-start gap-3">
                <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-[#8B5CF6]" />
                <p className="text-[11px] leading-relaxed text-[#777187]">
                  Community and personal event controls are shown here as the
                  approved settings surface. Their push preference storage will
                  connect to the upcoming member notification service; existing
                  email delivery is unchanged.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function CommunityNotificationSettings({
  community,
}: {
  community: PersonCommunityItem;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/my/settings"
        className="mb-5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#6D28D9]"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back to all settings
      </Link>
      <div className="overflow-hidden rounded-2xl border border-[#ECE9F5] bg-white">
        <div className="flex items-center gap-4 border-b border-[#ECE9F5] p-5 sm:p-7">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl bg-[#EEE6FF] text-xl font-bold text-[#6D28D9]">
            {community.logoUrl ? (
              <img
                src={community.logoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              community.name.slice(0, 1)
            )}
          </div>
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-[#8B5CF6] uppercase">
              Community notification settings
            </p>
            <h1 className="mt-1 text-[22px] font-bold text-[#1D1B27]">
              {community.name}
            </h1>
            <p className="mt-1 text-[12px] text-[#918CA0]">
              Choose which community activity you want to be notified about.
            </p>
          </div>
        </div>
        <div className="p-5 sm:p-7">
          <FutureToggle
            label="Replies to my posts"
            description="Get notified when someone replies to your posts."
          />
          <FutureToggle
            label="Replies to my comments"
            description="Get notified when someone replies to your comments."
          />
          <FutureToggle
            label="Mentions"
            description="Get notified when someone mentions you."
          />
          <FutureToggle
            label="Live sessions"
            description="Get notified when a live session is starting or live now."
          />
        </div>
      </div>
    </div>
  );
}
