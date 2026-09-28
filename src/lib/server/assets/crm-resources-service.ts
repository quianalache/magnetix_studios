import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { isoOf, memberNames } from "@/lib/server/assets/people";
import type { CrmResourceItem, CrmResourceType } from "@/types/media-library";

/**
 * CRM Resources (Assets, 2026-09): one read-only list of things already
 * built in Magnetix — courses, offers, communities, forms, pages, webinars,
 * booking pages, products and websites. Nothing is copied: every item is
 * read from its module's authoritative record and links back to it.
 *
 * Each module is read independently; a module that fails to load is
 * reported in `unavailable` instead of hiding the others. Funnels: pages
 * carry a reserved `funnelId`, but no funnel records exist yet, so there is
 * nothing to list (reported, not faked).
 */

type Doc = FirebaseFirestore.DocumentData;
type Row = Omit<CrmResourceItem, "updatedByName"> & { byUid: string | null };

function text(v: unknown, max = 240): string {
  if (typeof v !== "string") return "";
  const plain = v.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > max ? `${plain.slice(0, max - 1)}…` : plain;
}

function byUid(d: Doc): string | null {
  return (d.updatedByUid as string) || (d.createdByUid as string) || null;
}

const MODULES: {
  type: CrmResourceType;
  module: string;
  load: (sa: string) => Promise<Row[]>;
}[] = [
  {
    type: "course",
    module: "Courses",
    load: async (sa) => {
      const snap = await getAdminDb().collection(`subAccounts/${sa}/standaloneCourses`).get();
      return snap.docs.map((s) => {
        const d = s.data();
        const published = d.published === true;
        return {
          id: s.id, type: "course", title: d.title || "Untitled course",
          description: text(d.description ?? d.subtitle ?? d.shortDescription),
          sourceModule: "Courses", delivery: typeof d.priceCents === "number" && d.priceCents > 0 ? "Paid Access" : "Member Access",
          status: published ? "active" : "draft", statusLabel: published ? "Published" : "Draft",
          updatedAt: isoOf(d.updatedAt ?? d.createdAt), href: `/courses/${s.id}`,
          publicUrl: published ? `/course/${sa}/${s.id}` : null, byUid: byUid(d),
        };
      });
    },
  },
  {
    type: "offer",
    module: "Offers",
    load: async (sa) => {
      const snap = await getAdminDb().collection(`subAccounts/${sa}/courseOffers`).get();
      return snap.docs.map((s) => {
        const d = s.data();
        const published = d.visibility === "published";
        return {
          id: s.id, type: "offer", title: d.title || "Untitled offer",
          description: text(d.description ?? d.subtitle), sourceModule: "Offers", delivery: "Checkout Link",
          status: published ? "active" : "draft", statusLabel: published ? "Published" : "Draft",
          updatedAt: isoOf(d.updatedAt ?? d.createdAt), href: `/courses/offers/${s.id}`,
          publicUrl: published ? `/offer/${sa}/${s.id}` : null, byUid: byUid(d),
        };
      });
    },
  },
  {
    type: "community",
    module: "Communities",
    load: async (sa) => {
      const snap = await getAdminDb().collection(`subAccounts/${sa}/communityGroups`).get();
      return snap.docs.map((s) => {
        const d = s.data();
        const published = d.status === "published";
        return {
          id: s.id, type: "community", title: d.name || "Untitled community",
          description: text(d.tagline ?? d.description), sourceModule: "Communities", delivery: "Member Access",
          status: d.archived ? "archived" : published ? "active" : "draft", statusLabel: d.archived ? "Archived" : published ? "Published" : "Draft",
          updatedAt: isoOf(d.updatedAt ?? d.createdAt), href: `/community`,
          publicUrl: published && d.slug ? `/c/${sa}/${d.slug}` : null, byUid: byUid(d),
        };
      });
    },
  },
  {
    type: "form",
    module: "Forms",
    load: async (sa) => {
      const snap = await getAdminDb().collection("forms").where("subAccountId", "==", sa).get();
      return snap.docs.map((s) => {
        const d = s.data();
        const archived = d.archived === true || d.status === "archived";
        return {
          id: s.id, type: "form", title: d.name || d.title || "Untitled form",
          description: text(d.description), sourceModule: "Forms", delivery: "Public Form",
          status: archived ? "archived" : "active", statusLabel: archived ? "Archived" : "Live",
          updatedAt: isoOf(d.updatedAt ?? d.createdAt), href: `/forms/${s.id}`,
          publicUrl: archived ? null : `/f/${s.id}`, byUid: byUid(d),
        };
      });
    },
  },
  {
    type: "page",
    module: "Pages",
    load: async (sa) => {
      const snap = await getAdminDb().collection("pages").where("subAccountId", "==", sa).get();
      return snap.docs.map((s) => {
        const d = s.data();
        const published = d.status === "published";
        return {
          id: s.id, type: "page", title: d.name || "Untitled page",
          description: text(d.seo?.description) || (d.pageType ? `${String(d.pageType)[0].toUpperCase()}${String(d.pageType).slice(1)} page` : ""),
          sourceModule: "Pages & Funnels", delivery: "Page URL",
          status: published ? "active" : "draft", statusLabel: published ? "Published" : "Draft",
          updatedAt: isoOf(d.updatedAt ?? d.createdAt), href: `/pages-funnels/${s.id}`,
          publicUrl: published ? `/p/${s.id}` : null, byUid: byUid(d),
        };
      });
    },
  },
  {
    type: "webinar",
    module: "Webinars",
    load: async (sa) => {
      const snap = await getAdminDb().collection(`subAccounts/${sa}/webinars`).get();
      return snap.docs.map((s) => {
        const d = s.data();
        const draft = d.status === "draft";
        const ended = d.status === "ended" || d.status === "cancelled" || d.status === "archived";
        return {
          id: s.id, type: "webinar", title: d.title || "Untitled webinar",
          description: text(d.description), sourceModule: "Webinars", delivery: "Registration",
          status: draft ? "draft" : ended ? "archived" : "active",
          statusLabel: d.status ? `${String(d.status)[0].toUpperCase()}${String(d.status).slice(1)}` : "Draft",
          updatedAt: isoOf(d.updatedAt ?? d.createdAt), href: `/webinars/${s.id}`,
          publicUrl: !draft && d.slug ? `/webinar/${sa}/${d.slug}` : null, byUid: byUid(d),
        };
      });
    },
  },
  {
    type: "booking_page",
    module: "Booking",
    load: async (sa) => {
      const snap = await getAdminDb().collection(`subAccounts/${sa}/bookingPages`).get();
      return snap.docs.map((s) => {
        const d = s.data();
        const published = d.status === "published";
        const slug = (d.slug as string) || s.id;
        return {
          id: s.id, type: "booking_page", title: d.name || "Untitled booking page",
          description: text(d.description), sourceModule: "Booking", delivery: "Booking Link",
          status: published ? "active" : "draft", statusLabel: published ? "Published" : "Draft",
          updatedAt: isoOf(d.updatedAt ?? d.createdAt), href: `/booking/${encodeURIComponent(slug)}`,
          publicUrl: published ? `/b/${sa}/${slug}` : null, byUid: byUid(d),
        };
      });
    },
  },
  {
    type: "product",
    module: "Products",
    load: async (sa) => {
      const snap = await getAdminDb().collection("products").where("subAccountId", "==", sa).get();
      return snap.docs.map((s) => {
        const d = s.data();
        const active = d.active !== false;
        return {
          id: s.id, type: "product", title: d.name || "Untitled product",
          description: text(d.description), sourceModule: "Products", delivery: "Invoice Line Item",
          status: active ? "active" : "archived", statusLabel: active ? "Active" : "Archived",
          updatedAt: isoOf(d.updatedAt ?? d.createdAt), href: `/products`, publicUrl: null, byUid: byUid(d),
        };
      });
    },
  },
  {
    type: "website",
    module: "Websites",
    load: async (sa) => {
      const snap = await getAdminDb().collection(`subAccounts/${sa}/website`).get();
      return snap.docs.map((s) => {
        const d = s.data();
        const cfg = (d.config ?? d) as Doc;
        const live = d.status === "ready" || d.status === "published";
        return {
          id: s.id, type: "website", title: cfg.business_name || cfg.heading || "Website",
          description: text(cfg.description ?? cfg.hero ?? cfg.niche), sourceModule: "Websites", delivery: "Website",
          status: live ? "active" : "draft",
          statusLabel: d.status ? `${String(d.status)[0].toUpperCase()}${String(d.status).slice(1)}` : "Draft",
          updatedAt: isoOf(d.updatedAt ?? d.createdAt), href: `/website`,
          publicUrl: live && typeof d.liveUrl === "string" ? d.liveUrl : null, byUid: byUid(d),
        };
      });
    },
  },
];

export const CRM_RESOURCE_MODULES = MODULES.map((m) => ({ type: m.type, module: m.module }));

export async function listCrmResources(subAccountId: string): Promise<{
  items: CrmResourceItem[];
  counts: Record<CrmResourceType, number>;
  unavailable: string[];
}> {
  const results = await Promise.all(
    MODULES.map(async (m) => {
      try {
        return { m, rows: await m.load(subAccountId), failed: false };
      } catch (err) {
        console.warn(`[crm-resources] ${m.module} failed`, err);
        return { m, rows: [] as Row[], failed: true };
      }
    })
  );
  const rows = results.flatMap((r) => r.rows);
  const names = await memberNames(subAccountId, rows.map((r) => r.byUid));
  const items: CrmResourceItem[] = rows
    .map(({ byUid: uid, ...r }) => ({ ...r, updatedByName: uid ? names.get(uid) ?? null : null }))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const counts = Object.fromEntries(MODULES.map((m) => [m.type, 0])) as Record<CrmResourceType, number>;
  for (const i of items) counts[i.type]++;
  return { items, counts, unavailable: results.filter((r) => r.failed).map((r) => r.m.module) };
}
