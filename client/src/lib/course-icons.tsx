/**
 * Shared course icon utilities — used by the icon picker (outline page)
 * and the sidebar renderer.
 */
import type { LucideProps } from "lucide-react";
import type { FC } from "react";
import {
  // Education
  BookOpen, BookMarked, GraduationCap, Library, FileText,
  PenLine, NotebookPen, ClipboardList, ScrollText, Newspaper, BookCopy,
  // Media & Content
  Video, Mic, Camera, Film, Music, Headphones, Radio, MonitorPlay, Clapperboard,
  // Business & Growth
  Briefcase, TrendingUp, BarChart2, Target, Award, Trophy, Star,
  DollarSign, PieChart, LineChart, Handshake, Building2, ShoppingCart,
  Package, Coins, Receipt, Tag,
  // Action & Energy
  Zap, Rocket, Sparkles, Flame, Heart, ThumbsUp, PartyPopper,
  Megaphone, Bell, Timer, AlarmClock, Clock, Hourglass, Flag,
  // Social & Community
  Users, Users2, Globe, MessageSquare, MessageCircle, Mail, Share2,
  Network, Link, AtSign, Hash,
  // Tech & Tools
  Code, Lightbulb, Layers, Monitor, Laptop, Smartphone,
  Database, Cloud, Wifi, Settings, Terminal, Puzzle, Cpu, Bot,
  // Navigation & Direction
  Compass, Map, MapPin, Navigation, Milestone, Route,
  // Lifestyle & Wellness
  Coffee, Dumbbell, Leaf, Sun, Moon, Mountain, Feather, Anchor, Flower2,
  // Creative & Design
  Palette, PenTool, Wand2, Brush, Gem, Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type LucideIcon = FC<LucideProps>;

export type CourseIconEntry = { name: string; icon: LucideIcon };
export type CourseIconGroup = { category: string; icons: CourseIconEntry[] };

// ─── Icon groups ─────────────────────────────────────────────────────────────

export const COURSE_ICON_GROUPS: CourseIconGroup[] = [
  {
    category: "Education",
    icons: [
      { name: "BookOpen",      icon: BookOpen },
      { name: "BookMarked",    icon: BookMarked },
      { name: "BookCopy",      icon: BookCopy },
      { name: "GraduationCap", icon: GraduationCap },
      { name: "Library",       icon: Library },
      { name: "FileText",      icon: FileText },
      { name: "PenLine",       icon: PenLine },
      { name: "NotebookPen",   icon: NotebookPen },
      { name: "ClipboardList", icon: ClipboardList },
      { name: "ScrollText",    icon: ScrollText },
      { name: "Newspaper",     icon: Newspaper },
    ],
  },
  {
    category: "Media & Content",
    icons: [
      { name: "Video",       icon: Video },
      { name: "Mic",         icon: Mic },
      { name: "Camera",      icon: Camera },
      { name: "Film",        icon: Film },
      { name: "Music",       icon: Music },
      { name: "Headphones",  icon: Headphones },
      { name: "Radio",       icon: Radio },
      { name: "MonitorPlay", icon: MonitorPlay },
      { name: "Clapperboard",icon: Clapperboard },
      { name: "Megaphone",   icon: Megaphone },
    ],
  },
  {
    category: "Business & Growth",
    icons: [
      { name: "Briefcase",   icon: Briefcase },
      { name: "TrendingUp",  icon: TrendingUp },
      { name: "BarChart2",   icon: BarChart2 },
      { name: "PieChart",    icon: PieChart },
      { name: "LineChart",   icon: LineChart },
      { name: "Target",      icon: Target },
      { name: "Award",       icon: Award },
      { name: "Trophy",      icon: Trophy },
      { name: "DollarSign",  icon: DollarSign },
      { name: "Coins",       icon: Coins },
      { name: "Receipt",     icon: Receipt },
      { name: "ShoppingCart",icon: ShoppingCart },
      { name: "Package",     icon: Package },
      { name: "Tag",         icon: Tag },
      { name: "Handshake",   icon: Handshake },
      { name: "Building2",   icon: Building2 },
    ],
  },
  {
    category: "Action & Energy",
    icons: [
      { name: "Zap",         icon: Zap },
      { name: "Rocket",      icon: Rocket },
      { name: "Sparkles",    icon: Sparkles },
      { name: "Flame",       icon: Flame },
      { name: "Star",        icon: Star },
      { name: "Heart",       icon: Heart },
      { name: "ThumbsUp",    icon: ThumbsUp },
      { name: "PartyPopper", icon: PartyPopper },
      { name: "Bell",        icon: Bell },
      { name: "Flag",        icon: Flag },
      { name: "Timer",       icon: Timer },
      { name: "Clock",       icon: Clock },
      { name: "Hourglass",   icon: Hourglass },
      { name: "AlarmClock",  icon: AlarmClock },
    ],
  },
  {
    category: "Social & Community",
    icons: [
      { name: "Users",          icon: Users },
      { name: "Users2",         icon: Users2 },
      { name: "Globe",          icon: Globe },
      { name: "MessageSquare",  icon: MessageSquare },
      { name: "MessageCircle",  icon: MessageCircle },
      { name: "Mail",           icon: Mail },
      { name: "Share2",         icon: Share2 },
      { name: "Network",        icon: Network },
      { name: "Link",           icon: Link },
      { name: "AtSign",         icon: AtSign },
      { name: "Hash",           icon: Hash },
    ],
  },
  {
    category: "Tech & Tools",
    icons: [
      { name: "Code",       icon: Code },
      { name: "Terminal",   icon: Terminal },
      { name: "Monitor",    icon: Monitor },
      { name: "Laptop",     icon: Laptop },
      { name: "Smartphone", icon: Smartphone },
      { name: "Database",   icon: Database },
      { name: "Cloud",      icon: Cloud },
      { name: "Cpu",        icon: Cpu },
      { name: "Wifi",       icon: Wifi },
      { name: "Bot",        icon: Bot },
      { name: "Settings",   icon: Settings },
      { name: "Puzzle",     icon: Puzzle },
      { name: "Layers",     icon: Layers },
      { name: "Lightbulb",  icon: Lightbulb },
    ],
  },
  {
    category: "Navigation",
    icons: [
      { name: "Compass",    icon: Compass },
      { name: "Map",        icon: Map },
      { name: "MapPin",     icon: MapPin },
      { name: "Navigation", icon: Navigation },
      { name: "Milestone",  icon: Milestone },
      { name: "Route",      icon: Route },
    ],
  },
  {
    category: "Lifestyle",
    icons: [
      { name: "Coffee",   icon: Coffee },
      { name: "Dumbbell", icon: Dumbbell },
      { name: "Leaf",     icon: Leaf },
      { name: "Sun",      icon: Sun },
      { name: "Moon",     icon: Moon },
      { name: "Mountain", icon: Mountain },
      { name: "Feather",  icon: Feather },
      { name: "Anchor",   icon: Anchor },
      { name: "Flower2",  icon: Flower2 },
    ],
  },
  {
    category: "Creative",
    icons: [
      { name: "Palette",  icon: Palette },
      { name: "PenTool",  icon: PenTool },
      { name: "Wand2",    icon: Wand2 },
      { name: "Brush",    icon: Brush },
      { name: "Gem",      icon: Gem },
      { name: "Crown",    icon: Crown },
    ],
  },
];

// Flat list for backward-compat usages and the icon map
export const COURSE_ICONS: CourseIconEntry[] = COURSE_ICON_GROUPS.flatMap((g) => g.icons);

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
