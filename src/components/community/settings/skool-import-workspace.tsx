"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Download,
  Eye,
  EyeOff,
  FileSearch,
  Lock,
  Loader2,
  Mail,
  ShieldCheck,
  Users,
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

  // Recover "Connected" state across a page refresh from a previously
  // stored session id — never re-reads cookies/credentials, just the
  // public session fields (see the session route).
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
        if (data.session?.skoolCommunityName) {
          setImportSessionId(stored);
          setCommunityName(data.session.skoolCommunityName);
          setStatus("connected");
        }
      } catch {
        // transient — leave the form usable, no state to restore
      }
    })();
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
      sessionStorage.removeItem(`skool-import-session:${groupId}`);
      setImportSessionId(null);
      setCommunityName(null);
      setStatus("idle");
      setSkoolUrl("");
      setEmail("");
      setDisconnecting(false);
      toast.success("Disconnected from Skool.");
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

          <StepIndicator brand={brand} />

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0 rounded-xl border border-[#E4E4E4] p-5">
              {connected ? (
                <ConnectedState
                  communityName={communityName}
                  disconnecting={disconnecting}
                  onDisconnect={handleDisconnect}
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

            <WhatHappensNext />
          </div>

          <TrustFooter />
        </section>
      </div>
    </div>
  );
}

function StepIndicator({ brand }: { brand: string }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-3 overflow-x-auto">
      {STEPS.map((step, i) => (
        <div key={step.key} className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-2">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
              style={
                i === 0
                  ? { backgroundColor: brand, color: "white" }
                  : { backgroundColor: "#F0F0F0", color: "#909090" }
              }
            >
              {i + 1}
            </span>
            <div className="leading-tight">
              <p className={cn("text-sm font-medium", i === 0 ? "text-[#202124]" : "text-[#909090]")}>
                {step.label}
              </p>
              <p className="text-[11px] text-[#b4b4b4]">{step.description}</p>
            </div>
          </div>
          {i < STEPS.length - 1 && <div className="h-px w-8 shrink-0 bg-[#E4E4E4]" />}
        </div>
      ))}
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
  onDisconnect,
}: {
  communityName: string | null;
  disconnecting: boolean;
  onDisconnect: () => void;
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
          disabled
          title="Scan step coming next"
          className="flex items-center gap-2 rounded-md border border-[#E4E4E4] px-4 py-2 text-sm font-semibold text-[#909090] opacity-60"
        >
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
      <p className="mt-2 text-xs text-[#b4b4b4]">Scan step coming next — nothing has been imported yet.</p>
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

function TrustFooter() {
  const items = [
    { icon: Lock, label: "Password never stored or logged" },
    { icon: ShieldCheck, label: "Credentials used only for this import session" },
    { icon: Check, label: "No import happens during Connect" },
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
