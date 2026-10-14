"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Lock, QrCode } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { createQrCode } from "@/lib/firestore/qr-codes";
import { defaultQrStyle, emptyVcard } from "@/types/qr-codes";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { EmptyState } from "@/components/system/empty-state";
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

  const back = (
    <Link href={saPath("/qr-codes")} className="inline-flex items-center gap-1 hover:text-foreground">
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      Back to QR codes
    </Link>
  );

  if (!loading && !isAdmin) {
    return (
      <PageShell width="data">
        <PageHeader breadcrumbs={back} title="New QR Code" icon={QrCode} />
        <EmptyState
          icon={Lock}
          title="Admins only"
          description="Only sub-account admins can manage QR codes."
          action={<Button variant="outline" render={<Link href={saPath("/qr-codes")} />}>Back to QR codes</Button>}
        />
      </PageShell>
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
    <PageShell width="data">
      <PageHeader breadcrumbs={back} title="New QR Code" icon={QrCode} />
      <QrCodeBuilder
        initial={BLANK}
        submitLabel="Create QR Code"
        onSubmit={handleSubmit}
        subAccountId={subAccountId}
        qrId={draftId}
      />
    </PageShell>
  );
}
