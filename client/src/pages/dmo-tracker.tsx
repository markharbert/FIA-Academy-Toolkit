import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
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
  CheckCircle2,
  Circle,
  Eye,
  BookOpen,
  Lightbulb,
  Zap,
  Users,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react";
import type { DmoEntry } from "@shared/schema";

const DMO_ACTIVITIES = [
  {
    key: "visionMeditation" as const,
    minutesKey: "visionMinutes" as const,
    label: "Vision & Meditation",
    description: "Get quiet, shut out the noise. Visualize your future.",
    target: 30,
    icon: Eye,
    gradient: "from-violet-600 to-purple-700",
    lightBg: "bg-violet-50 dark:bg-violet-950/30",
    border: "border-violet-200 dark:border-violet-800",
    checked: "bg-violet-600",
    dot: "bg-violet-500",
    badgeColor: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
  },
  {
    key: "personalDevelopment" as const,
    minutesKey: "personalMinutes" as const,
    label: "Personal Development",
    description: "Read, listen, grow. Invest in the best version of you.",
    target: 30,
    icon: BookOpen,
    gradient: "from-blue-600 to-cyan-600",
    lightBg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800",
    checked: "bg-blue-600",
    dot: "bg-blue-500",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  },
  {
    key: "expandSkills" as const,
    minutesKey: "expandMinutes" as const,
    label: "Expand Your Skills",
    description: "Traffic, content, ads, video marketing. Self-education is a fortune.",
    target: 60,
    icon: Lightbulb,
    gradient: "from-teal-500 to-emerald-600",
    lightBg: "bg-teal-50 dark:bg-teal-950/30",
    border: "border-teal-200 dark:border-teal-800",
    checked: "bg-teal-600",
    dot: "bg-teal-500",
    badgeColor: "bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300",
  },
  {
    key: "execution" as const,
    minutesKey: "executionMinutes" as const,
    label: "Execution",
    description: "Post, create, show up. After you consume — CREATE.",
    target: 60,
    icon: Zap,
    gradient: "from-amber-500 to-orange-600",
    lightBg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-800",
    checked: "bg-amber-500",
    dot: "bg-amber-500",
    badgeColor: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  },
  {
    key: "connecting" as const,
    minutesKey: "connectingMinutes" as const,
    label: "Connect with People",
    description: "Messenger, DMs, comments, Zoom, phone. This is your money activity.",
    target: 60,
    icon: Users,
    gradient: "from-red-600 to-rose-700",
    lightBg: "bg-red-50 dark:bg-red-950/30",
    border: "border-red-200 dark:border-red-800",
    checked: "bg-red-600",
    dot: "bg-red-500",
    badgeColor: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  },
] as const;

const STREAK_MILESTONES = [
  { days: 3, label: "3-Day Spark", icon: "⚡" },
  { days: 7, label: "7-Day Flame", icon: "🔥" },
  { days: 14, label: "2-Week Warrior", icon: "💪" },
  { days: 21, label: "21-Day Habit", icon: "🏆" },
  { days: 30, label: "30-Day Champion", icon: "👑" },
  { days: 60, label: "60-Day Legend", icon: "🌟" },
  { days: 90, label: "90-Day Elite", icon: "💎" },
];

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

interface ActivityCardProps {
  activity: typeof DMO_ACTIVITIES[number];
  checked: boolean;
  minutes: number;
  onToggle: () => void;
  onMinutesChange: (val: number) => void;
  disabled: boolean;
}

function ActivityCard({ activity, checked, minutes, onToggle, onMinutesChange, disabled }: ActivityCardProps) {
  const Icon = activity.icon;
  const [showMinutes, setShowMinutes] = useState(false);

  return (
    <div
      className={`relative rounded-xl border-2 transition-all duration-300 ${
        checked
          ? `border-transparent bg-gradient-to-br ${activity.gradient} shadow-lg`
          : `${activity.border} ${activity.lightBg} hover:shadow-md`
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button
            onClick={onToggle}
            disabled={disabled}
            className="mt-0.5 shrink-0 transition-transform hover:scale-110 active:scale-95"
            data-testid={`button-dmo-toggle-${activity.key}`}
          >
            {checked ? (
              <CheckCircle2 className="h-6 w-6 text-white" />
            ) : (
              <Circle className={`h-6 w-6 ${activity.dot}`} />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 shrink-0 ${checked ? "text-white/90" : "text-current opacity-60"}`} />
                <span className={`font-semibold text-sm ${checked ? "text-white" : "text-foreground"}`}>
                  {activity.label}
                </span>
              </div>
              <span className={`text-xs shrink-0 px-2 py-0.5 rounded-full font-medium ${
                checked ? "bg-white/20 text-white" : activity.badgeColor
              }`}>
                {activity.target} min
              </span>
            </div>
            <p className={`text-xs mt-1 leading-relaxed ${checked ? "text-white/80" : "text-muted-foreground"}`}>
              {activity.description}
            </p>
            <button
              onClick={() => setShowMinutes(!showMinutes)}
              className={`mt-2 text-xs flex items-center gap-1 transition-colors ${
                checked ? "text-white/70 hover:text-white" : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`button-dmo-minutes-toggle-${activity.key}`}
            >
              {showMinutes ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {minutes > 0 ? `${minutes} min logged` : "Log minutes"}
            </button>
            {showMinutes && (
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={480}
                  value={minutes || ""}
                  onChange={(e) => onMinutesChange(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className={`h-7 w-20 text-sm ${checked ? "bg-white/20 border-white/30 text-white placeholder:text-white/50" : ""}`}
                  data-testid={`input-dmo-minutes-${activity.key}`}
                />
                <span className={`text-xs ${checked ? "text-white/70" : "text-muted-foreground"}`}>minutes</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const count = payload[0].value;
    return (
      <div className="bg-sidebar text-sidebar-foreground rounded-lg px-3 py-2 text-xs shadow-xl border border-sidebar-border">
        <p className="font-medium">{label}</p>
        <p className="text-white/80">{count} of 5 activities</p>
      </div>
    );
  }
  return null;
}

export default function DmoTrackerPage() {
  const { toast } = useToast();
  const today = getTodayString();

  const [localEntry, setLocalEntry] = useState<Partial<DmoEntry>>({});
  const [notes, setNotes] = useState("");
  const [isDirty, setIsDirty] = useState(false);

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
    if (todayData?.entry) {
      setLocalEntry(todayData.entry);
      setNotes(todayData.entry.notes ?? "");
    }
  }, [todayData]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<DmoEntry>) =>
      apiRequest("POST", "/api/dmo/entry", { date: today, ...data }),
    onSuccess: (res) => {
      res.json().then((data: { entry: DmoEntry; streak: { current: number; best: number; totalDays: number } }) => {
        setLocalEntry(data.entry);
        queryClient.invalidateQueries({ queryKey: ["/api/dmo/today"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dmo/streak"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dmo/history"] });
        setIsDirty(false);
        toast({ title: "DMO saved!", description: "Keep showing up every day." });
      });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const handleToggle = (key: typeof DMO_ACTIVITIES[number]["key"]) => {
    setLocalEntry(prev => ({ ...prev, [key]: !prev[key] }));
    setIsDirty(true);
  };

  const handleMinutes = (key: typeof DMO_ACTIVITIES[number]["minutesKey"], val: number) => {
    setLocalEntry(prev => ({ ...prev, [key]: val }));
    setIsDirty(true);
  };

  const handleSave = () => {
    saveMutation.mutate({ ...localEntry, notes });
  };

  const completedToday = DMO_ACTIVITIES.filter(a => localEntry[a.key]).length;
  const completionPct = Math.round((completedToday / 5) * 100);

  // Build chart data — last 30 days in chronological order
  const chartData = (() => {
    const entryMap = new Map<string, DmoEntry>();
    (history ?? []).forEach(e => entryMap.set(e.date, e));

    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().split("T")[0];
      const entry = entryMap.get(dateStr);
      const count = entry
        ? [entry.visionMeditation, entry.personalDevelopment, entry.expandSkills, entry.execution, entry.connecting]
            .filter(Boolean).length
        : 0;
      days.push({
        date: formatDisplayDate(dateStr),
        fullDate: dateStr,
        count,
      });
    }
    return days;
  })();

  const nextMilestone = STREAK_MILESTONES.find(m => m.days > (streak?.current ?? 0));
  const earnedMilestones = STREAK_MILESTONES.filter(m => m.days <= (streak?.current ?? 0));

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Header */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">
                Daily Method of Operation
              </h1>
              <p className="text-sidebar-foreground/70 mt-1 text-sm">
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
            {/* Today's progress ring summary */}
            <div className="flex items-center gap-3 bg-white/10 rounded-xl px-4 py-3">
              <div className="relative h-12 w-12">
                <svg className="h-12 w-12 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="3.2" />
                  <circle
                    cx="18" cy="18" r="15.9" fill="none"
                    stroke={completionPct === 100 ? "#4ade80" : "#dc2626"}
                    strokeWidth="3.2"
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
                <p className="text-white font-semibold text-sm">{completedToday}/5 Done</p>
                <p className="text-white/60 text-xs">Today</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Stat Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-0 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Flame className="h-4 w-4" />
                <span className="text-xs font-medium opacity-90">Current Streak</span>
              </div>
              <p className="text-3xl font-bold" data-testid="text-dmo-current-streak">
                {streak?.current ?? 0}
              </p>
              <p className="text-xs opacity-75">days</p>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-violet-600 to-purple-700 text-white shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Trophy className="h-4 w-4" />
                <span className="text-xs font-medium opacity-90">Best Streak</span>
              </div>
              <p className="text-3xl font-bold" data-testid="text-dmo-best-streak">
                {streak?.best ?? 0}
              </p>
              <p className="text-xs opacity-75">days</p>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CalendarCheck className="h-4 w-4" />
                <span className="text-xs font-medium opacity-90">Total Days</span>
              </div>
              <p className="text-3xl font-bold" data-testid="text-dmo-total-days">
                {streak?.totalDays ?? 0}
              </p>
              <p className="text-xs opacity-75">logged</p>
            </CardContent>
          </Card>

          <Card className="border-0 bg-gradient-to-br from-blue-600 to-cyan-600 text-white shadow-lg">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Star className="h-4 w-4" />
                <span className="text-xs font-medium opacity-90">Today</span>
              </div>
              <p className="text-3xl font-bold">
                {completedToday}/5
              </p>
              <p className="text-xs opacity-75">activities</p>
            </CardContent>
          </Card>
        </div>

        {/* Streak Milestone Banner */}
        {nextMilestone && (streak?.current ?? 0) > 0 && (
          <Card className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔥</span>
                <div>
                  <p className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
                    {streak?.current}-day streak! Keep going!
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {nextMilestone.days - (streak?.current ?? 0)} more days to unlock {nextMilestone.icon} {nextMilestone.label}
                  </p>
                </div>
              </div>
              {earnedMilestones.length > 0 && (
                <div className="flex gap-1 flex-wrap justify-end">
                  {earnedMilestones.map(m => (
                    <Badge key={m.days} className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs">
                      {m.icon} {m.label}
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Today's Check-in */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">Today's Check-In</h2>
              {todayData?.entry && (
                <Badge variant="outline" className="text-xs text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30">
                  ✓ Saved today
                </Badge>
              )}
            </div>

            {todayLoading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {DMO_ACTIVITIES.map((activity) => (
                  <ActivityCard
                    key={activity.key}
                    activity={activity}
                    checked={!!localEntry[activity.key]}
                    minutes={localEntry[activity.minutesKey] ?? 0}
                    onToggle={() => handleToggle(activity.key)}
                    onMinutesChange={(val) => handleMinutes(activity.minutesKey, val)}
                    disabled={saveMutation.isPending}
                  />
                ))}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Notes (optional)</label>
              <Textarea
                value={notes}
                onChange={(e) => { setNotes(e.target.value); setIsDirty(true); }}
                placeholder="Wins, struggles, reflections..."
                className="resize-none h-20 text-sm"
                data-testid="input-dmo-notes"
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending || !isDirty}
              className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-semibold shadow-md"
              data-testid="button-dmo-save"
            >
              {saveMutation.isPending ? "Saving..." : isDirty ? "Save Today's DMO" : "✓ All Saved"}
            </Button>
          </div>

          {/* Right column — Chart + Tips */}
          <div className="space-y-4">
            {/* Activity Chart */}
            <Card className="border border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center justify-between">
                  <span>30-Day Activity</span>
                  <div className="flex items-center gap-3 text-xs font-normal text-muted-foreground">
                    {[1, 2, 3, 4, 5].map(n => (
                      <span key={n} className="flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-sm" style={{ background: getBarColor(n) }} />
                        {n}
                      </span>
                    ))}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={chartData} barSize={7} margin={{ left: -20, right: 4 }}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 9, fill: "currentColor" }}
                      tickLine={false}
                      axisLine={false}
                      interval={4}
                    />
                    <YAxis
                      domain={[0, 5]}
                      tick={{ fontSize: 9 }}
                      tickLine={false}
                      axisLine={false}
                      ticks={[0, 1, 2, 3, 4, 5]}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={getBarColor(entry.count)}
                          opacity={entry.fullDate === today ? 1 : 0.85}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* The 5 Steps Summary */}
            <Card className="border border-border bg-sidebar text-sidebar-foreground">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-white">The 5-Step DMO</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {DMO_ACTIVITIES.map((a) => {
                  const Icon = a.icon;
                  return (
                    <div key={a.key} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${a.gradient} flex items-center justify-center shrink-0`}>
                        <Icon className="h-3 w-3 text-white" />
                      </div>
                      <div className="flex-1">
                        <span className="text-xs font-medium text-white">{a.label}</span>
                      </div>
                      <span className="text-xs text-white/50">{a.target === 30 ? "30 min" : "1 hr+"}</span>
                    </div>
                  );
                })}
                <p className="text-xs text-white/40 pt-2 border-t border-white/10 italic">
                  "You don't get paid for the hour. You get paid for the value you bring to the hour." — Jim Rohn
                </p>
              </CardContent>
            </Card>

            {/* Milestones */}
            <Card className="border border-border">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-foreground">Streak Milestones</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid grid-cols-2 gap-2">
                  {STREAK_MILESTONES.map((m) => {
                    const earned = (streak?.current ?? 0) >= m.days;
                    return (
                      <div
                        key={m.days}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-all ${
                          earned
                            ? "bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 font-medium"
                            : "bg-muted/50 border border-border opacity-50"
                        }`}
                        data-testid={`badge-dmo-milestone-${m.days}`}
                      >
                        <span className={earned ? "grayscale-0" : "grayscale"}>{m.icon}</span>
                        <div>
                          <p className={earned ? "text-amber-800 dark:text-amber-200" : "text-muted-foreground"}>
                            {m.label}
                          </p>
                          <p className={`text-[10px] ${earned ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/70"}`}>
                            {m.days} days
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
