"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ColorInput } from "@/components/ui/color-input";
import { ButtonColorFields } from "./button-color-fields";
import { TypeRadio } from "./block-form";
import type { LessonBodyTheme, LessonButtonState } from "@/types/course-theme";

export function ButtonStateFields({
  value,
  onChange,
}: {
  value: LessonButtonState;
  onChange: (next: LessonButtonState) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Button Text</Label>
        <Input
          value={value.text}
          onChange={(e) => onChange({ ...value, text: e.target.value })}
        />
      </div>
      <TypeRadio
        value={value.buttonType}
        onChange={(v) => onChange({ ...value, buttonType: v })}
      />
      <ButtonColorFields
        color={value.color}
        borderColor={value.borderColor}
        textColor={value.textColor}
        colorHover={value.colorHover}
        borderColorHover={value.borderColorHover}
        textColorHover={value.textColorHover}
        onChange={(next) =>
          onChange({
            ...value,
            color: next.color,
            borderColor: next.borderColor,
            textColor: next.textColor,
            colorHover: next.colorHover,
            borderColorHover: next.borderColorHover,
            textColorHover: next.textColorHover,
          })
        }
      />
    </div>
  );
}

/**
 * Lesson page's Body tab — NOT a block list (unlike the Product page's Body
 * tab). Three fixed, always-present sections: the "About this Lesson" text
 * area, the Mark-as-Complete button (2 independent states — incomplete/
 * completed), and the "Next Lesson" promo card shown after completing.
 */
export function LessonBodyPanel({
  value,
  onChange,
}: {
  value: LessonBodyTheme;
  onChange: (next: LessonBodyTheme) => void;
}) {
  return (
    <div className="max-w-md space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium">Text</p>
        <ColorInput
          label="Background Color"
          value={value.background}
          onChange={(v) => onChange({ ...value, background: v })}
        />
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label>Lesson Title</Label>
            <Input
              value={value.aboutHeadingText}
              onChange={(e) => onChange({ ...value, aboutHeadingText: e.target.value })}
            />
          </div>
          <ColorInput
            value={value.aboutHeadingColor}
            onChange={(v) => onChange({ ...value, aboutHeadingColor: v })}
          />
        </div>
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">Call To Action</p>
        <p className="text-xs text-muted-foreground">Lesson Incomplete button</p>
        <ButtonStateFields
          value={value.ctaIncomplete}
          onChange={(ctaIncomplete) => onChange({ ...value, ctaIncomplete })}
        />
        <p className="text-xs text-muted-foreground">
          Lesson completed Button (After completed)
        </p>
        <ButtonStateFields
          value={value.ctaCompleted}
          onChange={(ctaCompleted) => onChange({ ...value, ctaCompleted })}
        />
      </div>

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">Next Lesson Card Content</p>
        <div className="flex flex-col gap-3">
          <ColorInput
            label="Card Background Color"
            value={value.nextLessonCard.backgroundColor}
            onChange={(v) =>
              onChange({ ...value, nextLessonCard: { ...value.nextLessonCard, backgroundColor: v } })
            }
          />
          <ColorInput
            label="Card Border Color"
            value={value.nextLessonCard.borderColor}
            onChange={(v) =>
              onChange({ ...value, nextLessonCard: { ...value.nextLessonCard, borderColor: v } })
            }
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label>Message Content</Label>
            <Input
              value={value.nextLessonCard.messageText}
              onChange={(e) =>
                onChange({
                  ...value,
                  nextLessonCard: { ...value.nextLessonCard, messageText: e.target.value },
                })
              }
            />
          </div>
          <ColorInput
            value={value.nextLessonCard.messageColor}
            onChange={(v) =>
              onChange({ ...value, nextLessonCard: { ...value.nextLessonCard, messageColor: v } })
            }
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label>Button Text</Label>
            <Input
              value={value.nextLessonCard.buttonText}
              onChange={(e) =>
                onChange({
                  ...value,
                  nextLessonCard: { ...value.nextLessonCard, buttonText: e.target.value },
                })
              }
            />
          </div>
          <ColorInput
            value={value.nextLessonCard.buttonTextColor}
            onChange={(v) =>
              onChange({ ...value, nextLessonCard: { ...value.nextLessonCard, buttonTextColor: v } })
            }
          />
        </div>
        <ColorInput
          label="Next Lesson Title Color"
          value={value.nextLessonCard.nextLessonTitleColor}
          onChange={(v) =>
            onChange({
              ...value,
              nextLessonCard: { ...value.nextLessonCard, nextLessonTitleColor: v },
            })
          }
        />
      </div>
    </div>
  );
}
