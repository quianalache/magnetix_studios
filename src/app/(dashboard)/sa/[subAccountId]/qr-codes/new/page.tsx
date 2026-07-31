"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { createQrCode } from "@/lib/firestore/qr-codes";
import { defaultQrStyle, emptyVcard } from "@/types/qr-codes";
import {
  QrCodeBuilder,
  type QrCodeFormValues,
} from "@/components/qr-codes/qr-code-builder";

const BLANK: QrCodeFormValues = {
  name: "",
  kind: "link",
  destinationUrl: "",
  destinationType: "custom",
  destinationRef: null,
  vcard: emptyVcard(),
  style: defaultQrStyle(),
};

export default function NewQrCodePage() {
  const router = useRouter();
  const { user } = useAuth();
  const { agencyId, subAccountId, isAdmin, saPath, loading } = useSubAccount();
  const [draftId] = useState(() => crypto.randomUUID());

  if (!loading && !isAdmin) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border bg-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Only sub-account admins can manage QR codes.
        </p>
        <Link
          href={saPath("/qr-codes")}
          className="mt-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
      </div>
    );
  }

  async function handleSubmit(values: QrCodeFormValues) {
    if (!user || !agencyId) return;
    const id = await createQrCode({ agencyId, subAccountId }, user.uid, {
      name: values.name,
      kind: values.kind,
      destinationUrl: values.kind === "link" ? values.destinationUrl : null,
      destinationType: values.kind === "link" ? values.destinationType : "custom",
      destinationRef: values.kind === "link" ? values.destinationRef : null,
      vcard: values.kind === "contact" ? values.vcard : null,
      style: values.style,
    });
    toast.success("QR code created.");
    router.push(saPath(`/qr-codes/${id}`));
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4">
      <Link
        href={saPath("/qr-codes")}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to QR codes
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">New QR Code</h1>
      <QrCodeBuilder
        initial={BLANK}
        submitLabel="Create QR Code"
        onSubmit={handleSubmit}
        subAccountId={subAccountId}
        qrId={draftId}
      />
    </div>
  );
}
