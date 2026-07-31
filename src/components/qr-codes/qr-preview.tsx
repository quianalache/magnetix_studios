"use client";

import { useEffect, useRef } from "react";
import type QRCodeStyling from "qr-code-styling";
import type { Options } from "qr-code-styling";
import type { QrCodeStyle } from "@/types/qr-codes";

/**
 * Live QR preview + download, backed by `qr-code-styling`. The library
 * touches `document`/canvas at construction time, so it's loaded via a
 * runtime `import()` inside an effect rather than a static import — safe
 * under Next.js SSR without a `next/dynamic` wrapper.
 */

const DOT_TYPE_MAP: Record<
  QrCodeStyle["dotStyle"],
  NonNullable<Options["dotsOptions"]>["type"]
> = {
  square: "square",
  rounded: "rounded",
  dots: "dots",
  classy: "classy",
};

function buildOptions(data: string, style: QrCodeStyle, size: number): Partial<Options> {
  const roundedCorners = style.dotStyle !== "square";
  return {
    width: size,
    height: size,
    data: data || " ",
    image: style.logoUrl ?? undefined,
    dotsOptions: { type: DOT_TYPE_MAP[style.dotStyle], color: style.fgColor },
    cornersSquareOptions: {
      type: roundedCorners ? "extra-rounded" : "square",
      color: style.fgColor,
    },
    cornersDotOptions: {
      type: roundedCorners ? "dot" : "square",
      color: style.fgColor,
    },
    backgroundOptions: { color: style.bgColor },
    imageOptions: { crossOrigin: "anonymous", margin: 4, imageSize: 0.35 },
  };
}

export interface QrPreviewHandle {
  download: (extension: "png" | "svg", name: string) => void;
}

export function QrPreview({
  data,
  style,
  size = 240,
  onReady,
}: {
  data: string;
  style: QrCodeStyle;
  size?: number;
  onReady?: (handle: QrPreviewHandle) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);
  const latest = useRef({ data, style });
  latest.current = { data, style };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { default: QRCodeStylingCtor } = await import("qr-code-styling");
      if (cancelled || !containerRef.current) return;
      const qr = new QRCodeStylingCtor(
        buildOptions(latest.current.data, latest.current.style, size),
      );
      qrRef.current = qr;
      containerRef.current.innerHTML = "";
      qr.append(containerRef.current);
      onReady?.({
        download: (extension, name) => void qr.download({ name, extension }),
      });
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally mount-only — `size` changes are rare (fixed preview
    // sizes) and prop changes are handled by the effect below via `.update()`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  useEffect(() => {
    qrRef.current?.update(buildOptions(data, style, size));
  }, [data, style, size]);

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center overflow-hidden rounded-xl border bg-white p-3"
      style={{ width: size + 24, height: size + 24 }}
    />
  );
}
