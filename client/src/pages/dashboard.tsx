import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import {
  Flame, Video, Mail, FileText, Search,
  TrendingUp, TrendingDown, ArrowRight,
  ChevronRight, Inbox, Trophy, Target,
  Eye, BookOpen, Zap, Users, Lightbulb,
  Plus, Activity, Radar, ShieldCheck, AlertTriangle,
  Sparkles, BarChart3, GitCompare,
} from "lucide-react";
import type {
  Session, DmoEntry, EmailAnalysis, SavedTopic, Script, Topic,
  InsightsResponse, AnomalyEvent, PostmasterDomain,
} from "@shared/schema";

type SavedTopicWithTopic = SavedTopic & { topic: Topic };

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

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
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

/** A vivid, bordered tile with a top accent gradient bar. The cornerstone of the new look. */
function GradientTile({
  accent,
  children,
  href,
  testId,
  className = "",
}: {
  accent: string; // tailwind gradient classes like "from-violet-500 to-fuchsia-500"
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
      {/* top accent bar */}
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent}`} />
      {/* corner glow */}
      <div className={`pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-gradient-to-br ${accent} opacity-10 blur-2xl`} />
      <CardContent className="relative pt-5 pb-5">{children}</CardContent>
    </Card>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

function TileTitle({ icon: Icon, title, accent, badge }: { icon: React.ComponentType<{ className?: string }>; title: string; accent: string; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`h-7 w-7 rounded-lg bg-gradient-to-br ${accent} flex items-center justify-center shadow-sm`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      {badge}
    </div>
  );
}

function GradientNumber({ children, accent, className = "" }: { children: React.ReactNode; accent: string; className?: string }) {
  return (
    <span
      className={`bg-gradient-to-br ${accent} bg-clip-text text-transparent tabular-nums font-bold ${className}`}
    >
      {children}
    </span>
  );
}

function MiniStat({ value, label, accent }: { value: number | string; label: string; accent: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <GradientNumber accent={accent} className="text-2xl">{value}</GradientNumber>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.firstName || user?.displayName?.split(" ")[0] || "";

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
  const { data: savedTopics = [] } = useQuery<SavedTopicWithTopic[]>({
    queryKey: ["/api/topic-pulse/saved-topics"],
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

  // ── derived values ─────────────────────────────────────────────────────────
  const todayEntry = dmoToday?.entry ?? null;
  const todayPts = dmoTotalPts(todayEntry);
  const currentStreak = streak?.current ?? 0;
  const bestStreak = streak?.best ?? 0;

  const scoredSessions = useMemo(
    () => sessions.filter(s => s.scoreJson != null && s.scoreStatus === "final").slice(0, 10),
    [sessions]
  );
  const avgVideoScore = useMemo(() => {
    if (scoredSessions.length === 0) return null;
    const total = scoredSessions.reduce((s, sess) => s + (sess.scoreJson?.totalScore ?? 0), 0);
    return Math.round(total / scoredSessions.length);
  }, [scoredSessions]);
  const latestSession = sessions[0] ?? null;

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

  // Sender reputation: pick "best" / first domain
  const primaryDomain = useMemo(() => reputation?.domains?.[0] ?? null, [reputation]);
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

  // ── recent activity (now includes inbox-intel anomalies) ───────────────────
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
    sessions.slice(0, 4).forEach(s => {
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

  // ── header status message ──────────────────────────────────────────────────
  const headerKpis = useMemo(() => {
    return [
      {
        label: "DMO points today",
        value: `${todayPts}/25`,
        accent: "from-amber-500 to-orange-500",
      },
      {
        label: "Videos scored",
        value: scoredSessions.length,
        accent: "from-rose-500 to-red-500",
      },
      {
        label: "Competitor emails this week",
        value: insights?.totalEmails7d ?? 0,
        accent: "from-violet-500 to-fuchsia-500",
      },
      {
        label: "New alerts",
        value: insights?.anomalies?.length ?? 0,
        accent: "from-sky-500 to-cyan-500",
      },
    ];
  }, [todayPts, scoredSessions.length, insights]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-auto bg-background">
      {/* ── Hero gradient header ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-border">
        {/* layered gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(230_75%_10%)] via-[hsl(230_60%_18%)] to-[hsl(203_54%_30%)]" />
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 h-96 w-96 rounded-full bg-sky-500/25 blur-3xl" />
        <div className="absolute top-1/3 right-1/3 h-64 w-64 rounded-full bg-rose-500/20 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="text-white">
              <p className="text-xs font-medium tracking-wide uppercase text-white/70">{todayLabel()}</p>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-1" data-testid="text-dashboard-title">
                {firstName ? `${timeGreeting()}, ${firstName}` : timeGreeting()}
              </h1>
              <p className="text-white/80 mt-1 text-sm">
                Your private marketing command center — every tool, one screen.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href="/video-score-upload">
                <Button size="sm" className="bg-white text-[hsl(230_75%_10%)] hover:bg-white/90 shadow-lg" data-testid="button-new-session">
                  <Video className="h-4 w-4 mr-1.5" />
                  Score Video
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
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
            {headerKpis.map((k, i) => (
              <div
                key={i}
                className="rounded-xl bg-white/10 backdrop-blur-md ring-1 ring-white/15 px-4 py-3"
                data-testid={`kpi-${i}`}
              >
                <p className="text-[10px] uppercase tracking-wider text-white/70 font-medium">{k.label}</p>
                <p className={`mt-1 text-2xl font-bold tabular-nums text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.25)]`}>
                  {k.value}
                </p>
                <div className={`mt-1 h-0.5 w-8 rounded-full bg-gradient-to-r ${k.accent}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* ── Row 1 — Daily signals (3 vivid tiles) ────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* DMO Streak */}
          <GradientTile accent="from-amber-500 to-orange-600" href="/dmo-tracker" testId="card-dmo-streak">
            <TileTitle icon={Flame} title="DMO Streak" accent="from-amber-500 to-orange-600" />
            <div className="mt-4 flex items-end gap-2">
              <GradientNumber accent="from-amber-500 to-orange-600" className="text-5xl leading-none">{currentStreak}</GradientNumber>
              <span className="text-muted-foreground text-sm mb-1.5">days</span>
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
          </GradientTile>

          {/* Video Practice */}
          <GradientTile accent="from-rose-500 to-red-600" href="/video-score" testId="card-video-stats">
            <TileTitle icon={Video} title="Video Practice" accent="from-rose-500 to-red-600" />
            <div className="mt-4 flex items-end gap-2">
              <GradientNumber accent="from-rose-500 to-red-600" className="text-5xl leading-none">{sessions.length}</GradientNumber>
              <span className="text-muted-foreground text-sm mb-1.5">sessions</span>
              {avgVideoScore != null && (
                <span className={`ml-auto text-xs font-bold mb-1.5 px-2 py-0.5 rounded-full bg-muted ${scoreColor(avgVideoScore)}`}>
                  avg {avgVideoScore}
                </span>
              )}
            </div>
            <div className="mt-4 min-h-[34px]">
              {latestSession ? (
                <>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">Latest</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-sm font-medium truncate flex-1">{latestSession.title || "Untitled session"}</p>
                    {latestSession.scoreStatus === "final" && latestSession.scoreJson && (
                      <span className={`text-xs font-bold shrink-0 ${scoreColor(latestSession.scoreJson.totalScore)}`}>
                        {latestSession.scoreJson.totalScore}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">No sessions yet — record your first video.</p>
              )}
            </div>
          </GradientTile>

          {/* Inbox Analyzer */}
          <GradientTile accent="from-sky-500 to-blue-600" href="/email-tools/inbox-analyzer" testId="card-inbox-health">
            <TileTitle
              icon={Mail}
              title="Inbox Analyzer"
              accent="from-sky-500 to-blue-600"
              badge={hasNewEmail ? <Badge className="h-4 px-1.5 text-[10px] leading-none bg-sky-500 hover:bg-sky-500 text-white border-0 rounded-full ml-auto">New</Badge> : undefined}
            />
            <div className="mt-4 flex items-end gap-2">
              <GradientNumber accent="from-sky-500 to-blue-600" className="text-5xl leading-none">{emails.length}</GradientNumber>
              <span className="text-muted-foreground text-sm mb-1.5">analyzed</span>
              {avgEmailScore != null && (
                <span className={`ml-auto text-xs font-bold mb-1.5 px-2 py-0.5 rounded-full bg-muted ${scoreColor(avgEmailScore)}`}>
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
          </GradientTile>
        </div>

        {/* ── Row 2 — Competitor Pulse + Email Health ──────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Competitor Pulse (Inbox Intel) */}
          <GradientTile accent="from-violet-500 via-fuchsia-500 to-pink-500" testId="card-competitor-pulse">
            <div className="flex items-start justify-between gap-2">
              <TileTitle icon={Radar} title="Competitor Pulse" accent="from-violet-500 to-fuchsia-500" />
              <Link href="/email-tools/inbox-intel">
                <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors" data-testid="link-pulse-open">
                  Open <ChevronRight className="h-3 w-3" />
                </button>
              </Link>
            </div>

            {/* topline counts */}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <MiniStat value={insights?.activeTrackerCount ?? 0} label="Active" accent="from-violet-500 to-fuchsia-500" />
              <MiniStat value={insights?.totalEmails7d ?? 0} label="7-day" accent="from-fuchsia-500 to-pink-500" />
              <MiniStat value={insights?.totalEmails30d ?? 0} label="30-day" accent="from-pink-500 to-rose-500" />
              <Link href="/email-tools/inbox-intel/compare" className="ml-auto">
                <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-compare">
                  <GitCompare className="h-3 w-3 mr-1" /> Compare
                </Button>
              </Link>
            </div>

            {/* anomalies */}
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Alerts</p>
              {insights?.anomalies && insights.anomalies.length > 0 ? (
                <div className="space-y-1.5">
                  {insights.anomalies.slice(0, 3).map(a => {
                    const meta = ANOMALY_META[a.type];
                    return (
                      <Link key={a.id} href={`/email-tools/inbox-intel/${a.trackerId}`}>
                        <div className={`flex items-center gap-2.5 rounded-lg p-2 ring-1 ${meta.bg} ${meta.ring} hover:brightness-105 transition-all cursor-pointer`} data-testid={`anomaly-${a.id}`}>
                          <meta.icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-semibold truncate">{a.trackerName}</span>
                              <span className={`text-[10px] uppercase tracking-wide font-bold ${meta.color}`}>{meta.label}</span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{a.message}</p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2">All quiet — no anomalies detected this week.</p>
              )}
            </div>

            {/* leaderboard */}
            {insights?.leaderboard && insights.leaderboard.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Top sends · last 7 days</p>
                <div className="space-y-1">
                  {insights.leaderboard.slice(0, 3).map((l, idx) => (
                    <Link key={l.trackerId} href={`/email-tools/inbox-intel/${l.trackerId}`}>
                      <div className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors cursor-pointer" data-testid={`leader-${idx}`}>
                        <span className={`h-5 w-5 rounded-full text-[10px] font-bold flex items-center justify-center ${idx === 0 ? "bg-gradient-to-br from-amber-400 to-yellow-600 text-white" : idx === 1 ? "bg-muted text-foreground" : "bg-muted/60 text-muted-foreground"}`}>{idx + 1}</span>
                        <span className="text-sm font-medium truncate flex-1">{l.trackerName}</span>
                        <span className="text-sm font-bold tabular-nums">{l.count7d}</span>
                        {l.pctChange != null && (
                          <span className={`text-[11px] font-medium tabular-nums w-12 text-right ${l.pctChange > 0 ? "text-emerald-500" : l.pctChange < 0 ? "text-rose-500" : "text-muted-foreground"}`}>
                            {l.pctChange > 0 ? "+" : ""}{l.pctChange}%
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {(insights?.totalTrackers ?? 0) === 0 && (
              <div className="mt-4 rounded-lg border border-dashed border-violet-500/30 bg-violet-500/5 p-3 text-center">
                <p className="text-xs text-muted-foreground mb-2">No trackers yet — set one up to start watching the competition.</p>
                <Link href="/email-tools/inbox-intel">
                  <Button size="sm" variant="outline" data-testid="button-create-tracker">
                    <Plus className="h-3.5 w-3.5 mr-1" /> Track a competitor
                  </Button>
                </Link>
              </div>
            )}
          </GradientTile>

          {/* Email Health (Reputation + Placement) */}
          <GradientTile accent="from-emerald-500 via-teal-500 to-cyan-500" testId="card-email-health">
            <div className="flex items-start justify-between gap-2">
              <TileTitle icon={ShieldCheck} title="Email Health" accent="from-emerald-500 to-teal-500" />
            </div>

            {/* Sender Reputation block */}
            <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${repTone.dot} ${reputation?.connected ? "animate-pulse" : ""}`} />
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Sender Reputation</p>
                </div>
                <Link href="/email-tools/sender-reputation">
                  <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                    Open <ChevronRight className="h-3 w-3" />
                  </button>
                </Link>
              </div>
              {reputation?.connected ? (
                <div className="mt-2 flex items-end justify-between gap-3">
                  <div>
                    <p className={`text-2xl font-bold ${repTone.color}`}>{repTone.label}</p>
                    {primaryDomain?.domainName && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{primaryDomain.domainName}</p>
                    )}
                  </div>
                  <div className="text-right text-[11px] text-muted-foreground">
                    {reputation.lastSyncedAt ? `Synced ${timeAgo(new Date(reputation.lastSyncedAt))}` : "Awaiting sync"}
                    {(reputation.domains?.length ?? 0) > 1 && (
                      <p className="mt-0.5">{reputation.domains.length} domains</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Not connected. Link Google Postmaster to track domain trust.</p>
                  <Link href="/email-tools/sender-reputation">
                    <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-connect-postmaster">
                      Connect
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Placement block */}
            <div className="mt-3 rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Inbox className="h-3.5 w-3.5 text-cyan-500" />
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Inbox Placement</p>
                </div>
                <Link href="/email-tools/inbox-analyzer">
                  <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5">
                    Open <ChevronRight className="h-3 w-3" />
                  </button>
                </Link>
              </div>
              {placement ? (
                <div className="mt-2">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-2xl font-bold tabular-nums">
                        <GradientNumber accent="from-emerald-500 to-cyan-500">{placement.primary}</GradientNumber>
                        <span className="text-muted-foreground text-base font-medium"> / {placement.total}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">landed in primary</p>
                    </div>
                    <div className="text-right text-[11px] text-muted-foreground">
                      {placement.checkedAt ? `Tested ${timeAgo(new Date(placement.checkedAt))}` : "Never tested"}
                    </div>
                  </div>
                  {/* mini bar */}
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all"
                      style={{ width: `${placement.total > 0 ? (placement.primary / placement.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">No placement test yet — run one from the Inbox Analyzer.</p>
              )}
            </div>
          </GradientTile>
        </div>

        {/* ── Row 3 — Recent Activity + Quick Actions ──────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Recent Activity */}
          <GradientTile accent="from-slate-400 to-slate-600" className="lg:col-span-2" testId="card-recent-activity">
            <div className="flex items-center justify-between">
              <TileTitle icon={Activity} title="Recent Activity" accent="from-slate-500 to-slate-700" />
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
          </GradientTile>

          {/* Quick Actions */}
          <GradientTile accent="from-yellow-400 to-amber-500" testId="card-quick-actions">
            <TileTitle icon={Zap} title="Quick Actions" accent="from-yellow-400 to-amber-500" />
            <div className="mt-3 space-y-2">
              <QuickAction href="/video-score-upload" icon={Video} label="Score a Video" iconClass="text-rose-500" testId="action-score-video" />
              <QuickAction href="/dmo-tracker" icon={Target} label="Log DMO" iconClass="text-amber-500" testId="action-log-dmo" />
              <QuickAction href="/email-tools/inbox-intel" icon={Radar} label="Inbox Intel" iconClass="text-violet-500" badge={(insights?.totalTrackers ?? 0) > 0 ? String(insights?.totalTrackers ?? 0) : undefined} testId="action-inbox-intel" />
              <QuickAction href="/email-tools/inbox-analyzer" icon={Mail} label="Inbox Analyzer" iconClass="text-sky-500" testId="action-inbox-analyzer" />
              <QuickAction href="/video-trends" icon={Search} label="Research Topics" iconClass="text-teal-500" badge={savedTopics.length > 0 ? String(savedTopics.length) : undefined} testId="action-research-topics" />
              <QuickAction href="/video-trends/scripts" icon={FileText} label="View Scripts" iconClass="text-emerald-500" badge={scripts.length > 0 ? String(scripts.length) : undefined} testId="action-scripts" />
            </div>
          </GradientTile>
        </div>

      </div>
    </div>
  );
}

// ─── small button row used inside Quick Actions ───────────────────────────────
function QuickAction({
  href, icon: Icon, label, iconClass, badge, testId,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  iconClass: string;
  badge?: string;
  testId?: string;
}) {
  return (
    <Link href={href} className="block">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 px-3 py-2 hover-elevate cursor-pointer group" data-testid={testId}>
        <Icon className={`h-4 w-4 ${iconClass}`} />
        <span className="text-sm font-medium flex-1">{label}</span>
        {badge && (
          <span className="text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{badge}</span>
        )}
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}
