import {
  Type,
  Image,
  Video,
  LayoutTemplate,
  ShoppingBag,
  MousePointerClick,
  Activity,
  User,
  type LucideIcon,
} from "lucide-react";
import type { CourseBlock, CourseBlockType, SidebarBlockType } from "@/types/course-theme";

/** Sensible starting values for a freshly-added block, keyed by type — used
 *  by both the Body and Sidebar "Add block" pickers in the theme editor. */
export function createDefaultBlock(type: CourseBlockType, order: number): CourseBlock {
  const id = crypto.randomUUID();
  switch (type) {
    case "text":
      return { id, order, type, background: "#ffffff", textColor: "#1d2939", bodyHtml: "" };
    case "image":
      return { id, order, type, imageUrl: null, linkUrl: null };
    case "video":
      return { id, order, type, videoUrl: null, videoProvider: null, videoId: null };
    case "custom":
      return {
        id,
        order,
        type,
        heading: "Heading",
        headingColor: "#1d2939",
        background: "#ffffff",
        borderColor: "#e4e4e4",
        bodyHtml: "",
        imageUrl: null,
        buttonVisible: true,
        buttonText: "Learn more",
        buttonType: "solid",
        buttonAlign: "left",
        buttonColor: "#202124",
        buttonTextColor: "#ffffff",
        linkUrl: "",
      };
    case "crossSell":
      return {
        id,
        order,
        type,
        background: "#ffffff",
        targetCourseId: null,
        titleColor: "#1d2939",
        priceColor: "#1d2939",
        buttonText: "Get it now!",
        buttonColor: "#202124",
        buttonTextColor: "#ffffff",
      };
    case "callToAction":
      return {
        id,
        order,
        type,
        buttonText: "Get in touch",
        buttonType: "solid",
        buttonAlign: "left",
        buttonColor: "#202124",
        buttonTextColor: "#ffffff",
        linkUrl: "",
      };
  }
}

export const BLOCK_TYPE_LABELS: Record<CourseBlockType, string> = {
  text: "Text",
  image: "Image",
  video: "Video",
  custom: "Custom",
  crossSell: "Cross Sell",
  callToAction: "Call To Action",
};

export const ADDABLE_BLOCK_TYPES: CourseBlockType[] = [
  "text",
  "image",
  "video",
  "custom",
  "crossSell",
  "callToAction",
];

export const BLOCK_TYPE_ICONS: Record<SidebarBlockType, LucideIcon> = {
  text: Type,
  image: Image,
  video: Video,
  custom: LayoutTemplate,
  crossSell: ShoppingBag,
  callToAction: MousePointerClick,
  progress: Activity,
  instructor: User,
};
