import { Globe, Mail } from "lucide-react";
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaPinterest,
  FaThreads,
  FaTiktok,
  FaXTwitter,
  FaYoutube,
} from "react-icons/fa6";
import type { ComponentType } from "react";
import type { SocialNetwork } from "@/lib/pages-funnels/social-links";

/**
 * The ONE map from social network to icon (Wave 3 Social Links). Brand marks
 * come from react-icons' Font Awesome 6 set (already a dependency); the
 * generic Website / Email icons from lucide, like the rest of the builder.
 * Icons are decorative — every link carries a text accessible name.
 */
export const SOCIAL_ICONS: Record<SocialNetwork, ComponentType<{ size?: number; "aria-hidden"?: boolean }>> = {
  instagram: FaInstagram,
  facebook: FaFacebook,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  linkedin: FaLinkedin,
  x: FaXTwitter,
  pinterest: FaPinterest,
  threads: FaThreads,
  website: Globe,
  email: Mail,
};
