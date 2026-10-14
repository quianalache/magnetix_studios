"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, QrCode as QrCodeIcon } from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToQrCode, updateQrCode } from "@/lib/firestore/qr-codes";
import { defaultQrStyle, emptyVcard } from "@/types/qr-codes";
import type { QrCodeDoc } from "@/types/qr-codes";
import {
  QrCodeBuilder,
  type QrCodeFormValues,
} from "@/components/qr-codes/qr-code-builder";
import { QrScanChart } from "@/components/qr-codes/qr-scan-chart";
import { Button } from "@/components/ui/button";
import { PageShell, PageShellLoading } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
import { Tag } from "@/components/system/status-pill";

export default function EditQrCodePage() {
  const params = useParams<{ qrId: string }>();
  const id = params.qrId;
  const { subAccountId, isAdmin, saPath, loading: subLoading } = useSubAccount();
  const [code, setCode] = useState<QrCodeDoc | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const unsub = subscribeToQrCode(
      id,
      (c) => {
        setCode(c);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return () => unsub();
  }, [id]);

  async function handleSubmit(values: QrCodeFormValues) {
    await updateQrCode(id, {
      name: values.name,
      kind: values.kind,
      destinationUrl: values.kind === "link" ? values.destinationUrl : null,
      destinationType: values.kind === "link" ? values.destinationType : "custom",
      destinationRef: values.kind === "link" ? values.destinationRef : null,
      vcard: values.kind === "contact" ? values.vcard : null,
      style: values.style,
    });
    toast.success("QR code saved.");
  }

  const back = (
    <Link href={saPath("/qr-codes")} className="inline-flex items-center gap-1 hover:text-foreground">
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      Back to QR codes
    </Link>
  );

  if (loading || subLoading) {
    return <PageShellLoading width="data" />;
  }

  if (!code) {
    return (
      <PageShell width="data">
        <PageHeader breadcrumbs={back} title="QR code" icon={QrCodeIcon} />
        <EmptyState
          icon={QrCodeIcon}
          title="QR code not found"
          description="It may have been deleted, or the link is wrong."
          action={<Button variant="outline" render={<Link href={saPath("/qr-codes")} />}>Back to QR codes</Button>}
        />
      </PageShell>
    );
  }

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const redirectUrl = `${base}/qr/${id}`;

  return (
    <PageShell width="data">
      <PageHeader
        breadcrumbs={back}
        title={code.name}
        icon={QrCodeIcon}
        actions={<Tag color={code.kind === "link" ? "violet" : "aqua"}>{code.kind === "link" ? "Link" : "Contact card"}</Tag>}
        description={
          code.kind === "link" ? (
            <>
              {code.scanCount} scan{code.scanCount === 1 ? "" : "s"} · short link{" "}
              <code className="rounded-chip bg-surface-sunken px-1.5 py-0.5 font-mono text-caption break-all">{redirectUrl}</code>
            </>
          ) : undefined
        }
      />
      {code.kind === "link" && <QrScanChart qrId={id} />}
      {isAdmin ? (
        <QrCodeBuilder
          initial={{
            name: code.name,
            kind: code.kind,
            destinationUrl: code.destinationUrl ?? "",
            destinationType: code.destinationType,
            destinationRef: code.destinationRef,
            vcard: code.vcard ?? emptyVcard(),
            style: code.style ?? defaultQrStyle(),
          }}
          submitLabel="Save changes"
          onSubmit={handleSubmit}
          subAccountId={subAccountId}
          qrId={id}
          redirectUrl={code.kind === "link" ? redirectUrl : undefined}
        />
      ) : (
        <p className="text-body-sm text-muted-foreground">
          Only sub-account admins can edit QR codes.
        </p>
      )}
    </PageShell>
  );
}
