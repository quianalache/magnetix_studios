"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { subscribeToForms } from "@/lib/firestore/forms";
import { useSubAccount } from "@/context/sub-account-context";
import { newBlockId } from "@/lib/pages-funnels/blocks";
import type {
  BlockAlignment,
  BackgroundStyle,
  ButtonStyle,
  PageBlock,
} from "@/types/pages-funnels";
import type { LeadForm } from "@/types/forms";

type SettingsTab = "Content" | "Layout" | "Style" | "Spacing";

const ALIGN_OPTIONS: { value: BlockAlignment; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
];

const BACKGROUND_OPTIONS: { value: BackgroundStyle; label: string }[] = [
  { value: "none", label: "None" },
  { value: "solid", label: "Solid" },
  { value: "gradient", label: "Gradient" },
];

const BUTTON_STYLE_OPTIONS: { value: ButtonStyle; label: string }[] = [
  { value: "primary", label: "Primary" },
  { value: "secondary", label: "Secondary" },
  { value: "outline", label: "Outline" },
];

/** Which tabs make sense for each block type — kept as a lookup rather than
 *  hard-coding tab visibility inline everywhere it's checked. */
const HAS_LAYOUT: Partial<Record<PageBlock["type"], boolean>> = {
  hero: true,
  heading: true,
  text: true,
  button: true,
};
const HAS_STYLE: Partial<Record<PageBlock["type"], boolean>> = {
  hero: true,
  cta: true,
  button: true,
};
const NO_SPACING: Partial<Record<PageBlock["type"], boolean>> = {
  spacer: true,
};

interface SettingsPanelProps {
  block: PageBlock;
  onChange: (block: PageBlock) => void;
  onClose: () => void;
}

export function SettingsPanel({ block, onChange, onClose }: SettingsPanelProps) {
  const [tab, setTab] = useState<SettingsTab>("Content");

  // Reset to Content whenever the selected block changes, so switching
  // blocks doesn't strand the panel on a tab the new block doesn't have.
  useEffect(() => setTab("Content"), [block.id]);

  function patchContent(patch: Record<string, unknown>) {
    onChange({ ...block, content: { ...block.content, ...patch } } as PageBlock);
  }

  function patchSpacing(patch: Partial<PageBlock["spacing"]>) {
    onChange({ ...block, spacing: { ...block.spacing, ...patch } });
  }

  const showLayout = !!HAS_LAYOUT[block.type];
  const showStyle = !!HAS_STYLE[block.type];
  const showSpacing = !NO_SPACING[block.type];

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">Block Settings</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as SettingsTab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-4 mt-3 w-fit">
          <TabsTrigger value="Content">Content</TabsTrigger>
          {showLayout && <TabsTrigger value="Layout">Layout</TabsTrigger>}
          {showStyle && <TabsTrigger value="Style">Style</TabsTrigger>}
          {showSpacing && <TabsTrigger value="Spacing">Spacing</TabsTrigger>}
        </TabsList>

        <div className="flex-1 overflow-y-auto p-4">
          <TabsContent value="Content" className="space-y-4">
            <ContentFields block={block} patchContent={patchContent} onChange={onChange} />
          </TabsContent>

          {showLayout && (
            <TabsContent value="Layout" className="space-y-4">
              <Field label="Alignment">
                <SegmentedControl
                  value={(block.content as { alignment: BlockAlignment }).alignment}
                  onChange={(v) => patchContent({ alignment: v })}
                  options={ALIGN_OPTIONS}
                />
              </Field>
            </TabsContent>
          )}

          {showStyle && (
            <TabsContent value="Style" className="space-y-4">
              {block.type === "button" ? (
                <Field label="Button Style">
                  <SegmentedControl
                    value={block.content.style}
                    onChange={(v) => patchContent({ style: v })}
                    options={BUTTON_STYLE_OPTIONS}
                  />
                </Field>
              ) : (
                <Field label="Background Style">
                  <SegmentedControl
                    value={(block.content as { backgroundStyle: BackgroundStyle }).backgroundStyle}
                    onChange={(v) => patchContent({ backgroundStyle: v })}
                    options={BACKGROUND_OPTIONS}
                  />
                </Field>
              )}
            </TabsContent>
          )}

          {showSpacing && (
            <TabsContent value="Spacing" className="space-y-4">
              <Field label="Padding Top">
                <NumberField
                  value={block.spacing.paddingTop}
                  onChange={(v) => patchSpacing({ paddingTop: v })}
                />
              </Field>
              <Field label="Padding Bottom">
                <NumberField
                  value={block.spacing.paddingBottom}
                  onChange={(v) => patchSpacing({ paddingBottom: v })}
                />
              </Field>
            </TabsContent>
          )}
        </div>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function CharCount({ value, max }: { value: string; max: number }) {
  return (
    <p className="text-right text-[11px] text-muted-foreground">
      {value.length} / {max}
    </p>
  );
}

function NumberField({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        min={0}
        max={200}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 flex-1 accent-primary"
      />
      <div className="flex w-16 items-center gap-1">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="h-8 text-sm"
        />
        <span className="text-xs text-muted-foreground">px</span>
      </div>
    </div>
  );
}

function ContentFields({
  block,
  patchContent,
  onChange,
}: {
  block: PageBlock;
  patchContent: (patch: Record<string, unknown>) => void;
  onChange: (block: PageBlock) => void;
}) {
  switch (block.type) {
    case "hero": {
      const c = block.content;
      return (
        <>
          <Field label="Headline">
            <Textarea value={c.headline} onChange={(e) => patchContent({ headline: e.target.value })} maxLength={120} rows={2} />
            <CharCount value={c.headline} max={120} />
          </Field>
          <Field label="Subheadline">
            <Textarea value={c.subheadline} onChange={(e) => patchContent({ subheadline: e.target.value })} maxLength={240} rows={3} />
            <CharCount value={c.subheadline} max={240} />
          </Field>
          <Field label="Button Text">
            <Input value={c.buttonText} onChange={(e) => patchContent({ buttonText: e.target.value })} />
          </Field>
          <Field label="Button Link">
            <Input value={c.buttonLink} onChange={(e) => patchContent({ buttonLink: e.target.value })} />
          </Field>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Open in new tab</Label>
            <Switch checked={c.buttonOpenInNewTab} onCheckedChange={(v) => patchContent({ buttonOpenInNewTab: v })} />
          </div>
          <Field label="Secondary Link Text">
            <Input value={c.secondaryLinkText} onChange={(e) => patchContent({ secondaryLinkText: e.target.value })} />
          </Field>
          <Field label="Secondary Link URL">
            <Input value={c.secondaryLinkLink} onChange={(e) => patchContent({ secondaryLinkLink: e.target.value })} />
          </Field>
        </>
      );
    }

    case "heading": {
      const c = block.content;
      return (
        <>
          <Field label="Text">
            <Textarea value={c.text} onChange={(e) => patchContent({ text: e.target.value })} rows={2} />
          </Field>
          <Field label="Size">
            <SegmentedControl
              value={c.level}
              onChange={(v) => patchContent({ level: v })}
              options={[
                { value: "h1", label: "Large" },
                { value: "h2", label: "Medium" },
                { value: "h3", label: "Small" },
              ]}
            />
          </Field>
        </>
      );
    }

    case "text":
      return (
        <Field label="Text">
          <Textarea value={block.content.text} onChange={(e) => patchContent({ text: e.target.value })} rows={5} />
        </Field>
      );

    case "button": {
      const c = block.content;
      return (
        <>
          <Field label="Button Text">
            <Input value={c.text} onChange={(e) => patchContent({ text: e.target.value })} />
          </Field>
          <Field label="Link">
            <Input value={c.link} onChange={(e) => patchContent({ link: e.target.value })} />
          </Field>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Open in new tab</Label>
            <Switch checked={c.openInNewTab} onCheckedChange={(v) => patchContent({ openInNewTab: v })} />
          </div>
        </>
      );
    }

    case "image": {
      const c = block.content;
      return (
        <>
          <Field label="Image URL">
            <Input value={c.src} onChange={(e) => patchContent({ src: e.target.value })} placeholder="https://..." />
          </Field>
          <Field label="Alt Text">
            <Input value={c.alt} onChange={(e) => patchContent({ alt: e.target.value })} />
          </Field>
          <Field label="Link (optional)">
            <Input value={c.link} onChange={(e) => patchContent({ link: e.target.value })} />
          </Field>
        </>
      );
    }

    case "features":
    case "testimonials":
    case "faq": {
      const c = block.content;
      return (
        <>
          <Field label="Eyebrow">
            <Input value={c.eyebrow} onChange={(e) => patchContent({ eyebrow: e.target.value })} />
          </Field>
          <Field label="Headline">
            <Input value={c.headline} onChange={(e) => patchContent({ headline: e.target.value })} />
          </Field>
          <RepeatingItems block={block} onChange={onChange} />
        </>
      );
    }

    case "cta": {
      const c = block.content;
      return (
        <>
          <Field label="Headline">
            <Input value={c.headline} onChange={(e) => patchContent({ headline: e.target.value })} />
          </Field>
          <Field label="Subheadline">
            <Textarea value={c.subheadline} onChange={(e) => patchContent({ subheadline: e.target.value })} rows={2} />
          </Field>
          <Field label="Button Text">
            <Input value={c.buttonText} onChange={(e) => patchContent({ buttonText: e.target.value })} />
          </Field>
          <Field label="Button Link">
            <Input value={c.buttonLink} onChange={(e) => patchContent({ buttonLink: e.target.value })} />
          </Field>
        </>
      );
    }

    case "divider":
      return (
        <Field label="Style">
          <SegmentedControl
            value={block.content.style}
            onChange={(v) => patchContent({ style: v })}
            options={[
              { value: "line", label: "Line" },
              { value: "space", label: "Blank space" },
            ]}
          />
        </Field>
      );

    case "spacer":
      return (
        <Field label="Height">
          <NumberField value={block.content.height} onChange={(v) => patchContent({ height: v })} />
        </Field>
      );

    case "form":
      return <FormBlockFields block={block} patchContent={patchContent} />;
  }
}

function FormBlockFields({
  block,
  patchContent,
}: {
  block: Extract<PageBlock, { type: "form" }>;
  patchContent: (patch: Record<string, unknown>) => void;
}) {
  const { subAccountId, agencyId } = useSubAccount();
  const [forms, setForms] = useState<LeadForm[]>([]);

  useEffect(() => {
    if (!agencyId) return;
    return subscribeToForms({ agencyId, subAccountId }, setForms);
  }, [agencyId, subAccountId]);

  return (
    <Field label="Form">
      <select
        value={block.content.formId ?? ""}
        onChange={(e) => {
          const form = forms.find((f) => f.id === e.target.value);
          patchContent({ formId: form?.id ?? null, formName: form?.name ?? null });
        }}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
      >
        <option value="">Select an existing form...</option>
        {forms.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
      {forms.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No forms yet — create one under Marketing → Forms, then come back to attach it here.
        </p>
      )}
    </Field>
  );
}

/** Shared editor for the item lists inside Features/Testimonials/FAQ — each
 *  has a different shape, so this switches on `block.type` internally
 *  rather than trying to force one generic item shape on all three. */
function RepeatingItems({
  block,
  onChange,
}: {
  block: Extract<PageBlock, { type: "features" | "testimonials" | "faq" }>;
  onChange: (block: PageBlock) => void;
}) {
  if (block.type === "features") {
    const items = block.content.items;
    return (
      <Field label="Feature Cards">
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={item.id} className="space-y-1.5 rounded-lg border border-border p-2.5">
              <div className="flex items-center gap-1.5">
                <Input
                  value={item.title}
                  placeholder="Title"
                  onChange={(e) => {
                    const next = [...items];
                    next[i] = { ...item, title: e.target.value };
                    onChange({ ...block, content: { ...block.content, items: next } });
                  }}
                  className="h-8 flex-1 text-sm"
                />
                <RemoveItemButton onClick={() => onChange({ ...block, content: { ...block.content, items: items.filter((_, j) => j !== i) } })} />
              </div>
              <Textarea
                value={item.description}
                placeholder="Description"
                rows={2}
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...item, description: e.target.value };
                  onChange({ ...block, content: { ...block.content, items: next } });
                }}
                className="text-sm"
              />
            </div>
          ))}
          <AddItemButton
            onClick={() =>
              onChange({
                ...block,
                content: { ...block.content, items: [...items, { id: newBlockId(), title: "New feature", description: "" }] },
              })
            }
          />
        </div>
      </Field>
    );
  }

  if (block.type === "testimonials") {
    const items = block.content.items;
    return (
      <Field label="Testimonials">
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={item.id} className="space-y-1.5 rounded-lg border border-border p-2.5">
              <div className="flex items-start gap-1.5">
                <Textarea
                  value={item.quote}
                  placeholder="Quote"
                  rows={2}
                  onChange={(e) => {
                    const next = [...items];
                    next[i] = { ...item, quote: e.target.value };
                    onChange({ ...block, content: { ...block.content, items: next } });
                  }}
                  className="flex-1 text-sm"
                />
                <RemoveItemButton onClick={() => onChange({ ...block, content: { ...block.content, items: items.filter((_, j) => j !== i) } })} />
              </div>
              <Input
                value={item.name}
                placeholder="Name"
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...item, name: e.target.value };
                  onChange({ ...block, content: { ...block.content, items: next } });
                }}
                className="h-8 text-sm"
              />
            </div>
          ))}
          <AddItemButton
            onClick={() =>
              onChange({
                ...block,
                content: { ...block.content, items: [...items, { id: newBlockId(), quote: "New testimonial", name: "" }] },
              })
            }
          />
        </div>
      </Field>
    );
  }

  const items = block.content.items;
  return (
    <Field label="Questions">
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={item.id} className="space-y-1.5 rounded-lg border border-border p-2.5">
            <div className="flex items-center gap-1.5">
              <Input
                value={item.question}
                placeholder="Question"
                onChange={(e) => {
                  const next = [...items];
                  next[i] = { ...item, question: e.target.value };
                  onChange({ ...block, content: { ...block.content, items: next } });
                }}
                className="h-8 flex-1 text-sm"
              />
              <RemoveItemButton onClick={() => onChange({ ...block, content: { ...block.content, items: items.filter((_, j) => j !== i) } })} />
            </div>
            <Textarea
              value={item.answer}
              placeholder="Answer"
              rows={2}
              onChange={(e) => {
                const next = [...items];
                next[i] = { ...item, answer: e.target.value };
                onChange({ ...block, content: { ...block.content, items: next } });
              }}
              className="text-sm"
            />
          </div>
        ))}
        <AddItemButton
          onClick={() =>
            onChange({
              ...block,
              content: { ...block.content, items: [...items, { id: newBlockId(), question: "New question", answer: "" }] },
            })
          }
        />
      </div>
    </Field>
  );
}

function AddItemButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} className="w-full">
      <Plus className="h-3.5 w-3.5" /> Add item
    </Button>
  );
}

function RemoveItemButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Remove"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}
