"use client";

import { useEffect, useState } from "react";

/**
 * 2026-09-01: shared install-prompt detection, extracted out of the CRM's
 * own `InstallBanner` (src/components/pwa/install-banner.tsx) so the new
 * MyMagnetix install banner can reuse the exact same device-detection/
 * dismiss/install-state logic instead of a second parallel copy — per
 * "REUSE the existing... device detection... dismiss behavior... install-
 * state logic," not build a new PWA education system. `InstallBanner`
 * itself was refactored to call this hook too; behavior there is
 * unchanged, only the logic moved.
 *
 * `dismissKey` is caller-supplied (not shared) so dismissing the CRM
 * banner and dismissing the MyMagnetix banner are independent — they're
 * different installable apps (different manifest, different start_url),
 * a person may reasonably want one but not the other.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type PwaInstallMode = "hidden" | "android" | "ios";

export function usePwaInstallState(dismissKey: string): {
  mode: PwaInstallMode;
  dismiss: () => void;
  install: () => Promise<void>;
} {
  const [mode, setMode] = useState<PwaInstallMode>("hidden");
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(dismissKey)) return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
    if (isIos) {
      setMode("ios");
      return;
    }

    // Chromium fires this only when the app is installable and not yet
    // installed — the event IS the "show the banner" signal.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
    // dismissKey is a stable literal per call site — not a real dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    localStorage.setItem(dismissKey, "1");
    setMode("hidden");
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") setMode("hidden");
  };

  return { mode, dismiss, install };
}
