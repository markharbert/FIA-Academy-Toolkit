import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { format, parseISO } from "date-fns";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Trophy, Flame, Target, TrendingUp, TrendingDown, Minus,
  CheckCircle2, Lock, Download, ChevronDown, ChevronUp, Star,
  Video, Users, DollarSign, Clock, Calendar, Printer,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AccountabilityCheckin, AccountabilityBadge } from "@shared/schema";

// ─── Badge Definitions ────────────────────────────────────────────────────────

const BADGE_DEFS = [
  { id: "first_checkin",  emoji: "📋", name: "First Check-In",       desc: "Submitted your very first weekly check-in" },
  { id: "first_video",    emoji: "🎬", name: "Lights, Camera!",       desc: "Published your first video" },
  { id: "videos_10",      emoji: "🔟", name: "10 Videos Strong",      desc: "Published 10 videos total" },
  { id: "videos_25",      emoji: "🎯", name: "Quarter Century",        desc: "Published 25 videos total" },
  { id: "videos_50",      emoji: "🏅", name: "Fifty Films",            desc: "Published 50 videos total" },
  { id: "videos_100",     emoji: "💯", name: "Century Club",           desc: "Published 100 videos total" },
  { id: "first_lead",     emoji: "🌱", name: "First Opt-In",          desc: "Generated your first lead" },
  { id: "leads_50",       emoji: "📬", name: "50 Leads",              desc: "50 leads generated total" },
  { id: "leads_100",      emoji: "📣", name: "100 Leads",             desc: "100 leads generated total" },
  { id: "leads_500",      emoji: "🚀", name: "500 Leads",             desc: "500 leads generated total" },
  { id: "first_dollar",   emoji: "💵", name: "First Dollar",          desc: "Earned your first dollar online" },
  { id: "week_500",       emoji: "💰", name: "$500 Week",             desc: "Generated $500+ in a single week" },
  { id: "week_1000",      emoji: "💎", name: "$1K Week",              desc: "Generated $1,000+ in a single week" },
  { id: "month_1000",     emoji: "🥇", name: "$1K Month",             desc: "Generated $1,000+ in a single month" },
  { id: "month_5000",     emoji: "🏆", name: "$5K Month",             desc: "Generated $5,000+ in a single month" },
  { id: "month_10000",    emoji: "👑", name: "$10K Month",            desc: "Generated $10,000+ in a single month" },
  { id: "streak_4",       emoji: "🔥", name: "4-Week Streak",         desc: "4 consecutive weeks of check-ins" },
  { id: "streak_8",       emoji: "🔥🔥", name: "8-Week Streak",      desc: "8 consecutive weeks of check-ins" },
  { id: "streak_12",      emoji: "⚡", name: "12-Week Streak",        desc: "12 consecutive weeks of check-ins" },
  { id: "streak_26",      emoji: "🌟", name: "6-Month Streak",        desc: "26 consecutive weeks of check-ins" },
  { id: "streak_52",      emoji: "🎖️", name: "1-Year Streak",        desc: "52 consecutive weeks of check-ins" },
] as const;

const PLATFORMS = ["YouTube", "Facebook", "Instagram", "TikTok", "Other"] as const;

// ─── Helper: ISO week ─────────────────────────────────────────────────────────
function getISOWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

function computeStreak(checkins: AccountabilityCheckin[]): number {
  if (!checkins.length) return 0;
  const sorted = [...checkins].sort((a, b) =>
    b.year !== a.year ? b.year - a.year : b.weekNumber - a.weekNumber
  );
  let streak = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevDate = new Date(prev.year, 0, 1 + (prev.weekNumber - 1) * 7);
    const currDate = new Date(curr.year, 0, 1 + (curr.weekNumber - 1) * 7);
    const diffDays = (prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays >= 5 && diffDays <= 9) streak++;
    else break;
  }
  return streak;
}

function rolling4Avg(checkins: AccountabilityCheckin[], field: keyof AccountabilityCheckin): number {
  const last4 = [...checkins].slice(-4);
  if (!last4.length) return 0;
  return last4.reduce((s, c) => s + (Number(c[field]) || 0), 0) / last4.length;
}

function fmt$(n: number) { return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }); }

// ─── Badge Congrats Dialog ────────────────────────────────────────────────────
function BadgeCongratsDialog({ badgeIds, onClose }: { badgeIds: string[]; onClose: () => void }) {
  const defs = badgeIds.map(id => BADGE_DEFS.find(b => b.id === id)).filter(Boolean);
  return (
    <Dialog open={badgeIds.length > 0} onOpenChange={onClose}>
      <DialogContent className="max-w-sm text-center">
        <DialogHeader>
          <DialogTitle className="text-2xl">🎉 New Badge{defs.length > 1 ? "s" : ""} Earned!</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {defs.map(b => b && (
            <div key={b.id} className="flex flex-col items-center gap-1 p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700">
              <span className="text-5xl">{b.emoji}</span>
              <p className="font-bold text-lg">{b.name}</p>
              <p className="text-sm text-muted-foreground">{b.desc}</p>
            </div>
          ))}
        </div>
        <Button onClick={onClose} className="w-full">Awesome!</Button>
      </DialogContent>
    </Dialog>
  );
}

// ─── Check-In Form ────────────────────────────────────────────────────────────
function CheckInForm({ existing, onSaved }: { existing: AccountabilityCheckin | null; onSaved: (newBadges: string[]) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { control, register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      videosPublished: existing?.videosPublished ?? 0,
      videoPlatforms: (existing?.videoPlatforms as string[]) ?? [],
      totalViews: existing?.totalViews ?? 0,
      newLeads: existing?.newLeads ?? 0,
      emailListSize: existing?.emailListSize ?? 0,
      revenueThisWeek: existing?.revenueThisWeek ?? 0,
      hoursWorked: existing?.hoursWorked ?? 0,
      weeklyWin: existing?.weeklyWin ?? "",
      weeklyStruggle: existing?.weeklyStruggle ?? "",
      nextWeekGoal: existing?.nextWeekGoal ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/accountability/checkin", data),
    onSuccess: async (res) => {
      const json = await res.json();
      qc.invalidateQueries({ queryKey: ["/api/accountability/checkin/current"] });
      qc.invalidateQueries({ queryKey: ["/api/accountability/checkins"] });
      qc.invalidateQueries({ queryKey: ["/api/accountability/badges"] });
      toast({ title: existing ? "Check-in updated!" : "Check-in submitted!", description: "Your data has been saved." });
      onSaved(json.newBadges ?? []);
    },
    onError: () => toast({ title: "Error", description: "Failed to save check-in.", variant: "destructive" }),
  });

  return (
    <form onSubmit={handleSubmit(d => mutation.mutate(d))} className="space-y-6 max-w-2xl">
      {existing && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 text-sm text-blue-700 dark:text-blue-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          You already submitted this week. You can update your entry below.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="videosPublished">Videos Published This Week</Label>
          <Input id="videosPublished" type="number" min={0} {...register("videosPublished", { valueAsNumber: true })} data-testid="input-videos-published" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="totalViews">Total Views Across All Platforms</Label>
          <Input id="totalViews" type="number" min={0} {...register("totalViews", { valueAsNumber: true })} data-testid="input-total-views" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="newLeads">New Leads / Opt-ins</Label>
          <Input id="newLeads" type="number" min={0} {...register("newLeads", { valueAsNumber: true })} data-testid="input-new-leads" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="emailListSize">Current Email List Size</Label>
          <Input id="emailListSize" type="number" min={0} {...register("emailListSize", { valueAsNumber: true })} data-testid="input-email-list-size" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="revenueThisWeek">Revenue This Week ($)</Label>
          <Input id="revenueThisWeek" type="number" min={0} step="0.01" {...register("revenueThisWeek", { valueAsNumber: true })} data-testid="input-revenue" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="hoursWorked">Hours Worked on Business</Label>
          <Input id="hoursWorked" type="number" min={0} step="0.5" {...register("hoursWorked", { valueAsNumber: true })} data-testid="input-hours-worked" />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Which Platforms Did You Post On?</Label>
        <Controller name="videoPlatforms" control={control} render={({ field }) => (
          <div className="flex flex-wrap gap-3">
            {PLATFORMS.map(p => (
              <div key={p} className="flex items-center gap-2">
                <Checkbox
                  id={`platform-${p}`}
                  checked={(field.value as string[]).includes(p)}
                  onCheckedChange={checked => {
                    const cur = field.value as string[];
                    field.onChange(checked ? [...cur, p] : cur.filter(x => x !== p));
                  }}
                  data-testid={`checkbox-platform-${p.toLowerCase()}`}
                />
                <Label htmlFor={`platform-${p}`} className="cursor-pointer">{p}</Label>
              </div>
            ))}
          </div>
        )} />
      </div>

      <div className="space-y-1">
        <Label htmlFor="weeklyWin">🏆 One Win to Celebrate This Week</Label>
        <Textarea id="weeklyWin" rows={3} placeholder="What went well? Even small wins count!" {...register("weeklyWin")} data-testid="textarea-weekly-win" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="weeklyStruggle">💪 One Struggle or Challenge This Week</Label>
        <Textarea id="weeklyStruggle" rows={3} placeholder="What got in the way? Be honest with yourself." {...register("weeklyStruggle")} data-testid="textarea-weekly-struggle" />
      </div>
      <div className="space-y-1">
        <Label htmlFor="nextWeekGoal">🎯 Main Focus Goal for Next Week</Label>
        <Textarea id="nextWeekGoal" rows={3} placeholder="What's your #1 priority next week?" {...register("nextWeekGoal")} data-testid="textarea-next-week-goal" />
      </div>

      <Button type="submit" disabled={isSubmitting || mutation.isPending} className="w-full h-11" data-testid="button-submit-checkin">
        {mutation.isPending ? "Saving…" : existing ? "Update This Week's Check-In" : "Submit Check-In"}
      </Button>
    </form>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ checkins }: { checkins: AccountabilityCheckin[] }) {
  const sorted = useMemo(() =>
    [...checkins].sort((a, b) => a.year !== b.year ? a.year - b.year : a.weekNumber - b.weekNumber),
    [checkins]);

  const streak = useMemo(() => computeStreak(checkins), [checkins]);
  const totalVideos = checkins.reduce((s, c) => s + c.videosPublished, 0);
  const totalLeads = checkins.reduce((s, c) => s + c.newLeads, 0);
  const totalRevenue = checkins.reduce((s, c) => s + c.revenueThisWeek, 0);
  const revenuePerVideo = totalVideos > 0 ? totalRevenue / totalVideos : 0;

  const now = new Date();
  const thisMonthCheckins = checkins.filter(c => {
    const d = new Date(c.dateSubmitted);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });
  const thisYearCheckins = checkins.filter(c => new Date(c.dateSubmitted).getFullYear() === now.getFullYear());
  const monthRevenue = thisMonthCheckins.reduce((s, c) => s + c.revenueThisWeek, 0);
  const yearRevenue = thisYearCheckins.reduce((s, c) => s + c.revenueThisWeek, 0);
  const monthVideos = thisMonthCheckins.reduce((s, c) => s + c.videosPublished, 0);
  const yearVideos = thisYearCheckins.reduce((s, c) => s + c.videosPublished, 0);
  const monthLeads = thisMonthCheckins.reduce((s, c) => s + c.newLeads, 0);
  const yearLeads = thisYearCheckins.reduce((s, c) => s + c.newLeads, 0);

  const bestWeekRevenue = Math.max(...checkins.map(c => c.revenueThisWeek));
  const bestWeekLeads = Math.max(...checkins.map(c => c.newLeads));

  const avg4Videos = rolling4Avg(sorted, "videosPublished");
  const avg4Leads = rolling4Avg(sorted, "newLeads");
  const avg4Revenue = rolling4Avg(sorted, "revenueThisWeek");
  const last = sorted[sorted.length - 1];
  const consistencyScore = Math.min(checkins.length, 10);

  const chartData = sorted.map((c, i) => ({
    label: `W${c.weekNumber}`,
    videos: c.videosPublished,
    views: c.totalViews,
    leads: c.newLeads,
    emailList: c.emailListSize,
    revenue: c.revenueThisWeek,
  }));

  const insightArrow = (val: number, avg: number) => {
    if (val > avg * 1.05) return { icon: TrendingUp, color: "text-green-500", label: "above average" };
    if (val < avg * 0.95) return { icon: TrendingDown, color: "text-red-500", label: "below average" };
    return { icon: Minus, color: "text-muted-foreground", label: "on track" };
  };

  const videoTrend = insightArrow(last?.videosPublished ?? 0, avg4Videos);
  const leadTrend = insightArrow(last?.newLeads ?? 0, avg4Leads);
  const revTrend = insightArrow(last?.revenueThisWeek ?? 0, avg4Revenue);

  const trendMsg = (() => {
    const ups = [videoTrend, leadTrend, revTrend].filter(t => t.label === "above average").length;
    const downs = [videoTrend, leadTrend, revTrend].filter(t => t.label === "below average").length;
    if (ups >= 2) return "🔥 You're trending upward — keep this momentum going!";
    if (downs >= 2) return "💪 A tough week, but showing up is what matters. Reset and go!";
    return "📊 You're holding steady. Small consistent actions build big results.";
  })();

  const StatCard = ({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) => (
    <Card>
      <CardContent className="pt-4 pb-3 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10"><Icon className="h-5 w-5 text-primary" /></div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4" data-testid="grid-stats">
        <StatCard icon={Flame} label="Check-In Streak" value={`${streak} wk${streak !== 1 ? "s" : ""}`} sub={`${consistencyScore}/10 consistency`} />
        <StatCard icon={Video} label="Total Videos" value={totalVideos.toString()} sub={`${monthVideos} this month`} />
        <StatCard icon={Users} label="Total Leads" value={totalLeads.toLocaleString()} sub={`${monthLeads} this month`} />
        <StatCard icon={DollarSign} label="Total Revenue" value={fmt$(totalRevenue)} sub={`${fmt$(monthRevenue)} this month`} />
      </div>

      {/* Insights for latest week */}
      {last && (
        <Card data-testid="card-weekly-insights">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4" /> Weekly Insights (Latest)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm italic text-muted-foreground">{trendMsg}</p>
            <div className="grid grid-cols-3 gap-3 mt-2">
              {[
                { label: "Videos vs avg", val: last.videosPublished, avg: avg4Videos, trend: videoTrend },
                { label: "Leads vs avg", val: last.newLeads, avg: avg4Leads, trend: leadTrend },
                { label: "Revenue vs avg", val: last.revenueThisWeek, avg: avg4Revenue, trend: revTrend },
              ].map(({ label, val, avg, trend }) => (
                <div key={label} className="text-center p-3 rounded-lg bg-muted/40">
                  <p className="text-xs text-muted-foreground mb-1">{label}</p>
                  <div className={`flex items-center justify-center gap-1 ${trend.color}`}>
                    <trend.icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{trend.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">4wk avg: {typeof avg === 'number' && avg > 10 ? fmt$(avg) : avg.toFixed(1)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Personal records */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-yellow-300 dark:border-yellow-700">
          <CardContent className="pt-4 flex items-center gap-3">
            <Star className="h-6 w-6 text-yellow-500" />
            <div>
              <p className="text-xs text-muted-foreground">Best Week — Revenue</p>
              <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{fmt$(bestWeekRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-yellow-300 dark:border-yellow-700">
          <CardContent className="pt-4 flex items-center gap-3">
            <Star className="h-6 w-6 text-yellow-500" />
            <div>
              <p className="text-xs text-muted-foreground">Best Week — Leads</p>
              <p className="text-lg font-bold text-yellow-600 dark:text-yellow-400">{bestWeekLeads.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Running totals */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" /> Running Totals</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">This Month</TableHead>
                <TableHead className="text-right">This Year</TableHead>
                <TableHead className="text-right">All Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow><TableCell>Videos Published</TableCell><TableCell className="text-right">{monthVideos}</TableCell><TableCell className="text-right">{yearVideos}</TableCell><TableCell className="text-right">{totalVideos}</TableCell></TableRow>
              <TableRow><TableCell>Leads Generated</TableCell><TableCell className="text-right">{monthLeads}</TableCell><TableCell className="text-right">{yearLeads}</TableCell><TableCell className="text-right">{totalLeads}</TableCell></TableRow>
              <TableRow><TableCell>Revenue</TableCell><TableCell className="text-right">{fmt$(monthRevenue)}</TableCell><TableCell className="text-right">{fmt$(yearRevenue)}</TableCell><TableCell className="text-right">{fmt$(totalRevenue)}</TableCell></TableRow>
              <TableRow><TableCell>Revenue / Video</TableCell><TableCell className="text-right" colSpan={2} /><TableCell className="text-right font-semibold">{fmt$(revenuePerVideo)}</TableCell></TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Charts */}
      <div className="space-y-6">
        {[
          { key: "videos", label: "Videos Published", color: "#3b82f6" },
          { key: "leads", label: "New Leads", color: "#22c55e" },
          { key: "revenue", label: "Revenue ($)", color: "#f59e0b" },
          { key: "views", label: "Total Views", color: "#a855f7" },
          { key: "emailList", label: "Email List Size", color: "#ec4899" },
        ].map(({ key, label, color }) => (
          <Card key={key}>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label} Over Time</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={chartData} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Badges Grid ─────────────────────────────────────────────────────────────
function BadgesGrid({ earnedIds }: { earnedIds: Set<string> }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3" data-testid="grid-badges">
      {BADGE_DEFS.map(b => {
        const earned = earnedIds.has(b.id);
        return (
          <div key={b.id} className={`flex flex-col items-center text-center p-4 rounded-xl border transition-all ${earned ? "border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/20" : "border-border bg-muted/30 opacity-50"}`} data-testid={`badge-${b.id}`}>
            <span className="text-3xl mb-2">{earned ? b.emoji : "🔒"}</span>
            <p className={`text-sm font-semibold ${earned ? "text-yellow-700 dark:text-yellow-400" : "text-muted-foreground"}`}>{b.name}</p>
            <p className="text-xs text-muted-foreground mt-1">{b.desc}</p>
          </div>
        );
      })}
    </div>
  );
}

// ─── History Table ────────────────────────────────────────────────────────────
type SortField = "dateSubmitted" | "videosPublished" | "newLeads" | "revenueThisWeek";

function HistoryTable({ checkins }: { checkins: AccountabilityCheckin[] }) {
  const [sortField, setSortField] = useState<SortField>("dateSubmitted");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<AccountabilityCheckin | null>(null);

  const sorted = useMemo(() => {
    return [...checkins].sort((a, b) => {
      let av: any = a[sortField], bv: any = b[sortField];
      if (sortField === "dateSubmitted") { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
  }, [checkins, sortField, sortDir]);

  const toggleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const SortBtn = ({ field, label }: { field: SortField; label: string }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-foreground">
      {label}
      {sortField === field ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
    </button>
  );

  return (
    <>
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead><SortBtn field="dateSubmitted" label="Week" /></TableHead>
              <TableHead className="text-right"><SortBtn field="videosPublished" label="Videos" /></TableHead>
              <TableHead className="text-right hidden sm:table-cell">Views</TableHead>
              <TableHead className="text-right"><SortBtn field="newLeads" label="Leads" /></TableHead>
              <TableHead className="text-right"><SortBtn field="revenueThisWeek" label="Revenue" /></TableHead>
              <TableHead className="text-right hidden sm:table-cell">Hours</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map(c => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(c)} data-testid={`row-checkin-${c.id}`}>
                <TableCell>
                  <p className="font-medium">Week {c.weekNumber}, {c.year}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(c.dateSubmitted), "MMM d")}</p>
                </TableCell>
                <TableCell className="text-right">{c.videosPublished}</TableCell>
                <TableCell className="text-right hidden sm:table-cell">{c.totalViews.toLocaleString()}</TableCell>
                <TableCell className="text-right">{c.newLeads}</TableCell>
                <TableCell className="text-right">{fmt$(c.revenueThisWeek)}</TableCell>
                <TableCell className="text-right hidden sm:table-cell">{c.hoursWorked}h</TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No check-ins yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        {selected && (
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Week {selected.weekNumber}, {selected.year}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["Videos Published", selected.videosPublished],
                  ["Total Views", selected.totalViews.toLocaleString()],
                  ["New Leads", selected.newLeads],
                  ["Email List Size", selected.emailListSize.toLocaleString()],
                  ["Revenue", fmt$(selected.revenueThisWeek)],
                  ["Hours Worked", `${selected.hoursWorked}h`],
                ].map(([k, v]) => (
                  <div key={String(k)} className="p-2 rounded bg-muted/40">
                    <p className="text-xs text-muted-foreground">{k}</p>
                    <p className="font-semibold">{v}</p>
                  </div>
                ))}
              </div>
              {(selected.videoPlatforms as string[]).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Platforms</p>
                  <div className="flex flex-wrap gap-1">{(selected.videoPlatforms as string[]).map(p => <Badge key={p} variant="secondary">{p}</Badge>)}</div>
                </div>
              )}
              {selected.weeklyWin && <div><p className="text-xs text-muted-foreground mb-1">🏆 Win</p><p className="bg-muted/40 p-2 rounded">{selected.weeklyWin}</p></div>}
              {selected.weeklyStruggle && <div><p className="text-xs text-muted-foreground mb-1">💪 Struggle</p><p className="bg-muted/40 p-2 rounded">{selected.weeklyStruggle}</p></div>}
              {selected.nextWeekGoal && <div><p className="text-xs text-muted-foreground mb-1">🎯 Next Week Goal</p><p className="bg-muted/40 p-2 rounded">{selected.nextWeekGoal}</p></div>}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

// ─── Coaching Brief ───────────────────────────────────────────────────────────
function CoachingBrief({ checkins, badgeIds }: { checkins: AccountabilityCheckin[]; badgeIds: Set<string> }) {
  const printRef = useRef<HTMLDivElement>(null);
  const last4 = useMemo(() => [...checkins].sort((a, b) => b.year !== a.year ? b.year - a.year : b.weekNumber - a.weekNumber).slice(0, 4).reverse(), [checkins]);

  const t4Videos = last4.reduce((s, c) => s + c.videosPublished, 0);
  const t4Leads = last4.reduce((s, c) => s + c.newLeads, 0);
  const t4Revenue = last4.reduce((s, c) => s + c.revenueThisWeek, 0);
  const streak = computeStreak(checkins);
  const consistencyScore = Math.min(checkins.length, 10);

  const trend = (vals: number[]) => {
    if (vals.length < 2) return "—";
    const first = vals.slice(0, Math.floor(vals.length / 2)).reduce((s, v) => s + v, 0);
    const last = vals.slice(Math.floor(vals.length / 2)).reduce((s, v) => s + v, 0);
    if (last > first * 1.05) return "↑ Improving";
    if (last < first * 0.95) return "↓ Declining";
    return "→ Holding Steady";
  };

  const earnedBadges = BADGE_DEFS.filter(b => badgeIds.has(b.id));

  const handlePrint = () => {
    if (!printRef.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<html><head><title>Coaching Brief</title><style>
      body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 32px; color: #111; }
      h1 { color: #06092a; } h2 { color: #06092a; border-bottom: 1px solid #eee; padding-bottom: 6px; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; }
      td, th { padding: 6px 10px; border: 1px solid #ddd; text-align: left; }
      th { background: #f5f5f5; } .badge { display: inline-block; margin: 3px; padding: 4px 8px; background: #fef9c3; border: 1px solid #f59e0b; border-radius: 99px; font-size: 13px; }
    </style></head><body>`);
    win.document.write(printRef.current.innerHTML);
    win.document.write("</body></html>");
    win.document.close();
    win.print();
  };

  if (checkins.length < 1) return (
    <div className="text-center text-muted-foreground py-12">Submit your first check-in to generate a coaching brief.</div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={handlePrint} data-testid="button-print-brief">
          <Printer className="mr-2 h-4 w-4" /> Print / Export PDF
        </Button>
      </div>

      <div ref={printRef} className="space-y-6 p-6 rounded-xl border bg-background text-sm" data-testid="card-coaching-brief">
        <div>
          <h1 className="text-2xl font-bold">Coaching Brief</h1>
          <p className="text-muted-foreground">Generated {format(new Date(), "MMMM d, yyyy")} · Last 4 weeks of data</p>
        </div>

        <Separator />

        <div>
          <h2 className="font-semibold text-base mb-3">4-Week Totals</h2>
          <div className="grid grid-cols-3 gap-3">
            {[["Videos", t4Videos], ["Leads", t4Leads], ["Revenue", fmt$(t4Revenue)]].map(([k, v]) => (
              <div key={String(k)} className="p-3 rounded-lg bg-muted/40 text-center">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="text-lg font-bold">{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-base mb-3">Trend Direction</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Videos", trend(last4.map(c => c.videosPublished))],
              ["Leads", trend(last4.map(c => c.newLeads))],
              ["Revenue", trend(last4.map(c => c.revenueThisWeek))],
            ].map(([k, v]) => (
              <div key={String(k)} className="p-3 rounded-lg bg-muted/40 text-center">
                <p className="text-xs text-muted-foreground">{k}</p>
                <p className="font-medium">{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-base mb-3">Weekly Summaries</h2>
          <div className="space-y-3">
            {last4.map(c => (
              <div key={c.id} className="p-3 rounded-lg border">
                <p className="font-semibold mb-2">Week {c.weekNumber}, {c.year} — {fmt$(c.revenueThisWeek)} revenue · {c.newLeads} leads · {c.videosPublished} videos</p>
                {c.weeklyWin && <p className="text-sm"><strong>Win:</strong> {c.weeklyWin}</p>}
                {c.weeklyStruggle && <p className="text-sm"><strong>Struggle:</strong> {c.weeklyStruggle}</p>}
                {c.nextWeekGoal && <p className="text-sm"><strong>Goal:</strong> {c.nextWeekGoal}</p>}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="font-semibold text-base mb-2">Consistency</h2>
          <p>Check-in streak: <strong>{streak} week{streak !== 1 ? "s" : ""}</strong> · Consistency score: <strong>{consistencyScore}/10</strong></p>
        </div>

        {earnedBadges.length > 0 && (
          <div>
            <h2 className="font-semibold text-base mb-2">Earned Badges</h2>
            <div className="flex flex-wrap gap-2">
              {earnedBadges.map(b => (
                <span key={b.id} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700 text-sm">
                  {b.emoji} {b.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AccountabilityPage() {
  const [newBadges, setNewBadges] = useState<string[]>([]);
  const { week, year } = getISOWeek(new Date());

  const { data: currentData, isLoading: loadingCurrent } = useQuery<{ checkin: AccountabilityCheckin | null; week: number; year: number }>({
    queryKey: ["/api/accountability/checkin/current"],
  });

  const { data: allCheckins = [], isLoading: loadingAll } = useQuery<AccountabilityCheckin[]>({
    queryKey: ["/api/accountability/checkins"],
  });

  const { data: badgesData = [] } = useQuery<AccountabilityBadge[]>({
    queryKey: ["/api/accountability/badges"],
  });

  const earnedIds = useMemo(() => new Set(badgesData.map(b => b.badgeId)), [badgesData]);
  const earnedCount = earnedIds.size;
  const streak = useMemo(() => computeStreak(allCheckins), [allCheckins]);

  const loading = loadingCurrent || loadingAll;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <BadgeCongratsDialog badgeIds={newBadges} onClose={() => setNewBadges([])} />

      <div className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Trophy className="h-6 w-6 text-yellow-500" /> Accountability Tracker
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Week {week}, {year}</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Flame className="h-4 w-4 text-orange-500" />
              <span>{streak} wk streak</span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <span>{earnedCount}/{BADGE_DEFS.length} badges</span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">Loading…</div>
      ) : (
        <Tabs defaultValue="checkin">
          <TabsList className="mb-6 flex flex-wrap h-auto gap-1">
            <TabsTrigger value="checkin" data-testid="tab-checkin">
              {currentData?.checkin ? "✓ " : ""}Check-In
            </TabsTrigger>
            <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="badges" data-testid="tab-badges">
              Badges <Badge variant="secondary" className="ml-1">{earnedCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="tab-history">History</TabsTrigger>
            <TabsTrigger value="brief" data-testid="tab-brief">Coaching Brief</TabsTrigger>
          </TabsList>

          <TabsContent value="checkin">
            <CheckInForm existing={currentData?.checkin ?? null} onSaved={setNewBadges} />
          </TabsContent>

          <TabsContent value="dashboard">
            {allCheckins.length < 2 ? (
              <div className="text-center text-muted-foreground py-12">
                <p className="text-lg font-medium mb-2">Dashboard unlocks after 2 check-ins</p>
                <p className="text-sm">Submit your first weekly check-in to start tracking your progress.</p>
              </div>
            ) : (
              <Dashboard checkins={allCheckins} />
            )}
          </TabsContent>

          <TabsContent value="badges">
            <BadgesGrid earnedIds={earnedIds} />
          </TabsContent>

          <TabsContent value="history">
            <HistoryTable checkins={allCheckins} />
          </TabsContent>

          <TabsContent value="brief">
            <CoachingBrief checkins={allCheckins} badgeIds={earnedIds} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
