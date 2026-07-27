"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_SERVICE_AGREEMENT_TEXT,
  type CourseOfferCheckoutSettings,
  type ServiceAgreementMode,
} from "@/types/course-offers";

/**
 * The Offer checkout editor's two non-visual tabs — "Extra Contact
 * Information" and "Service Agreement" — sit alongside Layout/Header/Hero/
 * Body/Sidebar in the same "Edit Checkout" side nav, but configure checkout
 * *behavior* (`offer.checkoutSettings`) rather than the visual theme, so
 * they're saved via the general offer PATCH endpoint instead of the theme
 * endpoint.
 */
export function ExtraContactInfoPanel({
  value,
  onChange,
}: {
  value: CourseOfferCheckoutSettings;
  onChange: (next: CourseOfferCheckoutSettings) => void;
}) {
  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm font-medium">Extra Contact Information</p>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value.collectAddress}
          onCheckedChange={(v) => onChange({ ...value, collectAddress: v === true })}
        />
        Collect address
      </label>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={value.collectPhoneNumber}
          onCheckedChange={(v) => onChange({ ...value, collectPhoneNumber: v === true })}
        />
        Collect phone number
      </label>
    </div>
  );
}

const MODES: { value: ServiceAgreementMode; label: string }[] = [
  { value: "notRequired", label: "Not required" },
  { value: "required", label: "Required:" },
  { value: "custom", label: "Custom agreement text:" },
];

export function ServiceAgreementPanel({
  value,
  onChange,
}: {
  value: CourseOfferCheckoutSettings;
  onChange: (next: CourseOfferCheckoutSettings) => void;
}) {
  const agreement = value.serviceAgreement;

  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm font-medium">Service Agreement</p>
      <div className="space-y-3">
        {MODES.map((m) => (
          <div key={m.value} className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                checked={agreement.mode === m.value}
                onChange={() =>
                  onChange({
                    ...value,
                    serviceAgreement: { ...agreement, mode: m.value },
                  })
                }
                className="h-3.5 w-3.5"
              />
              {m.label}
            </label>
            {m.value !== "notRequired" && (
              <p className="pl-[1.375rem] text-xs text-muted-foreground">
                {DEFAULT_SERVICE_AGREEMENT_TEXT}
              </p>
            )}
            {m.value === "custom" && agreement.mode === "custom" && (
              <Textarea
                value={agreement.customText}
                onChange={(e) =>
                  onChange({
                    ...value,
                    serviceAgreement: { ...agreement, customText: e.target.value },
                  })
                }
                className="ml-[1.375rem] min-h-24 text-[13px]"
                style={{ width: "calc(100% - 1.375rem)" }}
              />
            )}
          </div>
        ))}
      </div>

      {agreement.mode !== "notRequired" && (
        <div className="space-y-1.5">
          <Label>Link to Service Agreement</Label>
          <Input
            value={agreement.linkUrl}
            onChange={(e) =>
              onChange({
                ...value,
                serviceAgreement: { ...agreement, linkUrl: e.target.value },
              })
            }
            placeholder="Enter the URL..."
          />
        </div>
      )}
    </div>
  );
}
