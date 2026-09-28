"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import {
  subscribeToProjects,
  subscribeToProjectTemplates,
} from "@/lib/firestore/projects";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import type { Contact } from "@/types/contacts";
import type { Project, ProjectTemplate } from "@/types/projects";

/**
 * The live reads every Projects-module page needs — the same three
 * subscriptions the pre-redesign Projects page ran inline (projects,
 * templates, contacts for the assign-a-client picker). Read-only; every
 * write still goes through the `/api/sub-accounts/[id]/projects*` routes.
 */
export function useProjectsData() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    setLoading(true);
    const scope = { agencyId, subAccountId };
    let projectsReady = false;
    let templatesReady = false;
    let contactsReady = false;
    const settle = () => {
      if (projectsReady && templatesReady && contactsReady) setLoading(false);
    };
    const unsubP = safeSubscribe(
      () =>
        subscribeToProjects(scope, (l) => {
          setProjects(l);
          projectsReady = true;
          settle();
        }),
      () => {
        projectsReady = true;
        settle();
      }
    );
    const unsubT = safeSubscribe(
      () =>
        subscribeToProjectTemplates(scope, (l) => {
          setTemplates(l);
          templatesReady = true;
          settle();
        }),
      () => {
        templatesReady = true;
        settle();
      }
    );
    const unsubC = safeSubscribe(
      () =>
        subscribeToContacts(scope, (l) => {
          setContacts(l);
          contactsReady = true;
          settle();
        }),
      () => {
        contactsReady = true;
        settle();
      }
    );
    return () => {
      unsubP?.();
      unsubT?.();
      unsubC?.();
    };
  }, [user, agencyId, subAccountId, authLoading]);

  return { projects, templates, contacts, loading };
}
