"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { AgencyAudienceSource } from "@/types/agency-communications";

interface AudiencePickerOptions {
  plans: { id: string; name: string }[];
  communities: { id: string; name: string }[];
  courses: { id: string; title: string }[];
  offers: { id: string; title: string }[];
}

/**
 * Agency Communications' own audience picker — deliberately NOT the tenant
 * Contact condition-group builder (`AudienceConditionBuilder`), per the
 * standing instruction that Agency audiences are structurally different: a
 * small, closed set of real sources (sub-account owners, plan cohorts,
 * Agency Community members, Agency course/offer buyers), not an open-ended
 * Contact filter. Plain checkboxes + a couple of multi-selects, matching
 * this codebase's existing "compact settings panel" visual pattern rather
 * than a new condition-builder UI.
 */
export function AgencyAudiencePicker({
  value,
  onChange,
}: {
  value: AgencyAudienceSource[];
  onChange: (next: AgencyAudienceSource[]) => void;
}) {
  const [options, setOptions] = useState<AudiencePickerOptions | null>(null);

  useEffect(() => {
    fetch("/api/agency/communications/audience/options")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: (AudiencePickerOptions & { ok?: boolean }) | null) => setOptions(d ?? { plans: [], communities: [], courses: [], offers: [] }))
      .catch(() => setOptions({ plans: [], communities: [], courses: [], offers: [] }));
  }, []);

  const hasOwners = value.some((s) => s.kind === "subAccountOwners");
  const planSource = value.find((s) => s.kind === "planCohort");
  const communitySources = value.filter((s) => s.kind === "community");
  const courseSources = value.filter((s) => s.kind === "course");
  const offerSources = value.filter((s) => s.kind === "courseOffer");

  function toggleOwners(checked: boolean) {
    onChange(checked ? [...value, { kind: "subAccountOwners" }] : value.filter((s) => s.kind !== "subAccountOwners"));
  }

  function togglePlan(planId: string, checked: boolean) {
    const current = planSource?.planIds ?? [];
    const nextIds = checked ? [...current, planId] : current.filter((id) => id !== planId);
    const withoutPlan = value.filter((s) => s.kind !== "planCohort");
    onChange(nextIds.length > 0 ? [...withoutPlan, { kind: "planCohort", planIds: nextIds }] : withoutPlan);
  }

  function toggleCommunity(groupId: string, checked: boolean) {
    onChange(
      checked
        ? [...value, { kind: "community", groupId }]
        : value.filter((s) => !(s.kind === "community" && s.groupId === groupId)),
    );
  }

  function toggleCourse(courseId: string, checked: boolean) {
    onChange(
      checked
        ? [...value, { kind: "course", courseId }]
        : value.filter((s) => !(s.kind === "course" && s.courseId === courseId)),
    );
  }

  function toggleOffer(offerId: string, checked: boolean) {
    onChange(
      checked
        ? [...value, { kind: "courseOffer", offerId }]
        : value.filter((s) => !(s.kind === "courseOffer" && s.offerId === offerId)),
    );
  }

  if (!options) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading audiences…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked={hasOwners} onCheckedChange={(v) => toggleOwners(v === true)} />
          All sub-account owners
        </label>
        <p className="pl-6 text-xs text-muted-foreground">Every Magnetix Studios business owner.</p>
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">Sub-accounts by plan</p>
        {options.plans.length === 0 ? (
          <p className="pl-1 text-xs text-muted-foreground">No plans created yet.</p>
        ) : (
          <div className="space-y-1 pl-1">
            {options.plans.map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={(planSource?.planIds ?? []).includes(p.id)}
                  onCheckedChange={(v) => togglePlan(p.id, v === true)}
                />
                {p.name}
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">Agency Community</p>
        {options.communities.length === 0 ? (
          <p className="pl-1 text-xs text-muted-foreground">No communities yet.</p>
        ) : (
          <div className="space-y-1 pl-1">
            {options.communities.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={communitySources.some((s) => s.groupId === c.id)}
                  onCheckedChange={(v) => toggleCommunity(c.id, v === true)}
                />
                {c.name}
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">Course enrollees</p>
        {options.courses.length === 0 ? (
          <p className="pl-1 text-xs text-muted-foreground">No Standalone Courses yet.</p>
        ) : (
          <div className="space-y-1 pl-1">
            {options.courses.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={courseSources.some((s) => s.courseId === c.id)}
                  onCheckedChange={(v) => toggleCourse(c.id, v === true)}
                />
                {c.title}
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-1.5">
        <p className="text-sm font-medium">Course Offer buyers</p>
        {options.offers.length === 0 ? (
          <p className="pl-1 text-xs text-muted-foreground">No Course Offers yet.</p>
        ) : (
          <div className="space-y-1 pl-1">
            {options.offers.map((o) => (
              <label key={o.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={offerSources.some((s) => s.offerId === o.id)}
                  onCheckedChange={(v) => toggleOffer(o.id, v === true)}
                />
                {o.title}
              </label>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
