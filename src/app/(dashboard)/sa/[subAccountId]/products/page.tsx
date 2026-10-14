"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Archive, Loader2, Package, Pencil, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToProducts } from "@/lib/firestore/products";
import type { Product } from "@/types/products";
import { Switch } from "@/components/ui/switch";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { StatusPill } from "@/components/system/status-pill";
import { EmptyState as SystemEmptyState } from "@/components/system/empty-state";
import { DataTableShell, DATA_TABLE_HEAD_ROW, DATA_TABLE_ROW, DATA_TABLE_TD, DATA_TABLE_TH } from "@/components/system/data-table";

/**
 * Sub-account product catalog. Operator creates reusable products here;
 * the quote/invoice builder snapshots them into line items.
 *
 * v1 scope: name, description, unit price, currency, active toggle.
 * Recurring/subscription support deferred to v1.1.
 */

export default function ProductsPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();

  const [products, setProducts] = useState<Product[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const unsub = subscribeToProducts(
      { agencyId, subAccountId },
      setProducts,
    );
    return () => unsub();
  }, [user, agencyId, subAccountId, authLoading]);

  const visible = useMemo(
    () => products.filter((p) => showArchived || p.active),
    [products, showArchived],
  );
  const archivedCount = useMemo(
    () => products.filter((p) => !p.active).length,
    [products],
  );

  return (
    <PageShell width="data">
      <PageHeader
        accent="crescent"
        title="Products"
        description="Reusable line items for quotes and invoices. Snapshotted into each document at the moment of add — editing a product never changes historical quotes or invoices."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden="true" />
            New product
          </Button>
        }
      />

      {archivedCount > 0 && (
        <div className="flex items-center gap-2.5">
          <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor="show-archived" className="font-medium text-muted-foreground">
            Show archived ({archivedCount})
          </Label>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} />
      ) : (
        <DataTableShell minWidth="40rem">
          <thead>
            <tr className={DATA_TABLE_HEAD_ROW}>
              <th className={DATA_TABLE_TH}>Name</th>
              <th className={DATA_TABLE_TH}>Description</th>
              <th className={`${DATA_TABLE_TH} text-right`}>Price</th>
              <th className={DATA_TABLE_TH}>Status</th>
              <th className={DATA_TABLE_TH}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <ProductRow key={p.id} product={p} subAccountId={subAccountId} onEdit={() => setEditing(p)} />
            ))}
          </tbody>
        </DataTableShell>
      )}

      <ProductDialog
        open={creating || !!editing}
        product={editing}
        subAccountId={subAccountId}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </PageShell>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <SystemEmptyState
      icon={Package}
      title="No products yet"
      description="Add your first product to start building quotes and invoices."
      action={
        <Button onClick={onCreate}>
          <Plus className="size-4" aria-hidden="true" />
          New product
        </Button>
      }
    />
  );
}

function ProductRow({
  product,
  subAccountId,
  onEdit,
}: {
  product: Product;
  subAccountId: string;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggleArchive() {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/products/${product.id}`,
        product.active
          ? { method: "DELETE" }
          : {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ active: true }),
            },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed.");
      toast.success(product.active ? "Product archived." : "Product restored.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className={DATA_TABLE_ROW}>
      <td className={`${DATA_TABLE_TD} font-medium text-foreground`}>{product.name}</td>
      <td className={`${DATA_TABLE_TD} max-w-md truncate text-muted-foreground`}>
        {product.description || <span className="italic text-ink-tertiary">No description</span>}
      </td>
      <td className={`${DATA_TABLE_TD} whitespace-nowrap text-right tabular-nums text-foreground`}>
        {formatPrice(product.unitPriceCents, product.currency)}
      </td>
      <td className={DATA_TABLE_TD}>
        <StatusPill tone={product.active ? "success" : "neutral"}>{product.active ? "Active" : "Archived"}</StatusPill>
      </td>
      <td className={DATA_TABLE_TD}>
        <div className="flex items-center justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={onEdit} aria-label={`Edit ${product.name}`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={toggleArchive}
            title={product.active ? "Archive" : "Restore"}
            aria-label={`${product.active ? "Archive" : "Restore"} ${product.name}`}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : product.active ? (
              <Archive className="h-3.5 w-3.5" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function ProductDialog({
  open,
  product,
  subAccountId,
  onClose,
}: {
  open: boolean;
  product: Product | null;
  subAccountId: string;
  onClose: () => void;
}) {
  const editing = !!product;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setName(product.name);
      setDescription(product.description);
      setPriceDollars((product.unitPriceCents / 100).toFixed(2));
      setCurrency(product.currency);
    } else {
      setName("");
      setDescription("");
      setPriceDollars("");
      setCurrency("USD");
    }
  }, [open, product]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error("Name is required.");
      return;
    }
    const priceNum = Number(priceDollars);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      toast.error("Price must be a non-negative number.");
      return;
    }
    const unitPriceCents = Math.round(priceNum * 100);

    setSaving(true);
    try {
      const payload = {
        name: trimmedName,
        description: description.trim(),
        unitPriceCents,
        currency: currency.trim().toUpperCase(),
      };
      const res = await fetch(
        editing
          ? `/api/sub-accounts/${subAccountId}/products/${product!.id}`
          : `/api/sub-accounts/${subAccountId}/products`,
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        id?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save.");
      }
      toast.success(editing ? "Product updated." : "Product created.");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
          <DialogDescription>
            Reusable line item for quotes and invoices.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="product-name">Name</Label>
            <Input
              id="product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Website audit"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="product-description">Description</Label>
            <Textarea
              id="product-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional. Shown to the recipient on the invoice."
              rows={3}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="product-price">Unit price</Label>
              <Input
                id="product-price"
                type="number"
                step="0.01"
                min="0"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-currency">Currency</Label>
              <Input
                id="product-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="USD"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </>
              ) : editing ? (
                "Save"
              ) : (
                "Create"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatPrice(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
