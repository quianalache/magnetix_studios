import {
  LayoutPanelTop,
  Rows3,
  Columns3,
  Heading as HeadingIcon,
  Type,
  PilcrowSquare,
  MousePointerClick,
  Image as ImageIcon,
  Video as VideoIcon,
  Minus,
  MoveVertical,
  ChevronsUpDown,
  GalleryHorizontal,
  FileText,
  Sparkles,
  Hexagon,
  ListChecks,
  CircleDot,
  Waypoints,
  Grid3x3,
  Variable,
  Star,
  Orbit,
  ListOrdered,
  CircleDashed,
  SunMoon,
  House,
  Globe,
  Spline,
  KeyRound,
  BadgeDollarSign,
  LogIn,
  Download,
  BookOpen,
} from "lucide-react";

/**
 * Puck component name -> icon, for the custom Magnetix Blocks panel
 * (Phase 2B task §4/§6 — "the approved builder direction used visual
 * blocks/icons because they are substantially easier to scan"). Reuses
 * lucide-react, the same icon library already used everywhere else in this
 * repo (V1's own BlocksPanel included) — no second icon system introduced.
 * Icon choices for Hero (`GalleryHorizontal`) and Form (`FileText`) match
 * V1's own BlocksPanel exactly (blocks-panel.tsx's `BLOCK_ICONS`), for a
 * consistent visual vocabulary across the two builders during the
 * transition period.
 */
export const BLOCK_ICONS: Record<string, typeof HeadingIcon> = {
  Section: LayoutPanelTop,
  Row: Rows3,
  Column: Columns3,
  Heading: HeadingIcon,
  Text: Type,
  RichText: PilcrowSquare,
  Button: MousePointerClick,
  Image: ImageIcon,
  Video: VideoIcon,
  Divider: Minus,
  Spacer: MoveVertical,
  Accordion: ChevronsUpDown,
  Hero: GalleryHorizontal,
  Form: FileText,
  ReadingTool: Sparkles,
  // Reading Result Page blocks (2026-10-21)
  HumanDesignChart: Hexagon,
  AtAGlance: ListChecks,
  Centers: CircleDot,
  Channels: Waypoints,
  Gates: Grid3x3,
  Variables: Variable,
  Skills: Star,
  Mandala: Orbit,
  MandalaActivations: ListOrdered,
  AstrologyChart: CircleDashed,
  AstrologyKeyFacts: SunMoon,
  AstrologyHouses: House,
  AstrologyPlacements: Globe,
  AstrologyAspects: Spline,
  GeneKeys: KeyRound,
  FeaturedOffer: BadgeDollarSign,
  MyMagnetixButton: LogIn,
  PdfButton: Download,
  ReadingReportButton: BookOpen,
};
