import type { StandaloneCourseDifficulty } from "@/types/standalone-courses";

/** Fixed topic list for the course editor's Settings → Course tags picker,
 *  in the exact order Quiana specified. Free-text is not supported — this
 *  keeps the tag useful for future filter/discovery UI. */
export const COURSE_TOPICS = [
  "Marketing",
  "Sales",
  "Business",
  "Design",
  "Development",
  "Finance",
  "Health and Fitness",
  "Photography",
  "Music",
  "Lifestyle",
  "Personal Development",
  "Real Estate",
  "Education",
  "Technology",
  "Entrepreneurship",
  "Productivity",
  "Wellness",
  "Creative",
  "Leadership",
  "Miscellaneous",
] as const;

export const COURSE_DIFFICULTIES: { value: StandaloneCourseDifficulty; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
];

/** Common course languages — no reference list was given for this dropdown,
 *  so this is a reasonable default set rather than a literal GHL copy. */
export const COURSE_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Chinese",
  "Japanese",
  "Korean",
  "Arabic",
  "Hindi",
  "Russian",
] as const;
