"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { BookOpen, Check, Crown, Gem, Heart, Rocket, Sparkles, Star, Trophy, Users, Zap } from "lucide-react";
import { EnrollOfferModal } from "@/app/offer/[saId]/[offerId]/enroll-modal";
import { communitySignupHref } from "@/lib/community/routes";
import type { MembershipLevel } from "@/types/community-membership";
import type { Member } from "@/types/community";
import type { CourseOffer } from "@/types/course-offers";

const ICONS = { people: Users, crown: Crown, star: Star, gem: Gem, sparkles: Sparkles, rocket: Rocket, lightning: Zap, heart: Heart, play: Rocket, book: BookOpen, trophy: Trophy } as const;

function money(cents: number | null, currency: string): string {
  if (cents == null) return "";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
}

type Plan = MembershipLevel & { offers: { monthly: CourseOffer | null; annual: CourseOffer | null; oneTime: CourseOffer | null } };

export function CommunityPlansView({ saId, group, brand, plans, member, pretty }: { saId: string; group: { id: string; slug: string; name: string; about: string; logoUrl: string | null; coverUrl: string | null; theme: unknown }; brand: string; plans: Plan[]; member: Pick<Member, "email" | "displayName" | "phone"> | null; pretty: boolean }) {
  return <div className="community-plans min-h-screen px-4 py-10 sm:px-6" style={{ "--plans-brand": brand } as CSSProperties}><style>{`.community-plans-title{display:block;font-size:clamp(2.25rem,6vw,3.75rem);line-height:1.05;font-weight:650;letter-spacing:-.04em;color:var(--foreground)}`}</style><div className="mx-auto max-w-7xl"><header className="mx-auto max-w-3xl text-center"><div className="flex items-center justify-center gap-3">{group.logoUrl ? <Image src={group.logoUrl} alt="" width={48} height={48} unoptimized className="h-12 w-12 rounded-xl object-cover" /> : <div className="grid h-12 w-12 place-items-center rounded-xl text-lg font-bold text-white" style={{ backgroundColor: brand }}>{group.name.charAt(0)}</div>}<span className="text-xl font-semibold text-foreground">{group.name}</span></div><p className="mt-8 text-sm font-semibold uppercase tracking-[.18em]" style={{ color: brand }}>Membership</p><h1><span className="community-plans-title mt-3">Choose your membership</span></h1><p className="mx-auto mt-4 max-w-2xl text-base text-muted-foreground">{group.about || `Join ${group.name} and get the access, resources, and support you need.`}</p></header><div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{plans.map((plan) => <PlanCard key={plan.id} saId={saId} group={group} plan={plan} brand={brand} member={member} pretty={pretty} />)}</div><p className="mt-8 text-center text-sm text-muted-foreground">Already a member? <Link className="font-semibold underline" style={{ color: brand }} href={communitySignupHref({ saId, pretty }, { join: group.id })}>Sign in</Link></p></div></div>;
}

function PlanCard({ saId, group, plan, brand, member, pretty }: { saId: string; group: { id: string; slug: string; name: string }; plan: Plan; brand: string; member: Pick<Member, "email" | "displayName" | "phone"> | null; pretty: boolean }) {
  const options = [plan.pricing.monthly.enabled && "monthly", plan.pricing.annual.enabled && "annual", plan.pricing.oneTime.enabled && "oneTime"].filter(Boolean) as ("monthly" | "annual" | "oneTime")[];
  const [selected, setSelected] = useState<"monthly" | "annual" | "oneTime">(options[0] ?? "monthly");
  const option = plan.pricing[selected];
  const offer = plan.offers[selected];
  const Icon = plan.icon && plan.icon !== "none" ? ICONS[plan.icon as keyof typeof ICONS] ?? Star : null;
  const isFree = plan.pricing.mode === "free";
  const bullet = plan.bulletStyle === "sparkle" ? <Sparkles className="h-4 w-4 shrink-0" style={{ color: brand }} /> : <Check className="h-4 w-4 shrink-0" style={{ color: brand }} />;
  const cta = isFree ? <Link href={communitySignupHref({ saId, pretty }, { join: group.id, level: plan.id })} className="flex h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white" style={{ backgroundColor: brand }}>Enter community</Link> : offer ? <EnrollOfferModal saId={saId} offerId={offer.id} type={offer.type} priceLabel={`${money(option.priceCents, option.currency)}${selected === "monthly" ? "/month" : selected === "annual" ? "/year" : ""}`} brand={brand} member={member} checkoutSettings={offer.checkoutSettings} /> : <button disabled className="h-11 rounded-lg bg-muted px-4 text-sm font-semibold text-muted-foreground">Checkout unavailable</button>;
  return <article className="relative flex flex-col rounded-2xl border border-border bg-white p-5 shadow-sm" style={plan.featuredLabel ? { borderColor: brand, boxShadow: `0 0 0 2px ${brand}22` } : undefined}>{plan.featuredLabel && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ backgroundColor: brand }}>{plan.featuredLabel}</span>}<div className="flex items-start gap-3">{Icon && <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ color: brand, backgroundColor: `${brand}15` }}><Icon className="h-5 w-5" /></span>}<div><h2 className="text-xl font-semibold text-foreground">{plan.name}</h2><p className="mt-1 text-sm text-muted-foreground">{plan.shortDescription}</p></div></div>{options.length > 1 && <div className="mt-5 flex rounded-lg bg-muted p-1">{options.map((key) => <button key={key} type="button" onClick={() => setSelected(key)} className="flex-1 rounded-md px-2 py-1.5 text-xs font-semibold" style={selected === key ? { backgroundColor: brand, color: "white" } : undefined}>{key === "monthly" ? "Monthly" : key === "annual" ? "Annual" : "One-time"}</button>)}</div>}<div className="mt-5 flex items-end gap-1"><span className="text-3xl font-semibold text-foreground">{isFree ? "Free" : money(option.priceCents, option.currency)}</span>{!isFree && <span className="pb-1 text-sm text-muted-foreground">{selected === "monthly" ? "/month" : selected === "annual" ? "/year" : "one-time"}</span>}</div>{option.savingsLabel && <p className="mt-1 text-sm font-semibold" style={{ color: brand }}>{option.savingsLabel}</p>}<ul className="mt-5 flex-1 space-y-3 border-t border-border pt-5">{plan.highlights.map((highlight, i) => <li key={`${highlight}-${i}`} className="flex gap-2 text-sm text-foreground">{bullet}<span>{highlight}</span></li>)}{selected === "annual" && option.bonuses?.map((bonus, i) => <li key={`bonus-${i}`} className="flex gap-2 rounded-md px-2 py-1 text-sm font-medium" style={{ backgroundColor: `${brand}10` }}>{bullet}<span>{bonus}</span></li>)}</ul><div className="mt-6">{cta}</div></article>;
}
