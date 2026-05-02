import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import {
  Flame, Video, Mail, FileText, Search,
  TrendingUp, TrendingDown, Minus, ArrowRight,
  CheckCircle2, Circle, ChevronRight, Inbox,
  BookmarkCheck, Trophy, Target, Clock,
  Eye, BookOpen, Zap, Users, Lightbulb,
  Plus, Activity, BarChart2,
} from "lucide-react";
import type { Session, DmoEntry, EmailAnalysis, SavedTopic, Script, Topic } from "@shared/schema";

type SavedTopicWithTopic = SavedTopic & { topic: Topic };

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
  if (s >= 80) return "text-green-600 dark:text-green-400";
  if (s >= 60) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-500 dark:text-red-400";
}

function scoreBg(s: number | null | undefined) {
  if (s == null) return "bg-muted text-muted-foreground";
  if (s >= 80) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  if (s >= 60) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
  return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
}

const DMO_ACTIVITIES = [
  { key: "visionMeditation" as const,   minutesKey: "visionMinutes" as const,    target: 30, label: "Vision & Meditation",  icon: Eye,         dot: "bg-violet-500" },
  { key: "personalDevelopment" as const, minutesKey: "personalMinutes" as const,  target: 30, label: "Personal Development", icon: BookOpen,    dot: "bg-blue-500" },
  { key: "expandSkills" as const,       minutesKey: "expandMinutes" as const,     target: 60, label: "Expand Your Skills",  icon: Lightbulb,   dot: "bg-teal-500" },
  { key: "execution" as const,          minutesKey: "executionMinutes" as const,  target: 60, label: "Execution",           icon: Zap,         dot: "bg-amber-500" },
  { key: "connecting" as const,         minutesKey: "connectingMinutes" as const, target: 60, label: "Connect with People", icon: Users,       dot: "bg-red-500" },
];

function calcActivityPts(minutes: number, target: number) {
  return Math.min(5, Math.floor(minutes / (target / 5)));
}

function dmoTotalPts(entry: DmoEntry | null) {
  if (!entry) return 0;
  return DMO_ACTIVITIES.reduce((sum, a) => sum + calcActivityPts((entry[a.minutesKey] as number) ?? 0, a.target), 0);
}

// ─── score sparkline ─────────────────────────────────────────────────────────

function ScoreSparkline({ scores }: { scores: number[] }) {
  if (scores.length < 2) return null;
  const W = 140, H = 44, PAD = 6;
  const lo = Math.max(0, Math.min(...scores) - 10);
  const hi = Math.min(100, Math.max(...scores) + 10);
  const range = hi - lo || 1;
  const pts = scores.map((s, i) => {
    const x = PAD + (i / (scores.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((s - lo) / range) * (H - PAD * 2);
    return [x, y] as [number, number];
  });
  const trend = scores[scores.length - 1] - scores[0];
  const stroke = trend > 2 ? "#22c55e" : trend < -2 ? "#ef4444" : "#94a3b8";
  const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  return (
    <svg width={W} height={H} className="overflow-visible">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.2" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        d={`${d} L ${pts[pts.length - 1][0]} ${H} L ${pts[0][0]} ${H} Z`}
        fill="url(#spark-fill)"
      />
      <path d={d} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill={stroke} />
      ))}
    </svg>
  );
}

// ─── placement badge ──────────────────────────────────────────────────────────

function PlacementBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    primary:    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    promotions: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    social:     "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    updates:    "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
    forums:     "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    spam:       "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

// ─── activity row ─────────────────────────────────────────────────────────────

type ActivityItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  sub: string;
  score?: number | null;
  ts: Date;
  href: string;
};

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

// ─── main component ───────────────────────────────────────────────────────────

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
  const sparkScores = scoredSessions.slice(0, 7).reverse().map(s => s.scoreJson!.totalScore);
  const latestSession = sessions[0] ?? null;

  const scoredEmails = emails.filter(e => e.overallScore != null).slice(0, 10);
  const avgEmailScore = useMemo(() => {
    if (scoredEmails.length === 0) return null;
    const total = scoredEmails.reduce((s, e) => s + (e.overallScore ?? 0), 0);
    return Math.round(total / scoredEmails.length);
  }, [scoredEmails]);
  const latestEmail = emails[0] ?? null;
  const lastPlacement = useMemo(() => {
    const results = latestEmail?.receivedAt
      ? (emails.find(e => {
          // find email with placement via lastPlacementResults — not stored per email
          return false; // placeholder; placement lives on address, not email
        }) ?? null)
      : null;
    return null; // placement is on address record, not per-email
  }, [emails]);

  // ── recent activity feed ───────────────────────────────────────────────────
  const recentActivity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];

    sessions.slice(0, 4).forEach(s => {
      items.push({
        id: `session-${s.id}`,
        icon: <Video className="h-4 w-4 text-primary" />,
        label: s.title || "Untitled session",
        sub: s.scoreStatus === "final"
          ? `Video scored ${s.scoreJson?.totalScore ?? "—"}/100`
          : s.scoreStatus === "partial"
          ? "Scoring in progress"
          : "Video uploaded",
        score: s.scoreStatus === "final" ? s.scoreJson?.totalScore : null,
        ts: new Date(s.createdAt),
        href: `/video-score/${s.id}`,
      });
    });

    emails.slice(0, 3).forEach(e => {
      items.push({
        id: `email-${e.id}`,
        icon: <Mail className="h-4 w-4 text-blue-500" />,
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
        icon: <FileText className="h-4 w-4 text-green-500" />,
        label: s.title || "Untitled script",
        sub: "Script generated",
        ts: new Date(s.createdAt),
        href: "/video-trends/scripts",
      });
    });

    return items.sort((a, b) => b.ts.getTime() - a.ts.getTime()).slice(0, 6);
  }, [sessions, emails, scripts]);

  // ── header status message ──────────────────────────────────────────────────
  const statusMsg = useMemo(() => {
    if (currentStreak > 0 && todayPts === 25) {
      return `Perfect day! You're on a ${currentStreak}-day DMO streak.`;
    }
    if (currentStreak >= 7) {
      return `You're on a ${currentStreak}-day streak — don't break it today.`;
    }
    if (currentStreak > 0) {
      return `${currentStreak}-day DMO streak going — keep the momentum.`;
    }
    if (sessions.length > 0 && avgVideoScore != null) {
      return `Your average video score is ${avgVideoScore}/100. Keep practicing.`;
    }
    return "Your marketing practice hub — everything in one place.";
  }, [currentStreak, todayPts, sessions.length, avgVideoScore]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-auto bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-2 sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{todayLabel()}</p>
            <h1 className="text-3xl font-bold tracking-tight" data-testid="text-dashboard-title">
              {firstName ? `${timeGreeting()}, ${firstName}` : timeGreeting()}
            </h1>
            <p className="text-muted-foreground mt-0.5">{statusMsg}</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link href="/video-score-upload">
              <Button size="sm" data-testid="button-new-session">
                <Video className="h-4 w-4 mr-1.5" />
                Score Video
              </Button>
            </Link>
            <Link href="/dmo">
              <Button size="sm" variant="outline" data-testid="button-log-dmo">
                <Target className="h-4 w-4 mr-1.5" />
                Log DMO
              </Button>
            </Link>
          </div>
        </div>

        {/* ── Stat cards row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

          {/* DMO Streak */}
          <Link href="/dmo">
            <Card className="hover-elevate cursor-pointer h-full" data-testid="card-dmo-streak">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Flame className="h-4 w-4 text-orange-500" />
                  DMO Streak
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold tabular-nums text-orange-500">{currentStreak}</span>
                  <span className="text-muted-foreground text-sm mb-1">days</span>
                  {bestStreak > 0 && (
                    <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
                      <Trophy className="h-3 w-3" /> {bestStreak}
                    </span>
                  )}
                </div>
                {/* 5 activity dots for today */}
                <div className="flex items-center gap-1.5">
                  {DMO_ACTIVITIES.map(a => {
                    const pts = todayEntry ? calcActivityPts((todayEntry[a.minutesKey] as number) ?? 0, a.target) : 0;
                    return (
                      <div
                        key={a.key}
                        title={`${a.label}: ${pts}/5 pts`}
                        className={`h-2.5 w-2.5 rounded-full transition-colors ${pts > 0 ? a.dot : "bg-muted-foreground/20"}`}
                      />
                    );
                  })}
                  <span className="ml-auto text-xs text-muted-foreground font-medium">{todayPts}/25 today</span>
                </div>
                {todayPts < 25 && (
                  <p className="text-xs text-muted-foreground">
                    {todayPts === 0 ? "Log today's activities to extend your streak" : `${25 - todayPts} pts left for a perfect day`}
                  </p>
                )}
                {todayPts === 25 && (
                  <p className="text-xs text-green-600 dark:text-green-400 font-medium">🎉 Perfect day!</p>
                )}
              </CardContent>
            </Card>
          </Link>

          {/* Video Practice */}
          <Link href="/video-score">
            <Card className="hover-elevate cursor-pointer h-full" data-testid="card-video-stats">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Video className="h-4 w-4 text-primary" />
                  Video Practice
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold tabular-nums">{sessions.length}</span>
                  <span className="text-muted-foreground text-sm mb-1">sessions</span>
                  {avgVideoScore != null && (
                    <span className={`ml-auto text-sm font-bold mb-1 ${scoreColor(avgVideoScore)}`}>
                      avg {avgVideoScore}
                    </span>
                  )}
                </div>
                {latestSession ? (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Latest</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate flex-1">{latestSession.title || "Untitled session"}</p>
                      {latestSession.scoreStatus === "final" && latestSession.scoreJson && (
                        <span className={`text-xs font-bold shrink-0 ${scoreColor(latestSession.scoreJson.totalScore)}`}>
                          {latestSession.scoreJson.totalScore}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No sessions yet — record your first video</p>
                )}
              </CardContent>
            </Card>
          </Link>

          {/* Inbox Health */}
          <Link href="/email-tools/inbox-analyzer">
            <Card className="hover-elevate cursor-pointer h-full" data-testid="card-inbox-health">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Mail className="h-4 w-4 text-blue-500" />
                  Inbox Health
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold tabular-nums">{emails.length}</span>
                  <span className="text-muted-foreground text-sm mb-1">analyzed</span>
                  {avgEmailScore != null && (
                    <span className={`ml-auto text-sm font-bold mb-1 ${scoreColor(avgEmailScore)}`}>
                      avg {avgEmailScore}
                    </span>
                  )}
                </div>
                {latestEmail ? (
                  <div className="space-y-0.5">
                    <p className="text-xs text-muted-foreground">Latest</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-medium truncate flex-1">{latestEmail.subject || "(No subject)"}</p>
                      {latestEmail.overallScore != null && (
                        <span className={`text-xs font-bold shrink-0 ${scoreColor(latestEmail.overallScore)}`}>
                          {latestEmail.overallScore}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No emails yet — send a test to your inbox address</p>
                )}
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* ── Middle row ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Score Trend */}
          <Card className="md:col-span-2" data-testid="card-score-trend">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                  <BarChart2 className="h-4 w-4 text-primary" />
                  Video Score Trend
                </CardTitle>
                <Link href="/video-score">
                  <button className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors">
                    View all <ChevronRight className="h-3 w-3" />
                  </button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {scoredSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center">
                    <Video className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">No scored sessions yet</p>
                  <Link href="/video-score-upload">
                    <Button size="sm" variant="outline">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Record your first video
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* sparkline + trend indicator */}
                  <div className="flex items-center gap-4">
                    <ScoreSparkline scores={sparkScores} />
                    {sparkScores.length >= 2 && (() => {
                      const diff = sparkScores[sparkScores.length - 1] - sparkScores[0];
                      return (
                        <div className="flex flex-col gap-0.5">
                          <div className={`flex items-center gap-1 text-sm font-medium ${diff > 2 ? "text-green-600 dark:text-green-400" : diff < -2 ? "text-red-500" : "text-muted-foreground"}`}>
                            {diff > 2 ? <TrendingUp className="h-4 w-4" /> : diff < -2 ? <TrendingDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                            {diff > 2 ? `+${diff.toFixed(0)} pts` : diff < -2 ? `${diff.toFixed(0)} pts` : "Steady"}
                          </div>
                          <p className="text-xs text-muted-foreground">vs first session</p>
                        </div>
                      );
                    })()}
                  </div>
                  {/* last 3 scored sessions */}
                  <div className="divide-y divide-border/50">
                    {scoredSessions.slice(0, 3).map(s => (
                      <Link key={s.id} href={`/video-score/${s.id}`}>
                        <div className="flex items-center gap-3 py-2 hover:bg-muted/30 rounded px-1 transition-colors cursor-pointer" data-testid={`row-session-${s.id}`}>
                          <div className="h-7 w-7 rounded bg-primary/10 flex items-center justify-center shrink-0">
                            <Video className="h-3.5 w-3.5 text-primary" />
                          </div>
                          <span className="text-sm truncate flex-1 font-medium">{s.title || "Untitled session"}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{timeAgo(new Date(s.createdAt))}</span>
                          <span className={`text-sm font-bold shrink-0 tabular-nums ${scoreColor(s.scoreJson?.totalScore)}`}>
                            {s.scoreJson?.totalScore}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Content Pipeline */}
          <Card data-testid="card-content-pipeline">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                Content Pipeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Topics */}
              <Link href="/video-trends">
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer group">
                  <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                    <BookmarkCheck className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-2xl font-bold tabular-nums">{savedTopics.length}</span>
                      <span className="text-xs text-muted-foreground mt-1">saved topics</span>
                    </div>
                    {savedTopics[0] && (
                      <p className="text-xs text-muted-foreground truncate">{savedTopics[0].topic.topicTitle}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </div>
              </Link>

              <div className="border-t border-border/50" />

              {/* Scripts */}
              <Link href="/video-trends/scripts">
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer group">
                  <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
                    <FileText className="h-4.5 w-4.5 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-2xl font-bold tabular-nums">{scripts.length}</span>
                      <span className="text-xs text-muted-foreground mt-1">scripts</span>
                    </div>
                    {scripts[0] && (
                      <p className="text-xs text-muted-foreground truncate">{scripts[0].title}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                </div>
              </Link>

              {savedTopics.length === 0 && scripts.length === 0 && (
                <div className="pt-2 text-center">
                  <Link href="/video-trends">
                    <Button size="sm" variant="outline" className="w-full">
                      <Search className="h-3.5 w-3.5 mr-1.5" />
                      Research a topic
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Bottom row ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Recent Activity */}
          <Card className="md:col-span-2" data-testid="card-recent-activity">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-muted-foreground" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                  <p className="text-sm text-muted-foreground">No activity yet — dive into a tool to get started</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {recentActivity.map(item => (
                    <Link key={item.id} href={item.href}>
                      <div className="flex items-center gap-3 py-2.5 px-1 hover:bg-muted/30 rounded transition-colors cursor-pointer group">
                        <div className="h-7 w-7 rounded-full bg-muted/50 flex items-center justify-center shrink-0">
                          {item.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.label}</p>
                          <p className="text-xs text-muted-foreground">{item.sub}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.score != null && (
                            <span className={`text-xs font-bold tabular-nums ${scoreColor(item.score)}`}>{item.score}</span>
                          )}
                          <span className="text-xs text-muted-foreground">{timeAgo(item.ts)}</span>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card data-testid="card-quick-actions">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-yellow-500" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/video-score-upload" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start" data-testid="action-score-video">
                  <Video className="h-4 w-4 mr-2 text-primary" />
                  Score a Video
                </Button>
              </Link>
              <Link href="/dmo" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start" data-testid="action-log-dmo">
                  <Target className="h-4 w-4 mr-2 text-orange-500" />
                  Log DMO
                </Button>
              </Link>
              <Link href="/email-tools/inbox-analyzer" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start" data-testid="action-inbox-analyzer">
                  <Mail className="h-4 w-4 mr-2 text-blue-500" />
                  Inbox Analyzer
                </Button>
              </Link>
              <Link href="/video-trends" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start" data-testid="action-research-topics">
                  <Search className="h-4 w-4 mr-2 text-teal-500" />
                  Research Topics
                </Button>
              </Link>
              <Link href="/video-trends/scripts" className="block">
                <Button variant="outline" size="sm" className="w-full justify-start" data-testid="action-scripts">
                  <FileText className="h-4 w-4 mr-2 text-green-500" />
                  View Scripts
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
