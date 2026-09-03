"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PIPELINE_STAGES } from "@/types/deals";
import { NODE_LABELS } from "@/lib/workflows/catalog";
import { ConditionsEditor } from "./conditions-editor";
import {
  WorkflowEmailComposer,
  type WorkflowEmailTemplateOption,
} from "./workflow-email-composer";
import {
  emailAddressIsValid,
  emailAddressListIsValid,
  emailHtmlToPlainText,
  plainTextToEmailHtml,
} from "@/lib/automations/workflow-email";
import type { BuilderStep } from "@/lib/workflows/builder-tree";
import type { ConditionGroup, NotifyRecipient } from "@/types/workflows";
import type { WhatsappTemplateVariable } from "@/types/whatsapp-templates";

type Cfg = Record<string, unknown>;

/** Approved WhatsApp template, loaded once and passed down for the picker. */
export interface WhatsappTemplateOption {
  id: string;
  displayName: string;
  body: string;
  variables: WhatsappTemplateVariable[];
}

export type { WorkflowEmailTemplateOption };

function deriveWait(seconds: number): { value: number; unit: number } {
  if (seconds && seconds % 86_400 === 0)
    return { value: seconds / 86_400, unit: 86_400 };
  if (seconds && seconds % 3_600 === 0)
    return { value: seconds / 3_600, unit: 3_600 };
  return { value: Math.max(1, Math.round((seconds || 0) / 60)), unit: 60 };
}

export function NodeConfigDialog({
  step,
  whatsappTemplates,
  emailTemplates,
  emailDefaults,
  onClose,
  onSave,
}: {
  step: BuilderStep | null;
  whatsappTemplates: WhatsappTemplateOption[];
  emailTemplates: WorkflowEmailTemplateOption[];
  emailDefaults: {
    verifiedFrom: string;
    fromName: string;
    replyTo: string;
  };
  onClose: () => void;
  onSave: (config: Cfg) => void;
}) {
  const [cfg, setCfg] = useState<Cfg>({});
  useEffect(() => {
    if (!step) return;
    const next = { ...step.config };
    if (
      step.type === "send_email" &&
      !next.bodyHtml &&
      typeof next.body === "string"
    ) {
      next.bodyHtml = plainTextToEmailHtml(next.body);
    }
    setCfg(next);
  }, [step]);

  if (!step) return null;
  const set = (patch: Cfg) => setCfg((c) => ({ ...c, ...patch }));
  const str = (k: string) => (cfg[k] as string) ?? "";

  const wait = deriveWait(Number(cfg.seconds ?? 86_400));
  // Legacy notify configs have no `recipient` — derive a sensible default so
  // they open showing the email they already have (else "Agency owner").
  const notifyRecipient: NotifyRecipient =
    (cfg.recipient as NotifyRecipient | undefined) ??
    (str("to").trim() ? "custom" : "owner");
  const emailBody = emailHtmlToPlainText(
    String(cfg.bodyHtml ?? cfg.body ?? "")
  );
  const emailErrors =
    step.type === "send_email"
      ? [
          !emailDefaults.verifiedFrom &&
            "A verified workspace sender is required before saving this email.",
          !str("subject").trim() && "Subject is required.",
          !emailBody.trim() && "Email body is required.",
          cfg.emailType === "marketing" &&
            !emailBody.includes("{{unsubscribeLink}}") &&
            "Email body must include {{unsubscribeLink}} for compliance.",
          cfg.replyTo &&
            !emailAddressIsValid(String(cfg.replyTo)) &&
            "Reply-To must be a valid email address.",
          cfg.cc &&
            !emailAddressListIsValid(String(cfg.cc)) &&
            "CC contains an invalid email address.",
          cfg.bcc &&
            !emailAddressListIsValid(String(cfg.bcc)) &&
            "BCC contains an invalid email address.",
        ].filter((value): value is string => typeof value === "string")
      : [];

  return (
    <Dialog open={!!step} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={
          step.type === "send_email"
            ? "h-[90dvh] max-h-[90dvh] min-h-0 max-w-[calc(100%-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-3xl"
            : "max-w-lg"
        }
      >
        <DialogHeader>
          <DialogTitle>{NODE_LABELS[step.type]}</DialogTitle>
        </DialogHeader>

        <div
          className={
            step.type === "send_email"
              ? "min-h-0 min-w-0 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain pr-1"
              : "space-y-3"
          }
        >
          {step.type === "send_email" && (
            <WorkflowEmailComposer
              config={cfg}
              setConfig={set}
              templates={emailTemplates}
              verifiedFrom={emailDefaults.verifiedFrom}
              defaultFromName={emailDefaults.fromName}
              defaultReplyTo={emailDefaults.replyTo}
            />
          )}

          {step.type === "send_sms" && (
            <Field
              label="Message"
              hint="Supports merge tags like {{contact.firstName}}."
            >
              <Textarea
                rows={4}
                value={str("body")}
                onChange={(e) => set({ body: e.target.value })}
              />
            </Field>
          )}

          {step.type === "whatsapp_template" &&
            (() => {
              const tplId = str("templateId");
              const tpl = whatsappTemplates.find((t) => t.id === tplId) ?? null;
              const manualValues =
                (cfg.manualValues as Record<string, string> | undefined) ?? {};
              const mergeVars =
                tpl?.variables.filter((v) => v.source === "merge_tag") ?? [];
              const manualVars =
                tpl?.variables.filter((v) => v.source === "manual") ?? [];
              return (
                <>
                  <Field
                    label="Template"
                    hint={
                      whatsappTemplates.length === 0
                        ? "No approved WhatsApp templates yet. Create one in AI Agents → WhatsApp → Templates."
                        : "Only Meta-approved templates can be sent on WhatsApp."
                    }
                  >
                    <select
                      value={tplId}
                      onChange={(e) =>
                        set({ templateId: e.target.value, manualValues: {} })
                      }
                      className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                    >
                      <option value="">Choose a template…</option>
                      {whatsappTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.displayName}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {tpl && (
                    <div className="bg-muted/30 text-muted-foreground rounded-md border p-2 text-xs whitespace-pre-wrap">
                      {tpl.body}
                    </div>
                  )}
                  {mergeVars.length > 0 && (
                    <p className="text-muted-foreground text-xs">
                      Auto-filled from the contact:{" "}
                      {mergeVars
                        .map((v) => `{{${v.position}}} ${v.label}`)
                        .join(", ")}
                      .
                    </p>
                  )}
                  {manualVars.map((v) => (
                    <Field
                      key={v.position}
                      label={`Variable {{${v.position}}} — ${v.label}`}
                      hint="Static text, or merge tags like {{contact.firstName}}."
                    >
                      <Input
                        value={manualValues[String(v.position)] ?? ""}
                        placeholder={v.sampleValue}
                        onChange={(e) =>
                          set({
                            manualValues: {
                              ...manualValues,
                              [v.position]: e.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                  ))}
                </>
              );
            })()}

          {step.type === "wait" && (
            <Field label="Wait for">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  className="w-24"
                  value={wait.value}
                  onChange={(e) =>
                    set({
                      seconds: Math.max(1, Number(e.target.value)) * wait.unit,
                    })
                  }
                />
                <select
                  value={wait.unit}
                  onChange={(e) =>
                    set({ seconds: wait.value * Number(e.target.value) })
                  }
                  className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                >
                  <option value={60}>minutes</option>
                  <option value={3_600}>hours</option>
                  <option value={86_400}>days</option>
                </select>
              </div>
            </Field>
          )}

          {step.type === "wait_for_reply" && (
            <>
              <Field label="Wait for a reply for up to">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    className="w-24"
                    value={wait.value}
                    onChange={(e) =>
                      set({
                        seconds:
                          Math.max(1, Number(e.target.value)) * wait.unit,
                      })
                    }
                  />
                  <select
                    value={wait.unit}
                    onChange={(e) =>
                      set({ seconds: wait.value * Number(e.target.value) })
                    }
                    className="border-input bg-background h-9 rounded-md border px-2 text-sm"
                  >
                    <option value={60}>minutes</option>
                    <option value={3_600}>hours</option>
                    <option value={86_400}>days</option>
                  </select>
                </div>
              </Field>
              <p className="text-muted-foreground text-xs">
                If the contact replies within this window, the workflow
                continues down the <strong>Replied</strong> branch right away;
                otherwise it takes the <strong>No reply</strong> branch when the
                window ends. Counts SMS, WhatsApp, and Facebook/Instagram
                replies — email replies go straight to your own inbox and
                can&apos;t be detected.
              </p>
            </>
          )}

          {step.type === "if_else" && (
            <Field label="Continue down “yes” when:">
              <ConditionsEditor
                value={(cfg.conditions as ConditionGroup) ?? { all: [] }}
                onChange={(g) => set({ conditions: g })}
              />
            </Field>
          )}

          {(step.type === "add_tag" || step.type === "remove_tag") && (
            <Field label="Tag">
              <Input
                value={str("tag")}
                onChange={(e) => set({ tag: e.target.value })}
              />
            </Field>
          )}

          {step.type === "move_stage" && (
            <Field label="Move contact to stage">
              <select
                value={str("stage") || "new"}
                onChange={(e) => set({ stage: e.target.value })}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
              >
                {PIPELINE_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {step.type === "update_field" && (
            <>
              <Field
                label="Field"
                hint="A contact field (e.g. company) or customFields.yourKey"
              >
                <Input
                  value={str("field")}
                  onChange={(e) => set({ field: e.target.value })}
                />
              </Field>
              <Field label="Value">
                <Input
                  value={str("value")}
                  onChange={(e) => set({ value: e.target.value })}
                />
              </Field>
            </>
          )}

          {step.type === "create_task" && (
            <>
              <Field label="Task title" hint="Supports merge tags.">
                <Input
                  value={str("title")}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </Field>
              <Field label="Due in (days)">
                <Input
                  type="number"
                  min={0}
                  className="w-28"
                  value={Number(cfg.dueInDays ?? 1)}
                  onChange={(e) => set({ dueInDays: Number(e.target.value) })}
                />
              </Field>
            </>
          )}

          {step.type === "notify" && (
            <>
              <Field
                label="Send to"
                hint={
                  notifyRecipient === "account_contact"
                    ? "This sub-account's primary contact (Settings → Admin → Account contact). Falls back to the agency owner if none is set."
                    : notifyRecipient === "owner"
                      ? "Notifies the agency owner."
                      : undefined
                }
              >
                <select
                  value={notifyRecipient}
                  onChange={(e) =>
                    set({ recipient: e.target.value as NotifyRecipient })
                  }
                  className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm"
                >
                  <option value="owner">Agency owner</option>
                  <option value="account_contact">Account contact</option>
                  <option value="custom">Custom email</option>
                </select>
              </Field>
              {notifyRecipient === "custom" && (
                <Field label="Email address">
                  <Input
                    value={str("to")}
                    placeholder="name@example.com"
                    onChange={(e) => set({ to: e.target.value })}
                  />
                </Field>
              )}
              <Field label="Subject">
                <Input
                  value={str("subject")}
                  onChange={(e) => set({ subject: e.target.value })}
                />
              </Field>
              <Field label="Body">
                <Textarea
                  rows={4}
                  value={str("body")}
                  onChange={(e) => set({ body: e.target.value })}
                />
              </Field>
            </>
          )}

          {step.type === "webhook" && (
            <Field label="POST URL">
              <Input
                value={str("url")}
                placeholder="https://…"
                onChange={(e) => set({ url: e.target.value })}
              />
            </Field>
          )}

          {step.type === "create_contact" && (
            <>
              {(["name", "email", "phone", "company", "source"] as const).map(
                (field) => (
                  <Field
                    key={field}
                    label={field[0].toUpperCase() + field.slice(1)}
                  >
                    <Input
                      value={str(field)}
                      onChange={(e) => set({ [field]: e.target.value })}
                    />
                  </Field>
                )
              )}
            </>
          )}

          {(step.type === "update_task" || step.type === "complete_task") && (
            <Field
              label="Task ID"
              hint="The task must belong to this sub-account."
            >
              <Input
                value={str("taskId")}
                onChange={(e) => set({ taskId: e.target.value })}
              />
            </Field>
          )}

          {step.type === "update_task" && (
            <>
              <Field label="New title">
                <Input
                  value={str("title")}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </Field>
              <Field label="New notes">
                <Textarea
                  rows={3}
                  value={str("notes")}
                  onChange={(e) => set({ notes: e.target.value })}
                />
              </Field>
            </>
          )}

          {step.type === "create_deal" && (
            <>
              <Field label="Deal title">
                <Input
                  value={str("title")}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </Field>
              <Field label="Value">
                <Input
                  type="number"
                  value={Number(cfg.value ?? 0)}
                  onChange={(e) => set({ value: Number(e.target.value) })}
                />
              </Field>
              <Field label="Stage">
                <Input
                  value={str("stageId") || "new"}
                  onChange={(e) => set({ stageId: e.target.value })}
                />
              </Field>
            </>
          )}

          {step.type === "update_deal" && (
            <>
              <Field label="Deal ID">
                <Input
                  value={str("dealId")}
                  onChange={(e) => set({ dealId: e.target.value })}
                />
              </Field>
              <Field label="New title">
                <Input
                  value={str("title")}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </Field>
              <Field label="Stage">
                <Input
                  value={str("stageId")}
                  onChange={(e) => set({ stageId: e.target.value })}
                />
              </Field>
            </>
          )}

          {step.type === "grant_offer_access" && (
            <>
              <Field label="Offer ID">
                <Input
                  value={str("offerId")}
                  onChange={(e) => set({ offerId: e.target.value })}
                />
              </Field>
              <Field
                label="Purchase ID"
                hint="Only a purchase belonging to this contact can be granted."
              >
                <Input
                  value={str("purchaseId")}
                  onChange={(e) => set({ purchaseId: e.target.value })}
                />
              </Field>
            </>
          )}

          {step.type === "enroll_course" && (
            <Field label="Course ID">
              <Input
                value={str("courseId")}
                onChange={(e) => set({ courseId: e.target.value })}
              />
            </Field>
          )}

          {step.type === "start_workflow" && (
            <Field
              label="Target workflow ID"
              hint="Active workflow in this sub-account; self-invocation is blocked."
            >
              <Input
                value={str("workflowId")}
                onChange={(e) => set({ workflowId: e.target.value })}
              />
            </Field>
          )}

          {step.type === "grant_community_access" && (
            <Field label="Community group ID">
              <Input
                value={str("groupId")}
                onChange={(e) => set({ groupId: e.target.value })}
              />
            </Field>
          )}

          {step.type === "notify_community_member" && (
            <>
              <Field label="Title">
                <Input
                  value={str("title")}
                  onChange={(e) => set({ title: e.target.value })}
                />
              </Field>
              <Field label="Message">
                <Textarea
                  rows={3}
                  value={str("body")}
                  onChange={(e) => set({ body: e.target.value })}
                />
              </Field>
            </>
          )}

          {step.type === "assign_conversation" && (
            <Field label="Assignee user ID">
              <Input
                value={str("assigneeUid")}
                onChange={(e) => set({ assigneeUid: e.target.value })}
              />
            </Field>
          )}

          {step.type === "stop_workflow" && (
            <Field
              label="Workflow ID (optional)"
              hint="Blank stops the workflow containing this action."
            >
              <Input
                value={str("workflowId")}
                onChange={(e) => set({ workflowId: e.target.value })}
              />
            </Field>
          )}

          {step.type === "goal" && (
            <p className="text-muted-foreground text-sm">
              This step ends the workflow — nothing runs after it on this path.
            </p>
          )}
          {emailErrors.length > 0 && step.type === "send_email" && (
            <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-2 text-xs">
              {emailErrors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onSave(cfg);
              onClose();
            }}
          >
            Save step
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
