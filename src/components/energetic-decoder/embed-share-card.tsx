"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowUpRight, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubAccount } from "@/context/sub-account-context";

/** The public embeddable chart tool — her "embeddable chart tool" ask, mirrors bodygraph.com's embed. */
export function EnergeticDecoderEmbedShareCard({ subAccountId }: { subAccountId: string }) {
  const { saPath } = useSubAccount();
  const [copied, setCopied] = useState<"link" | "script" | null>(null);

  function buildUrl() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/decoder/${subAccountId}`;
  }

  function copy(kind: "link" | "script") {
    const text =
      kind === "link"
        ? buildUrl()
        : `<iframe src="${buildUrl()}" width="100%" height="700" style="border:0;background:transparent"></iframe>`;
    navigator.clipboard.writeText(text);
    setCopied(kind);
    toast.success(kind === "link" ? "Link copied" : "Embed snippet copied");
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <section className="rounded-2xl border bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-5">
      <header className="mb-3 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <Share2 className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold">Embed / share</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            A public tool visitors use to get their own Gene Keys profile —
            every submission becomes a saved reading + Contact for you
            automatically.
          </p>
        </div>
      </header>
      <div className="space-y-2">
        <Button variant="outline" size="sm" onClick={() => copy("link")} className="w-full justify-start">
          <Copy className="mr-1 h-3.5 w-3.5" />
          {copied === "link" ? "Link copied" : "Copy public link"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => copy("script")} className="w-full justify-start">
          <Copy className="mr-1 h-3.5 w-3.5" />
          {copied === "script" ? "Embed copied" : "Copy iframe embed"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start"
          render={<Link href={saPath("/qr-codes")} />}
        >
          <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
          Generate a QR code (opens QR Codes)
        </Button>
      </div>
    </section>
  );
}
