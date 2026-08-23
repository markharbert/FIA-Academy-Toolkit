/**
 * Shared course icon utilities — used by the icon picker (outline page)
 * and the sidebar renderer.
 */
import type { LucideProps } from "lucide-react";
import type { FC } from "react";
import {
  BookOpen, BookMarked, GraduationCap, Library, FileText,
  Video, Mic, Camera,
  TrendingUp, Target, Award, Trophy, Star,
  Zap, Rocket, Sparkles, Flame, Heart,
  Users, Globe, Code, Lightbulb, Briefcase, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Icon registry ────────────────────────────────────────────────────────────

type LucideIcon = FC<LucideProps>;

export const COURSE_ICONS: { name: string; icon: LucideIcon }[] = [
  { name: "BookOpen",     icon: BookOpen },
  { name: "BookMarked",   icon: BookMarked },
  { name: "GraduationCap", icon: GraduationCap },
  { name: "Library",      icon: Library },
  { name: "FileText",     icon: FileText },
  { name: "Video",        icon: Video },
  { name: "Mic",          icon: Mic },
  { name: "Camera",       icon: Camera },
  { name: "TrendingUp",   icon: TrendingUp },
  { name: "Target",       icon: Target },
  { name: "Award",        icon: Award },
  { name: "Trophy",       icon: Trophy },
  { name: "Star",         icon: Star },
  { name: "Zap",          icon: Zap },
  { name: "Rocket",       icon: Rocket },
  { name: "Sparkles",     icon: Sparkles },
  { name: "Flame",        icon: Flame },
  { name: "Heart",        icon: Heart },
  { name: "Users",        icon: Users },
  { name: "Globe",        icon: Globe },
  { name: "Code",         icon: Code },
  { name: "Lightbulb",    icon: Lightbulb },
  { name: "Briefcase",    icon: Briefcase },
  { name: "Layers",       icon: Layers },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  COURSE_ICONS.map(({ name, icon }) => [name, icon]),
);

// ─── Renderer ─────────────────────────────────────────────────────────────────

/** Renders the course icon: number badge, Lucide icon, or default GraduationCap. */
export function CourseIcon({
  icon,
  className,
}: {
  icon?: string | null;
  className?: string;
}) {
  if (icon && /^\d+$/.test(icon)) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full font-bold leading-none",
          "bg-violet-500/20 text-violet-300 text-[11px] min-w-[1.1rem] min-h-[1.1rem]",
          className,
        )}
      >
        {icon}
      </span>
    );
  }
  if (icon && ICON_MAP[icon]) {
    const Icon = ICON_MAP[icon];
    return <Icon className={className} />;
  }
  return <GraduationCap className={className} />;
}
