import {
  CheckCircle2,
  DollarSign,
  FileText,
  Presentation,
  Rocket,
  ShoppingCart,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { PageType } from "@/types/pages-funnels";

/** One icon per existing page type — shared by the library cards and the Create Page flow. */
export const PAGE_TYPE_ICONS: Record<PageType, LucideIcon> = {
  landing: Rocket,
  sales: DollarSign,
  waitlist: Users,
  webinar: Presentation,
  checkout: ShoppingCart,
  thank_you: CheckCircle2,
  generic: FileText,
  reading_result: Sparkles,
};
