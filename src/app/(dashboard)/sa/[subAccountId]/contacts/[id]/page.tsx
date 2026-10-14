"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { UserX } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContact } from "@/lib/firestore/contacts";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/system/page-shell";
import { EmptyState } from "@/components/system/empty-state";
import { ContactProfileView } from "@/components/contacts/contact-profile-view";
import type { Contact } from "@/types/contacts";

/**
 * Contact profile route (Contacts redesign, 2026-09-25) — loads the contact
 * (live) and renders `ContactProfileView`. Every state renders in the same
 * <PageShell width="wide"> so the width doesn't jump.
 */
export default function ContactProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user, loading: authLoading } = useAuth();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user || !id) return;
    setLoading(true);
    const unsub = safeSubscribe(
      () =>
        subscribeToContact(
          id,
          (c) => {
            setContact(c);
            setLoading(false);
          },
          () => setLoading(false),
        ),
      () => setLoading(false),
    );
    return () => unsub?.();
  }, [id, user, authLoading]);

  if (loading) {
    return (
      <PageShell width="wide" className="gap-5">
        <ProfileSkeleton />
      </PageShell>
    );
  }

  if (!contact) {
    return (
      <PageShell width="wide" className="gap-5">
        <NotFound />
      </PageShell>
    );
  }

  return (
    <PageShell width="wide" className="gap-5">
      <ContactProfileView contact={contact} />
    </PageShell>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading contact">
      <div className="flex items-center gap-3">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_330px]">
        <Skeleton className="h-72 rounded-card" />
        <Skeleton className="h-96 rounded-card" />
        <Skeleton className="hidden h-72 rounded-card xl:block" />
      </div>
    </div>
  );
}

function NotFound() {
  const { saPath } = useSubAccount();
  return (
    <EmptyState
      icon={UserX}
      title="Contact not found"
      description="This contact may have been deleted or you don't have access."
      action={<Button render={<Link href={saPath("/contacts")} />}>Back to contacts</Button>}
    />
  );
}
