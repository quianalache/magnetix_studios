"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Circle,
  Download,
  Eye,
  EyeOff,
  FileSearch,
  FolderKanban,
  GraduationCap,
  Loader2,
  Lock,
  Mail,
  Search,
  ShieldCheck,
  Star,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { communityHomeHref } from "@/lib/community/routes";
import { SettingsNav } from "@/components/community/settings/settings-nav";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ConnectStatus = "idle" | "connecting" | "connected" | "error";

interface ConnectErrorState {
  message: string;
}

type ScanPhaseKey =
  | "community"
  | "categories"
  | "members"
  | "posts"
  | "comments"
  | "attachments"
  | "points"
  | "pinned"
  | "classroom"
  | "finalize";

type ScanPhaseStatus = "pending" | "scanning" | "complete" | "warning" | "error";

interface ScanPhase {
  status: ScanPhaseStatus;
  detail: string | null;
  message: string | null;
}

type ScanStatus = "scanning" | "awaiting_verification" | "complete" | "cancelled" | "failed";

interface ScanFailure {
  phase: ScanPhaseKey | null;
  reason: "session-expired" | "phase-error";
  message: string;
  retryable: boolean;
}

interface ScanResult {
  id: string;
  status: ScanStatus;
  phases: Record<ScanPhaseKey, ScanPhase>;
  community: { name: string; displayName: string; description: string | null; logoUrl: string | null } | null;
  categories: { count: number } | null;
  members: { totalDiscovered: number; emailResolvedCount: number } | null;
  content: { uniquePostCount: number; commentCount: number } | null;
  attachments: { imageCount: number; voiceCount: number; fileCount: number; videoDeferredCount: number } | null;
  points: { membersWithPointData: number } | null;
  pinned: { count: number } | null;
  classroom: { detected: boolean; courseCount: number | null } | null;
  warnings: string[];
  failure: ScanFailure | null;
}

const PHASE_ORDER: ScanPhaseKey[] = [
  "community",
  "categories",
  "members",
  "posts",
  "comments",
  "attachments",
  "points",
  "pinned",
  "classroom",
];
const PHASE_LABELS: Record<ScanPhaseKey, { title: string; subtitle: string }> = {
  community: { title: "Community details", subtitle: "Community name, description, image, and settings" },
  categories: { title: "Channels / Categories", subtitle: "Discovering all categories and their details" },
  members: { title: "Members", subtitle: "Scanning members and member profiles" },
  posts: { title: "Posts", subtitle: "Discovering posts across your community" },
  comments: { title: "Posts & Comments", subtitle: "Scanning posts and all comments" },
  attachments: { title: "Attachments", subtitle: "Images, files, voice notes, and other attachments" },
  points: { title: "Points & Levels", subtitle: "Member points, levels, and leaderboard data" },
  pinned: { title: "Featured / Pinned Posts", subtitle: "Pinned and featured posts" },
  classroom: { title: "Classroom", subtitle: "Detecting courses and lessons" },
  finalize: { title: "Finalizing preview", subtitle: "Preparing your scan summary" },
};
// Rough relative weight of each phase's real cost, for a determinate
// (not fabricated) progress percentage — comments dominates because it's
// one headless-browser round trip per post, by far the slowest phase at
// any real community size. Not a time estimate, just phase-completion
// weighting. Sums to 100.
const PHASE_WEIGHT: Record<ScanPhaseKey, number> = {
  community: 5,
  categories: 5,
  members: 15,
  posts: 15,
  comments: 45,
  attachments: 0,
  points: 0,
  pinned: 0,
  classroom: 5,
  finalize: 10,
};

function scanPercent(scan: ScanResult): number {
  let total = 0;
  for (const key of Object.keys(PHASE_WEIGHT) as ScanPhaseKey[]) {
    const weight = PHASE_WEIGHT[key];
    if (weight === 0) continue;
    const phase = scan.phases[key];
    if (phase.status === "complete") {
      total += weight;
    } else if (key === "comments" && phase.detail) {
      const m = phase.detail.match(/^(\d+)\s*\/\s*(\d+)/);
      if (m) {
        const done = Number(m[1]);
        const of = Number(m[2]) || 1;
        total += weight * Math.min(1, done / of);
      }
    }
  }
  return Math.round(Math.min(100, total));
}

const STEPS = [
  { key: "connect", label: "Connect", description: "Enter Skool credentials" },
  { key: "scan", label: "Scan", description: "We fetch and analyze" },
  { key: "preview", label: "Preview", description: "Review what we found" },
  { key: "import", label: "Import", description: "Bring it into Magnetix" },
  { key: "complete", label: "Complete", description: "You're all set" },
] as const;

export function SkoolImportWorkspace({
  saId,
  pretty = false,
  staffGroupId,
  groupId,
  groupSlug,
  brand,
}: {
  saId: string;
  pretty?: boolean;
  /** Staff Community-in-CRM integration — see CommunityLinkBase in routes.ts. */
  staffGroupId?: string;
  groupId: string;
  groupSlug: string;
  brand: string;
}) {
  const [skoolUrl, setSkoolUrl] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<ConnectStatus>("idle");
  const [error, setError] = useState<ConnectErrorState | null>(null);
  const [importSessionId, setImportSessionId] = useState<string | null>(null);
  const [communityName, setCommunityName] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [startingScan, setStartingScan] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch(`/api/community/${saId}/${groupId}/skool-import/scan/status?importSessionId=${sessionId}`);
        if (!res.ok) return;
        const data = (await res.json()) as { scan?: ScanResult };
        if (data.scan) {
          setScan(data.scan);
          if (data.scan.status !== "scanning") stopPolling();
        }
      } catch {
        // transient — next poll tick tries again
      }
    },
    [saId, groupId, stopPolling],
  );

  // Recover state across a page refresh: session first, then whatever scan
  // (if any) already exists for it — never re-reads cookies/credentials.
  useEffect(() => {
    const stored = sessionStorage.getItem(`skool-import-session:${groupId}`);
    if (!stored) return;
    (async () => {
      try {
        const res = await fetch(`/api/community/${saId}/${groupId}/skool-import/session/${stored}`);
        if (!res.ok) {
          sessionStorage.removeItem(`skool-import-session:${groupId}`);
          return;
        }
        const data = (await res.json()) as { session?: { skoolCommunityName?: string } };
        if (!data.session?.skoolCommunityName) return;
        setImportSessionId(stored);
        setCommunityName(data.session.skoolCommunityName);
        setStatus("connected");

        const scanRes = await fetch(`/api/community/${saId}/${groupId}/skool-import/scan/status?importSessionId=${stored}`);
        if (scanRes.ok) {
          const scanData = (await scanRes.json()) as { scan?: ScanResult };
          if (scanData.scan) {
            setScan(scanData.scan);
            if (scanData.scan.status === "scanning") {
              pollRef.current = setInterval(() => pollStatus(stored), 3000);
            }
          }
        }
      } catch {
        // transient — leave the form usable, no state to restore
      }
    })();
    return () => stopPolling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saId, groupId]);

  async function handleConnect() {
    setError(null);
    setStatus("connecting");
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/skool-import/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skoolUrl, email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        importSessionId?: string;
        skoolCommunityName?: string;
        message?: string;
      };
      if (!res.ok || !data.ok || !data.importSessionId) {
        setStatus("error");
        setError({ message: data.message ?? "We couldn't connect to Skool right now. Please try again." });
        return;
      }
      // The password never lives anywhere past this point — cleared from
      // the form the instant we know we don't need to resubmit it.
      setPassword("");
      setImportSessionId(data.importSessionId);
      setCommunityName(data.skoolCommunityName ?? null);
      sessionStorage.setItem(`skool-import-session:${groupId}`, data.importSessionId);
      setStatus("connected");
      toast.success("Connected to Skool.");
    } catch {
      setStatus("error");
      setError({ message: "We couldn't connect to Skool right now. Please try again." });
    }
  }

  async function handleDisconnect() {
    if (!importSessionId) return;
    setDisconnecting(true);
    try {
      await fetch(`/api/community/${saId}/${groupId}/skool-import/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importSessionId }),
      });
    } catch {
      // best-effort — the session also expires on its own (30 min idle TTL)
    } finally {
      stopPolling();
      sessionStorage.removeItem(`skool-import-session:${groupId}`);
      setImportSessionId(null);
      setCommunityName(null);
      setScan(null);
      setStatus("idle");
      setSkoolUrl("");
      setEmail("");
      setDisconnecting(false);
      toast.success("Disconnected from Skool.");
    }
  }

  async function handleStartScan() {
    if (!importSessionId) return;
    setStartingScan(true);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/skool-import/scan/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importSessionId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.message ?? "Couldn't start the scan. Please try again.");
        return;
      }
      await pollStatus(importSessionId);
      pollRef.current = setInterval(() => pollStatus(importSessionId), 3000);
    } catch {
      toast.error("Couldn't start the scan. Please try again.");
    } finally {
      setStartingScan(false);
    }
  }

  async function handleRetryScan() {
    if (!importSessionId) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/skool-import/scan/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importSessionId }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        toast.error(data.message ?? "Couldn't retry the scan. Please try again.");
        return;
      }
      await pollStatus(importSessionId);
      pollRef.current = setInterval(() => pollStatus(importSessionId), 3000);
    } catch {
      toast.error("Couldn't retry the scan. Please try again.");
    } finally {
      setRetrying(false);
    }
  }

  async function handleCancelScan() {
    if (!importSessionId) return;
    setCancelling(true);
    stopPolling();
    try {
      await fetch(`/api/community/${saId}/${groupId}/skool-import/scan/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importSessionId }),
      });
    } catch {
      // best-effort
    } finally {
      sessionStorage.removeItem(`skool-import-session:${groupId}`);
      setImportSessionId(null);
      setCommunityName(null);
      setScan(null);
      setStatus("idle");
      setCancelling(false);
      toast.success("Scan cancelled.");
    }
  }

  const connecting = status === "connecting";
  const connected = status === "connected";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#202124]">Community Settings</h1>
          <Link
            href={communityHomeHref({ saId, pretty, staffGroupId }, groupSlug)}
            className="mt-1 flex items-center gap-1 text-sm text-[#909090] hover:text-[#202124]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Community
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <SettingsNav brand={brand} active="skool-import" link={{ saId, pretty, staffGroupId }} groupSlug={groupSlug} />

        <section className="min-w-0 rounded-xl border border-[#E4E4E4] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-[#202124]">Skool Import</h2>
                <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none text-white" style={{ backgroundColor: brand }}>
                  New
                </span>
              </div>
              <p className="mt-1 text-sm text-[#909090]">
                Import your Skool community members and content into Magnetix.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border border-[#E4E4E4] bg-[#F8F7F5] px-3 py-2 text-xs text-[#3a3a44]">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>
                <strong className="font-semibold">Your data is safe.</strong> We never store your Skool
                password. Credentials are used only for this import.
              </span>
            </div>
          </div>

          <StepIndicator brand={brand} activeIndex={connected ? (scan ? 1 : 1) : 0} connectComplete={connected} />

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 rounded-xl border border-[#E4E4E4] p-5">
              {scan ? (
                <ScanCard
                  brand={brand}
                  scan={scan}
                  communityName={communityName}
                  cancelling={cancelling}
                  onCancel={handleCancelScan}
                  retrying={retrying}
                  onRetry={handleRetryScan}
                />
              ) : connected ? (
                <ConnectedState
                  communityName={communityName}
                  disconnecting={disconnecting}
                  startingScan={startingScan}
                  onDisconnect={handleDisconnect}
                  onStartScan={handleStartScan}
                />
              ) : (
                <ConnectForm
                  brand={brand}
                  skoolUrl={skoolUrl}
                  email={email}
                  password={password}
                  showPassword={showPassword}
                  connecting={connecting}
                  error={error}
                  onSkoolUrlChange={setSkoolUrl}
                  onEmailChange={setEmail}
                  onPasswordChange={setPassword}
                  onToggleShowPassword={() => setShowPassword((v) => !v)}
                  onSubmit={handleConnect}
                />
              )}
            </div>

            {scan ? <WhatWereLookingFor /> : <WhatHappensNext />}
          </div>

          <TrustFooter />
        </section>
      </div>
    </div>
  );
}

function StepIndicator({
  brand,
  activeIndex,
  connectComplete,
}: {
  brand: string;
  activeIndex: number;
  connectComplete: boolean;
}) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-3 overflow-x-auto">
      {STEPS.map((step, i) => {
        const isComplete = i === 0 && connectComplete;
        const isActive = i === activeIndex && !isComplete;
        return (
          <div key={step.key} className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={
                  isComplete
                    ? { backgroundColor: "#dcfce7", color: "#15803d" }
                    : isActive
                      ? { backgroundColor: brand, color: "white" }
                      : { backgroundColor: "#F0F0F0", color: "#909090" }
                }
              >
                {isComplete ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div className="leading-tight">
                <p className={cn("text-sm font-medium", isActive || isComplete ? "text-[#202124]" : "text-[#909090]")}>
                  {step.label}
                </p>
                <p className="text-[11px] text-[#b4b4b4]">
                  {isComplete ? "Connected to Skool" : step.description}
                </p>
              </div>
            </div>
            {i < STEPS.length - 1 && <div className="h-px w-8 shrink-0 bg-[#E4E4E4]" />}
          </div>
        );
      })}
    </div>
  );
}

function ConnectForm({
  brand,
  skoolUrl,
  email,
  password,
  showPassword,
  connecting,
  error,
  onSkoolUrlChange,
  onEmailChange,
  onPasswordChange,
  onToggleShowPassword,
  onSubmit,
}: {
  brand: string;
  skoolUrl: string;
  email: string;
  password: string;
  showPassword: boolean;
  connecting: boolean;
  error: ConnectErrorState | null;
  onSkoolUrlChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onToggleShowPassword: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = skoolUrl.trim() && email.trim() && password.trim() && !connecting;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white"
          style={{ backgroundColor: brand }}
        >
          1
        </span>
        <h3 className="text-base font-semibold text-[#202124]">Connect to Skool</h3>
      </div>
      <p className="mt-1 text-sm text-[#909090]">
        We&apos;ll securely connect to your Skool community to scan your members and content.
      </p>

      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) onSubmit();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="skool-url">Skool Community URL</Label>
          <Input
            id="skool-url"
            value={skoolUrl}
            onChange={(e) => onSkoolUrlChange(e.target.value)}
            placeholder="e.g. skool.com/your-community"
            disabled={connecting}
            autoComplete="off"
          />
          <p className="text-xs text-[#909090]">The full URL of your Skool community</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="skool-email">Skool Email</Label>
          <Input
            id="skool-email"
            type="email"
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="you@example.com"
            disabled={connecting}
            autoComplete="off"
          />
          <p className="text-xs text-[#909090]">
            Use the email for the Skool owner/admin account that manages this community.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="skool-password">Skool Password</Label>
          <div className="relative">
            <Input
              id="skool-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Enter your password"
              disabled={connecting}
              autoComplete="off"
              className="pr-9"
            />
            <button
              type="button"
              onClick={onToggleShowPassword}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#909090] hover:text-[#202124]"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-[#909090]">We never store or log your Skool password.</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            {error.message}
          </div>
        )}

        <div className="rounded-lg border border-[#E4E4E4] bg-[#F8F7F5] px-3 py-2.5 text-xs text-[#3a3a44]">
          You&apos;ll need owner access to export member emails. We&apos;ll guide you if email verification is
          required.
        </div>

        <button
          type="submit"
          disabled={!canSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: brand }}
        >
          {connecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
            </>
          ) : (
            "Connect & Scan"
          )}
        </button>
        <p className="text-center text-[11px] text-[#b4b4b4]">
          <Lock className="mr-1 inline h-3 w-3" />
          Your credentials are used only to establish this import session.
        </p>
      </form>
    </div>
  );
}

function ConnectedState({
  communityName,
  disconnecting,
  startingScan,
  onDisconnect,
  onStartScan,
}: {
  communityName: string | null;
  disconnecting: boolean;
  startingScan: boolean;
  onDisconnect: () => void;
  onStartScan: () => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="h-4.5 w-4.5" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-[#202124]">Connected to Skool</h3>
          {communityName && <p className="text-sm text-[#909090]">{communityName}</p>}
        </div>
      </div>

      <p className="mt-4 text-sm text-[#3a3a44]">
        Your Skool community is connected and ready to scan.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onStartScan}
          disabled={startingScan}
          className="flex items-center gap-2 rounded-md bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {startingScan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Continue to Scan
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={disconnecting}
          className="flex items-center gap-2 rounded-md border border-[#E4E4E4] px-4 py-2 text-sm font-medium text-[#3a3a44] hover:bg-[#F5F4F2] disabled:opacity-60"
        >
          {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Disconnect
        </button>
      </div>
    </div>
  );
}

function phaseIcon(status: ScanPhaseStatus) {
  if (status === "complete") return <Check className="h-4 w-4 text-emerald-600" />;
  if (status === "scanning") return <Loader2 className="h-4 w-4 animate-spin text-[#7C3AED]" />;
  if (status === "warning" || status === "error") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <Circle className="h-3.5 w-3.5 text-[#d4d4d4]" />;
}

function ScanCard({
  brand,
  scan,
  communityName,
  cancelling,
  onCancel,
  retrying,
  onRetry,
}: {
  brand: string;
  scan: ScanResult;
  communityName: string | null;
  cancelling: boolean;
  onCancel: () => void;
  retrying: boolean;
  onRetry: () => void;
}) {
  const percent = scanPercent(scan);
  const name = scan.community?.displayName ?? communityName ?? "your Skool community";

  if (scan.status === "awaiting_verification") {
    return (
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <Mail className="h-4.5 w-4.5" />
          </span>
          <h3 className="text-base font-semibold text-[#202124]">Verification required</h3>
        </div>
        <p className="mt-3 text-sm text-[#3a3a44]">
          Skool sent a verification code to your account email. Continue to verification to complete member
          email scanning.
        </p>
        <PhaseList scan={scan} />
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled
            title="Verification is the next build pass"
            className="flex items-center gap-2 rounded-md border border-[#E4E4E4] px-4 py-2 text-sm font-semibold text-[#909090] opacity-60"
          >
            Continue to Verification
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="flex items-center gap-2 rounded-md border border-[#E4E4E4] px-4 py-2 text-sm font-medium text-[#3a3a44] hover:bg-[#F5F4F2] disabled:opacity-60"
          >
            {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            Cancel scan
          </button>
        </div>
      </div>
    );
  }

  if (scan.status === "complete") {
    return (
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Check className="h-4.5 w-4.5" />
          </span>
          <h3 className="text-base font-semibold text-[#202124]">Scan complete</h3>
        </div>
        <p className="mt-3 text-sm text-[#3a3a44]">
          We finished scanning {name}. Preview is the next step — nothing has been imported yet.
        </p>
        <PhaseList scan={scan} />
        <div className="mt-5">
          <button
            type="button"
            disabled
            title="Preview is the next build pass"
            className="flex items-center gap-2 rounded-md border border-[#E4E4E4] px-4 py-2 text-sm font-semibold text-[#909090] opacity-60"
          >
            Continue to Preview
          </button>
        </div>
      </div>
    );
  }

  if (scan.status === "failed") {
    const sessionExpired = scan.failure?.reason === "session-expired";
    const canRetry = !sessionExpired && !!scan.failure?.retryable;
    return (
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-700">
            <AlertTriangle className="h-4.5 w-4.5" />
          </span>
          <h3 className="text-base font-semibold text-[#202124]">
            {sessionExpired ? "Connection expired" : "Scan couldn't continue"}
          </h3>
        </div>
        <p className="mt-3 text-sm text-[#3a3a44]">
          {scan.failure?.message ??
            (sessionExpired
              ? "Your Skool connection expired partway through. Reconnect to try again."
              : "We couldn't finish this scan. You can retry from where it left off.")}
        </p>
        <PhaseList scan={scan} />
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: brand }}
            >
              {retrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Retry scan
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="flex items-center gap-2 rounded-md border border-[#E4E4E4] px-4 py-2 text-sm font-medium text-[#3a3a44] hover:bg-[#F5F4F2] disabled:opacity-60"
          >
            {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
            {sessionExpired ? "Reconnect to Skool" : "Start over"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: `${brand}1a`, color: brand }}
        >
          <Search className="h-4.5 w-4.5" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-[#202124]">Scanning {name}…</h3>
          <p className="text-sm text-[#909090]">
            We&apos;re scanning your Skool community to discover members and content. This may take a few
            minutes depending on the size of your community.
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F0F0F0]">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${percent}%`, backgroundColor: brand }}
          />
        </div>
        <span className="shrink-0 text-sm font-medium text-[#3a3a44]">{percent}%</span>
      </div>

      <PhaseList scan={scan} />

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-[#E4E4E4] bg-[#F8F7F5] px-3 py-2.5 text-xs text-[#3a3a44]">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
        <span>
          <strong className="font-semibold">You can safely leave this page.</strong> Scanning continues on our
          servers — come back anytime and we&apos;ll show you where it left off.
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[#E4E4E4] pt-4 text-xs text-[#909090]">
        <span>This session will expire after 30 minutes of inactivity.</span>
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="flex items-center gap-1.5 rounded-md border border-[#E4E4E4] px-3 py-1.5 font-medium text-[#3a3a44] hover:bg-[#F5F4F2] disabled:opacity-60"
        >
          {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          Cancel scan
        </button>
      </div>
    </div>
  );
}

function PhaseList({ scan }: { scan: ScanResult }) {
  return (
    <div className="mt-5 divide-y divide-[#F0F0F0] rounded-lg border border-[#E4E4E4]">
      {PHASE_ORDER.map((key) => {
        const phase = scan.phases[key];
        const label = PHASE_LABELS[key];
        return (
          <div key={key} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="shrink-0">{phaseIcon(phase.status)}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#202124]">{label.title}</p>
                <p className="truncate text-xs text-[#909090]">
                  {phase.message ?? label.subtitle}
                </p>
              </div>
            </div>
            <span className="shrink-0 text-xs font-medium text-[#909090]">
              {phase.detail ?? (phase.status === "pending" ? "Pending" : phase.status === "complete" ? "Complete" : "")}
            </span>
          </div>
        );
      })}
      {scan.classroom?.detected && (
        <div className="bg-[#F8F7F5] px-3.5 py-2.5 text-xs text-[#3a3a44]">
          <GraduationCap className="mr-1.5 inline h-3.5 w-3.5 text-[#7C3AED]" />
          Classroom detected — courses and lessons are not imported in this version yet.
        </div>
      )}
      {scan.attachments && scan.attachments.videoDeferredCount > 0 && (
        <div className="bg-[#F8F7F5] px-3.5 py-2.5 text-xs text-[#3a3a44]">
          {scan.attachments.videoDeferredCount} Skool-hosted video
          {scan.attachments.videoDeferredCount === 1 ? "" : "s"} detected — requires video rehosting, not yet
          importable.
        </div>
      )}
      {scan.warnings.length > 0 &&
        scan.warnings.map((w, i) => (
          <div key={i} className="bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
            {w}
          </div>
        ))}
    </div>
  );
}

function WhatHappensNext() {
  const items = [
    {
      icon: FileSearch,
      title: "We scan your community",
      body: "Community details, members, channels, posts, comments, and points.",
    },
    {
      icon: Mail,
      title: "Verify if needed",
      body: "Skool may send a numeric verification code to the owner's email when Magnetix requests the full member export.",
    },
    {
      icon: Users,
      title: "Preview everything",
      body: "Nothing is imported before the owner reviews what Magnetix found.",
    },
    {
      icon: Download,
      title: "Import safely",
      body: "Source IDs and import mappings protect against duplicate imports.",
    },
    {
      icon: Check,
      title: "Done",
      body: "You receive an import summary and any items that still need attention.",
    },
  ];

  return (
    <div className="rounded-xl border border-[#E4E4E4] bg-[#F8F7F5] p-4">
      <h3 className="text-sm font-semibold text-[#202124]">What happens next?</h3>
      <div className="mt-3 space-y-3.5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="flex gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#7C3AED]">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-sm font-medium text-[#202124]">{item.title}</p>
                <p className="text-xs text-[#909090]">{item.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WhatWereLookingFor() {
  const items = [
    { icon: Users, title: "Members", body: "Names, profiles, roles, points, levels, and activity status." },
    { icon: FileSearch, title: "Content", body: "Posts, comments, replies, mentions, and timestamps." },
    { icon: FolderKanban, title: "Attachments", body: "Images, files, voice notes, and other supported media." },
    { icon: Star, title: "Community data", body: "Channels, pinned posts, and community information." },
    { icon: Trophy, title: "Points & Levels", body: "Point totals, levels, and leaderboard data." },
    {
      icon: GraduationCap,
      title: "Classroom",
      body: "Detects whether courses/classroom content exists — not imported in this version.",
    },
  ];

  return (
    <div className="rounded-xl border border-[#E4E4E4] bg-[#F8F7F5] p-4">
      <h3 className="text-sm font-semibold text-[#202124]">What we&apos;re looking for</h3>
      <div className="mt-3 space-y-3.5">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="flex gap-2.5">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-[#7C3AED]">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-sm font-medium text-[#202124]">{item.title}</p>
                <p className="text-xs text-[#909090]">{item.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrustFooter() {
  const items = [
    { icon: Lock, label: "Password never stored or logged" },
    { icon: ShieldCheck, label: "Credentials used only for this import session" },
    { icon: Check, label: "No import happens during Connect or Scan" },
  ];
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 rounded-xl border border-[#E4E4E4] bg-[#F8F7F5] p-4 text-xs text-[#3a3a44]">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <span key={item.label} className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-[#909090]" />
            {item.label}
          </span>
        );
      })}
    </div>
  );
}
