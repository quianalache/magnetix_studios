"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, FileText, Film, Image as ImageIcon, Link2, Plus, Upload, Users } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AssetsHeader, AssetsTabs, type AssetsTab } from "@/components/assets/assets-ui";
import { ResourceLibrary } from "@/components/assets/resource-library";
import { CrmResources } from "@/components/assets/crm-resources";
import { MediaLibrary, type MediaUploadRequest } from "@/components/assets/media-library";
import { AffiliateLibrary } from "@/components/assets/affiliate-library";

const TABS: { id: AssetsTab; label: string; icon: typeof FileText }[] = [
  { id: "crm", label: "CRM Resources", icon: Users },
  { id: "media", label: "Media Library", icon: ImageIcon },
  { id: "resources", label: "External Resources", icon: FileText },
  { id: "affiliates", label: "Affiliate Library", icon: Link2 },
];

/**
 * Assets (approved 2026-09) — a top-level sub-account section, NOT part of
 * Projects: Resource Library · CRM Resources · Media Library · Affiliate
 * Library. `?tab=` deep-links an area.
 */
function AssetsPageInner() {
  const { isAdmin } = useSubAccount();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tabParam = params.get("tab") as AssetsTab | null;
  const tab: AssetsTab = TABS.some((t) => t.id === tabParam) ? (tabParam as AssetsTab) : "crm";
  const [resourceSignal, setResourceSignal] = useState(0);
  const [affiliateSignal, setAffiliateSignal] = useState(0);
  const [uploadRequest, setUploadRequest] = useState<MediaUploadRequest | null>(null);

  function go(next: AssetsTab) {
    setResourceSignal(0);
    setAffiliateSignal(0);
    setUploadRequest(null);
    const q = new URLSearchParams(params.toString());
    q.set("tab", next);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  }

  function newResource() {
    if (tab !== "resources") go("resources");
    setResourceSignal((n) => n + 1);
  }
  function newAffiliate() {
    if (tab !== "affiliates") go("affiliates");
    setAffiliateSignal((n) => n + 1);
  }
  function upload(kind: MediaUploadRequest["kind"]) {
    if (tab !== "media") go("media");
    setUploadRequest({ kind, nonce: Date.now() });
  }

  const primary = tab === "media" && isAdmin
    ? { label: "Upload Media", icon: Upload, run: () => upload("file") }
    : tab === "affiliates"
      ? { label: "New Affiliate Program", icon: Plus, run: newAffiliate }
      : tab === "resources"
        ? { label: "New External Resource", icon: Plus, run: newResource }
        : null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <AssetsHeader
        actions={primary ? (
          <div className="flex">
            <Button className="h-11 rounded-r-none px-5" onClick={primary.run}>
              <primary.icon className="mr-1.5 h-4 w-4" />
              {primary.label}
            </Button>
            {tab === "media" && <DropdownMenu>
              <DropdownMenuTrigger render={<Button className="h-11 rounded-l-none border-l border-white/20 px-3" aria-label="More create options" />}>
                <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {isAdmin && (
                  <>
                    <DropdownMenuItem onClick={() => upload("file")}>
                      <ImageIcon className="mr-2 h-4 w-4" /> Upload images or documents
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => upload("video")}>
                      <Film className="mr-2 h-4 w-4" /> Upload a video
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            }
          </div>
        ) : null}
      />
      <AssetsTabs tabs={TABS} active={tab} onChange={go} />
      {tab === "resources" && <ResourceLibrary createSignal={resourceSignal} />}
      {tab === "crm" && <CrmResources />}
      {tab === "media" && <MediaLibrary uploadRequest={uploadRequest} />}
      {tab === "affiliates" && <AffiliateLibrary createSignal={affiliateSignal} />}
    </div>
  );
}

export default function AssetsPage() {
  return (
    <Suspense fallback={null}>
      <AssetsPageInner />
    </Suspense>
  );
}
