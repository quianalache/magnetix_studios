"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Filter, Plus } from "lucide-react";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { StatusPill } from "@/components/system/status-pill";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useSubAccount } from "@/context/sub-account-context";
import { commerceFetch } from "@/lib/client/commerce-api";
import type { Funnel } from "@/types/checkout";

type Row = Funnel & { stepCount: number };

/** Pages & Funnels → Funnels: named, ordered step sequences. */
export default function FunnelsPage() {
  const { subAccountId } = useParams<{ subAccountId: string }>();
  const { isAdmin } = useSubAccount();
  const router = useRouter();
  const [funnels, setFunnels] = useState<Row[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    commerceFetch<{ funnels: Row[] }>(subAccountId, "funnels").then((d) => setFunnels(d.funnels), (e: Error) => toast.error(e.message));
  }, [subAccountId]);
  useEffect(load, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await commerceFetch<{ funnel: Funnel }>(subAccountId, "funnels", { method: "POST", body: { name: name || "Untitled funnel", withCheckoutStep: true } });
      router.push(`/sa/${subAccountId}/pages-funnels/funnels/${d.funnel.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  if (!funnels) return <PageShellLoading width="data" />;
  return (
    <PageShell width="data">
      <PageHeader
        breadcrumbs={<Link href={`/sa/${subAccountId}/pages-funnels`} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-caption"><ArrowLeft className="size-3.5" aria-hidden /> Pages &amp; Funnels</Link>}
        title="Funnels"
        description="Put pages and a checkout in the order you choose. Each funnel starts with a Checkout step you can configure."
      />
      {isAdmin && (
        <form onSubmit={create} className="flex flex-wrap gap-2">
          <Input aria-label="New funnel name" placeholder="New funnel name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1 sm:max-w-sm" />
          <Button type="submit" disabled={busy}><Plus className="size-4" aria-hidden /> Create funnel</Button>
        </form>
      )}
      {funnels.length === 0 ? (
        <EmptyState icon={Filter} title="No funnels yet" description="Create a funnel to set up a checkout with Order Bumps and choose where buyers go next." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {funnels.map((f) => (
            <Link key={f.id} href={`/sa/${subAccountId}/pages-funnels/funnels/${f.id}`} className="block rounded-xl">
              <Card variant="interactive" className="h-full p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-body">{f.name}</p>
                  <StatusPill status={f.status} />
                </div>
                <p className="text-muted-foreground mt-1 text-caption">{f.stepCount} {f.stepCount === 1 ? "step" : "steps"} · Edited {new Date(f.updatedAt).toLocaleDateString()}</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </PageShell>
  );
}
