"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, Eye, FileText, Search, Sparkles } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextBlockEditor } from "@/components/broadcasts/text-block-editor";
import { SUPPORTED_TAGS_EMAIL } from "@/lib/automations/merge-tags";
import {
  emailAddressIsValid,
  emailAddressListIsValid,
  emailHtmlToPlainText,
  plainTextToEmailHtml,
} from "@/lib/automations/workflow-email";

export interface WorkflowEmailTemplateOption {
  id: string;
  name: string;
  subject: string;
  body: string;
}

type Config = Record<string, unknown>;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function verifiedAddress(header: string): string {
  const match = header.match(/<([^>]+)>/);
  return (match?.[1] ?? header).trim();
}

function sample(value: string): string {
  return value
    .replace(/\{\{\s*contact\.firstName\s*\}\}/g, "Alex")
    .replace(/\{\{\s*contact\.lastName\s*\}\}/g, "Morgan")
    .replace(/\{\{\s*contact\.email\s*\}\}/g, "alex@example.com")
    .replace(/\{\{\s*contact\.phone\s*\}\}/g, "+1 555 0100")
    .replace(/\{\{\s*owner\.firstName\s*\}\}/g, "Taylor")
    .replace(/\{\{\s*owner\.email\s*\}\}/g, "team@example.com")
    .replace(/\{\{\s*workspace\.name\s*\}\}/g, "Magnetix Studios")
    .replace(/\{\{\s*bookingLink\s*\}\}/g, "https://example.com/book")
    .replace(
      /\{\{\s*unsubscribeLink\s*\}\}/g,
      "https://example.com/unsubscribe"
    );
}

export function WorkflowEmailComposer({
  config,
  setConfig,
  templates,
  verifiedFrom,
  defaultFromName,
  defaultReplyTo,
}: {
  config: Config;
  setConfig: (patch: Config) => void;
  templates: WorkflowEmailTemplateOption[];
  verifiedFrom: string;
  defaultFromName: string;
  defaultReplyTo: string;
}) {
  const [templateQuery, setTemplateQuery] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [target, setTarget] = useState<"subject" | "body">("body");
  const bodyEditorRef = useRef<Editor | null>(null);
  const subjectRef = useRef<HTMLInputElement | null>(null);

  const subject = String(config.subject ?? "");
  const body = String(config.body ?? "");
  const bodyHtml = String(config.bodyHtml ?? plainTextToEmailHtml(body));
  const fromName = String(config.fromName ?? defaultFromName);
  const replyTo = String(config.replyTo ?? defaultReplyTo);
  const cc = String(config.cc ?? "");
  const bcc = String(config.bcc ?? "");

  const filteredTemplates = useMemo(() => {
    const query = templateQuery.trim().toLowerCase();
    if (!query) return templates;
    return templates.filter(
      (template) =>
        template.name.toLowerCase().includes(query) ||
        template.subject.toLowerCase().includes(query) ||
        template.body.toLowerCase().includes(query)
    );
  }, [templateQuery, templates]);

  const insertTag = useCallback(
    (tag: string) => {
      const token = "{{" + tag + "}}";
      if (target === "subject") {
        const input = subjectRef.current;
        if (!input) {
          setConfig({ subject: subject + token });
          return;
        }
        const start = input.selectionStart ?? subject.length;
        const end = input.selectionEnd ?? subject.length;
        setConfig({
          subject: subject.slice(0, start) + token + subject.slice(end),
        });
        requestAnimationFrame(() => {
          input.focus();
          input.setSelectionRange(start + token.length, start + token.length);
        });
        return;
      }
      bodyEditorRef.current?.commands.insertContent(token);
    },
    [bodyEditorRef, setConfig, subject, target]
  );

  function applyTemplate(template: WorkflowEmailTemplateOption) {
    if (subject.trim() || emailHtmlToPlainText(bodyHtml).trim()) {
      const confirmed = window.confirm(
        "Using another template will replace the email content you've edited in this step."
      );
      if (!confirmed) return;
    }
    setConfig({
      subject: template.subject,
      body: template.body,
      bodyHtml: plainTextToEmailHtml(template.body),
    });
    setShowTemplates(false);
    setTemplateQuery("");
  }

  const previewHtml =
    '<!doctype html><html><body style="margin:0;background:#f4f4f4;padding:24px 12px;font-family:Arial,sans-serif">' +
    '<div style="max-width:600px;margin:auto;background:#fff;padding:24px">' +
    '<p style="font-size:12px;color:#666">From: ' +
    escapeHtml(fromName || defaultFromName) +
    " &lt;" +
    escapeHtml(verifiedAddress(verifiedFrom)) +
    "&gt;</p><h2>" +
    escapeHtml(sample(subject) || "(no subject)") +
    "</h2><div>" +
    sample(bodyHtml) +
    "</div></div></body></html>";

  return (
    <div className="space-y-4">
      <div className="bg-muted/20 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">
              How do you want to create this email?
            </p>
            <p className="text-muted-foreground text-xs">
              Start from a copied template or compose independently.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowTemplates((open) => !open)}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            Start from template
            <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        </div>
        {showTemplates && (
          <div className="mt-3 space-y-2 border-t pt-3">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-2.5 left-2.5 h-3.5 w-3.5" />
              <Input
                value={templateQuery}
                onChange={(event) => setTemplateQuery(event.target.value)}
                placeholder="Search email templates…"
                className="pl-8"
                aria-label="Search email templates"
              />
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto">
              {filteredTemplates.length ? (
                filteredTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => applyTemplate(template)}
                    className="hover:bg-muted/60 bg-background w-full rounded-md border p-2 text-left"
                  >
                    <span className="block truncate text-sm font-medium">
                      {template.name}
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {template.subject || template.body.slice(0, 90)}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-muted-foreground px-1 py-2 text-xs">
                  No email templates found for this workspace.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="workflow-email-from-name">From name</Label>
        <Input
          id="workflow-email-from-name"
          value={fromName}
          onChange={(event) => setConfig({ fromName: event.target.value })}
          placeholder={defaultFromName}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="workflow-email-from">From email</Label>
        <Input
          id="workflow-email-from"
          value={verifiedAddress(verifiedFrom)}
          readOnly
        />
        <p className="text-muted-foreground text-[11px]">
          Sender address is controlled by the verified workspace sending domain.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="workflow-email-subject">Subject</Label>
          <PersonalizationButton onInsert={insertTag} />
        </div>
        <Input
          id="workflow-email-subject"
          ref={subjectRef}
          value={subject}
          onFocus={() => setTarget("subject")}
          onChange={(event) => setConfig({ subject: event.target.value })}
          placeholder="Welcome, {{contact.firstName}}"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Email body</Label>
          <PersonalizationButton onInsert={insertTag} />
        </div>
        <div onFocus={() => setTarget("body")}>
          <TextBlockEditor
            value={bodyHtml}
            onChange={(html) =>
              setConfig({ bodyHtml: html, body: emailHtmlToPlainText(html) })
            }
            onEditorReady={(editor) => {
              bodyEditorRef.current = editor;
            }}
          />
        </div>
        <p className="text-muted-foreground text-[11px]">
          Email bodies must include <code>{"{{unsubscribeLink}}"}</code>.
          Required by the current Magnetix workflow email policy.
        </p>
      </div>

      <details className="rounded-lg border px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">
          Advanced sender settings
        </summary>
        <div className="mt-3 space-y-3">
          <FieldEmail
            id="workflow-email-reply-to"
            label="Reply-To"
            value={replyTo}
            placeholder={defaultReplyTo || "reply@example.com"}
            onChange={(value) => setConfig({ replyTo: value })}
          />
          <FieldEmail
            id="workflow-email-cc"
            label="CC"
            value={cc}
            placeholder="one@example.com, two@example.com"
            hint="Optional. Separate multiple addresses with commas."
            onChange={(value) => setConfig({ cc: value })}
            list
          />
          <FieldEmail
            id="workflow-email-bcc"
            label="BCC"
            value={bcc}
            placeholder="archive@example.com"
            hint="Optional. Separate multiple addresses with commas."
            onChange={(value) => setConfig({ bcc: value })}
            list
          />
        </div>
      </details>

      <div className="bg-muted/20 rounded-lg border p-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowPreview((open) => !open)}
        >
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          {showPreview ? "Hide preview" : "Preview email"}
        </Button>
        {showPreview && (
          <iframe
            title="Email preview"
            sandbox=""
            srcDoc={previewHtml}
            className="mt-3 h-80 w-full rounded-md border bg-white"
          />
        )}
      </div>
    </div>
  );
}

function PersonalizationButton({
  onInsert,
}: {
  onInsert: (tag: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 text-xs"
        onClick={() => setOpen((value) => !value)}
      >
        <Sparkles className="h-3 w-3" /> Insert personalization
      </Button>
      {open && (
        <div className="bg-popover absolute right-0 z-10 mt-1 w-72 rounded-md border p-1 shadow-md">
          {SUPPORTED_TAGS_EMAIL.map((tag) => (
            <button
              key={tag.tag}
              type="button"
              className="hover:bg-muted w-full rounded px-2 py-1.5 text-left"
              onClick={() => {
                onInsert(tag.tag);
                setOpen(false);
              }}
            >
              <span className="block text-xs font-medium">
                {tag.description}
              </span>
              <code className="text-muted-foreground text-[10px]">
                {"{{" + tag.tag + "}}"}
              </code>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FieldEmail({
  id,
  label,
  value,
  placeholder,
  hint,
  onChange,
  list = false,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  hint?: string;
  onChange: (value: string) => void;
  list?: boolean;
}) {
  const valid =
    !value.trim() ||
    (list ? emailAddressListIsValid(value) : emailAddressIsValid(value));
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        aria-invalid={!valid}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint && <p className="text-muted-foreground text-[11px]">{hint}</p>}
      {!valid && (
        <p className="text-destructive text-[11px]">
          Enter valid email address{list ? "es" : ""}.
        </p>
      )}
    </div>
  );
}
