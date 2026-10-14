import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * tailwind-merge must know the Magnetix design-system scales
 * (src/styles/magnetix/tokens.css), or it mistakes `text-caption` for a text
 * COLOR and silently drops it when a color class follows (and likewise for the
 * custom shadows and radii). Keep these lists in sync with tokens.css.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display-xl", "display-lg", "display-md", "title-lg", "title-md", "section", "body", "body-sm", "caption", "micro", "overline", "th"],
      shadow: ["card", "pop", "overlay"],
      radius: ["control", "card", "chip"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
