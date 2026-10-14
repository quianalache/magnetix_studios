"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  QrCode,
  Link2,
  Contact,
  Plus,
  MoreVertical,
  Pencil,
  Download,
  FolderInput,
  FolderPlus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToQrCodes, deleteQrCode, updateQrCode } from "@/lib/firestore/qr-codes";
import { subscribeToQrFolders, createQrFolder } from "@/lib/firestore/qr-folders";
import { downloadQrCode } from "@/lib/qr-codes/render";
import { buildVcardText } from "@/types/qr-codes";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState as SystemEmptyState } from "@/components/system/empty-state";
import { Tag } from "@/components/system/status-pill";
import { useConfirm } from "@/components/system/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { QrCodeDoc, QrFolder } from "@/types/qr-codes";

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
}

function qrDataFor(code: QrCodeDoc): string {
  if (code.kind === "contact") return code.vcard ? buildVcardText(code.vcard) : "";
  return `${appOrigin()}/qr/${code.id}`;
}

export default function QrCodesListPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, isAdmin, saPath } = useSubAccount();
  const [codes, setCodes] = useState<QrCodeDoc[]>([]);
  const [folders, setFolders] = useState<QrFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const { confirm: confirmDialog, dialog: confirmElement } = useConfirm();

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const unsubCodes = subscribeToQrCodes(
      { agencyId, subAccountId },
      (list) => {
        setCodes(list);
        setLoading(false);
      },
      () => setLoading(false),
    );
    const unsubFolders = subscribeToQrFolders({ agencyId, subAccountId }, setFolders);
    return () => {
      unsubCodes();
      unsubFolders();
    };
  }, [user, agencyId, subAccountId, authLoading]);

  const groups = useMemo(() => {
    const byFolder = new Map<string | null, QrCodeDoc[]>();
    for (const c of codes) {
      const key = c.folderId;
      const list = byFolder.get(key) ?? [];
      list.push(c);
      byFolder.set(key, list);
    }
    const named = folders
      .map((f) => ({ folder: f, codes: byFolder.get(f.id) ?? [] }))
      .filter((g) => g.codes.length > 0);
    const unfiled = byFolder.get(null) ?? [];
    return { named, unfiled };
  }, [codes, folders]);

  async function handleDelete(c: QrCodeDoc) {
    const ok = await confirmDialog({
      title: `Delete QR code "${c.name}"?`,
      description: "Anyone who scans a printed copy will hit a dead link.",
      confirmLabel: "Delete QR code",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteQrCode(c.id);
      toast.success("QR code deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  async function handleMove(c: QrCodeDoc, folderId: string | null) {
    try {
      await updateQrCode(c.id, { folderId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not move");
    }
  }

  async function handleDownload(c: QrCodeDoc, extension: "png" | "svg") {
    try {
      await downloadQrCode(qrDataFor(c), c.style, extension, c.name || "qr-code");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't generate the download");
    }
  }

  async function handleCreateFolder(name: string) {
    if (!name.trim() || !agencyId) return;
    try {
      await createQrFolder({ agencyId, subAccountId }, name.trim());
      toast.success("Folder created");
      setNewFolderOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create folder");
    }
  }

  const isEmpty = codes.length === 0;

  return (
    <PageShell width="data">
      <PageHeader
        accent="crescent"
        title="QR Codes"
        icon={QrCode}
        description="Generate a QR for any link, or a digital business card people can scan to save your contact info."
        actions={
          isAdmin && (
            <>
              <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
                <FolderPlus className="h-4 w-4" />
                New folder
              </Button>
              <Button render={<Link href={saPath("/qr-codes/new")} />}>
                <Plus className="h-4 w-4" />
                New QR Code
              </Button>
            </>
          )
        }
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-card" />
          ))}
        </div>
      ) : isEmpty ? (
        <SystemEmptyState
          icon={QrCode}
          title="No QR codes yet"
          description="Create one for any link — a booking page, offer, or website — or a digital business card people can scan to save your contact info."
          action={
            isAdmin ? (
              <Button render={<Link href={saPath("/qr-codes/new")} />}>
                <Plus className="h-4 w-4" />
                New QR Code
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {groups.named.map(({ folder, codes: list }) => (
            <div key={folder.id} className="space-y-2">
              <h2 className="text-overline font-semibold tracking-[0.12em] text-ink-tertiary uppercase">
                {folder.name}
              </h2>
              <QrList
                codes={list}
                folders={folders}
                isAdmin={isAdmin}
                saPath={saPath}
                onDelete={handleDelete}
                onMove={handleMove}
                onDownload={handleDownload}
              />
            </div>
          ))}
          {groups.unfiled.length > 0 && (
            <div className="space-y-2">
              {groups.named.length > 0 && (
                <h2 className="text-overline font-semibold tracking-[0.12em] text-ink-tertiary uppercase">
                  Unfiled
                </h2>
              )}
              <QrList
                codes={groups.unfiled}
                folders={folders}
                isAdmin={isAdmin}
                saPath={saPath}
                onDelete={handleDelete}
                onMove={handleMove}
                onDownload={handleDownload}
              />
            </div>
          )}
        </div>
      )}

      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        onCreate={handleCreateFolder}
      />
      {confirmElement}
    </PageShell>
  );
}

function QrList({
  codes,
  folders,
  isAdmin,
  saPath,
  onDelete,
  onMove,
  onDownload,
}: {
  codes: QrCodeDoc[];
  folders: QrFolder[];
  isAdmin: boolean;
  saPath: (p: string) => string;
  onDelete: (c: QrCodeDoc) => void;
  onMove: (c: QrCodeDoc, folderId: string | null) => void;
  onDownload: (c: QrCodeDoc, extension: "png" | "svg") => void;
}) {
  return (
    <ul className="divide-y divide-border-subtle overflow-hidden rounded-card border border-border bg-card shadow-card">
      {codes.map((c) => (
        <li
          key={c.id}
          className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-tint-violet"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={
                c.kind === "link"
                  ? "flex size-9 shrink-0 items-center justify-center rounded-chip bg-tag-violet-bg text-tag-violet-fg"
                  : "flex size-9 shrink-0 items-center justify-center rounded-chip bg-tag-aqua-bg text-tag-aqua-fg"
              }
            >
              {c.kind === "link" ? <Link2 className="h-4 w-4" /> : <Contact className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <Link
                href={saPath(`/qr-codes/${c.id}`)}
                className="block truncate text-body-sm font-semibold hover:text-link hover:underline"
              >
                {c.name}
              </Link>
              <p className="truncate text-caption text-muted-foreground">
                {c.kind === "link"
                  ? `${c.destinationUrl || "No destination set"} · ${c.scanCount} scan${c.scanCount === 1 ? "" : "s"}`
                  : "Contact card"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
          <Tag color={c.kind === "link" ? "violet" : "aqua"} className="hidden sm:inline-flex">{c.kind === "link" ? "Link" : "Contact card"}</Tag>
          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="ghost" size="sm" aria-label="QR code actions">
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end">
                <DropdownMenuItem render={<Link href={saPath(`/qr-codes/${c.id}`)} />}>
                  <Pencil className="mr-2 h-3.5 w-3.5" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDownload(c, "png")}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Download PNG
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDownload(c, "svg")}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Download SVG
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <FolderInput className="mr-2 h-3.5 w-3.5" />
                    Move to folder
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {c.folderId !== null && (
                      <DropdownMenuItem onClick={() => onMove(c, null)}>Unfiled</DropdownMenuItem>
                    )}
                    {folders
                      .filter((f) => f.id !== c.folderId)
                      .map((f) => (
                        <DropdownMenuItem key={f.id} onClick={() => onMove(c, f.id)}>
                          {f.name}
                        </DropdownMenuItem>
                      ))}
                    {folders.length === 0 && (
                      <DropdownMenuItem disabled>No folders yet</DropdownMenuItem>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => onDelete(c)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function NewFolderDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    try {
      await onCreate(name);
      setName("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Print materials"
          autoFocus
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={!name.trim() || saving}>
            {saving ? "Creating…" : "Create folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
