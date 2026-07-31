"use client";

import { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ColorInput } from "@/components/ui/color-input";
import { uploadQrLogo } from "@/lib/qr-codes/upload-logo";
import type { QrCodeStyle, QrDotStyle } from "@/types/qr-codes";

const DOT_STYLE_OPTIONS: { value: QrDotStyle; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "rounded", label: "Rounded" },
  { value: "dots", label: "Dots" },
  { value: "classy", label: "Classy" },
];

/** Shared styling controls (color, dot shape, optional logo) for both QR
 *  kinds — matches GHL's QR builder's shape/color/logo section, scoped down
 *  (no rim text, marker-border customization, or background image). */
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
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleLogoPick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadQrLogo(file, subAccountId, qrId);
      onChange({ ...style, logoUrl: url });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't upload logo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <h3 className="text-sm font-semibold">Style</h3>
      <div className="flex gap-4">
        <ColorInput
          label="Code color"
          value={style.fgColor}
          onChange={(hex) => onChange({ ...style, fgColor: hex })}
        />
        <ColorInput
          label="Background"
          value={style.bgColor}
          onChange={(hex) => onChange({ ...style, bgColor: hex })}
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">
          Dot style
        </Label>
        <select
          value={style.dotStyle}
          onChange={(e) =>
            onChange({ ...style, dotStyle: e.target.value as QrDotStyle })
          }
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
          Logo (optional)
        </Label>
        {style.logoUrl ? (
          <div className="flex items-center gap-2">
            <img
              src={style.logoUrl}
              alt="QR logo"
              className="h-9 w-9 rounded-md border object-contain"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange({ ...style, logoUrl: null })}
            >
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
            {uploading ? "Uploading…" : "Upload logo"}
          </Button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleLogoPick(e.target.files?.[0])}
        />
      </div>
    </div>
  );
}
