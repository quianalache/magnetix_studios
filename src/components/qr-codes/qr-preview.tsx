"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { renderQrToBlob } from "@/lib/qr-codes/render";
import type { QrCodeStyle } from "@/types/qr-codes";

/**
 * Live QR preview. Renders through the exact same `renderQrToBlob` pipeline
 * used for downloads (compositing shape/rim-text/background-image on top of
 * `qr-code-styling`'s raw output), so what's on screen is guaranteed to
 * match what gets downloaded — no separate "preview-only" rendering path to
 * drift out of sync.
 */

export interface QrPreviewHandle {
  download: (extension: "png" | "svg", name: string) => void;
}

export function QrPreview({
  data,
  style,
  size = 260,
  onReady,
}: {
  data: string;
  style: QrCodeStyle;
  size?: number;
  onReady?: (handle: QrPreviewHandle) => void;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    let cancelled = false;
    (async () => {
      try {
        const blob = await renderQrToBlob(data, style, "png", size);
        if (cancelled || id !== requestId.current) return;
        const url = URL.createObjectURL(blob);
        if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
        prevUrl.current = url;
        setImgUrl(url);
      } catch {
        // Leave the previous preview showing on a transient render error.
      } finally {
        if (!cancelled && id === requestId.current) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, JSON.stringify(style), size]);

  useEffect(() => {
    onReady?.({
      download: (extension, name) => {
        void (async () => {
          const { downloadQrCode } = await import("@/lib/qr-codes/render");
          await downloadQrCode(data, style, extension, name);
        })();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, JSON.stringify(style)]);

  useEffect(
    () => () => {
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
    },
    [],
  );

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-xl border bg-[repeating-conic-gradient(#e5e7eb_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-3"
      style={{ width: size + 24, height: (size + 24) * 1.15 }}
    >
      {imgUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imgUrl} alt="QR code preview" className="max-h-full max-w-full" />
      )}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
