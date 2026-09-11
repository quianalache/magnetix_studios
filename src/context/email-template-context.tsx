"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  subscribeToEmailTemplates,
  type EmailTemplateSummary,
} from "@/lib/email/template-library";

interface EmailTemplateContextValue {
  templates: EmailTemplateSummary[];
  loading: boolean;
}

const EmailTemplateContext = createContext<EmailTemplateContextValue | null>(
  null,
);

/**
 * Owns the two unified Email Template listeners for the active sub-account.
 * This provider lives above route content, so Email → Broadcasts → Workflow
 * navigation does not tear down and recreate the same Firestore watch pair.
 */
export function EmailTemplateProvider({
  subAccountId,
  children,
}: {
  subAccountId: string;
  children: ReactNode;
}) {
  const [templates, setTemplates] = useState<EmailTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setTemplates([]);
    setLoading(true);
    if (!subAccountId) return;
    return subscribeToEmailTemplates(subAccountId, (next) => {
      setTemplates(next);
      setLoading(false);
    });
  }, [subAccountId]);

  return (
    <EmailTemplateContext.Provider value={{ templates, loading }}>
      {children}
    </EmailTemplateContext.Provider>
  );
}

export function useEmailTemplateContext(): EmailTemplateContextValue {
  const value = useContext(EmailTemplateContext);
  if (!value) {
    throw new Error(
      "useEmailTemplateContext must be used inside EmailTemplateProvider",
    );
  }
  return value;
}
