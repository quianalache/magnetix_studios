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
import { PageHeader } from "@/components/dashboard/page-header";
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
    if (!confirm(`Delete QR code "${c.name}"? Anyone who scans a printed copy will hit a dead link.`)) return;
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
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="QR Codes"
        description="Generate a QR for any link, or a digital business card people can scan to save your contact info."
        actions={
          isAdmin && (
            <>
              <Button variant="outline" onClick={() => setNewFolderOpen(true)}>
                <FolderPlus className="mr-1 h-4 w-4" />
                New folder
              </Button>
              <Button render={<Link href={saPath("/qr-codes/new")} />}>
                <Plus className="mr-1 h-4 w-4" />
                New QR Code
              </Button>
            </>
          )
        }
      />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl border bg-muted/30" />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {groups.named.map(({ folder, codes: list }) => (
            <div key={folder.id} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
    </div>
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
    <ul className="space-y-2">
      {codes.map((c) => (
        <li
          key={c.id}
          className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span
              className={
                c.kind === "link"
                  ? "flex h-8 w-8 items-center justify-center rounded-lg bg-[#5E2574]/10 text-[#5E2574] dark:bg-[#C892DE]/15 dark:text-[#C892DE]"
                  : "flex h-8 w-8 items-center justify-center rounded-lg bg-[#9EDBDD]/25 text-teal-700 dark:bg-[#9EDBDD]/15 dark:text-[#9EDBDD]"
              }
            >
              {c.kind === "link" ? <Link2 className="h-4 w-4" /> : <Contact className="h-4 w-4" />}
            </span>
            <div className="min-w-0">
              <Link
                href={saPath(`/qr-codes/${c.id}`)}
                className="block truncate font-medium hover:text-primary hover:underline"
              >
                {c.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {c.kind === "link"
                  ? `${c.destinationUrl || "No destination set"} · ${c.scanCount} scan${c.scanCount === 1 ? "" : "s"}`
                  : "Contact card"}
              </p>
            </div>
          </div>
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

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <QrCode className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold">No QR codes yet</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        Create one for any link — a booking page, offer, or website — or a
        digital business card people can scan to save your contact info.
      </p>
    </div>
  );
}
