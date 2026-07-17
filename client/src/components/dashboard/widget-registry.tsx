import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";
import type { AnomalyEvent, DmoEntry } from "@shared/schema";
import {
  TrendingUp, TrendingDown, GitCompare, AlertTriangle,
  Eye, BookOpen, Lightbulb, Zap, Users,
} from "lucide-react";

// ─── Widget system types ───────────────────────────────────────────────────────

export type WidgetId =
  | "projects"
  | "email-health"
  | "dmo-streak"
  | "inbox-analyzer"
  | "competitor-pulse"
  | "recent-activity"
  | "video-score"
  | "topic-pulse"
  | "scripts"
  | "youtube-analytics"
  | "search-console"
  | "funnel-board"
  | "quick-actions";

export type WidgetSize = "third" | "half" | "two-thirds" | "full";

export type WidgetConfig = {
  id: WidgetId;
  visible: boolean;
  size: WidgetSize;
};

export const DEFAULT_LAYOUT: WidgetConfig[] = [
  { id: "projects",           visible: true,  size: "two-thirds" },
  { id: "email-health",       visible: true,  size: "third"      },
  { id: "dmo-streak",         visible: true,  size: "third"      },
  { id: "inbox-analyzer",     visible: true,  size: "third"      },
  { id: "competitor-pulse",   visible: true,  size: "third"      },
  { id: "recent-activity",    visible: true,  size: "full"       },
  { id: "video-score",        visible: false, size: "third"      },
  { id: "topic-pulse",        visible: false, size: "third"      },
  { id: "scripts",            visible: false, size: "third"      },
  { id: "youtube-analytics",  visible: false, size: "half"       },
  { id: "search-console",     visible: false, size: "half"       },
  { id: "funnel-board",       visible: false, size: "half"       },
  { id: "quick-actions",      visible: false, size: "full"       },
];

export const WIDGET_META: Record<WidgetId, { title: string; description: string }> = {
  "projects":           { title: "Projects",           description: "Upcoming tasks and project summary" },
  "email-health":       { title: "Email Health",       description: "Sender reputation and inbox placement" },
  "dmo-streak":         { title: "DMO Streak",         description: "Daily method of operation progress" },
  "inbox-analyzer":     { title: "Inbox Analyzer",     description: "Email analysis scores" },
  "competitor-pulse":   { title: "Competitor Pulse",   description: "Inbox Intel alerts and tracker stats" },
  "recent-activity":    { title: "Recent Activity",    description: "Latest events across all tools" },
  "video-score":        { title: "Video Score",        description: "Latest AI-scored session and score trend" },
  "topic-pulse":        { title: "Topic Pulse",        description: "Research runs and saved topics" },
  "scripts":            { title: "Scripts",            description: "AI-generated video scripts library" },
  "youtube-analytics":  { title: "YouTube Analytics",  description: "Channel stats: subscribers, views, watch time" },
  "search-console":     { title: "Search Console",     description: "Google Search Console clicks and impressions" },
  "funnel-board":       { title: "Funnel Board",       description: "Marketing funnel canvases" },
  "quick-actions":      { title: "Quick Actions",      description: "One-click shortcuts to key workflows" },
};

export const SIZE_CLASSES: Record<WidgetSize, string> = {
  "third":      "col-span-12 sm:col-span-6 lg:col-span-4",
  "half":       "col-span-12 sm:col-span-6",
  "two-thirds": "col-span-12 lg:col-span-8",
  "full":       "col-span-12",
};

export const SIZE_LABELS: Record<WidgetSize, string> = {
  "third":      "1/3 width",
  "half":       "1/2 width",
  "two-thirds": "2/3 width",
  "full":       "Full width",
};

/** Merge a saved layout with the default — adds any new widget IDs not yet in saved. */
export function mergeLayout(saved: WidgetConfig[] | null | undefined): WidgetConfig[] {
  if (!saved || saved.length === 0) return DEFAULT_LAYOUT;
  const savedIds = new Set(saved.map((w) => w.id));
  const newWidgets = DEFAULT_LAYOUT.filter((w) => !savedIds.has(w.id));
  return [...saved, ...newWidgets];
}

// ─── Shared presentational components ─────────────────────────────────────────

export function Tile({
  accent,
  children,
  href,
  testId,
  className = "",
}: {
  accent: string;
  children: React.ReactNode;
  href?: string;
  testId?: string;
  className?: string;
}) {
  const card = (
    <Card
      className={`relative overflow-hidden border-card-border bg-card transition-all hover-elevate h-full ${
        href ? "cursor-pointer" : ""
      } ${className}`}
      data-testid={testId}
    >
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />
      <CardContent className="relative pt-5 pb-5 h-full">{children}</CardContent>
    </Card>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {card}
    </Link>
  ) : (
    card
  );
}

export function TileTitle({
  icon: Icon,
  title,
  accent,
  badge,
  right,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  accent: string;
  badge?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${accent}`}>
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {badge}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

export function StatChip({
  value,
  label,
  tone = "neutral",
}: {
  value: number | string;
  label: string;
  tone?: "neutral" | "rose" | "amber" | "indigo" | "teal" | "emerald" | "sky";
}) {
  const toneClasses =
    tone === "rose"
      ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20"
      : tone === "amber"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20"
      : tone === "indigo"
      ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-indigo-500/20"
      : tone === "teal"
      ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 ring-teal-500/20"
      : tone === "emerald"
      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20"
      : tone === "sky"
      ? "bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/20"
      : "bg-muted text-foreground ring-border";
  return (
    <div className={`rounded-lg ring-1 px-2.5 py-1.5 ${toneClasses}`}>
      <p className="text-lg font-bold tabular-nums leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-wide font-medium opacity-80 mt-0.5">{label}</p>
    </div>
  );
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

export function scoreColor(s: number | null | undefined) {
  if (s == null) return "text-muted-foreground";
  if (s >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (s >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-rose-500 dark:text-rose-400";
}

export function timeAgo(date: Date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function reputationTone(rep: string | null | undefined) {
  const r = (rep || "").toUpperCase();
  if (r === "HIGH")   return { label: "Excellent", color: "text-emerald-500", dot: "bg-emerald-500" };
  if (r === "MEDIUM") return { label: "Good",      color: "text-sky-500",     dot: "bg-sky-500" };
  if (r === "LOW")    return { label: "Low",        color: "text-amber-500",   dot: "bg-amber-500" };
  if (r === "BAD")    return { label: "Bad",        color: "text-rose-500",    dot: "bg-rose-500" };
  return { label: "No data", color: "text-muted-foreground", dot: "bg-muted-foreground/40" };
}

export function filterPostmasterLast90(stats: any[] | null | undefined): any[] {
  if (!stats?.length) return [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return [...stats]
    .filter((s: any) => s.date >= cutoffStr)
    .sort((a: any, b: any) => b.date.localeCompare(a.date));
}

export function domainRep90(d: any): string | null {
  const stats = filterPostmasterLast90(d.trafficStats as any[]);
  return (
    stats.find(
      (s: any) =>
        s.domainReputation && s.domainReputation !== "REPUTATION_CATEGORY_UNSPECIFIED",
    )?.domainReputation ?? null
  );
}

export function domainSpam90(d: any): number | null {
  const stats = filterPostmasterLast90(d.trafficStats as any[]);
  return stats.find((s: any) => s.spamRate != null)?.spamRate ?? null;
}

// ─── DMO helpers ───────────────────────────────────────────────────────────────

export const DMO_ACTIVITIES = [
  { key: "visionMeditation" as const,    secondsKey: "visionSeconds" as const,     target: 30, label: "Vision & Meditation",  icon: Eye,       dot: "bg-violet-500", ring: "ring-violet-400" },
  { key: "personalDevelopment" as const, secondsKey: "personalSeconds" as const,   target: 30, label: "Personal Development", icon: BookOpen,  dot: "bg-blue-500",   ring: "ring-blue-400" },
  { key: "expandSkills" as const,        secondsKey: "expandSeconds" as const,     target: 60, label: "Expand Your Skills",   icon: Lightbulb, dot: "bg-teal-500",   ring: "ring-teal-400" },
  { key: "execution" as const,           secondsKey: "executionSeconds" as const,  target: 60, label: "Execution",            icon: Zap,       dot: "bg-amber-500",  ring: "ring-amber-400" },
  { key: "connecting" as const,          secondsKey: "connectingSeconds" as const, target: 60, label: "Connect with People",  icon: Users,     dot: "bg-rose-500",   ring: "ring-rose-400" },
];

export function calcActivityPts(seconds: number, targetMinutes: number) {
  return Math.min(5, Math.floor((seconds / 60) / (targetMinutes / 5)));
}

export function dmoTotalPts(entry: DmoEntry | null) {
  if (!entry) return 0;
  return DMO_ACTIVITIES.reduce(
    (sum, a) => sum + calcActivityPts((entry[a.secondsKey] as number) ?? 0, a.target),
    0,
  );
}

// ─── Anomaly meta ──────────────────────────────────────────────────────────────

export const ANOMALY_META: Record<
  AnomalyEvent["type"],
  { icon: React.ComponentType<{ className?: string }>; label: string; color: string; bg: string; ring: string }
> = {
  spike:           { icon: TrendingUp,    label: "Send spike",      color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-500/10",   ring: "ring-amber-500/30" },
  gap:             { icon: TrendingDown,  label: "Went silent",     color: "text-sky-600 dark:text-sky-400",       bg: "bg-sky-500/10",     ring: "ring-sky-500/30" },
  esp_change:      { icon: GitCompare,    label: "Switched ESP",    color: "text-fuchsia-600 dark:text-fuchsia-400", bg: "bg-fuchsia-500/10", ring: "ring-fuchsia-500/30" },
  auth_regression: { icon: AlertTriangle, label: "Auth regression", color: "text-rose-600 dark:text-rose-400",     bg: "bg-rose-500/10",    ring: "ring-rose-500/30" },
};

// ─── Number formatter ─────────────────────────────────────────────────────────

export function fmtNum(n: number | null | undefined, decimals = 0): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(decimals);
}
