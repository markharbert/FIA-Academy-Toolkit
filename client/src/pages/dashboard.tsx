import { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { dayDiffInTz, formatInTz } from "@shared/datetime";
import {
  Flame, Video, Mail, FileText,
  TrendingUp, TrendingDown,
  ChevronRight, Inbox, Trophy, Target,
  Eye, BookOpen, Zap, Users, Lightbulb,
  Plus, Activity, Radar, ShieldCheck, AlertTriangle,
  Sparkles, GitCompare, Briefcase, CalendarClock,
  ListChecks, CircleDot, Star,
} from "lucide-react";
import type {
  Session, DmoEntry, EmailAnalysis, Script,
  InsightsResponse, AnomalyEvent, PostmasterDomain, ProjectWithCounts,
  ProjectTask,
} from "@shared/schema";

type OpenTask = ProjectTask & { projectName: string; projectColor: string };

type AddressResponse = {
  token: string;
  email: string;
  lastPlacementResults: Record<string, string> | null;
  lastPlacementCheckedAt: string | null;
};

type ReputationStatus = {
  connected: boolean;
  connectedEmail?: string;
  lastSyncedAt?: string | null;
  domains: PostmasterDomain[];
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function timeGreeting(tz?: string | null) {
  let h: number;
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz || undefined, hour: "numeric", hour12: false }).formatToParts(new Date());
    h = parseInt(parts.find(p => p.type === "hour")?.value || "0", 10);
  } catch {
    h = new Date().getHours();
  }
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(tz?: string | null) {
  try {
    return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz || undefined });
  } catch {
    return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  }
}

function nowTimeLabel(tz?: string | null) {
  try {
    return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz || undefined });
  } catch {
    return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}

function scoreColor(s: number | null | undefined) {
  if (s == null) return "text-muted-foreground";
  if (s >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (s >= 60) return "text-amber-600 dark:text-amber-400";
  return "text-rose-500 dark:text-rose-400";
}

const DMO_ACTIVITIES = [
  { key: "visionMeditation" as const,    secondsKey: "visionSeconds" as const,     target: 30, label: "Vision & Meditation",  icon: Eye,       dot: "bg-violet-500",  ring: "ring-violet-400" },
  { key: "personalDevelopment" as const, secondsKey: "personalSeconds" as const,   target: 30, label: "Personal Development", icon: BookOpen,  dot: "bg-blue-500",    ring: "ring-blue-400" },
  { key: "expandSkills" as const,        secondsKey: "expandSeconds" as const,     target: 60, label: "Expand Your Skills",   icon: Lightbulb, dot: "bg-teal-500",    ring: "ring-teal-400" },
  { key: "execution" as const,           secondsKey: "executionSeconds" as const,  target: 60, label: "Execution",            icon: Zap,       dot: "bg-amber-500",   ring: "ring-amber-400" },
  { key: "connecting" as const,          secondsKey: "connectingSeconds" as const, target: 60, label: "Connect with People",  icon: Users,     dot: "bg-rose-500",    ring: "ring-rose-400" },
];

function calcActivityPts(seconds: number, targetMinutes: number) {
  return Math.min(5, Math.floor((seconds / 60) / (targetMinutes / 5)));
}

function dmoTotalPts(entry: DmoEntry | null) {
  if (!entry) return 0;
  return DMO_ACTIVITIES.reduce((sum, a) => sum + calcActivityPts((entry[a.secondsKey] as number) ?? 0, a.target), 0);
}

function timeAgo(date: Date) {
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function reputationTone(rep: string | null | undefined) {
  const r = (rep || "").toUpperCase();
  if (r === "HIGH") return { label: "Excellent", color: "text-emerald-500", dot: "bg-emerald-500" };
  if (r === "MEDIUM") return { label: "Good", color: "text-sky-500", dot: "bg-sky-500" };
  if (r === "LOW") return { label: "Low", color: "text-amber-500", dot: "bg-amber-500" };
  if (r === "BAD") return { label: "Bad", color: "text-rose-500", dot: "bg-rose-500" };
  return { label: "Unknown", color: "text-muted-foreground", dot: "bg-muted-foreground/40" };
}

const ANOMALY_META: Record<AnomalyEvent["type"], { icon: React.ComponentType<{ className?: string }>; label: string; color: string; bg: string; ring: string }> = {
  spike:           { icon: TrendingUp,    label: "Send spike",     color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-500/10",  ring: "ring-amber-500/30" },
  gap:             { icon: TrendingDown,  label: "Went silent",    color: "text-sky-600 dark:text-sky-400",       bg: "bg-sky-500/10",    ring: "ring-sky-500/30" },
  esp_change:      { icon: GitCompare,    label: "Switched ESP",   color: "text-fuchsia-600 dark:text-fuchsia-400", bg: "bg-fuchsia-500/10", ring: "ring-fuchsia-500/30" },
  auth_regression: { icon: AlertTriangle, label: "Auth regression", color: "text-rose-600 dark:text-rose-400",    bg: "bg-rose-500/10",   ring: "ring-rose-500/30" },
};

// ─── tiny presentational pieces ──────────────────────────────────────────────

/** Calm tile — neutral card, single-color top accent rule. */
function Tile({
  accent,
  children,
  href,
  testId,
  className = "",
}: {
  accent: string; // single tone like "bg-indigo-500"
  children: React.ReactNode;
  href?: string;
  testId?: string;
  className?: string;
}) {
  const card = (
    <Card
      className={`relative overflow-hidden border-card-border bg-card transition-all hover-elevate ${href ? "cursor-pointer" : ""} ${className}`}
      data-testid={testId}
    >
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accent}`} />
      <CardContent className="relative pt-5 pb-5 h-full">{children}</CardContent>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

function TileTitle({
  icon: Icon,
  title,
  accent,
  badge,
  right,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  accent: string; // e.g. "text-indigo-500 bg-indigo-500/10"
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

function StatChip({ value, label, tone = "neutral" }: { value: number | string; label: string; tone?: "neutral" | "rose" | "amber" | "indigo" }) {
  const toneClasses =
    tone === "rose"   ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20" :
    tone === "amber"  ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20" :
    tone === "indigo" ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 ring-indigo-500/20" :
    "bg-muted text-foreground ring-border";
  return (
    <div className={`rounded-lg ring-1 px-2.5 py-1.5 ${toneClasses}`}>
      <p className="text-lg font-bold tabular-nums leading-none">{value}</p>
      <p className="text-[10px] uppercase tracking-wide font-medium opacity-80 mt-0.5">{label}</p>
    </div>
  );
}

// Date helpers shared with task bucketing.
function dueLocal(due: Date): Date {
  if (due.getUTCHours() === 0 && due.getUTCMinutes() === 0 && due.getUTCSeconds() === 0) {
    return new Date(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  }
  return due;
}

function bucketTask(t: OpenTask, tz?: string | null): "overdue" | "today" | "week" | "later" | "none" {
  if (!t.dueDate) return "none";
  const diff = dayDiffInTz(new Date(t.dueDate), tz || "America/New_York");
  if (diff === 0) return "today";
  if (diff < 0) return "overdue";
  if (diff <= 7) return "week";
  return "later";
}

function formatTaskDue(due: Date, tz?: string | null): string {
  const diff = dayDiffInTz(due, tz || "America/New_York");
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return `Past Due · ${-diff}d`;
  return formatInTz(due, tz || "America/New_York", "MMM d");
}

// ─── main component ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.firstName || user?.displayName?.split(" ")[0] || "";

  // Live clock that ticks once a minute in the user's saved time zone.
  const [nowTime, setNowTime] = useState(() => nowTimeLabel(user?.timezone));
  useEffect(() => {
    setNowTime(nowTimeLabel(user?.timezone));
    const id = setInterval(() => setNowTime(nowTimeLabel(user?.timezone)), 30_000);
    return () => clearInterval(id);
  }, [user?.timezone]);

  // ── data fetching ──────────────────────────────────────────────────────────
  const { data: streak } = useQuery<{ current: number; best: number; totalDays: number }>({
    queryKey: ["/api/dmo/streak"],
  });
  const { data: dmoToday } = useQuery<{ entry: DmoEntry | null; date: string }>({
    queryKey: ["/api/dmo/today"],
  });
  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
  });
  const { data: emails = [] } = useQuery<EmailAnalysis[]>({
    queryKey: ["/api/inbox-analyzer/emails"],
  });
  const { data: scripts = [] } = useQuery<Script[]>({
    queryKey: ["/api/topic-pulse/scripts"],
  });
  const { data: insights } = useQuery<InsightsResponse>({
    queryKey: ["/api/inbox-intel/insights"],
  });
  const { data: reputation } = useQuery<ReputationStatus>({
    queryKey: ["/api/sender-reputation/status"],
  });
  const { data: address } = useQuery<AddressResponse>({
    queryKey: ["/api/inbox-analyzer/address"],
  });
  const { data: projectsSummary } = useQuery<{
    projects: ProjectWithCounts[];
    totalActive: number;
    totalOpenTasks: number;
    totalDueThisWeek: number;
    totalOverdue: number;
  }>({ queryKey: ["/api/dashboard/projects"] });
  const { data: openTasks = [] } = useQuery<OpenTask[]>({
    queryKey: ["/api/projects/all-tasks"],
  });
  const { data: urgentTasks = [] } = useQuery<OpenTask[]>({
    queryKey: ["/api/projects/urgent-tasks"],
  });

  // ── derived values ─────────────────────────────────────────────────────────
  const todayEntry = dmoToday?.entry ?? null;
  const todayPts = dmoTotalPts(todayEntry);
  const currentStreak = streak?.current ?? 0;
  const bestStreak = streak?.best ?? 0;

  const scoredEmails = emails.filter(e => e.overallScore != null).slice(0, 10);
  const avgEmailScore = useMemo(() => {
    if (scoredEmails.length === 0) return null;
    const total = scoredEmails.reduce((s, e) => s + (e.overallScore ?? 0), 0);
    return Math.round(total / scoredEmails.length);
  }, [scoredEmails]);
  const latestEmail = emails[0] ?? null;

  const [inboxLastVisited] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("inbox_analyzer_last_visited") : null,
  );
  const hasNewEmail = useMemo(() => {
    if (!latestEmail?.receivedAt) return false;
    if (!inboxLastVisited) return true;
    return new Date(String(latestEmail.receivedAt)) > new Date(inboxLastVisited);
  }, [latestEmail, inboxLastVisited]);

  // Sender reputation: respect the user's saved default domain preference
  const primaryDomain = useMemo(() => {
    const saved = localStorage.getItem("postmaster_default_domain");
    const domains = reputation?.domains ?? [];
    return (saved && domains.find(d => d.domainName === saved)) || domains[0] || null;
  }, [reputation]);
  const repTone = reputationTone(primaryDomain?.latestReputation);

  // Inbox placement: count primaries from last test
  const placement = useMemo(() => {
    const r = address?.lastPlacementResults;
    if (!r || typeof r !== "object") return null;
    const entries = Object.entries(r);
    if (entries.length === 0) return null;
    const primary = entries.filter(([, status]) => status === "primary").length;
    return { primary, total: entries.length, checkedAt: address?.lastPlacementCheckedAt ?? null };
  }, [address]);

  // ── recent activity ────────────────────────────────────────────────────────
  type ActivityItem = {
    id: string;
    icon: React.ReactNode;
    label: string;
    sub: string;
    score?: number | null;
    ts: Date;
    href: string;
  };

  const recentActivity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    sessions.slice(0, 3).forEach(s => {
      items.push({
        id: `session-${s.id}`,
        icon: <Video className="h-3.5 w-3.5 text-rose-500" />,
        label: s.title || "Untitled session",
        sub: s.scoreStatus === "final"
          ? `Video scored ${s.scoreJson?.totalScore ?? "—"}/100`
          : s.scoreStatus === "partial" ? "Scoring in progress" : "Video uploaded",
        score: s.scoreStatus === "final" ? s.scoreJson?.totalScore : null,
        ts: new Date(s.createdAt),
        href: `/video-score-upload/${s.id}`,
      });
    });
    emails.slice(0, 3).forEach(e => {
      items.push({
        id: `email-${e.id}`,
        icon: <Mail className="h-3.5 w-3.5 text-sky-500" />,
        label: e.subject || "(No subject)",
        sub: e.overallScore != null ? `Email scored ${e.overallScore}/100` : "Email analyzed",
        score: e.overallScore,
        ts: new Date(e.receivedAt),
        href: "/email-tools/inbox-analyzer",
      });
    });
    scripts.slice(0, 2).forEach(s => {
      items.push({
        id: `script-${s.id}`,
        icon: <FileText className="h-3.5 w-3.5 text-emerald-500" />,
        label: s.title || "Untitled script",
        sub: "Script generated",
        ts: new Date(s.createdAt),
        href: "/video-trends/scripts",
      });
    });
    insights?.anomalies?.slice(0, 4).forEach(a => {
      const meta = ANOMALY_META[a.type];
      items.push({
        id: `anom-${a.id}`,
        icon: <meta.icon className={`h-3.5 w-3.5 ${meta.color}`} />,
        label: a.trackerName,
        sub: a.message,
        ts: new Date(a.occurredAt),
        href: `/email-tools/inbox-intel/${a.trackerId}`,
      });
    });
    return items.sort((a, b) => b.ts.getTime() - a.ts.getTime()).slice(0, 7);
  }, [sessions, emails, scripts, insights]);

  // ── header KPIs ────────────────────────────────────────────────────────────
  const headerKpis = useMemo(() => {
    return [
      { label: "DMO points today",     value: `${todayPts}/25` },
      { label: "Open tasks",           value: projectsSummary?.totalOpenTasks ?? 0 },
      { label: "Competitor emails 7d", value: insights?.totalEmails7d ?? 0 },
    ];
  }, [todayPts, projectsSummary, insights]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-auto bg-background">
      {/* ── Hero header — single calm gradient ───────────────────────────── */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(230_70%_12%)] via-[hsl(230_55%_20%)] to-[hsl(230_45%_28%)]" />
        <div className="absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-indigo-500/15 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-7">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="text-white">
              <p className="text-xs font-medium tracking-wide uppercase text-white/70 flex items-center gap-2 flex-wrap">
                <span data-testid="text-dashboard-date">{todayLabel(user?.timezone)}</span>
                <span className="opacity-50">·</span>
                <span className="tabular-nums" data-testid="text-dashboard-time">{nowTime}</span>
              </p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-1" data-testid="text-dashboard-title">
                {firstName ? `${timeGreeting(user?.timezone)}, ${firstName}` : timeGreeting(user?.timezone)}
              </h1>
              <p className="text-white/70 mt-1 text-sm">
                Your private marketing command center.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href="/projects">
                <Button size="sm" className="bg-white text-[hsl(230_70%_12%)] hover:bg-white/90 shadow-lg" data-testid="button-open-projects">
                  <Briefcase className="h-4 w-4 mr-1.5" />
                  Open Projects
                </Button>
              </Link>
              <Link href="/dmo-tracker">
                <Button size="sm" variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white" data-testid="button-log-dmo">
                  <Target className="h-4 w-4 mr-1.5" />
                  Log DMO
                </Button>
              </Link>
            </div>
          </div>

          {/* KPI ribbon */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
            {headerKpis.map((k, i) => (
              <div
                key={i}
                className="rounded-xl bg-white/8 backdrop-blur-md ring-1 ring-white/15 px-4 py-3"
                data-testid={`kpi-${i}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-white/70 font-medium">{k.label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums text-white">
                  {k.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Row 1 — Projects (hero) + Email Health ──────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ProjectsHero
            summary={projectsSummary}
            tasks={openTasks}
            urgentTasks={urgentTasks}
            tz={user?.timezone}
          />
          <EmailHealthTile
            reputation={reputation}
            primaryDomain={primaryDomain}
            repTone={repTone}
            placement={placement}
          />
        </div>

        {/* ── Row 2 — DMO Streak + Inbox Analyzer + Competitor Pulse ─────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          {/* DMO Streak */}
          <Tile accent="bg-amber-500" href="/dmo-tracker" testId="card-dmo-streak">
            <TileTitle icon={Flame} title="DMO Streak" accent="bg-amber-500/10 text-amber-600 dark:text-amber-400" />
            <div className="mt-4 flex items-end gap-2">
              <span className="text-4xl font-bold tabular-nums leading-none">{currentStreak}</span>
              <span className="text-muted-foreground text-sm mb-1">days</span>
              {bestStreak > 0 && (
                <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                  <Trophy className="h-3 w-3" /> Best {bestStreak}
                </span>
              )}
            </div>
            <div className="mt-4 flex items-center gap-1.5">
              {DMO_ACTIVITIES.map(a => {
                const pts = todayEntry ? calcActivityPts((todayEntry[a.secondsKey] as number) ?? 0, a.target) : 0;
                return (
                  <div
                    key={a.key}
                    title={`${a.label}: ${pts}/5 pts`}
                    className={`h-2.5 w-2.5 rounded-full transition-colors ${pts > 0 ? a.dot : "bg-muted-foreground/20"} ${pts === 5 ? `ring-2 ${a.ring}` : ""}`}
                  />
                );
              })}
              <span className="ml-auto text-xs text-muted-foreground font-medium tabular-nums">{todayPts}/25 today</span>
            </div>
            {todayPts === 25 ? (
              <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">Perfect day — streak extended.</p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">{todayPts === 0 ? "Log activities to keep your streak alive." : `${25 - todayPts} pts left for a perfect day.`}</p>
            )}
          </Tile>

          {/* Inbox Analyzer */}
          <Tile accent="bg-sky-500" href="/email-tools/inbox-analyzer" testId="card-inbox-analyzer">
            <TileTitle
              icon={Mail}
              title="Inbox Analyzer"
              accent="bg-sky-500/10 text-sky-600 dark:text-sky-400"
              badge={hasNewEmail ? <Badge className="h-4 px-1.5 text-[10px] leading-none bg-sky-500 hover:bg-sky-500 text-white border-0 rounded-full">New</Badge> : undefined}
            />
            <div className="mt-4 flex items-end gap-2">
              <span className="text-4xl font-bold tabular-nums leading-none">{emails.length}</span>
              <span className="text-muted-foreground text-sm mb-1">analyzed</span>
              {avgEmailScore != null && (
                <span className={`ml-auto text-xs font-bold mb-1 px-2 py-0.5 rounded-full bg-muted ${scoreColor(avgEmailScore)}`}>
                  avg {avgEmailScore}
                </span>
              )}
            </div>
            <div className="mt-4 min-h-[34px]">
              {latestEmail ? (
                <>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Latest</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-sm font-medium truncate flex-1">{latestEmail.subject || "(No subject)"}</p>
                    {latestEmail.overallScore != null && (
                      <span className={`text-xs font-bold shrink-0 ${scoreColor(latestEmail.overallScore)}`}>
                        {latestEmail.overallScore}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No emails yet — send a test to your inbox address.</p>
              )}
            </div>
          </Tile>

          {/* Competitor Pulse */}
          <Tile accent="bg-violet-500" testId="card-competitor-pulse">
            <TileTitle
              icon={Radar}
              title="Competitor Pulse"
              accent="bg-violet-500/10 text-violet-600 dark:text-violet-400"
              right={
                <Link
                  href="/email-tools/inbox-intel"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
                  data-testid="link-pulse-open"
                >
                  Open <ChevronRight className="h-3 w-3" />
                </Link>
              }
            />
            <div className="mt-4 grid grid-cols-3 gap-2">
              <StatChip value={insights?.activeTrackerCount ?? 0} label="Active" />
              <StatChip value={insights?.totalEmails7d ?? 0} label="7-day" />
              <StatChip value={insights?.totalEmails30d ?? 0} label="30-day" />
            </div>
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Alerts</p>
              {insights?.anomalies && insights.anomalies.length > 0 ? (
                <div className="space-y-1.5">
                  {insights.anomalies.slice(0, 2).map(a => {
                    const meta = ANOMALY_META[a.type];
                    return (
                      <Link key={a.id} href={`/email-tools/inbox-intel/${a.trackerId}`}>
                        <div className={`flex items-center gap-2 rounded-md p-1.5 ring-1 ${meta.bg} ${meta.ring} hover:brightness-105 transition-all cursor-pointer`} data-testid={`anomaly-${a.id}`}>
                          <meta.icon className={`h-3.5 w-3.5 shrink-0 ${meta.color}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold truncate">{a.trackerName}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{meta.label}</p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-1">All quiet this week.</p>
              )}
            </div>
            {(insights?.totalTrackers ?? 0) === 0 && (
              <div className="mt-3 rounded-md border border-dashed border-border p-2 text-center">
                <Link href="/email-tools/inbox-intel">
                  <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-create-tracker">
                    <Plus className="h-3 w-3 mr-1" /> Track a competitor
                  </Button>
                </Link>
              </div>
            )}
          </Tile>
        </div>

        {/* ── Row 3 — Recent Activity (full width) ─────────────────────────── */}
        <Tile accent="bg-slate-400" testId="card-recent-activity">
          <div className="flex items-center justify-between">
            <TileTitle icon={Activity} title="Recent Activity" accent="bg-muted text-muted-foreground" />
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Last 7 events</span>
          </div>
          <div className="mt-3">
            {recentActivity.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                <Sparkles className="h-6 w-6 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No activity yet — dive into a tool to get started.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {recentActivity.map(item => (
                  <Link key={item.id} href={item.href}>
                    <div className="flex items-center gap-3 py-2.5 px-1 hover:bg-muted/30 rounded transition-colors cursor-pointer group" data-testid={`activity-${item.id}`}>
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{item.sub}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.score != null && (
                          <span className={`text-xs font-bold tabular-nums ${scoreColor(item.score)}`}>{item.score}</span>
                        )}
                        <span className="text-xs text-muted-foreground tabular-nums">{timeAgo(item.ts)}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Tile>

      </div>
    </div>
  );
}

// ─── Projects hero (large, lists tasks front and center) ─────────────────────
function ProjectsHero({
  summary,
  tasks,
  urgentTasks,
  tz,
}: {
  summary: {
    projects: ProjectWithCounts[];
    totalActive: number;
    totalOpenTasks: number;
    totalDueThisWeek: number;
    totalOverdue: number;
  } | undefined;
  tasks: OpenTask[];
  urgentTasks?: OpenTask[];
  tz?: string | null;
}) {
  const s = summary ?? { projects: [], totalActive: 0, totalOpenTasks: 0, totalDueThisWeek: 0, totalOverdue: 0 };
  const urgent = urgentTasks ?? [];
  const pastDueTasks = urgent.filter(t => t.dueDate && new Date(t.dueDate) < new Date());
  const upcomingTasks = urgent.filter(t => t.dueDate && new Date(t.dueDate) >= new Date());

  // "Up Next" = tasks due this week only (overdue + today + this week).
  // Tasks without a due date and tasks dated further out are intentionally hidden.
  const grouped = useMemo(() => {
    const overdue: OpenTask[] = [];
    const today: OpenTask[] = [];
    const week: OpenTask[] = [];
    for (const t of tasks) {
      const b = bucketTask(t, tz);
      if (b === "overdue") overdue.push(t);
      else if (b === "today") today.push(t);
      else if (b === "week") week.push(t);
    }
    // Limit to ~8 total, prioritizing earlier groups.
    const out: Array<{ section: string; tone: string; items: OpenTask[] }> = [];
    let remaining = 8;
    const push = (section: string, tone: string, items: OpenTask[]) => {
      if (items.length === 0 || remaining <= 0) return;
      const take = items.slice(0, remaining);
      out.push({ section, tone, items: take });
      remaining -= take.length;
    };
    push("Past Due", "text-rose-600 dark:text-rose-400", overdue);
    push("Today", "text-amber-600 dark:text-amber-400", today);
    push("This week", "text-sky-600 dark:text-sky-400", week);
    return out;
  }, [tasks]);

  const hasAnyTasks = grouped.some(g => g.items.length > 0);
  const hasAnyProjects = s.totalActive > 0;

  return (
    <Card
      className="relative overflow-hidden border-card-border bg-card lg:col-span-2 hover-elevate transition-all"
      data-testid="card-projects-hero"
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-indigo-500" />
      <CardContent className="relative pt-5 pb-5">
        <div className="flex items-center justify-between gap-2">
          <TileTitle icon={Briefcase} title="Projects" accent="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" />
          <Link
            href="/projects"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
            data-testid="link-projects-open"
          >
            Open all <ChevronRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Urgent / Past Due alert banner */}
        {urgent.length > 0 && (
          <Link href="/projects" data-testid="banner-urgent-tasks">
            <div className="mt-4 rounded-lg overflow-hidden border border-rose-500/30 bg-gradient-to-r from-rose-500/8 to-amber-500/5 hover:from-rose-500/14 transition-colors cursor-pointer">
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-rose-500/20">
                <div className="flex items-center gap-2">
                  <div className="h-5 w-5 rounded-md bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-3 w-3 text-white" />
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {pastDueTasks.length > 0 && (
                      <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">{pastDueTasks.length} Past Due</span>
                    )}
                    {pastDueTasks.length > 0 && upcomingTasks.length > 0 && (
                      <span className="text-muted-foreground text-[11px]">·</span>
                    )}
                    {upcomingTasks.length > 0 && (
                      <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">{upcomingTasks.length} Urgent</span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 shrink-0">
                  View all <ChevronRight className="h-3 w-3" />
                </span>
              </div>
              <ul className="divide-y divide-rose-500/10">
                {urgent.slice(0, 3).map(t => {
                  const isPastDue = t.dueDate && new Date(t.dueDate) < new Date();
                  return (
                    <li key={t.id} className="flex items-center gap-2.5 px-3 py-2" data-testid={`dashboard-urgent-task-${t.id}`}>
                      {isPastDue
                        ? <AlertTriangle className="h-3 w-3 shrink-0 text-rose-500" />
                        : <Flame className="h-3 w-3 shrink-0 text-amber-500" />
                      }
                      <p className="text-xs font-medium flex-1 truncate">{t.title}</p>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.projectColor }} />
                        <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">{t.projectName}</span>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
                        isPastDue ? "bg-rose-500/15 text-rose-700 dark:text-rose-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      }`}>
                        {isPastDue ? "Past Due" : "Urgent"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Link>
        )}

        {/* Summary chips */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatChip value={s.totalActive}      label="Projects" tone="indigo" />
          <StatChip value={s.totalOpenTasks}   label="Open tasks" />
          <StatChip value={s.totalDueThisWeek} label="Due 7d"   tone={s.totalDueThisWeek > 0 ? "amber" : "neutral"} />
          <StatChip value={s.totalOverdue}     label="Overdue"  tone={s.totalOverdue > 0 ? "rose" : "neutral"} />
        </div>

        {/* Up Next task list */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5" /> Up Next
            </p>
            {hasAnyTasks && (
              <Link
                href="/projects"
                className="text-[11px] text-muted-foreground hover:text-foreground"
                data-testid="link-tasks-list"
              >
                See all tasks
              </Link>
            )}
          </div>

          {!hasAnyTasks ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center" data-testid="empty-projects-tasks">
              {hasAnyProjects ? (
                <>
                  <CircleDot className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm font-medium">Nothing due this week</p>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-3">All clear — open Projects to see your full task list.</p>
                  <Link href="/projects">
                    <Button size="sm" variant="outline" data-testid="button-open-projects-empty">
                      Browse projects
                    </Button>
                  </Link>
                </>
              ) : (
                <>
                  <Briefcase className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm font-medium">No projects yet</p>
                  <p className="text-xs text-muted-foreground mt-0.5 mb-3">Create your first project to start organizing your work.</p>
                  <Link href="/projects">
                    <Button size="sm" data-testid="button-create-first-project">
                      <Plus className="h-3.5 w-3.5 mr-1" /> New Project
                    </Button>
                  </Link>
                </>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden bg-background/40">
              {grouped.map((g, gi) => (
                <div key={g.section}>
                  <div className={`px-3 py-1.5 text-[10px] uppercase tracking-wide font-bold border-b border-border bg-muted/30 ${g.tone}`}>
                    {g.section} · {g.items.length}
                  </div>
                  <ul className={`${gi < grouped.length - 1 ? "border-b border-border" : ""}`}>
                    {g.items.map(t => {
                      const due = t.dueDate ? new Date(t.dueDate) : null;
                      const b = bucketTask(t, tz);
                      const dueClasses =
                        b === "overdue" ? "text-rose-700 dark:text-rose-300 bg-rose-500/10" :
                        b === "today"   ? "text-amber-700 dark:text-amber-300 bg-amber-500/10" :
                        b === "week"    ? "text-sky-700 dark:text-sky-300 bg-sky-500/10" :
                        "text-muted-foreground bg-muted";
                      return (
                        <li key={t.id} className="border-b border-border last:border-b-0">
                          <Link href={`/projects/${t.projectId}`}>
                            <div className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors group" data-testid={`hero-task-${t.id}`}>
                              <CircleDot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{t.title}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: t.projectColor }} aria-hidden="true" />
                                  <p className="text-[11px] text-muted-foreground truncate">{t.projectName}</p>
                                </div>
                              </div>
                              {due && (
                                <span className={`text-[10px] font-semibold uppercase tracking-wide tabular-nums px-1.5 py-0.5 rounded shrink-0 ${dueClasses}`}>
                                  <CalendarClock className="h-2.5 w-2.5 inline mr-0.5" />
                                  {formatTaskDue(due, tz)}
                                </span>
                              )}
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top projects strip */}
        {s.projects.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Top projects</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {s.projects.slice(0, 3).map(p => {
                const pct = p.totalTasks > 0 ? Math.round((p.doneTasks / p.totalTasks) * 100) : 0;
                return (
                  <Link key={p.id} href={`/projects/${p.id}`}>
                    <div className="rounded-md border border-border p-2.5 hover:bg-muted/40 transition-colors cursor-pointer group" data-testid={`hero-project-${p.id}`}>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: p.color }} />
                        <p className="text-sm font-medium truncate flex-1">{p.name}</p>
                        <span className="text-[10px] text-muted-foreground tabular-nums">{p.openTasks} open</span>
                      </div>
                      <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full transition-all" style={{ width: `${pct}%`, background: p.color }} />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Email Health (Reputation + Placement) ───────────────────────────────────
function EmailHealthTile({
  reputation,
  primaryDomain,
  repTone,
  placement,
}: {
  reputation: ReputationStatus | undefined;
  primaryDomain: PostmasterDomain | null;
  repTone: ReturnType<typeof reputationTone>;
  placement: { primary: number; total: number; checkedAt: string | null } | null;
}) {
  return (
    <Tile accent="bg-emerald-500" testId="card-email-health">
      <TileTitle icon={ShieldCheck} title="Email Health" accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" />

      {/* Sender Reputation */}
      <div className="mt-4 rounded-lg border border-border bg-background/40 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${repTone.dot} ${reputation?.connected ? "animate-pulse" : ""}`} />
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Sender Reputation</p>
          </div>
          <Link
            href="/email-tools/sender-reputation"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            Open <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {reputation?.connected ? (
          <div className="mt-2">
            <p className="text-[11px] text-muted-foreground mb-2">
              {reputation.lastSyncedAt ? `Synced ${timeAgo(new Date(reputation.lastSyncedAt))}` : "Awaiting sync"}
            </p>
            <div className="space-y-1.5">
              {(reputation.domains ?? []).slice(0, 10).map(d => {
                const tone = reputationTone(d.latestReputation);
                const isDefault = d.domainName === localStorage.getItem("postmaster_default_domain");
                return (
                  <div key={d.domainName} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${tone.dot}`} />
                      <span className="text-xs text-foreground truncate">{d.domainName}</span>
                      {isDefault && <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400 flex-shrink-0" />}
                    </div>
                    <span className={`text-xs font-semibold flex-shrink-0 ${tone.color}`}>{tone.label}</span>
                  </div>
                );
              })}
            </div>
            {(reputation.domains?.length ?? 0) > 10 && (
              <Link
                href="/email-tools/sender-reputation"
                className="text-[11px] text-muted-foreground hover:text-foreground mt-2 block"
                data-testid="link-more-domains"
              >
                +{reputation.domains.length - 10} more domain{reputation.domains.length - 10 !== 1 ? "s" : ""} →
              </Link>
            )}
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Not connected. Link Google Postmaster.</p>
            <Link href="/email-tools/sender-reputation">
              <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-connect-postmaster">
                Connect
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Placement */}
      <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Inbox className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Inbox Placement</p>
          </div>
          <Link
            href="/email-tools/inbox-analyzer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
          >
            Open <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        {placement ? (
          <div className="mt-2">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">{placement.primary}</span>
                  <span className="text-muted-foreground text-base font-medium"> / {placement.total}</span>
                </p>
                <p className="text-xs text-muted-foreground">landed in primary</p>
              </div>
              <div className="text-right text-[11px] text-muted-foreground">
                {placement.checkedAt ? `Tested ${timeAgo(new Date(placement.checkedAt))}` : "Never tested"}
              </div>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${placement.total > 0 ? (placement.primary / placement.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-2">No placement test yet — run one from the Inbox Analyzer.</p>
        )}
      </div>
    </Tile>
  );
}
