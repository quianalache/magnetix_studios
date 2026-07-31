"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ColorInput } from "@/components/ui/color-input";
import {
  uploadQrBackgroundImage,
  uploadQrLogo,
} from "@/lib/qr-codes/upload-logo";
import type { QrCodeStyle, QrDotStyle, QrShape } from "@/types/qr-codes";

const DOT_STYLE_OPTIONS: { value: QrDotStyle; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "dots", label: "Dots" },
  { value: "classy", label: "Classy" },
];

const SHAPE_OPTIONS: { value: QrShape; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "circle", label: "Circle" },
];

/** Shared styling controls for both QR kinds — matches GHL's QR builder:
 *  color, dot shape, outer frame shape, marker color, optional logo,
 *  optional background image (with a transparent-background toggle as the
 *  common-case stand-in for a full alpha slider), and rim CTA text. */
export function QrStylePanel({
  style,
  onChange,
  subAccountId,
  qrId,
}: {
  style: QrCodeStyle;
  onChange: (style: QrCodeStyle) => void;
  subAccountId: string;
  /** Storage path namespace — a fresh client id before the doc is saved. */
  qrId: string;
}) {
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <h3 className="text-sm font-semibold">Style</h3>
      <div className="flex flex-wrap gap-4">
        <ColorInput
          label="Code color"
          value={style.fgColor}
          onChange={(hex) => onChange({ ...style, fgColor: hex, markerColor: hex })}
        />
        <ColorInput
          label="Markers"
          value={style.markerColor || style.fgColor}
          onChange={(hex) => onChange({ ...style, markerColor: hex })}
        />
        <ColorInput
          label="Background"
          value={style.bgColor}
          onChange={(hex) => onChange({ ...style, bgColor: hex })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Dot style
          </Label>
          <select
            value={style.dotStyle}
            onChange={(e) => onChange({ ...style, dotStyle: e.target.value as QrDotStyle })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&_option]:bg-background [&_option]:text-foreground"
          >
            {DOT_STYLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            QR shape
          </Label>
          <select
            value={style.shape}
            onChange={(e) => onChange({ ...style, shape: e.target.value as QrShape })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&_option]:bg-background [&_option]:text-foreground"
          >
            {SHAPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
        <div>
          <p className="text-sm font-medium">Transparent background</p>
          <p className="text-xs text-muted-foreground">
            For overlaying on a flyer or poster
          </p>
        </div>
        <Switch
          checked={style.bgTransparent}
          onCheckedChange={(v) => onChange({ ...style, bgTransparent: v })}
        />
      </div>

      <ImageUploadField
        label="Logo (optional)"
        value={style.logoUrl}
        onUpload={async (file) => uploadQrLogo(file, subAccountId, qrId)}
        onChange={(url) => onChange({ ...style, logoUrl: url })}
      />

      <ImageUploadField
        label="Background image (optional)"
        value={style.backgroundImageUrl}
        onUpload={async (file) => uploadQrBackgroundImage(file, subAccountId, qrId)}
        onChange={(url) => onChange({ ...style, backgroundImageUrl: url })}
      />

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          Text above the code (optional)
        </Label>
        <Input
          value={style.topText}
          onChange={(e) => onChange({ ...style, topText: e.target.value })}
          placeholder="Scan me"
          maxLength={40}
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          Text below the code (optional)
        </Label>
        <Input
          value={style.bottomText}
          onChange={(e) => onChange({ ...style, bottomText: e.target.value })}
          placeholder="Book a call"
          maxLength={40}
        />
      </div>
    </div>
  );
}

function ImageUploadField({
  label,
  value,
  onUpload,
  onChange,
}: {
  label: string;
  value: string | null;
  onUpload: (file: File) => Promise<string>;
  onChange: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handlePick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await onUpload(file);
      onChange(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't upload image");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {value ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="" className="h-9 w-9 rounded-md border object-contain" />
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>
            <X className="mr-1 h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="mr-1 h-3.5 w-3.5" />
          )}
          {uploading ? "Uploading…" : "Upload image"}
        </Button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handlePick(e.target.files?.[0])}
      />
    </div>
  );
}
