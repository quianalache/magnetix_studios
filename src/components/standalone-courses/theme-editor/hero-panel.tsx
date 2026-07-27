"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorInput } from "@/components/ui/color-input";
import { ImageUpload } from "@/components/community/image-upload";
import type { HeroTheme, HeroVerticalSpacing } from "@/types/course-theme";

export function HeroPanel({
  value,
  onChange,
  onUploadImage,
}: {
  value: HeroTheme;
  onChange: (next: HeroTheme) => void;
  /** Storage path (course theme vs offer theme) is the caller's concern —
   *  same reasoning as `BlockForm`'s `onUploadImage`. */
  onUploadImage: (file: File) => Promise<string>;
}) {
  return (
    <div className="max-w-md space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.visible}
          onChange={(e) => onChange({ ...value, visible: e.target.checked })}
          className="h-4 w-4"
        />
        Show Hero
      </label>

      {value.visible && (
        <>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="flex gap-3">
              {(["color", "image"] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="radio"
                    checked={value.backgroundType === t}
                    onChange={() => onChange({ ...value, backgroundType: t })}
                    className="h-3.5 w-3.5"
                  />
                  {t === "color" ? "Color" : "Image"}
                </label>
              ))}
            </div>
          </div>

          {value.backgroundType === "color" ? (
            <ColorInput
              label="Background Color"
              value={value.backgroundColor}
              onChange={(v) => onChange({ ...value, backgroundColor: v })}
            />
          ) : (
            <ImageUpload
              label="Background Image"
              hint="Recommended dimensions of 1280×384."
              value={value.backgroundImageUrl}
              onChange={(url) => onChange({ ...value, backgroundImageUrl: url })}
              onUpload={onUploadImage}
            />
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.overlayVisible}
              onChange={(e) => onChange({ ...value, overlayVisible: e.target.checked })}
              className="h-4 w-4"
            />
            Show Overlay
          </label>
          {value.overlayVisible && (
            <div className="space-y-3 rounded-lg border p-3">
              <ColorInput
                label="Overlay Color"
                value={value.overlayColor}
                onChange={(v) => onChange({ ...value, overlayColor: v })}
              />
              <div className="space-y-1.5">
                <Label>Transparency — {value.overlayOpacity}%</Label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={value.overlayOpacity}
                  onChange={(e) =>
                    onChange({ ...value, overlayOpacity: Number(e.target.value) })
                  }
                  className="w-full"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Tagline</Label>
            <Input
              value={value.tagline}
              onChange={(e) => onChange({ ...value, tagline: e.target.value })}
              maxLength={2500}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Button Text</Label>
            <Input
              value={value.buttonText}
              onChange={(e) => onChange({ ...value, buttonText: e.target.value })}
              maxLength={300}
            />
          </div>
          <div className="flex flex-col gap-3">
            <ColorInput
              label="Button Color"
              value={value.buttonColor}
              onChange={(v) => onChange({ ...value, buttonColor: v })}
            />
            <ColorInput
              label="Button Text Color"
              value={value.buttonTextColor}
              onChange={(v) => onChange({ ...value, buttonTextColor: v })}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Vertical Spacing</Label>
            <div className="flex gap-3">
              {(["small", "medium", "large"] as HeroVerticalSpacing[]).map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="radio"
                    checked={value.verticalSpacing === s}
                    onChange={() => onChange({ ...value, verticalSpacing: s })}
                    className="h-3.5 w-3.5"
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
