import { CommunityBanner } from "@/components/community/community-banner";
import { AboutCommunityCard } from "@/components/community/about-community-card";
import type { CommunityGroup } from "@/types/community";

/**
 * Community Settings → General "Live Preview" (Part 5). Deliberately reuses
 * the REAL `CommunityBanner`/`AboutCommunityCard` components that Community
 * Home itself renders (built in the prior Community Home task) rather than
 * a second hand-built preview UI — fed a synthetic group object that
 * overlays the admin's in-progress (unsaved) edits onto the real, currently
 * persisted group, so what's shown here is exactly what those components
 * would render once saved. Per Part 5, this intentionally does NOT
 * reproduce every Home feature (feed, left nav, sort tabs, sidebar cards) —
 * its job is visual configuration feedback for name/description/logo/cover,
 * not a full interactive mirror.
 */
export function LivePreviewPanel({
  group,
  brand,
  name,
  aboutPlainText,
  logoUrl,
  coverUrl,
  showBanner,
  memberCount,
  onlineCount,
  adminCount,
}: {
  group: CommunityGroup;
  brand: string;
  name: string;
  aboutPlainText: string;
  logoUrl: string | null;
  coverUrl: string | null;
  /** Draft value of "Show Community Banner" (General tab) — the preview
   *  reflects the unsaved toggle state, same as every other field here. */
  showBanner: boolean;
  memberCount: number;
  onlineCount: number;
  adminCount: number;
}) {
  const previewGroup: CommunityGroup = {
    ...group,
    name: name.trim() || group.name,
    about: aboutPlainText,
    coverUrl,
    logoUrl,
    showBanner,
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-[#202124]">Live Preview</h2>
        <p className="text-xs text-[#909090]">This is how your community appears to members.</p>
      </div>

      <div className="relative">
        {showBanner && <CommunityBanner group={previewGroup} />}
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="absolute -bottom-4 left-4 h-12 w-12 rounded-full border-2 border-white object-cover shadow"
          />
        )}
      </div>

      <div className={logoUrl ? "pt-2" : undefined}>
        <AboutCommunityCard
          group={previewGroup}
          brand={brand}
          memberCount={memberCount}
          onlineCount={onlineCount}
          adminCount={adminCount}
        />
      </div>
    </div>
  );
}
