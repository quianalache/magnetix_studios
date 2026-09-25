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
import { ContactProfileView } from "@/components/contacts/contact-profile-view";
import type { Contact } from "@/types/contacts";

/**
 * Contact profile route (Contacts redesign, 2026-09-25) — loads the contact
 * (live) and renders `ContactProfileView`. Loading / not-found states use
 * the same max-w-7xl container as the view so the width doesn't jump.
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
      <div className="mx-auto w-full max-w-7xl">
        <ProfileSkeleton />
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="mx-auto w-full max-w-7xl">
        <NotFound />
      </div>
    );
  }

  return <ContactProfileView contact={contact} />;
}

function ProfileSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 animate-pulse rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-6 w-56 animate-pulse rounded bg-muted" />
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_330px]">
        <div className="h-72 animate-pulse rounded-xl bg-muted" />
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
        <div className="hidden h-72 animate-pulse rounded-xl bg-muted xl:block" />
      </div>
    </div>
  );
}

function NotFound() {
  const { saPath } = useSubAccount();
  return (
    <div className="bg-card/50 mx-auto max-w-md rounded-xl border border-dashed p-12 text-center">
      <div className="bg-muted mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
        <UserX className="text-muted-foreground h-6 w-6" />
      </div>
      <h2 className="text-lg font-semibold">Contact not found</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        This contact may have been deleted or you don&apos;t have access.
      </p>
      <Button render={<Link href={saPath("/contacts")} />} className="mt-6">
        Back to contacts
      </Button>
    </div>
  );
}
