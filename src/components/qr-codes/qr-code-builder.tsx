"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link2, Contact, Download, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { QrStylePanel } from "@/components/qr-codes/qr-style-panel";
import { QrPreview, type QrPreviewHandle } from "@/components/qr-codes/qr-preview";
import { subscribeToBookingPages } from "@/lib/firestore/booking-pages";
import { subscribeToCourseOffers } from "@/lib/firestore/course-offers";
import type { BookingPage } from "@/types/booking";
import type { CourseOffer } from "@/types/course-offers";
import {
  buildVcardText,
  defaultQrStyle,
  emptyVcard,
  type QrCodeKind,
  type QrCodeStyle,
  type QrCodeVcard,
  type QrDestinationRef,
  type QrDestinationType,
} from "@/types/qr-codes";

export interface QrCodeFormValues {
  name: string;
  kind: QrCodeKind;
  destinationUrl: string;
  destinationType: QrDestinationType;
  destinationRef: QrDestinationRef | null;
  vcard: QrCodeVcard;
  style: QrCodeStyle;
}

const VCARD_FIELDS: { key: keyof QrCodeVcard; label: string; placeholder: string }[] = [
  { key: "name", label: "Full name", placeholder: "Jamie Rivera" },
  { key: "title", label: "Title", placeholder: "Founder" },
  { key: "company", label: "Company", placeholder: "Magnetix Studios" },
  { key: "phone", label: "Phone", placeholder: "+1 (555) 123-4567" },
  { key: "email", label: "Email", placeholder: "jamie@example.com" },
  { key: "website", label: "Website", placeholder: "https://example.com" },
  { key: "address", label: "Address", placeholder: "123 Main St, Springfield" },
];

const DESTINATION_TYPES: { value: QrDestinationType; label: string }[] = [
  { value: "custom", label: "Custom URL" },
  { value: "booking", label: "Booking Page" },
  { value: "offer", label: "Offer" },
];

function appOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
}

export function QrCodeBuilder({
  initial,
  submitLabel,
  onSubmit,
  subAccountId,
  qrId,
  /** The real `/qr/{id}` short link — only known once a Link-kind code has
   *  been saved. Undefined in "new" mode, where the Link preview shows the
   *  raw destination as a stand-in until the first save. */
  redirectUrl,
}: {
  initial: QrCodeFormValues;
  submitLabel: string;
  onSubmit: (values: QrCodeFormValues) => Promise<void>;
  subAccountId: string;
  qrId: string;
  redirectUrl?: string;
}) {
  const [name, setName] = useState(initial.name);
  const [kind, setKind] = useState<QrCodeKind>(initial.kind);
  const [destinationType, setDestinationType] = useState<QrDestinationType>(initial.destinationType);
  const [destinationUrl, setDestinationUrl] = useState(initial.destinationUrl);
  const [destinationRef, setDestinationRef] = useState<QrDestinationRef | null>(initial.destinationRef);
  const [vcard, setVcard] = useState<QrCodeVcard>(initial.vcard ?? emptyVcard());
  const [style, setStyle] = useState<QrCodeStyle>(initial.style ?? defaultQrStyle());
  const [submitting, setSubmitting] = useState(false);
  const [bookingPages, setBookingPages] = useState<BookingPage[]>([]);
  const [offers, setOffers] = useState<CourseOffer[]>([]);
  const previewHandle = useRef<QrPreviewHandle | null>(null);

  useEffect(() => {
    const unsubPages = subscribeToBookingPages(subAccountId, (pages) =>
      setBookingPages(pages.filter((p) => p.status === "published")),
    );
    const unsubOffers = subscribeToCourseOffers(subAccountId, (list) =>
      setOffers(list.filter((o) => o.visibility === "published")),
    );
    return () => {
      unsubPages();
      unsubOffers();
    };
  }, [subAccountId]);

  const qrData = useMemo(() => {
    if (kind === "contact") return buildVcardText(vcard);
    return redirectUrl || destinationUrl || "";
  }, [kind, vcard, redirectUrl, destinationUrl]);

  function pickBookingPage(pageId: string) {
    const page = bookingPages.find((p) => p.id === pageId);
    if (!page) return;
    setDestinationUrl(`${appOrigin()}/b/${subAccountId}/${page.slug}`);
    setDestinationRef({ type: "booking", id: page.id });
  }

  function pickOffer(offerId: string) {
    const offer = offers.find((o) => o.id === offerId);
    if (!offer) return;
    setDestinationUrl(`${appOrigin()}/offer/${subAccountId}/${offer.id}`);
    setDestinationRef({ type: "offer", id: offerId });
  }

  function handleDestinationTypeChange(type: QrDestinationType) {
    setDestinationType(type);
    if (type === "custom") {
      setDestinationRef(null);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Give this QR code a name.");
      return;
    }
    if (kind === "link" && !destinationUrl.trim()) {
      toast.error("Add a destination link.");
      return;
    }
    if (kind === "contact" && !vcard.name.trim()) {
      toast.error("Add at least a name for the contact card.");
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        kind,
        destinationUrl: destinationUrl.trim(),
        destinationType,
        destinationRef,
        vcard,
        style,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save this QR code.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleDownload(extension: "png" | "svg") {
    previewHandle.current?.download(extension, name.trim() || "qr-code");
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Booking page QR"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Type</Label>
          <div className="flex gap-2">
            <KindButton
              active={kind === "link"}
              icon={<Link2 className="h-4 w-4" />}
              label="Link"
              onClick={() => setKind("link")}
            />
            <KindButton
              active={kind === "contact"}
              icon={<Contact className="h-4 w-4" />}
              label="Contact card"
              onClick={() => setKind("contact")}
            />
          </div>
        </div>

        {kind === "link" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Destination type</Label>
              <div className="flex gap-2">
                {DESTINATION_TYPES.map((t) => (
                  <KindButton
                    key={t.value}
                    active={destinationType === t.value}
                    icon={null}
                    label={t.label}
                    onClick={() => handleDestinationTypeChange(t.value)}
                  />
                ))}
              </div>
            </div>

            {destinationType === "booking" ? (
              <div className="space-y-1.5">
                <Label>Booking page</Label>
                <select
                  value={destinationRef?.type === "booking" ? destinationRef.id : ""}
                  onChange={(e) => pickBookingPage(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&_option]:bg-background [&_option]:text-foreground"
                >
                  <option value="" disabled>
                    {bookingPages.length ? "Choose a booking page…" : "No published booking pages yet"}
                  </option>
                  {bookingPages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : destinationType === "offer" ? (
              <div className="space-y-1.5">
                <Label>Offer</Label>
                <select
                  value={destinationRef?.type === "offer" ? destinationRef.id : ""}
                  onChange={(e) => pickOffer(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&_option]:bg-background [&_option]:text-foreground"
                >
                  <option value="" disabled>
                    {offers.length ? "Choose an offer…" : "No published offers yet"}
                  </option>
                  {offers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Destination</Label>
                <Input
                  type="url"
                  value={destinationUrl}
                  onChange={(e) => {
                    setDestinationUrl(e.target.value);
                    setDestinationRef(null);
                  }}
                  placeholder="https://your-booking-page.com"
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              The printed code points at a short link of ours — you can
              change this destination later without reprinting it. Scan the
              preview with your phone any time to test it.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {VCARD_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1.5">
                <Label>{f.label}</Label>
                <Input
                  value={vcard[f.key]}
                  onChange={(e) => setVcard({ ...vcard, [f.key]: e.target.value })}
                  placeholder={f.placeholder}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Encoded directly into the code — scanning it works with no
              internet connection or server, on any phone&apos;s camera app.
            </p>
          </div>
        )}

        <Button type="submit" disabled={submitting}>
          <Save className="mr-1 h-4 w-4" />
          {submitting ? "Saving…" : submitLabel}
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card p-4">
          <QrPreview
            data={qrData}
            style={style}
            onReady={(handle) => {
              previewHandle.current = handle;
            }}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => handleDownload("png")}>
              <Download className="mr-1 h-3.5 w-3.5" />
              PNG
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => handleDownload("svg")}>
              <Download className="mr-1 h-3.5 w-3.5" />
              SVG
            </Button>
          </div>
        </div>
        <QrStylePanel style={style} onChange={setStyle} subAccountId={subAccountId} qrId={qrId} />
      </div>
    </form>
  );
}

function KindButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-input text-muted-foreground hover:bg-muted/50",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
