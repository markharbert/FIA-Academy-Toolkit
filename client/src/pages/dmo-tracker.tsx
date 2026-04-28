import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Flame,
  Trophy,
  CalendarCheck,
  Eye,
  BookOpen,
  Lightbulb,
  Zap,
  Users,
  Play,
  Pause,
  Square,
  CheckCircle2,
  Star,
} from "lucide-react";
import type { DmoEntry } from "@shared/schema";

// ─── Activity definitions ────────────────────────────────────────────────────

const DMO_ACTIVITIES = [
  {
    key: "visionMeditation" as const,
    minutesKey: "visionMinutes" as const,
    label: "Vision & Meditation",
    tagline: "Get quiet. Visualise where you're going.",
    description: "Shut out the noise. Write your objectives, plan your strategy, see your future.",
    target: 30,
    icon: Eye,
    gradient: "from-violet-600 to-purple-700",
    glowColor: "shadow-violet-500/40",
    borderActive: "border-violet-400",
    bgActive: "bg-violet-950/20",
    timerColor: "text-violet-300",
    startBg: "bg-violet-600 hover:bg-violet-500",
    quote: "It is the set of the sails, not the direction of the wind that determines which way we will go. — Jim Rohn",
  },
  {
    key: "personalDevelopment" as const,
    minutesKey: "personalMinutes" as const,
    label: "Personal Development",
    tagline: "Read, listen, grow. Invest in yourself.",
    description: "Training audios, books, spiritual growth, live events, coaching.",
    target: 30,
    icon: BookOpen,
    gradient: "from-blue-600 to-cyan-600",
    glowColor: "shadow-blue-500/40",
    borderActive: "border-blue-400",
    bgActive: "bg-blue-950/20",
    timerColor: "text-blue-300",
    startBg: "bg-blue-600 hover:bg-blue-500",
    quote: "Personal development is a major time-saver. The better you become, the less time it takes to achieve your goals. — Brian Tracy",
  },
  {
    key: "expandSkills" as const,
    minutesKey: "expandMinutes" as const,
    label: "Expand Your Skills",
    tagline: "Self-education will make you a fortune.",
    description: "Traffic, ads, content creation, video marketing, prospecting, copywriting.",
    target: 60,
    icon: Lightbulb,
    gradient: "from-teal-500 to-emerald-600",
    glowColor: "shadow-teal-500/40",
    borderActive: "border-teal-400",
    bgActive: "bg-teal-950/20",
    timerColor: "text-teal-300",
    startBg: "bg-teal-600 hover:bg-teal-500",
    quote: "Formal education will make you a living; self-education will make you a fortune. — Jim Rohn",
  },
  {
    key: "execution" as const,
    minutesKey: "executionMinutes" as const,
    label: "Execution",
    tagline: "After you consume — CREATE.",
    description: "Post, make a video, run an ad, write a podcast, do a webinar. Show up consistently.",
    target: 60,
    icon: Zap,
    gradient: "from-amber-500 to-orange-600",
    glowColor: "shadow-amber-500/40",
    borderActive: "border-amber-400",
    bgActive: "bg-amber-950/20",
    timerColor: "text-amber-300",
    startBg: "bg-amber-500 hover:bg-amber-400",
    quote: "You don't get paid for the hour. You get paid for the value you bring to the hour. — Jim Rohn",
  },
  {
    key: "connecting" as const,
    minutesKey: "connectingMinutes" as const,
    label: "Connect with People",
    tagline: "This is your money activity.",
    description: "Messenger, DMs, Zoom, phone calls, comments on posts. Connect with your audience every day.",
    target: 60,
    icon: Users,
    gradient: "from-red-600 to-rose-700",
    glowColor: "shadow-red-500/40",
    borderActive: "border-red-400",
    bgActive: "bg-red-950/20",
    timerColor: "text-red-300",
    startBg: "bg-red-600 hover:bg-red-500",
    quote: "To be interesting, be interested. — Dale Carnegie",
  },
] as const;

const STREAK_MILESTONES = [
  { days: 3,  label: "3-Day Spark",     icon: "⚡" },
  { days: 7,  label: "7-Day Flame",     icon: "🔥" },
  { days: 14, label: "2-Week Warrior",  icon: "💪" },
  { days: 21, label: "21-Day Habit",    icon: "🏆" },
  { days: 30, label: "30-Day Champion", icon: "👑" },
  { days: 60, label: "60-Day Legend",   icon: "🌟" },
  { days: 90, label: "90-Day Elite",    icon: "💎" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/** Returns 0–5 points earned based on minutes done vs target. */
function calcPoints(minutes: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(5, Math.floor(minutes / (target / 5)));
}

function getBarColor(count: number): string {
  if (count === 0) return "#1e293b";
  if (count === 1) return "#4c1d95";
  if (count === 2) return "#1d4ed8";
  if (count === 3) return "#0d9488";
  if (count === 4) return "#d97706";
  return "#dc2626";
}

function getTodayString(): string {
  return new Date().toISOString().split("T")[0];
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Timer state per activity ─────────────────────────────────────────────────

type TimerStatus = "idle" | "running" | "paused" | "done";

interface TimerState {
  status: TimerStatus;
  elapsed: number;       // total seconds accumulated (including previously saved)
  startedAt: number | null; // Date.now() when current run started
}

// ─── Point dots ──────────────────────────────────────────────────────────────

function PointDots({
  earned,
  isFull,
  gradient,
  timerColor,
}: {
  earned: number;
  isFull: boolean;
  gradient: string;
  timerColor: string;
}) {
  return (
    <div className="flex gap-1.5 items-center" data-testid="point-dots">
      {Array.from({ length: 5 }, (_, i) => (
        <div
          key={i}
          className={`h-3 w-3 rounded-full transition-all duration-500 ${
            i < earned
              ? isFull
                ? "bg-white shadow-sm shadow-white/50"
                : `bg-gradient-to-br ${gradient} shadow-sm`
              : isFull
              ? "bg-white/20"
              : "bg-muted-foreground/20"
          }`}
        />
      ))}
    </div>
  );
}

// ─── Activity Card ────────────────────────────────────────────────────────────

interface ActivityCardProps {
  activity: typeof DMO_ACTIVITIES[number];
  savedMinutes: number;
  savedChecked: boolean;
  onSave: (minutes: number) => Promise<void>;
  isSaving: boolean;
}

function ActivityCard({ activity, savedMinutes, savedChecked, onSave, isSaving }: ActivityCardProps) {
  const Icon = activity.icon;
  const [timer, setTimer] = useState<TimerState>(() => {
    if (savedChecked || savedMinutes > 0) {
      return { status: "done", elapsed: savedMinutes * 60, startedAt: null };
    }
    return { status: "idle", elapsed: 0, startedAt: null };
  });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Live elapsed = accumulated + whatever's ticking right now
  const liveSeconds =
    timer.status === "running" && timer.startedAt
      ? timer.elapsed + Math.floor((Date.now() - timer.startedAt) / 1000)
      : timer.elapsed;

  // Tick every second while running
  useEffect(() => {
    if (timer.status === "running") {
      intervalRef.current = setInterval(() => {
        setTimer(t => ({ ...t })); // trigger re-render
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timer.status, timer.startedAt]);

  const handleStart = useCallback(() => {
    setTimer(prev => ({ ...prev, status: "running", startedAt: Date.now() }));
  }, []);

  const handlePause = useCallback(() => {
    setTimer(prev => {
      const added = prev.startedAt ? Math.floor((Date.now() - prev.startedAt) / 1000) : 0;
      return { status: "paused", elapsed: prev.elapsed + added, startedAt: null };
    });
  }, []);

  // "Add More Time" — resume from where we left off (including already-saved minutes)
  const handleAddMore = useCallback(() => {
    setTimer({
      status: "running",
      elapsed: savedMinutes * 60, // anchor to what's already saved
      startedAt: Date.now(),
    });
  }, [savedMinutes]);

  const handleDone = useCallback(async () => {
    const added = timer.startedAt ? Math.floor((Date.now() - timer.startedAt) / 1000) : 0;
    const totalSeconds = timer.elapsed + added;
    const totalMinutes = Math.max(1, Math.round(totalSeconds / 60));
    setTimer({ status: "done", elapsed: totalSeconds, startedAt: null });
    await onSave(totalMinutes);
  }, [timer, onSave]);

  const isDone = timer.status === "done";
  const isRunning = timer.status === "running";
  const isPaused = timer.status === "paused";
  const isIdle = timer.status === "idle";

  const targetPct = Math.min(100, Math.round((liveSeconds / (activity.target * 60)) * 100));

  // Points: 0–5 based on live time vs target
  const liveMinutes = liveSeconds / 60;
  const pointsEarned = calcPoints(liveMinutes, activity.target);
  const isFull = pointsEarned >= 5;

  return (
    // Outer wrapper — pulsing gradient ring when running
    <div className={`relative rounded-2xl ${isRunning ? "p-[3px]" : ""}`}>
      {isRunning && (
        <div
          className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${activity.gradient} animate-pulse`}
          style={{ opacity: 0.7 }}
        />
      )}
    <div
      className={`relative rounded-2xl border-2 transition-all duration-500 overflow-hidden ${
        isDone && isFull
          ? `border-transparent bg-gradient-to-br ${activity.gradient} shadow-xl ${activity.glowColor} shadow-lg`
          : isDone && !isFull
          ? `${activity.borderActive} ${activity.bgActive}`
          : isRunning
          ? `border-transparent ${activity.bgActive}`
          : isPaused
          ? `${activity.borderActive} ${activity.bgActive} opacity-90`
          : "border-border bg-card hover:border-border/80"
      }`}
    >
      {/* Animated top progress bar */}
      {(isRunning || isPaused || isDone) && (
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-white/10">
          <div
            className={`h-full transition-all duration-1000 ${isRunning ? "animate-pulse" : ""}`}
            style={{
              width: `${isDone ? 100 : targetPct}%`,
              background: isDone ? "rgba(255,255,255,0.6)" : `hsl(var(--primary))`,
            }}
          />
        </div>
      )}

      <div className="p-6">
        <div className="flex items-start justify-between gap-4">
          {/* Left: icon + text */}
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div
              className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br ${activity.gradient} shadow-md`}
            >
              <Icon className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={`font-bold text-base ${isDone && isFull ? "text-white" : "text-foreground"}`}>
                  {activity.label}
                </h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    isDone && isFull ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  Goal: {activity.target} min
                </span>
              </div>
              <p className={`text-sm mt-0.5 font-medium ${isDone && isFull ? "text-white/90" : "text-muted-foreground"}`}>
                {activity.tagline}
              </p>
              <p className={`text-xs mt-1 leading-relaxed ${isDone && isFull ? "text-white/70" : "text-muted-foreground/70"}`}>
                {activity.description}
              </p>
            </div>
          </div>

          {/* Right: timer + controls */}
          <div className="shrink-0 flex flex-col items-end gap-3">
            {/* Timer display */}
            <div
              className={`text-3xl font-mono font-bold tabular-nums transition-all ${
                isDone && isFull
                  ? "text-white"
                  : isDone && !isFull
                  ? activity.timerColor
                  : isRunning
                  ? activity.timerColor
                  : "text-foreground/40"
              }`}
              data-testid={`timer-display-${activity.key}`}
            >
              {isDone && savedMinutes > 0 && timer.status === "done" && timer.elapsed === 0
                ? `${savedMinutes.toString().padStart(2, "0")}:00`
                : formatTimer(liveSeconds)}
            </div>

            {/* Point dots — shown whenever any time has been logged */}
            {(isDone || isRunning || isPaused) && (
              <PointDots
                earned={pointsEarned}
                isFull={isFull}
                gradient={activity.gradient}
                timerColor={activity.timerColor}
              />
            )}

            {/* Controls */}
            <div className="flex items-center gap-2">
              {isDone ? (
                <>
                  <div className="flex items-center gap-1.5">
                    {isFull ? (
                      <CheckCircle2 className="h-4 w-4 text-white" />
                    ) : null}
                    <span className={`text-sm font-bold ${isFull ? "text-white" : activity.timerColor}`}>
                      {pointsEarned}/5 pts
                    </span>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleAddMore}
                    className={`h-8 px-3 text-xs border ${
                      isFull
                        ? "bg-white/20 hover:bg-white/30 text-white border-white/30"
                        : `${activity.startBg} text-white border-transparent`
                    }`}
                    data-testid={`button-dmo-addmore-${activity.key}`}
                  >
                    <Play className="h-3 w-3 mr-1 fill-white" />
                    {isFull ? "Add More" : "Keep Going"}
                  </Button>
                </>
              ) : isIdle ? (
                <Button
                  onClick={handleStart}
                  className={`h-9 px-5 text-sm font-semibold text-white shadow-md ${activity.startBg}`}
                  data-testid={`button-dmo-start-${activity.key}`}
                >
                  <Play className="h-4 w-4 mr-1.5 fill-white" />
                  Start
                </Button>
              ) : (
                <div className="flex gap-2">
                  {isRunning ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePause}
                      className={`h-9 px-3 border-2 ${activity.borderActive}`}
                      data-testid={`button-dmo-pause-${activity.key}`}
                    >
                      <Pause className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={handleStart}
                      className={`h-9 px-3 text-white ${activity.startBg}`}
                      data-testid={`button-dmo-resume-${activity.key}`}
                    >
                      <Play className="h-4 w-4 fill-white" />
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleDone}
                    disabled={isSaving}
                    className="h-9 px-4 bg-green-600 hover:bg-green-500 text-white font-semibold"
                    data-testid={`button-dmo-done-${activity.key}`}
                  >
                    <Square className="h-3.5 w-3.5 mr-1 fill-white" />
                    Done
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Quote — visible only when idle/done */}
        {(isIdle || isDone) && (
          <p className={`mt-4 text-xs italic border-t pt-3 ${
            isDone && isFull
              ? "text-white/50 border-white/20"
              : "text-muted-foreground/50 border-border"
          }`}>
            "{activity.quote}"
          </p>
        )}

        {/* Running pulse indicator */}
        {isRunning && (
          <div className="mt-4 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
            </span>
            <span className={`text-xs font-medium ${activity.timerColor}`}>
              Timer running — stay focused!
            </span>
            <span className={`ml-auto text-xs ${activity.timerColor} opacity-60`}>
              {targetPct}% of goal
            </span>
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

// ─── Custom chart tooltip ─────────────────────────────────────────────────────

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload?.length) {
    return (
      <div className="bg-sidebar text-white rounded-lg px-3 py-2 text-xs shadow-xl border border-sidebar-border">
        <p className="font-medium">{label}</p>
        <p className="text-white/70">{payload[0].value} of 5 activities</p>
      </div>
    );
  }
  return null;
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DmoTrackerPage() {
  const { toast } = useToast();
  const today = getTodayString();
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);

  const { data: todayData, isLoading: todayLoading } = useQuery<{ entry: DmoEntry | null; date: string }>({
    queryKey: ["/api/dmo/today"],
  });

  const { data: streak } = useQuery<{ current: number; best: number; totalDays: number }>({
    queryKey: ["/api/dmo/streak"],
  });

  const { data: history } = useQuery<DmoEntry[]>({
    queryKey: ["/api/dmo/history"],
  });

  useEffect(() => {
    if (todayData?.entry?.notes) {
      setNotes(todayData.entry.notes);
    }
  }, [todayData]);

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiRequest("POST", "/api/dmo/entry", { date: today, ...data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dmo/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dmo/streak"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dmo/history"] });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const handleActivitySave = useCallback(async (
    key: typeof DMO_ACTIVITIES[number]["key"],
    minutesKey: typeof DMO_ACTIVITIES[number]["minutesKey"],
    minutes: number
  ) => {
    await saveMutation.mutateAsync({ [key]: true, [minutesKey]: minutes });
    toast({
      title: "Activity saved! 🎯",
      description: `${minutes} min logged. Keep it up!`,
    });
  }, [saveMutation, toast]);

  const handleSaveNotes = () => {
    saveMutation.mutate({ notes });
    setNotesDirty(false);
    toast({ title: "Notes saved." });
  };

  const entry = todayData?.entry;
  const completedToday = DMO_ACTIVITIES.filter(a => entry?.[a.key]).length;

  // Point-based scoring: each activity worth 5 pts, 25 pts max
  const totalPoints = DMO_ACTIVITIES.reduce((sum, a) => {
    const mins = entry?.[a.minutesKey] ?? 0;
    return sum + calcPoints(mins, a.target);
  }, 0);
  const isPerfectDay = totalPoints >= 25;
  const completionPct = Math.round((totalPoints / 25) * 100);

  // Build 30-day chart data
  const chartData = (() => {
    const map = new Map<string, DmoEntry>();
    (history ?? []).forEach(e => map.set(e.date, e));
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (29 - i) * 86400000);
      const dateStr = d.toISOString().split("T")[0];
      const e = map.get(dateStr);
      const count = e
        ? [e.visionMeditation, e.personalDevelopment, e.expandSkills, e.execution, e.connecting].filter(Boolean).length
        : 0;
      return { date: formatDisplayDate(dateStr), fullDate: dateStr, count };
    });
  })();

  const nextMilestone = STREAK_MILESTONES.find(m => m.days > (streak?.current ?? 0));
  const earnedMilestones = STREAK_MILESTONES.filter(m => m.days <= (streak?.current ?? 0));

  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-end justify-between gap-5">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Daily Method of Operation</h1>
            <p className="text-white/50 text-sm mt-1">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>

          {/* Points ring */}
          <div className={`flex items-center gap-4 rounded-2xl px-5 py-3 transition-all duration-500 ${
            isPerfectDay ? "bg-green-500/20 ring-1 ring-green-400/40" : "bg-white/10"
          }`}>
            <div className="relative h-14 w-14">
              <svg className="h-14 w-14 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={isPerfectDay ? "#4ade80" : "#dc2626"}
                  strokeWidth="3"
                  strokeDasharray={`${completionPct} ${100 - completionPct}`}
                  strokeLinecap="round"
                  className="transition-all duration-700"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                {completionPct}%
              </span>
            </div>
            <div>
              <p className={`font-bold text-xl leading-tight ${isPerfectDay ? "text-green-300" : "text-white"}`} data-testid="text-dmo-total-points">
                {totalPoints}<span className="text-sm font-medium opacity-60">/25</span>
              </p>
              <p className="text-white/50 text-xs">
                {isPerfectDay ? "🎉 Perfect Day!" : "pts earned today"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid xl:grid-cols-[1fr_360px] gap-8">

          {/* ── Left column: activities ── */}
          <div className="space-y-5">
            {/* Streak milestone callout */}
            {(streak?.current ?? 0) > 0 && nextMilestone && (
              <div className="flex items-center gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                <span className="text-2xl">🔥</span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    {streak?.current}-day streak!
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {nextMilestone.days - (streak?.current ?? 0)} more days → {nextMilestone.icon} {nextMilestone.label}
                  </p>
                </div>
                {earnedMilestones.length > 0 && (
                  <div className="flex gap-1">
                    {earnedMilestones.slice(-3).map(m => (
                      <span key={m.days} className="text-xl" title={m.label}>{m.icon}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Activity cards */}
            {todayLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-36 rounded-2xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {DMO_ACTIVITIES.map(activity => (
                  <ActivityCard
                    key={activity.key}
                    activity={activity}
                    savedMinutes={entry?.[activity.minutesKey] ?? 0}
                    savedChecked={entry?.[activity.key] ?? false}
                    onSave={(minutes) => handleActivitySave(activity.key, activity.minutesKey, minutes)}
                    isSaving={saveMutation.isPending}
                  />
                ))}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2 pt-2">
              <label className="text-sm font-semibold text-foreground">Daily Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setNotesDirty(true); }}
                placeholder="Wins, struggles, reflections for today..."
                className="resize-none h-24 text-sm"
                data-testid="input-dmo-notes"
              />
              {notesDirty && (
                <Button
                  onClick={handleSaveNotes}
                  disabled={saveMutation.isPending}
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  data-testid="button-dmo-save-notes"
                >
                  Save Notes
                </Button>
              )}
            </div>
          </div>

          {/* ── Right column: stats + chart + milestones ── */}
          <div className="space-y-5">
            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="border-0 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Flame className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium opacity-85">Streak</span>
                  </div>
                  <p className="text-3xl font-bold" data-testid="text-dmo-current-streak">{streak?.current ?? 0}</p>
                  <p className="text-xs opacity-60">days</p>
                </CardContent>
              </Card>

              <Card className="border-0 bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-lg">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Trophy className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium opacity-85">Best</span>
                  </div>
                  <p className="text-3xl font-bold" data-testid="text-dmo-best-streak">{streak?.best ?? 0}</p>
                  <p className="text-xs opacity-60">days</p>
                </CardContent>
              </Card>

              <Card className="border-0 bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CalendarCheck className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium opacity-85">Total Days</span>
                  </div>
                  <p className="text-3xl font-bold" data-testid="text-dmo-total-days">{streak?.totalDays ?? 0}</p>
                  <p className="text-xs opacity-60">logged</p>
                </CardContent>
              </Card>

              <Card className={`border-0 text-white shadow-lg transition-all duration-500 ${
                isPerfectDay
                  ? "bg-gradient-to-br from-green-500 to-emerald-600"
                  : "bg-gradient-to-br from-blue-600 to-cyan-600"
              }`}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Star className="h-3.5 w-3.5" />
                    <span className="text-xs font-medium opacity-85">Today</span>
                  </div>
                  <p className="text-3xl font-bold" data-testid="text-dmo-today-points">{totalPoints}<span className="text-base opacity-60">/25</span></p>
                  <p className="text-xs opacity-60">{isPerfectDay ? "perfect day! 🎉" : "pts"}</p>
                </CardContent>
              </Card>
            </div>

            {/* 30-day chart */}
            <Card className="border border-border">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-foreground">30-Day Activity</CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={chartData} barSize={6} margin={{ left: -22, right: 4 }}>
                    <XAxis dataKey="date" tick={{ fontSize: 8 }} tickLine={false} axisLine={false} interval={5} />
                    <YAxis domain={[0, 5]} tick={{ fontSize: 8 }} tickLine={false} axisLine={false} ticks={[0, 1, 2, 3, 4, 5]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {chartData.map((e, i) => (
                        <Cell key={i} fill={getBarColor(e.count)} opacity={e.fullDate === today ? 1 : 0.8} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-3 mt-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <span key={n} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <span className="inline-block w-2 h-2 rounded-sm" style={{ background: getBarColor(n) }} />
                      {n}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Milestones */}
            <Card className="border border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-foreground">Streak Milestones</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-2">
                  {STREAK_MILESTONES.map(m => {
                    const earned = (streak?.current ?? 0) >= m.days;
                    return (
                      <div
                        key={m.days}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-all ${
                          earned
                            ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800"
                            : "bg-muted/40 border border-transparent opacity-50"
                        }`}
                        data-testid={`badge-dmo-milestone-${m.days}`}
                      >
                        <span className={earned ? "" : "grayscale"}>{m.icon}</span>
                        <span className={`font-medium ${earned ? "text-amber-800 dark:text-amber-200" : "text-muted-foreground"}`}>
                          {m.label}
                        </span>
                        <span className="ml-auto text-muted-foreground">{m.days}d</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* The 5 steps card */}
            <Card className="border-0 bg-sidebar text-sidebar-foreground">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-white">The 5-Step DMO</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2.5">
                {DMO_ACTIVITIES.map(a => {
                  const Icon = a.icon;
                  return (
                    <div key={a.key} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${a.gradient} flex items-center justify-center shrink-0`}>
                        <Icon className="h-3.5 w-3.5 text-white" />
                      </div>
                      <span className="text-xs text-white/80 flex-1">{a.label}</span>
                      <span className="text-xs text-white/40">{a.target === 30 ? "30m" : "1h+"}</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
