import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Sparkles,
  ChevronDown,
  ChevronRight,
  BookText,
  RefreshCw,
  Pencil,
  Check,
  X,
  Plus,
  Minus,
  ExternalLink,
  Target,
} from "lucide-react";
import type { DmoEntry, DmoSettings } from "@shared/schema";
import { useAuth } from "@/lib/auth";

// ─── Activity definitions ────────────────────────────────────────────────────

const DMO_ACTIVITIES = [
  {
    key: "visionMeditation" as const,
    secondsKey: "visionSeconds" as const,
    settingsKey: "visionTarget" as const,
    label: "Vision & Meditation",
    tagline: "Get quiet. Visualise where you're going.",
    description: "Shut out the noise. Write your objectives, plan your strategy, see your future.",
    defaultTarget: 30,
    icon: Eye,
    gradient: "from-violet-600 to-purple-700",
    glowColor: "shadow-violet-500/40",
    borderActive: "border-violet-400",
    bgActive: "bg-violet-950/20",
    timerColor: "text-violet-700 dark:text-violet-300",
    startBg: "bg-violet-600 hover:bg-violet-500",
    quote: "It is the set of the sails, not the direction of the wind that determines which way we will go. — Jim Rohn",
  },
  {
    key: "personalDevelopment" as const,
    secondsKey: "personalSeconds" as const,
    settingsKey: "personalTarget" as const,
    label: "Personal Development",
    tagline: "Read, listen, grow. Invest in yourself.",
    description: "Training audios, books, spiritual growth, live events, coaching.",
    defaultTarget: 30,
    icon: BookOpen,
    gradient: "from-blue-600 to-cyan-600",
    glowColor: "shadow-blue-500/40",
    borderActive: "border-blue-400",
    bgActive: "bg-blue-950/20",
    timerColor: "text-blue-700 dark:text-blue-300",
    startBg: "bg-blue-600 hover:bg-blue-500",
    quote: "Personal development is a major time-saver. The better you become, the less time it takes to achieve your goals. — Brian Tracy",
  },
  {
    key: "expandSkills" as const,
    secondsKey: "expandSeconds" as const,
    settingsKey: "expandTarget" as const,
    label: "Expand Your Skills",
    tagline: "Self-education will make you a fortune.",
    description: "Traffic, ads, content creation, video marketing, prospecting, copywriting.",
    defaultTarget: 60,
    icon: Lightbulb,
    gradient: "from-teal-500 to-emerald-600",
    glowColor: "shadow-teal-500/40",
    borderActive: "border-teal-400",
    bgActive: "bg-teal-950/20",
    timerColor: "text-teal-700 dark:text-teal-300",
    startBg: "bg-teal-600 hover:bg-teal-500",
    quote: "Formal education will make you a living; self-education will make you a fortune. — Jim Rohn",
  },
  {
    key: "execution" as const,
    secondsKey: "executionSeconds" as const,
    settingsKey: "executionTarget" as const,
    label: "Execution",
    tagline: "After you consume — CREATE.",
    description: "Post, make a video, run an ad, write a podcast, do a webinar. Show up consistently.",
    defaultTarget: 60,
    icon: Zap,
    gradient: "from-amber-500 to-orange-600",
    glowColor: "shadow-amber-500/40",
    borderActive: "border-amber-400",
    bgActive: "bg-amber-950/20",
    timerColor: "text-amber-700 dark:text-amber-300",
    startBg: "bg-amber-500 hover:bg-amber-400",
    quote: "You don't get paid for the hour. You get paid for the value you bring to the hour. — Jim Rohn",
  },
  {
    key: "connecting" as const,
    secondsKey: "connectingSeconds" as const,
    settingsKey: "connectingTarget" as const,
    label: "Connect with People",
    tagline: "This is your money activity.",
    description: "Messenger, DMs, Zoom, phone calls, comments on posts. Connect with your audience every day.",
    defaultTarget: 60,
    icon: Users,
    gradient: "from-red-600 to-rose-700",
    glowColor: "shadow-red-500/40",
    borderActive: "border-red-400",
    bgActive: "bg-red-950/20",
    timerColor: "text-red-700 dark:text-red-300",
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

function parseMinsInput(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.includes(":")) {
    const [m, s] = trimmed.split(":").map(n => parseInt(n, 10) || 0);
    return Math.max(0, m * 60 + s);
  }
  return Math.max(0, (parseInt(trimmed, 10) || 0) * 60);
}

/** Returns 0–5 points earned based on seconds done vs minute-target. */
function calcPoints(seconds: number, targetMinutes: number): number {
  if (targetMinutes <= 0) return 0;
  return Math.min(5, Math.floor((seconds / 60) / (targetMinutes / 5)));
}

/** Color for a bar based on total pts (0–25). */
function getBarColor(pts: number): string {
  if (pts === 0)  return "#1e293b";
  if (pts <= 5)   return "#4c1d95";
  if (pts <= 10)  return "#1d4ed8";
  if (pts <= 15)  return "#0d9488";
  if (pts <= 20)  return "#d97706";
  if (pts <= 24)  return "#ea580c";
  return "#16a34a";
}

const BAR_LEGEND = [
  { label: "1–5",  pts:  1 },
  { label: "6–10", pts:  6 },
  { label: "11–15", pts: 11 },
  { label: "16–20", pts: 16 },
  { label: "21–24", pts: 21 },
  { label: "25 🎉", pts: 25 },
];

function getTodayString(tz?: string | null): string {
  try {
    const zone = tz || "America/New_York";
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(new Date());
  } catch {
    return new Date().toISOString().split("T")[0];
  }
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function getTotalSeconds(entry: DmoEntry): number {
  return DMO_ACTIVITIES.reduce((sum, a) => sum + (((entry[a.secondsKey] as number) ?? 0)), 0);
}

function getHeatClass(totalSeconds: number): string {
  if (totalSeconds <= 0) return "bg-muted/30 text-muted-foreground/20";
  if (totalSeconds < 1800) return "bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300";
  if (totalSeconds < 3600) return "bg-violet-200 dark:bg-violet-800/60 text-violet-800 dark:text-violet-200";
  if (totalSeconds < 7200) return "bg-violet-400 dark:bg-violet-600/80 text-white";
  if (totalSeconds < 10800) return "bg-violet-500 dark:bg-violet-500 text-white";
  return "bg-violet-700 dark:bg-violet-400 text-white";
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
  targetMinutes: number;
  savedSeconds: number;
  savedChecked: boolean;
  onSave: (seconds: number) => Promise<void>;
  onAutoSave: (seconds: number) => void;
  onGoalChange: (minutes: number) => void;
  isSaving: boolean;
}

const LS_KEY = (key: string) => `dmo-draft-${key}`;

function ActivityCard({ activity, targetMinutes, savedSeconds, savedChecked, onSave, onAutoSave, onGoalChange, isSaving }: ActivityCardProps) {
  const Icon = activity.icon;

  const [timer, setTimer] = useState<TimerState>(() => {
    if (savedChecked || savedSeconds > 0) {
      return { status: "done", elapsed: savedSeconds, startedAt: null };
    }
    try {
      const raw = localStorage.getItem(LS_KEY(activity.key));
      if (raw) {
        const draft = JSON.parse(raw) as { elapsed: number; startedAt: number; status?: string };
        if (draft.status === "running" && draft.startedAt) {
          // Timer was running when user left — restore as running so it keeps ticking
          return { status: "running", elapsed: draft.elapsed, startedAt: draft.startedAt };
        }
        const recovered = draft.elapsed + Math.floor((Date.now() - draft.startedAt) / 1000);
        return { status: "paused", elapsed: recovered, startedAt: null };
      }
    } catch { /* ignore */ }
    return { status: "idle", elapsed: 0, startedAt: null };
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Confirm-before-save state
  const [pendingSecs, setPendingSecs] = useState<number | null>(null);
  const [pendingInput, setPendingInput] = useState("");

  // Edit logged time state (in "done" mode)
  const [editingDone, setEditingDone] = useState(false);
  const [editDoneInput, setEditDoneInput] = useState("");

  // Manual entry from idle state
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualInput, setManualInput] = useState("");

  // Edit goal inline
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(targetMinutes));

  useEffect(() => { setGoalInput(String(targetMinutes)); }, [targetMinutes]);

  // Live elapsed = accumulated + whatever's ticking right now
  const liveSeconds =
    timer.status === "running" && timer.startedAt
      ? timer.elapsed + Math.floor((Date.now() - timer.startedAt) / 1000)
      : timer.elapsed;

  // Tick every second while running — also writes crash-recovery draft to localStorage
  useEffect(() => {
    if (timer.status === "running" && timer.startedAt) {
      const capturedStart = timer.startedAt;
      const capturedElapsed = timer.elapsed;
      intervalRef.current = setInterval(() => {
        try {
          localStorage.setItem(LS_KEY(activity.key), JSON.stringify({
            elapsed: capturedElapsed,
            startedAt: capturedStart,
            status: "running",
          }));
        } catch { /* ignore */ }
        setTimer(t => ({ ...t })); // trigger re-render for live time
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timer.status, timer.startedAt, timer.elapsed, activity.key]);

  // Auto-save to server every 5 s while running
  useEffect(() => {
    if (timer.status !== "running" || !timer.startedAt) return;
    const capturedElapsed = timer.elapsed;
    const capturedStart = timer.startedAt;
    const id = setInterval(() => {
      const added = Math.floor((Date.now() - capturedStart) / 1000);
      const totalSeconds = capturedElapsed + added;
      if (totalSeconds > 0) onAutoSave(totalSeconds);
    }, 5_000);
    return () => clearInterval(id);
  }, [timer.status, timer.startedAt, timer.elapsed, onAutoSave]);

  const handleStart = useCallback(() => {
    setTimer(prev => ({ ...prev, status: "running", startedAt: Date.now() }));
  }, []);

  const handlePause = useCallback(() => {
    setTimer(prev => {
      const added = prev.startedAt ? Math.floor((Date.now() - prev.startedAt) / 1000) : 0;
      return { status: "paused", elapsed: prev.elapsed + added, startedAt: null };
    });
    try { localStorage.removeItem(LS_KEY(activity.key)); } catch { /* ignore */ }
  }, [activity.key]);

  const handleAddMore = useCallback(() => {
    setTimer({
      status: "running",
      elapsed: savedSeconds,
      startedAt: Date.now(),
    });
    setEditingDone(false);
  }, [savedSeconds]);

  // "Done" — capture time and show confirmation UI instead of saving immediately
  const handleDone = useCallback(() => {
    const added = timer.startedAt ? Math.floor((Date.now() - timer.startedAt) / 1000) : 0;
    const totalSeconds = timer.elapsed + added;
    // Stop the timer, hold at current value
    setTimer({ status: "paused", elapsed: totalSeconds, startedAt: null });
    try { localStorage.removeItem(LS_KEY(activity.key)); } catch { /* ignore */ }
    // Pre-fill confirmation with mm:ss format
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    setPendingInput(s > 0 ? `${m}:${String(s).padStart(2, "0")}` : String(m));
    setPendingSecs(totalSeconds);
  }, [timer, activity.key]);

  const handleConfirmSave = useCallback(async () => {
    const seconds = parseMinsInput(pendingInput);
    setTimer({ status: "done", elapsed: seconds, startedAt: null });
    setPendingSecs(null);
    await onSave(seconds);
  }, [pendingInput, onSave]);

  const handleCancelConfirm = useCallback(() => {
    setPendingSecs(null);
    // Leave timer in paused state so user can resume or keep editing
  }, []);

  // Add or subtract minutes manually (while paused or in confirm step)
  const handleAdjustTime = useCallback((deltaMinutes: number) => {
    if (pendingSecs !== null) {
      const cur = parseMinsInput(pendingInput);
      const next = Math.max(0, cur + deltaMinutes * 60);
      const m = Math.floor(next / 60);
      const s = next % 60;
      setPendingInput(s > 0 ? `${m}:${String(s).padStart(2, "0")}` : String(m));
    } else {
      setTimer(prev => {
        const next = Math.max(0, prev.elapsed + deltaMinutes * 60);
        return { ...prev, elapsed: next };
      });
    }
  }, [pendingSecs, pendingInput]);

  // Edit the already-logged time in "done" state
  const handleStartEditDone = useCallback(() => {
    const m = Math.floor(liveSeconds / 60);
    const s = liveSeconds % 60;
    setEditDoneInput(s > 0 ? `${m}:${String(s).padStart(2, "0")}` : String(m));
    setEditingDone(true);
  }, [liveSeconds]);

  const handleSaveEditDone = useCallback(async () => {
    const seconds = parseMinsInput(editDoneInput);
    setTimer({ status: "done", elapsed: seconds, startedAt: null });
    setEditingDone(false);
    await onSave(seconds);
  }, [editDoneInput, onSave]);

  const handleCancelEditDone = useCallback(() => {
    setEditingDone(false);
  }, []);

  const handleSaveManualEntry = useCallback(async () => {
    const seconds = parseMinsInput(manualInput);
    if (seconds <= 0) return;
    setShowManualEntry(false);
    setManualInput("");
    setTimer({ status: "done", elapsed: seconds, startedAt: null });
    await onSave(seconds);
  }, [manualInput, onSave]);

  const handleSaveGoal = useCallback(() => {
    const mins = Math.max(1, Math.min(480, parseInt(goalInput, 10) || targetMinutes));
    setGoalInput(String(mins));
    setEditingGoal(false);
    onGoalChange(mins);
  }, [goalInput, targetMinutes, onGoalChange]);

  const isDone = timer.status === "done";
  const isRunning = timer.status === "running";
  const isPaused = timer.status === "paused";
  const isIdle = timer.status === "idle";
  const isConfirming = pendingSecs !== null;

  const targetPct = Math.min(100, Math.round((liveSeconds / (targetMinutes * 60)) * 100));
  const goalMet = liveSeconds >= targetMinutes * 60;

  const pointsEarned = calcPoints(liveSeconds, targetMinutes);
  const isFull = pointsEarned >= 5;

  return (
    <>
    <div className={`relative rounded-2xl transition-all duration-300 ${
      isRunning
        ? `p-[4px] bg-gradient-to-br ${activity.gradient} shadow-2xl ${activity.glowColor}`
        : ""
    }`}>
      {isRunning && (
        <>
          <div
            className={`absolute -inset-2 rounded-3xl bg-gradient-to-br ${activity.gradient} -z-10`}
            style={{ animation: "dmo-ring-inner 0.85s ease-in-out infinite" }}
          />
          <div
            className={`absolute -inset-6 rounded-[32px] bg-gradient-to-br ${activity.gradient} -z-10`}
            style={{ animation: "dmo-ring-outer 1.15s ease-in-out infinite", animationDelay: "0.4s" }}
          />
        </>
      )}
    <div
      className={`relative rounded-2xl border-2 transition-all duration-500 overflow-hidden ${
        isDone && isFull
          ? `border-transparent bg-gradient-to-br ${activity.gradient} shadow-xl ${activity.glowColor} shadow-lg`
          : isDone && !isFull
          ? `${activity.borderActive} ${activity.bgActive}`
          : isRunning
          ? "border-transparent bg-card dark:bg-card"
          : isPaused || isConfirming
          ? `${activity.borderActive} ${activity.bgActive} opacity-90`
          : "border-border bg-card hover:border-border/80"
      }`}
    >
      {/* Animated top progress bar */}
      {(isRunning || isPaused || isDone || isConfirming) && (
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-white/10">
          <div
            className={`h-full transition-all duration-1000 ${isRunning ? "animate-pulse" : ""}`}
            style={{
              width: `${Math.min(100, isDone ? 100 : targetPct)}%`,
              background: goalMet
                ? "rgba(74,222,128,0.8)"
                : isDone
                ? "rgba(255,255,255,0.6)"
                : `hsl(var(--primary))`,
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
                {/* Goal badge — editable inline */}
                {editingGoal ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={1}
                      max={480}
                      value={goalInput}
                      onChange={e => setGoalInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleSaveGoal(); if (e.key === "Escape") { setEditingGoal(false); setGoalInput(String(targetMinutes)); } }}
                      className="h-6 w-16 text-xs px-1.5 py-0"
                      autoFocus
                      data-testid={`input-dmo-goal-${activity.key}`}
                    />
                    <span className="text-xs text-muted-foreground">min</span>
                    <button onClick={handleSaveGoal} className="h-5 w-5 flex items-center justify-center rounded text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => { setEditingGoal(false); setGoalInput(String(targetMinutes)); }} className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:bg-muted">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingGoal(true)}
                    className={`group flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                      isDone && isFull ? "bg-white/20 text-white hover:bg-white/30" : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                    title="Click to change goal"
                    data-testid={`badge-dmo-goal-${activity.key}`}
                  >
                    <Target className="h-2.5 w-2.5" />
                    Goal: {targetMinutes} min
                    <Pencil className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </button>
                )}
                {/* Goal-met indicator — shown when time is past the target */}
                {goalMet && !isIdle && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${
                    isDone && isFull ? "bg-white/20 text-white" : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  }`}>
                    <CheckCircle2 className="h-3 w-3" />
                    Goal Met!
                  </span>
                )}
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
            {/* Timer display — editable in done state */}
            {isDone && editingDone ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={editDoneInput}
                  onChange={e => setEditDoneInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveEditDone(); if (e.key === "Escape") handleCancelEditDone(); }}
                  placeholder="mm or mm:ss"
                  className="h-9 w-28 text-right font-mono text-base px-2"
                  autoFocus
                  data-testid={`input-dmo-edit-time-${activity.key}`}
                />
                <button onClick={handleSaveEditDone} disabled={isSaving} className="h-8 w-8 flex items-center justify-center rounded-lg bg-green-600 text-white hover:bg-green-500">
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={handleCancelEditDone} className="h-8 w-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <div
                  className={`text-3xl font-mono font-bold tabular-nums transition-all ${
                    isDone && isFull
                      ? "text-white"
                      : isDone && !isFull
                      ? activity.timerColor
                      : isRunning
                      ? activity.timerColor
                      : isConfirming
                      ? activity.timerColor
                      : "text-foreground/40"
                  }`}
                  data-testid={`timer-display-${activity.key}`}
                >
                  {formatTimer(liveSeconds)}
                </div>
                {/* Edit pencil — only in done state (not confirming) */}
                {isDone && !editingDone && (
                  <button
                    onClick={handleStartEditDone}
                    className={`h-6 w-6 flex items-center justify-center rounded transition-colors ${
                      isFull ? "text-white/60 hover:bg-white/20" : "text-muted-foreground hover:bg-muted"
                    }`}
                    title="Edit logged time"
                    data-testid={`button-dmo-edit-time-${activity.key}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Point dots — shown whenever any time has been logged */}
            {(isDone || isRunning || isPaused || isConfirming) && !editingDone && (
              <PointDots
                earned={pointsEarned}
                isFull={isFull}
                gradient={activity.gradient}
                timerColor={activity.timerColor}
              />
            )}

            {/* Controls */}
            {!editingDone && (
            <div className="flex items-center gap-2">
              {isDone && !isConfirming ? (
                <>
                  <div className="flex items-center gap-1.5">
                    {isFull ? <CheckCircle2 className="h-4 w-4 text-white" /> : null}
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
                <div className="flex flex-col items-end gap-1.5">
                  <Button
                    onClick={handleStart}
                    className={`h-9 px-5 text-sm font-semibold text-white shadow-md ${activity.startBg}`}
                    data-testid={`button-dmo-start-${activity.key}`}
                  >
                    <Play className="h-4 w-4 mr-1.5 fill-white" />
                    Start
                  </Button>
                  <button
                    onClick={() => { setShowManualEntry(true); setManualInput(""); }}
                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                    data-testid={`button-dmo-log-manual-${activity.key}`}
                  >
                    log manually
                  </button>
                </div>
              ) : !isConfirming ? (
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
              ) : null}
            </div>
            )}
          </div>
        </div>

        {/* ── Manual entry panel (from idle) ── */}
        {showManualEntry && isIdle && (
          <div className={`mt-4 rounded-xl border-2 ${activity.borderActive} bg-background/80 p-4`}>
            <p className="text-sm font-semibold text-foreground mb-3">
              How many minutes did you spend on this?
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Input
                  value={manualInput}
                  onChange={e => setManualInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleSaveManualEntry(); if (e.key === "Escape") { setShowManualEntry(false); setManualInput(""); } }}
                  placeholder="e.g. 30 or 1:30"
                  className="h-9 w-32 text-center font-mono text-base"
                  autoFocus
                  data-testid={`input-dmo-manual-${activity.key}`}
                />
                <span className="text-xs text-muted-foreground">min / mm:ss</span>
              </div>
              <Button
                size="sm"
                onClick={handleSaveManualEntry}
                disabled={isSaving || parseMinsInput(manualInput) <= 0}
                className="h-9 px-4 bg-green-600 hover:bg-green-500 text-white font-semibold"
                data-testid={`button-dmo-manual-save-${activity.key}`}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setShowManualEntry(false); setManualInput(""); }}
                className="h-9 px-3"
                data-testid={`button-dmo-manual-cancel-${activity.key}`}
              >
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Type minutes (e.g. <strong>30</strong>) or minutes:seconds (e.g. <strong>1:30</strong>).
            </p>
          </div>
        )}

        {/* ── Confirm-before-save panel ── */}
        {isConfirming && (
          <div className={`mt-4 rounded-xl border-2 ${activity.borderActive} bg-background/80 p-4`}>
            <p className="text-sm font-semibold text-foreground mb-3">
              Review your time before saving
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Minus / Plus quick adjusters */}
              <button
                onClick={() => handleAdjustTime(-5)}
                className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted text-muted-foreground"
                title="−5 min"
                data-testid={`button-dmo-minus5-${activity.key}`}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-1.5">
                <Input
                  value={pendingInput}
                  onChange={e => setPendingInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") handleConfirmSave(); }}
                  placeholder="mm or mm:ss"
                  className="h-9 w-28 text-center font-mono text-base"
                  autoFocus
                  data-testid={`input-dmo-confirm-${activity.key}`}
                />
                <span className="text-xs text-muted-foreground">min / mm:ss</span>
              </div>
              <button
                onClick={() => handleAdjustTime(5)}
                className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted text-muted-foreground"
                title="+5 min"
                data-testid={`button-dmo-plus5-${activity.key}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <Button
                size="sm"
                onClick={handleConfirmSave}
                disabled={isSaving}
                className="h-9 px-4 bg-green-600 hover:bg-green-500 text-white font-semibold"
                data-testid={`button-dmo-confirm-save-${activity.key}`}
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCancelConfirm}
                className="h-9 px-3"
                data-testid={`button-dmo-cancel-confirm-${activity.key}`}
              >
                Cancel
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Tip: Type minutes (e.g. <strong>35</strong>) or minutes:seconds (e.g. <strong>5:30</strong>).
              Use − / + to adjust by 5 min.
            </p>
          </div>
        )}

        {/* Quote — visible only when idle/done (not confirming) */}
        {(isIdle || isDone) && !isConfirming && !editingDone && (
          <p className={`mt-4 text-xs italic border-t pt-3 ${
            isDone && isFull
              ? "text-white/50 border-white/20"
              : "text-muted-foreground/50 border-border"
          }`}>
            "{activity.quote}"
          </p>
        )}

        {/* Running pulse indicator */}
        {isRunning && !isConfirming && (
          <div className="mt-4 flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-gradient-to-br ${activity.gradient} opacity-75`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 bg-gradient-to-br ${activity.gradient}`} />
            </span>
            <span className={`text-xs font-semibold ${activity.timerColor}`}>
              {goalMet ? "Goal reached — keep going! 🎉" : "Timer running — stay focused!"}
            </span>
            <span className={`ml-auto text-xs font-medium ${activity.timerColor} opacity-70`}>
              {goalMet ? `+${Math.floor((liveSeconds - targetMinutes * 60) / 60)}m past goal` : `${targetPct}% of goal`}
            </span>
          </div>
        )}
      </div>
    </div>
    </div>
    </>
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
        <p className="text-white/70">{payload[0].value} / 25 pts</p>
        {payload[0].value === 25 && <p className="text-green-400 font-semibold">🎉 Perfect Day!</p>}
      </div>
    );
  }
  return null;
}

// ─── Journal helpers ─────────────────────────────────────────────────────────

function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay() || 7;
  const thu = new Date(d);
  thu.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(thu.getFullYear(), 0, 1);
  const week = Math.ceil(((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${thu.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function getWeekBounds(isoWeek: string): { start: string; end: string; label: string } {
  const [yr, wk] = isoWeek.split("-W").map(Number);
  const jan4 = new Date(yr, 0, 4);
  const mon = new Date(jan4);
  mon.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (wk - 1) * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const start = mon.toISOString().split("T")[0];
  const end = sun.toISOString().split("T")[0];
  return { start, end, label: `${fmt(mon)} – ${sun.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` };
}

function getMonthPeriod(dateStr: string): string { return dateStr.slice(0, 7); }

function getMonthBounds(month: string): { start: string; end: string; label: string } {
  const [yr, mo] = month.split("-").map(Number);
  const start = `${yr}-${String(mo).padStart(2, "0")}-01`;
  const lastDay = new Date(yr, mo, 0).getDate();
  const end = `${yr}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const label = new Date(yr, mo - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { start, end, label };
}

function calcEntryPts(entry: DmoEntry, targets?: DmoSettings): number {
  return DMO_ACTIVITIES.reduce((sum, a) => {
    const t = targets ? (targets[a.settingsKey] ?? a.defaultTarget) : a.defaultTarget;
    return sum + calcPoints((entry[a.secondsKey] as number) ?? 0, t);
  }, 0);
}

// ─── Journal entry card ────────────────────────────────────────────────────────

function JournalEntryCard({ entry, targets }: { entry: DmoEntry; targets?: DmoSettings }) {
  const pts = calcEntryPts(entry, targets);
  const dateObj = new Date(entry.date + "T12:00:00");
  const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
  const dateDisplay = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const isFull = pts >= 25;

  return (
    <div className="flex gap-4 py-3 px-4 border-b border-border last:border-0">
      <div className="w-14 shrink-0 text-right pt-0.5">
        <p className="text-xs font-bold text-foreground uppercase tracking-wide">{dayName}</p>
        <p className="text-xs text-muted-foreground">{dateDisplay}</p>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <div className="flex gap-1" title="Activities completed">
            {DMO_ACTIVITIES.map(a => {
              const t = targets ? (targets[a.settingsKey] ?? a.defaultTarget) : a.defaultTarget;
              const p = calcPoints((entry[a.secondsKey] as number) ?? 0, t);
              return (
                <div key={a.key} className={`h-2.5 w-2.5 rounded-full transition-all ${p > 0 ? `bg-gradient-to-br ${a.gradient}` : "bg-muted"}`} title={`${a.label}: ${p}/5 pts`} />
              );
            })}
          </div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isFull ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : pts > 0 ? "bg-muted text-muted-foreground" : "text-muted-foreground/40"}`}>
            {pts}/25 pts
          </span>
          {isFull && <span className="text-xs">🎉</span>}
        </div>
        {entry.notes?.trim() ? (
          <p className="text-sm text-foreground/80 leading-relaxed">{entry.notes.trim()}</p>
        ) : (
          <p className="text-xs text-muted-foreground/40 italic">No notes for this day</p>
        )}
      </div>
    </div>
  );
}

// ─── AI Summary card ───────────────────────────────────────────────────────────

interface SummaryData {
  summary: string;
  tips: string[];
  moodScore: number | null;
  performanceScore: number | null;
  generatedAt?: Date;
}

function SummaryCard({
  period, periodType, startDate, endDate, periodLabel,
}: {
  period: string; periodType: "weekly" | "monthly";
  startDate: string; endDate: string; periodLabel: string;
}) {
  const { data: cached, isLoading: fetching } = useQuery<SummaryData | null>({
    queryKey: ["/api/dmo/summary", period],
    queryFn: () => fetch(`/api/dmo/summary/${encodeURIComponent(period)}`, { credentials: "include" }).then(r => r.json()),
  });

  const generateMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/dmo/summary/generate", { period, periodType, startDate, endDate }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/dmo/summary", period] }),
  });

  const data = generateMutation.data as SummaryData | undefined ?? (cached ?? undefined);

  if (fetching) {
    return <div className="h-24 rounded-xl bg-muted animate-pulse mb-3" />;
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-4 mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground">No AI summary yet for this {periodType === "weekly" ? "week" : "month"}.</p>
        </div>
        <Button
          size="sm"
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          className="shrink-0"
          data-testid={`button-generate-summary-${period}`}
        >
          {generateMutation.isPending ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />Generating…</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate Summary</>
          )}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/20 p-4 mb-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wide">
            AI {periodType === "weekly" ? "Weekly" : "Monthly"} Summary
          </span>
        </div>
        <div className="flex items-center gap-2">
          {data.moodScore !== null && (
            <span className="text-xs bg-white/70 dark:bg-black/30 rounded-full px-2 py-0.5 text-violet-700 dark:text-violet-300 font-medium">
              Mood {data.moodScore?.toFixed(1)}/10
            </span>
          )}
          {data.performanceScore !== null && (
            <span className="text-xs bg-white/70 dark:bg-black/30 rounded-full px-2 py-0.5 text-indigo-700 dark:text-indigo-300 font-medium">
              Performance {data.performanceScore?.toFixed(1)}/10
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40"
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            title="Regenerate"
          >
            <RefreshCw className={`h-3 w-3 ${generateMutation.isPending ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>
      <p className="text-sm text-foreground/90 leading-relaxed mb-3">{data.summary}</p>
      {data.tips && data.tips.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 mb-2 uppercase tracking-wide">Tips for Next {periodType === "weekly" ? "Week" : "Month"}</p>
          <ul className="space-y-1">
            {data.tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm text-foreground/80">
                <span className="text-violet-500 font-bold shrink-0">{i + 1}.</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Week section ─────────────────────────────────────────────────────────────

function WeekSection({ weekKey, entries, targets }: { weekKey: string; entries: DmoEntry[]; targets?: DmoSettings }) {
  const bounds = getWeekBounds(weekKey);
  const [open, setOpen] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const avgPts = Math.round(entries.reduce((s, e) => s + calcEntryPts(e, targets), 0) / entries.length);

  return (
    <div className="mb-4">
      <div
        role="button"
        tabIndex={0}
        className="w-full flex items-center justify-between py-2 px-1 hover:bg-muted/50 rounded-lg transition-colors group cursor-pointer"
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setOpen(o => !o); }}
      >
        <div className="flex items-center gap-3">
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <span className="text-sm font-semibold text-foreground">{bounds.label}</span>
          <span className="text-xs text-muted-foreground">{entries.length} day{entries.length !== 1 ? "s" : ""} · avg {avgPts}/25</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-3 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={e => { e.stopPropagation(); setShowSummary(s => !s); setOpen(true); }}
          data-testid={`button-ai-summary-${weekKey}`}
        >
          <Sparkles className="h-3 w-3 mr-1" />
          AI Summary
        </Button>
      </div>

      {open && (
        <div className="pl-7 mt-1">
          {showSummary && (
            <SummaryCard
              period={weekKey}
              periodType="weekly"
              startDate={bounds.start}
              endDate={bounds.end}
              periodLabel={bounds.label}
            />
          )}
          <Card className="border border-border overflow-hidden">
            <CardContent className="p-0">
              {[...entries].sort((a, b) => b.date.localeCompare(a.date)).map(e => (
                <JournalEntryCard key={e.date} entry={e} targets={targets} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Month section ────────────────────────────────────────────────────────────

function MonthSection({ monthKey, entries, targets }: { monthKey: string; entries: DmoEntry[]; targets?: DmoSettings }) {
  const bounds = getMonthBounds(monthKey);
  const [showSummary, setShowSummary] = useState(false);
  const totalPts = entries.reduce((s, e) => s + calcEntryPts(e, targets), 0);
  const perfectDays = entries.filter(e => calcEntryPts(e, targets) >= 25).length;

  const weekMap = new Map<string, DmoEntry[]>();
  for (const e of entries) {
    const wk = getISOWeek(e.date);
    if (!weekMap.has(wk)) weekMap.set(wk, []);
    weekMap.get(wk)!.push(e);
  }
  const weeks = Array.from(weekMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
        <div>
          <h3 className="text-base font-bold text-foreground">{bounds.label}</h3>
          <p className="text-xs text-muted-foreground">
            {entries.length} days · {totalPts} total pts{perfectDays > 0 ? ` · ${perfectDays} perfect day${perfectDays !== 1 ? "s" : ""}` : ""}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => setShowSummary(s => !s)}
          data-testid={`button-monthly-summary-${monthKey}`}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          {showSummary ? "Hide" : "Monthly"} Summary
        </Button>
      </div>

      {showSummary && (
        <SummaryCard
          period={monthKey}
          periodType="monthly"
          startDate={bounds.start}
          endDate={bounds.end}
          periodLabel={bounds.label}
        />
      )}

      {weeks.map(([wk, wkEntries]) => (
        <WeekSection key={wk} weekKey={wk} entries={wkEntries} targets={targets} />
      ))}
    </div>
  );
}

// ─── Journal tab ──────────────────────────────────────────────────────────────

function JournalTab({ entries, targets }: { entries: DmoEntry[]; targets?: DmoSettings }) {
  const [notesOnly, setNotesOnly] = useState(false);
  const filtered = notesOnly ? entries.filter(e => e.notes?.trim()) : entries;

  const monthMap = new Map<string, DmoEntry[]>();
  for (const e of filtered) {
    const m = getMonthPeriod(e.date);
    if (!monthMap.has(m)) monthMap.set(m, []);
    monthMap.get(m)!.push(e);
  }
  const months = Array.from(monthMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <BookText className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <p className="text-muted-foreground font-medium">No entries yet</p>
        <p className="text-sm text-muted-foreground/60 mt-1">Start your DMO today and come back here to review your progress.</p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <p className="text-muted-foreground">No entries with notes found.</p>
        <button className="text-sm text-primary mt-2 underline" onClick={() => setNotesOnly(false)}>Show all entries</button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-sm text-muted-foreground">{filtered.length} of {entries.length} entries</p>
        <button
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${notesOnly ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground/30"}`}
          onClick={() => setNotesOnly(n => !n)}
        >
          {notesOnly ? "✓ Notes only" : "Notes only"}
        </button>
      </div>
      {months.map(([mk, mes]) => (
        <MonthSection key={mk} monthKey={mk} entries={mes} targets={targets} />
      ))}
    </div>
  );
}

// ─── Log Tab ──────────────────────────────────────────────────────────────────

function LogTab({ entries, targets }: { entries: DmoEntry[]; targets?: DmoSettings }) {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");

  const notesMutation = useMutation({
    mutationFn: ({ date, notes }: { date: string; notes: string }) =>
      apiRequest("PATCH", "/api/dmo/entry/notes", { date, notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dmo/history", 1825] });
      setEditingNotes(false);
      toast({ title: "Notes saved." });
    },
    onError: () => toast({ title: "Failed to save notes", variant: "destructive" }),
  });

  const entryMap = new Map<string, DmoEntry>();
  for (const e of entries) entryMap.set(e.date, e);

  const allMonths = Array.from(new Set(entries.map(e => e.date.slice(0, 7)))).sort((a, b) => b.localeCompare(a));
  const activeMonth = selectedMonth && allMonths.includes(selectedMonth) ? selectedMonth : (allMonths[0] ?? "");

  const getTarget = (a: typeof DMO_ACTIVITIES[number]) =>
    targets ? (targets[a.settingsKey] ?? a.defaultTarget) : a.defaultTarget;

  const selectedEntry = selectedDate ? entryMap.get(selectedDate) : null;

  const buildCalendar = (monthKey: string) => {
    const [yr, mo] = monthKey.split("-").map(Number);
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const firstDow = new Date(yr, mo - 1, 1).getDay();
    const cells: Array<string | null> = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${yr}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: Array<Array<string | null>> = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  };

  return (
    <div className="space-y-10">

      {/* ── Calendar section ── */}
      <div>
        <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
          <div>
            <h3 className="text-base font-bold text-foreground">Activity Calendar</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Tap any colored day to see the full breakdown and notes. Darker = more time logged.
            </p>
          </div>
          {allMonths.length > 0 && (
            <Select
              value={activeMonth}
              onValueChange={v => { setSelectedMonth(v); setSelectedDate(null); }}
            >
              <SelectTrigger className="w-48 h-9 text-sm shrink-0" data-testid="select-dmo-log-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {allMonths.map(mk => {
                  const [yr, mo] = mk.split("-").map(Number);
                  const label = new Date(yr, mo - 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
                  const count = entries.filter(e => e.date.startsWith(mk)).length;
                  return (
                    <SelectItem key={mk} value={mk}>
                      {label}
                      <span className="ml-2 text-muted-foreground text-[11px]">({count}d)</span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <span className="text-[10px] text-muted-foreground font-medium">Less</span>
          {[
            { label: "0", cls: "bg-muted/40 border border-border" },
            { label: "<30m", cls: "bg-violet-100 dark:bg-violet-900/50" },
            { label: "30–59m", cls: "bg-violet-200 dark:bg-violet-800/60" },
            { label: "1–2h", cls: "bg-violet-400 dark:bg-violet-600/80" },
            { label: "2–3h", cls: "bg-violet-500" },
            { label: "3h+", cls: "bg-violet-700 dark:bg-violet-400" },
          ].map(({ label, cls }) => (
            <span key={label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className={`inline-block w-4 h-4 rounded ${cls}`} />
              {label}
            </span>
          ))}
          <span className="text-[10px] text-muted-foreground font-medium">More</span>
        </div>

        {entries.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <CalendarCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-medium">No days logged yet</p>
            <p className="text-xs mt-1">Start tracking in the Today tab.</p>
          </div>
        ) : activeMonth ? (() => {
          const [yr, mo] = activeMonth.split("-").map(Number);
          const weeks = buildCalendar(activeMonth);
          const monthTotal = entries.filter(e => e.date.startsWith(activeMonth)).reduce((s, e) => s + getTotalSeconds(e), 0);
          const daysLogged = entries.filter(e => e.date.startsWith(activeMonth)).length;
          return (
            <div>
              {daysLogged > 0 ? (
                <p className="text-xs text-muted-foreground mb-3">
                  {formatDuration(monthTotal)} logged across {daysLogged} day{daysLogged !== 1 ? "s" : ""}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground/60 italic mb-3">No activity recorded this month.</p>
              )}

              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                  <div key={d} className="text-center text-[10px] text-muted-foreground font-medium">{d}</div>
                ))}
              </div>
              <div className="space-y-1">
                {weeks.map((week, wi) => (
                  <div key={wi} className="grid grid-cols-7 gap-1">
                    {week.map((date, di) => {
                      if (!date) return <div key={di} />;
                      const entry = entryMap.get(date);
                      const totalSecs = entry ? getTotalSeconds(entry) : 0;
                      const isSelected = date === selectedDate;
                      const dayNum = parseInt(date.split("-")[2], 10);
                      return (
                        <button
                          key={di}
                          onClick={() => totalSecs > 0 && setSelectedDate(isSelected ? null : date)}
                          data-testid={`button-dmo-log-day-${date}`}
                          className={`relative rounded-lg py-1.5 px-0.5 text-center transition-all ${
                            totalSecs > 0
                              ? `${getHeatClass(totalSecs)} hover:ring-2 hover:ring-violet-400 cursor-pointer`
                              : "bg-muted/30 text-muted-foreground/30 cursor-default"
                          } ${isSelected ? "ring-2 ring-violet-500 shadow-md" : ""}`}
                        >
                          <span className="block text-[11px] font-semibold leading-tight">{dayNum}</span>
                          {totalSecs > 0 && (
                            <span className="block text-[9px] leading-tight opacity-80 mt-0.5">
                              {formatDuration(totalSecs)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Expanded day detail — time + journal notes */}
              {selectedDate?.startsWith(activeMonth) && selectedEntry && (
                <div className="mt-4 rounded-xl border border-border bg-card p-5 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-bold text-foreground">
                      {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                        weekday: "long", month: "long", day: "numeric",
                      })}
                    </p>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {formatDuration(getTotalSeconds(selectedEntry))} total · {calcEntryPts(selectedEntry, targets)}/25 pts
                    </span>
                  </div>

                  {/* Activity breakdown */}
                  <div className="space-y-2.5 mb-5">
                    {DMO_ACTIVITIES.map(a => {
                      const secs = (selectedEntry[a.secondsKey] as number) ?? 0;
                      const target = getTarget(a);
                      const goalMet = secs >= target * 60;
                      const Icon = a.icon;
                      return (
                        <div key={a.key} className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${a.gradient} flex items-center justify-center shrink-0`}>
                            <Icon className="h-3.5 w-3.5 text-white" />
                          </div>
                          <span className="text-xs text-foreground flex-1 min-w-0 truncate">{a.label}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full bg-gradient-to-r ${a.gradient}`}
                                style={{ width: `${Math.min(100, secs > 0 ? Math.round((secs / (target * 60)) * 100) : 0)}%` }}
                              />
                            </div>
                            <span className={`text-xs font-semibold w-14 text-right ${secs > 0 ? "text-foreground" : "text-muted-foreground/30"}`}>
                              {formatDuration(secs)}
                            </span>
                            <span className={`text-[11px] w-4 ${goalMet && secs > 0 ? "text-green-500" : "text-transparent"}`}>✓</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Journal notes — editable */}
                  <div className="pt-4 border-t border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <BookText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Daily Notes</span>
                      </div>
                      {!editingNotes && (
                        <button
                          onClick={() => { setNotesText(selectedEntry.notes ?? ""); setEditingNotes(true); }}
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          data-testid="button-dmo-edit-notes"
                        >
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                      )}
                    </div>
                    {editingNotes ? (
                      <div className="space-y-2">
                        <textarea
                          value={notesText}
                          onChange={e => setNotesText(e.target.value)}
                          rows={4}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                          placeholder="Add notes for this day…"
                          autoFocus
                          data-testid="textarea-dmo-notes"
                        />
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setEditingNotes(false)}
                            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            data-testid="button-dmo-notes-cancel"
                          >
                            Cancel
                          </button>
                          <Button
                            size="sm"
                            className="h-7 px-3 text-xs"
                            disabled={notesMutation.isPending}
                            onClick={() => selectedDate && notesMutation.mutate({ date: selectedDate, notes: notesText })}
                            data-testid="button-dmo-notes-save"
                          >
                            {notesMutation.isPending ? "Saving…" : "Save Notes"}
                          </Button>
                        </div>
                      </div>
                    ) : selectedEntry.notes?.trim() ? (
                      <p className="text-sm text-foreground leading-relaxed">{selectedEntry.notes.trim()}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground/40 italic">No notes recorded for this day. Click Edit to add some.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })() : null}
      </div>

    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DmoTrackerPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const today = getTodayString(user?.timezone);
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [activeTab, setActiveTab] = useState<"today" | "log">("today");

  const { data: todayData, isLoading: todayLoading } = useQuery<{ entry: DmoEntry | null; date: string }>({
    queryKey: ["/api/dmo/today"],
  });

  const { data: streak } = useQuery<{ current: number; best: number; totalDays: number }>({
    queryKey: ["/api/dmo/streak"],
  });

  const { data: dmoSettings } = useQuery<DmoSettings>({
    queryKey: ["/api/dmo/settings"],
  });

  const settingsMutation = useMutation({
    mutationFn: (data: Partial<Omit<DmoSettings, "userId">>) =>
      apiRequest("POST", "/api/dmo/settings", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/dmo/settings"] }),
    onError: () => toast({ title: "Failed to save goal", variant: "destructive" }),
  });

  const [chartDays, setChartDays] = useState(7);

  const { data: history } = useQuery<DmoEntry[]>({
    queryKey: ["/api/dmo/history", chartDays],
    queryFn: () => fetch(`/api/dmo/history?limit=${chartDays}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: journalEntries } = useQuery<DmoEntry[]>({
    queryKey: ["/api/dmo/history", 1825],
    queryFn: () => fetch("/api/dmo/history?limit=1825", { credentials: "include" }).then(r => r.json()),
    enabled: activeTab === "log",
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
      queryClient.invalidateQueries({ queryKey: ["/api/dmo/history", chartDays] });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const handleActivitySave = useCallback(async (
    key: typeof DMO_ACTIVITIES[number]["key"],
    secondsKey: typeof DMO_ACTIVITIES[number]["secondsKey"],
    seconds: number
  ) => {
    await saveMutation.mutateAsync({ [key]: true, [secondsKey]: seconds });
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const display = mins > 0
      ? `${mins} min${secs > 0 ? ` ${secs} sec` : ""}`
      : `${secs} sec`;
    toast({
      title: "Activity saved! 🎯",
      description: `${display} logged. Keep it up!`,
    });
  }, [saveMutation, toast]);

  const handleAutoSave = useCallback(async (
    key: typeof DMO_ACTIVITIES[number]["key"],
    secondsKey: typeof DMO_ACTIVITIES[number]["secondsKey"],
    seconds: number
  ) => {
    try {
      await saveMutation.mutateAsync({ [key]: true, [secondsKey]: seconds });
    } catch {
      // Silently ignore — will retry in 5 s
    }
  }, [saveMutation]);

  const handleGoalChange = useCallback((
    settingsKey: typeof DMO_ACTIVITIES[number]["settingsKey"],
    minutes: number
  ) => {
    settingsMutation.mutate({ [settingsKey]: minutes });
  }, [settingsMutation]);

  const handleSaveNotes = () => {
    saveMutation.mutate({ notes });
    setNotesDirty(false);
    toast({ title: "Notes saved." });
  };

  const handlePopOut = () => {
    window.open(
      window.location.href,
      "dmo-popout",
      "width=640,height=860,left=100,top=80,resizable=yes,scrollbars=yes"
    );
  };

  const entry = todayData?.entry;

  const getTarget = (a: typeof DMO_ACTIVITIES[number]) =>
    dmoSettings ? (dmoSettings[a.settingsKey] ?? a.defaultTarget) : a.defaultTarget;

  const totalPoints = DMO_ACTIVITIES.reduce((sum, a) => {
    const secs = entry?.[a.secondsKey] ?? 0;
    return sum + calcPoints(secs, getTarget(a));
  }, 0);
  const totalTimeSeconds = DMO_ACTIVITIES.reduce((sum, a) => sum + ((entry?.[a.secondsKey] as number) ?? 0), 0);
  const isPerfectDay = totalPoints >= 25;
  const completionPct = Math.round((totalPoints / 25) * 100);

  const chartData = (() => {
    const map = new Map<string, DmoEntry>();
    (history ?? []).forEach(e => map.set(e.date, e));
    return Array.from({ length: chartDays }, (_, i) => {
      const d = new Date(Date.now() - (chartDays - 1 - i) * 86400000);
      const dateStr = d.toISOString().split("T")[0];
      const e = map.get(dateStr);
      const pts = e
        ? DMO_ACTIVITIES.reduce((sum, a) => sum + calcPoints(e[a.secondsKey] ?? 0, getTarget(a)), 0)
        : 0;
      return { date: formatDisplayDate(dateStr), fullDate: dateStr, pts };
    });
  })();

  const chartBarSize = chartDays <= 7 ? 28 : chartDays <= 30 ? 14 : chartDays <= 60 ? 6 : chartDays <= 90 ? 4 : 3;
  const chartInterval = chartDays <= 7 ? 0 : chartDays <= 30 ? 4 : chartDays <= 60 ? 9 : chartDays <= 90 ? 14 : 29;
  const chartHeight = 200;

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
            {/* Tab switcher + Pop Out button */}
            <div className="flex items-center gap-3 mt-4">
              <div className="flex gap-1 bg-white/10 rounded-xl p-1">
                <button
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${activeTab === "today" ? "bg-white text-sidebar shadow-sm" : "text-white/70 hover:text-white"}`}
                  onClick={() => setActiveTab("today")}
                  data-testid="tab-dmo-today"
                >
                  Today
                </button>
                <button
                  className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-1.5 ${activeTab === "log" ? "bg-white text-sidebar shadow-sm" : "text-white/70 hover:text-white"}`}
                  onClick={() => setActiveTab("log")}
                  data-testid="tab-dmo-log"
                >
                  <CalendarCheck className="h-3.5 w-3.5" />
                  Log
                </button>
              </div>
              <button
                onClick={handlePopOut}
                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-white/15 hover:bg-white/25 border border-white/30 hover:border-white/50 transition-all px-3 py-2 rounded-xl"
                title="Open in a pop-out window"
                data-testid="button-dmo-popout"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Pop Out
              </button>
            </div>
          </div>

          {/* Points ring + total time */}
          <div className="flex items-center gap-3 flex-wrap">
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
            {totalTimeSeconds > 0 && (
              <div className="flex flex-col items-center bg-white/10 rounded-2xl px-5 py-3">
                <p className="text-xl font-bold text-white leading-tight" data-testid="text-dmo-total-time">
                  {formatDuration(totalTimeSeconds)}
                </p>
                <p className="text-white/50 text-xs mt-0.5">total time today</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Log tab ── */}
      {activeTab === "log" && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-12">
          {journalEntries == null ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-40 rounded-2xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <LogTab entries={journalEntries} targets={dmoSettings} />
          )}
        </div>
      )}

      {/* ── Today tab ── */}
      {activeTab === "today" && (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 pb-8 space-y-4">

        {/* ── Streak banner ── */}
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

        {/* ── Full-width points history chart ── */}
        <Card className="border border-border">
          <CardHeader className="pb-1 pt-4 px-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Points History</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">Daily score out of 25 pts</p>
              </div>
              <Select value={String(chartDays)} onValueChange={v => setChartDays(Number(v))}>
                <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-chart-range">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="60">Last 60 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 180 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="px-3 pb-4">
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={chartData} barSize={chartBarSize} margin={{ left: -10, right: 4 }}>
                <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} interval={chartInterval} />
                <YAxis domain={[0, 25]} tick={{ fontSize: 9 }} tickLine={false} axisLine={false} ticks={[0, 5, 10, 15, 20, 25]} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="pts" radius={[3, 3, 0, 0]}>
                  {chartData.map((e, i) => (
                    <Cell key={i} fill={getBarColor(e.pts)} opacity={e.fullDate === today ? 1 : 0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
              {BAR_LEGEND.map(({ label, pts }) => (
                <span key={label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: getBarColor(pts) }} />
                  {label}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid xl:grid-cols-[1fr_360px] gap-8">

          {/* ── Left column: activities ── */}
          <div className="space-y-4">

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
                    targetMinutes={getTarget(activity)}
                    savedSeconds={entry?.[activity.secondsKey] ?? 0}
                    savedChecked={entry?.[activity.key] ?? false}
                    onSave={(seconds) => handleActivitySave(activity.key, activity.secondsKey, seconds)}
                    onAutoSave={(seconds) => handleAutoSave(activity.key, activity.secondsKey, seconds)}
                    onGoalChange={(minutes) => handleGoalChange(activity.settingsKey, minutes)}
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
                  const t = getTarget(a);
                  return (
                    <div key={a.key} className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${a.gradient} flex items-center justify-center shrink-0`}>
                        <Icon className="h-3.5 w-3.5 text-white" />
                      </div>
                      <span className="text-xs text-white/80 flex-1">{a.label}</span>
                      <span className="text-xs text-white/40">{t}m</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
