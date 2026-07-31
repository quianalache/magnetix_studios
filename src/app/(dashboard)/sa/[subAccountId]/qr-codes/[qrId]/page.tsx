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

  if (loading || subLoading) {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4">
        <div className="h-7 w-48 animate-pulse rounded bg-muted" />
        <div className="h-96 animate-pulse rounded-2xl bg-muted/40" />
      </div>
    );
  }

  if (!code) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-dashed bg-card/50 p-10 text-center">
        <QrCodeIcon className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
        <h2 className="text-base font-semibold">QR code not found</h2>
        <Link
          href={saPath("/qr-codes")}
          className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to QR codes
        </Link>
      </div>
    );
  }

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  const redirectUrl = `${base}/qr/${id}`;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <Link
        href={saPath("/qr-codes")}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to QR codes
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{code.name}</h1>
        {code.kind === "link" && (
          <p className="text-sm text-muted-foreground">
            {code.scanCount} scan{code.scanCount === 1 ? "" : "s"} · short link{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{redirectUrl}</code>
          </p>
        )}
      </div>
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
        <p className="text-sm text-muted-foreground">
          Only sub-account admins can edit QR codes.
        </p>
      )}
    </div>
  );
}
