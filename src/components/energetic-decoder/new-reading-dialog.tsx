"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, MapPin, Plus, Search, UserPlus, Users } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Contact } from "@/types/contacts";
import type { EnergeticProfile } from "@/types/energetic-profile";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";

interface PlaceSuggestion {
  lat: number;
  lng: number;
  displayName: string;
  timeZone: string;
}

/**
 * Phase 3 Task 4 (2026-08-13) — the Profile-centered "New Reading"
 * workflow. Replaces the old flat name/email/birth-data form (still used
 * verbatim as this component's "brand new person" screen) with a first
 * question — WHO is this reading for — per the approved architecture
 * (Contact → Energetic Profile → Reading). Kept deliberately simple for
 * the common case: a Contact with exactly one existing Profile skips
 * straight to a one-click confirm screen, no birth-data re-entry, no
 * Contact→Profile architecture the practitioner has to think about.
 *
 * Four real paths, matching what energetic-decoder-service.ts now
 * accepts:
 *   1. Existing Profile picked      → POST { profileId }
 *   2. New Profile, existing Contact → POST { contactId, name, birth data }
 *   3. Brand-new person             → POST { name, email, birth data }
 *      (identical shape/behavior to the pre-Task-4 form — the public
 *      decoder embed's own submission is untouched, separate code path)
 */

type Step =
  | "who"
  | "profile-list"
  | "confirm-profile"
  | "new-profile-form"
  | "new-person-form";

function displayName(c: Contact): string {
  return c.name || c.email || c.phone || "(unnamed contact)";
}

function contactSubtitle(c: Contact): string {
  if (c.name && c.email) return c.email;
  if (c.name && c.phone) return c.phone;
  return "";
}

export function NewReadingDialog({
  onCreated,
}: {
  onCreated: (reading: EnergeticDecoderReading) => void;
}) {
  const { subAccountId, agencyId } = useSubAccount();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("who");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const [profiles, setProfiles] = useState<EnergeticProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<EnergeticProfile | null>(null);

  // Birth-data form fields — shared by "new profile under existing
  // contact" and "brand new person"; email only applies to the latter.
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !agencyId || !subAccountId) return;
    const unsub = subscribeToContacts(
      { agencyId, subAccountId },
      (list) => setContacts(list),
      () => setContacts([]),
    );
    return () => unsub();
  }, [open, agencyId, subAccountId]);

  function resetAll() {
    setStep("who");
    setContactSearch("");
    setSelectedContact(null);
    setProfiles([]);
    setSelectedProfile(null);
    setName("");
    setEmail("");
    setBirthDate("");
    setBirthTime("");
    setBirthPlace("");
    setSelectedPlace(null);
    setSuggestions([]);
    setError(null);
  }

  async function pickContact(contact: Contact) {
    setSelectedContact(contact);
    setProfilesLoading(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/energetic-decoder/profiles?contactId=${contact.id}`,
      );
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; profiles?: EnergeticProfile[] };
      const list = data.profiles ?? [];
      setProfiles(list);
      if (list.length === 0) {
        // No chart subject under this Contact yet — go straight to the
        // birth-data form for their first Profile. Pre-fill name from the
        // Contact as a starting point (the common case: Contact IS the
        // chart subject); fully editable, e.g. a parent creating a child's
        // first Profile would just overwrite it.
        setName(contact.name ?? "");
        setStep("new-profile-form");
      } else if (list.length === 1) {
        setSelectedProfile(list[0]);
        setStep("confirm-profile");
      } else {
        setStep("profile-list");
      }
    } catch {
      setProfiles([]);
      setName(contact.name ?? "");
      setStep("new-profile-form");
    } finally {
      setProfilesLoading(false);
    }
  }

  function chooseProfile(profile: EnergeticProfile) {
    setSelectedProfile(profile);
    setStep("confirm-profile");
  }

  function startNewProfileForm() {
    setName(selectedContact?.name ?? "");
    setBirthDate("");
    setBirthTime("");
    setBirthPlace("");
    setSelectedPlace(null);
    setStep("new-profile-form");
  }

  function startNewPersonForm() {
    setSelectedContact(null);
    setProfiles([]);
    setSelectedProfile(null);
    setName("");
    setEmail("");
    setBirthDate("");
    setBirthTime("");
    setBirthPlace("");
    setSelectedPlace(null);
    setStep("new-person-form");
  }

  function handlePlaceChange(value: string) {
    setBirthPlace(value);
    setSelectedPlace(null);
    setSuggestionsOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const res = await fetch(
          `/api/sub-accounts/${subAccountId}/energetic-decoder/geocode?q=${encodeURIComponent(value)}`,
        );
        const data = (await res.json().catch(() => ({}))) as { results?: PlaceSuggestion[] };
        setSuggestions(data.results ?? []);
      } catch {
        setSuggestions([]);
      } finally {
        setSuggestLoading(false);
      }
    }, 400);
  }

  function pickSuggestion(s: PlaceSuggestion) {
    setBirthPlace(s.displayName);
    setSelectedPlace(s);
    setSuggestions([]);
    setSuggestionsOpen(false);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function submitReading(body: Record<string, unknown>) {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/readings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reading?: EnergeticDecoderReading;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.reading) {
        throw new Error(data.error ?? "Something went wrong.");
      }
      toast.success(`${data.reading.name}'s reading saved.`);
      setOpen(false);
      resetAll();
      onCreated(data.reading);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function submitExistingProfile() {
    if (!selectedProfile) return;
    void submitReading({ profileId: selectedProfile.id });
  }

  function submitBirthDataForm(e: React.FormEvent) {
    e.preventDefault();
    const placeFields =
      selectedPlace && selectedPlace.displayName === birthPlace
        ? { lat: selectedPlace.lat, lng: selectedPlace.lng, timeZone: selectedPlace.timeZone }
        : {};
    if (step === "new-profile-form" && selectedContact) {
      void submitReading({
        contactId: selectedContact.id,
        name,
        birthDate,
        birthTime,
        birthPlace,
        ...placeFields,
      });
    } else {
      void submitReading({ name, email, birthDate, birthTime, birthPlace, ...placeFields });
    }
  }

  const filteredContacts = useMemo(() => {
    const term = contactSearch.trim().toLowerCase();
    const sorted = [...contacts].sort((a, b) =>
      displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" }),
    );
    if (!term) return sorted;
    return sorted.filter((c) => {
      const n = (c.name ?? "").toLowerCase();
      const e = (c.email ?? "").toLowerCase();
      const p = (c.phone ?? "").toLowerCase();
      return n.includes(term) || e.includes(term) || p.includes(term);
    });
  }, [contacts, contactSearch]);

  function birthDataFields(withEmail: boolean) {
    return (
      <>
        <div className="space-y-1.5">
          <Label htmlFor="nr-name">Name</Label>
          <Input id="nr-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        {withEmail && (
          <div className="space-y-1.5">
            <Label htmlFor="nr-email">Email</Label>
            <Input
              id="nr-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
        )}
        <div className="relative space-y-1.5">
          <Label htmlFor="nr-place">Birth place</Label>
          <Input
            id="nr-place"
            value={birthPlace}
            onChange={(e) => handlePlaceChange(e.target.value)}
            onFocus={() => setSuggestionsOpen(true)}
            onBlur={() => setTimeout(() => setSuggestionsOpen(false), 150)}
            placeholder="Austin, TX, USA"
            autoComplete="off"
            required
          />
          {suggestionsOpen && (suggestions.length > 0 || suggestLoading) && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border bg-popover shadow-md">
              {suggestLoading && suggestions.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
              ) : (
                suggestions.map((s) => (
                  <button
                    key={`${s.lat},${s.lng}`}
                    type="button"
                    onMouseDown={() => pickSuggestion(s)}
                    className="flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-muted"
                  >
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                    <span>{s.displayName}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="nr-date">Birth date</Label>
            <Input id="nr-date" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nr-time">Birth time</Label>
            <Input id="nr-time" type="time" value={birthTime} onChange={(e) => setBirthTime(e.target.value)} required />
          </div>
        </div>
      </>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetAll();
      }}
    >
      <DialogTrigger className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground">
        <Plus className="h-3.5 w-3.5" />
        New reading
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === "who" && "New reading — who is this for?"}
            {step === "profile-list" && `${selectedContact ? displayName(selectedContact) : "Contact"}'s profiles`}
            {step === "confirm-profile" && "Confirm"}
            {step === "new-profile-form" && `New profile for ${selectedContact ? displayName(selectedContact) : "this contact"}`}
            {step === "new-person-form" && "New person"}
          </DialogTitle>
        </DialogHeader>

        {step === "who" && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={startNewPersonForm}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3.5 py-2.5 text-left text-sm font-semibold text-primary hover:bg-primary/5"
            >
              <UserPlus className="h-4 w-4" />
              New person (new contact)
            </button>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Search existing contacts…"
                className="pl-8"
                autoFocus
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              {profilesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : filteredContacts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">No contacts match.</p>
                </div>
              ) : (
                filteredContacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void pickContact(c)}
                    className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{displayName(c)}</p>
                      {contactSubtitle(c) && (
                        <p className="truncate text-[11px] text-muted-foreground">{contactSubtitle(c)}</p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {step === "profile-list" && selectedContact && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setStep("who")}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Back
            </button>
            <p className="text-xs text-muted-foreground">
              {displayName(selectedContact)} has {profiles.length} profiles — pick who this reading is for.
            </p>
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => chooseProfile(p)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm hover:border-primary"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {p.name}
                      {p.relationshipLabel && (
                        <span className="ml-1.5 font-normal text-muted-foreground">· {p.relationshipLabel}</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.birthPlace} · {p.birthDate}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={startNewProfileForm}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3.5 py-2.5 text-left text-sm font-semibold text-primary hover:bg-primary/5"
            >
              <UserPlus className="h-4 w-4" />
              Add another profile for {displayName(selectedContact)}
            </button>
          </div>
        )}

        {step === "confirm-profile" && selectedContact && selectedProfile && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => (profiles.length > 1 ? setStep("profile-list") : setStep("who"))}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Back
            </button>
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {selectedProfile.name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">
                    {selectedProfile.name}
                    {selectedProfile.relationshipLabel && (
                      <span className="ml-1.5 font-normal text-muted-foreground">· {selectedProfile.relationshipLabel}</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedProfile.birthPlace} · {selectedProfile.birthDate} · {selectedProfile.birthTime}
                  </p>
                </div>
                <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Uses this profile&apos;s saved birth data — nothing to re-enter. Contact: {displayName(selectedContact)}.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={submitExistingProfile} className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Generate &amp; save
            </Button>
            {profiles.length > 1 && (
              <button
                type="button"
                onClick={() => setStep("profile-list")}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Not them? Choose a different profile
              </button>
            )}
          </div>
        )}

        {(step === "new-profile-form" || step === "new-person-form") && (
          <form onSubmit={submitBirthDataForm} className="space-y-3">
            <button
              type="button"
              onClick={() => setStep(selectedContact ? (profiles.length > 0 ? "profile-list" : "who") : "who")}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              Back
            </button>
            <p className="-mt-1 text-xs text-muted-foreground">
              {step === "new-profile-form"
                ? "Generates the chart and saves it as a new profile under this contact."
                : "Generates the chart, creates a new contact, and saves it as their first profile."}
            </p>
            {birthDataFields(step === "new-person-form")}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Generate &amp; save
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
