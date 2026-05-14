import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Youtube, Eye, Video, ThumbsUp, MessageSquare,
  ExternalLink, RefreshCw, LogOut, Clock, TrendingUp, TrendingDown,
  Monitor, Globe, MousePointerClick, AlertCircle, UserPlus, Film,
  Share2, Search, Users, ChevronLeft, ChevronRight, Zap,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}
function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtShortDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function parseDuration(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = parseInt(m[1] || "0"), min = parseInt(m[2] || "0"), sec = parseInt(m[3] || "0");
  if (h > 0) return `${h}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${min}:${String(sec).padStart(2, "0")}`;
}
function fmtSecs(s: number): string {
  if (!s || s <= 0) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}
function fmtWatchMins(mins: number): string {
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Channel = {
  id: string; title: string; handle: string; thumbnail: string;
  subscriberCount: number; videoCount: number; viewCount: number;
};
type Status = { connected: boolean; connectedEmail?: string; channel?: Channel };
type VideoItem = {
  id: string; title: string; thumbnail: string; publishedAt: string;
  viewCount: number; likeCount: number; commentCount: number; duration: string;
  isShort: boolean;
};
type AnalyticsDay = {
  date: string; views: number; watchMinutes: number;
  subscribersGained: number; subscribersLost: number;
  impressions: number; ctr: number; shares: number;
};
type AnalyticsTotals = {
  views: number; watchHours: number; avgViewDuration: number;
  subscribersGained: number; subscribersLost: number;
  impressions: number; ctr: number; shares: number;
};
type AnalyticsData = { timeSeries: AnalyticsDay[]; totals: AnalyticsTotals } | null;
type TrafficSource = { source: string; label: string; views: number; watchMinutes: number };
type DeviceBreakdown = { device: string; label: string; views: number; pct: number };
type CountryViews = { country: string; views: number; watchMinutes: number };
type SearchTerm = { term: string; views: number };
type AgeGroup = { age: string; label: string; pct: number };
type DemographicsData = { ageGroups: AgeGroup[]; genderMalePct: number; genderFemalePct: number };
type SubscriberStatusData = {
  subscribedViews: number; subscribedWatchMinutes: number;
  nonSubscribedViews: number; nonSubscribedWatchMinutes: number;
};
type BreakdownData = {
  traffic: TrafficSource[]; devices: DeviceBreakdown[]; countries: CountryViews[];
  searchTerms: SearchTerm[]; demographics: DemographicsData;
  subscriberStatus: SubscriberStatusData;
};
type VideoAnalytics = {
  videoId: string; views: number; watchMinutes: number; avgViewDuration: number;
  avgViewPercentage: number; likes: number; comments: number; shares: number;
};
type MergedVideo = VideoItem & Partial<VideoAnalytics>;

// ── Shared UI ─────────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
  borderRadius: 8, fontSize: 12,
};

function KpiCard({ label, value, sub, icon: Icon, iconColor, trend }: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  iconColor: string; trend?: { value: string; positive: boolean } | null;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
        </div>
        <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        {trend && (
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trend.positive ? "text-emerald-500" : "text-rose-500"}`}>
            {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend.value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Card className="border-border bg-card overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-red-500 to-rose-600" />
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-0.5">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground mb-4">{sub}</p>}
        {!sub && <div className="mb-4" />}
        {children}
      </CardContent>
    </Card>
  );
}

function PercentBar({ value, total, color = "bg-red-500" }: { value: number; total: number; color?: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ReconnectBanner({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
      <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">Deep analytics require a reconnect</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Disconnect and reconnect your channel to unlock watch time, CTR, traffic sources, demographics, search terms, and more.
        </p>
      </div>
      <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={onConnect}>Reconnect</Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "videos" | "audience";
type SortKey = "views" | "watchTime" | "retention" | "engagement" | "shares" | "date";

export default function AnalyticsYouTubePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("overview");
  const [days, setDays] = useState(28);
  const [videoSort, setVideoSort] = useState<SortKey>("views");
  const [videoFilter, setVideoFilter] = useState<"all" | "regular" | "shorts">("all");
  const [videoPage, setVideoPage] = useState(0);
  const VIDEOS_PER_PAGE = 25;

  const { data: status, isLoading: statusLoading } = useQuery<Status>({
    queryKey: ["/api/analytics/youtube/status"],
  });
  const connected = status?.connected === true;

  const { data: videos, isLoading: videosLoading } = useQuery<VideoItem[]>({
    queryKey: ["/api/analytics/youtube/videos"],
    enabled: connected,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics/youtube/channel-analytics", days],
    queryFn: () => fetch(`/api/analytics/youtube/channel-analytics?days=${days}`, { credentials: "include" }).then((r) => r.json()),
    enabled: connected,
  });

  const { data: breakdowns, isLoading: breakdownsLoading } = useQuery<BreakdownData>({
    queryKey: ["/api/analytics/youtube/breakdowns", days],
    queryFn: () => fetch(`/api/analytics/youtube/breakdowns?days=${days}`, { credentials: "include" }).then((r) => r.json()),
    enabled: connected && tab === "audience",
  });

  const { data: videoAnalytics, isLoading: videoAnalyticsLoading } = useQuery<VideoAnalytics[]>({
    queryKey: ["/api/analytics/youtube/video-analytics", days],
    queryFn: () => fetch(`/api/analytics/youtube/video-analytics?days=${days}`, { credentials: "include" }).then((r) => r.json()),
    enabled: connected && tab === "videos",
  });

  const disconnectMut = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/analytics/youtube/disconnect"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/analytics/youtube/status"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics/youtube/videos"] });
      toast({ title: "Disconnected", description: "YouTube channel has been unlinked." });
    },
  });
  const refreshMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/analytics/youtube/refresh"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/analytics/youtube/status"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics/youtube/videos"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics/youtube/channel-analytics", days] });
      toast({ title: "Refreshed", description: "Channel data updated." });
    },
    onError: () => toast({ title: "Error", description: "Could not refresh.", variant: "destructive" }),
  });

  const analyticsAvailable = analytics !== null && (analytics?.timeSeries?.length ?? 0) > 0;
  const totals = analytics?.totals;
  const timeSeries = analytics?.timeSeries || [];

  const mergedVideos = useMemo<MergedVideo[]>(() => {
    if (!videos) return [];
    const map = new Map<string, VideoAnalytics>();
    (videoAnalytics || []).forEach((va) => map.set(va.videoId, va));
    return videos.map((v) => ({ ...v, ...(map.get(v.id) || {}) }));
  }, [videos, videoAnalytics]);

  const filteredSortedVideos = useMemo(() => {
    const filtered = videoFilter === "all" ? mergedVideos
      : videoFilter === "shorts" ? mergedVideos.filter((v) => v.isShort)
      : mergedVideos.filter((v) => !v.isShort);
    return [...filtered].sort((a, b) => {
      switch (videoSort) {
        case "views": return (b.viewCount || 0) - (a.viewCount || 0);
        case "watchTime": return (b.watchMinutes || 0) - (a.watchMinutes || 0);
        case "retention": return (b.avgViewPercentage || 0) - (a.avgViewPercentage || 0);
        case "shares": return (b.shares || 0) - (a.shares || 0);
        case "engagement": {
          const eA = a.viewCount > 0 ? (a.likeCount + a.commentCount) / a.viewCount : 0;
          const eB = b.viewCount > 0 ? (b.likeCount + b.commentCount) / b.viewCount : 0;
          return eB - eA;
        }
        case "date": return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        default: return 0;
      }
    });
  }, [mergedVideos, videoSort, videoFilter]);

  const totalPages = Math.ceil(filteredSortedVideos.length / VIDEOS_PER_PAGE);
  const pagedVideos = filteredSortedVideos.slice(videoPage * VIDEOS_PER_PAGE, (videoPage + 1) * VIDEOS_PER_PAGE);
  const shortsCount = mergedVideos.filter((v) => v.isShort).length;
  const regularCount = mergedVideos.filter((v) => !v.isShort).length;

  const chartData = timeSeries.map((d) => ({
    date: fmtShortDate(d.date),
    Views: d.views,
    "Watch Hrs": Math.round(d.watchMinutes / 60 * 10) / 10,
    "Subs +": d.subscribersGained,
    "Subs −": d.subscribersLost,
    Shares: d.shares,
  }));

  // ── Loading ───────────────────────────────────────────────────────────────
  if (statusLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-sidebar text-sidebar-foreground px-6 py-8">
          <div className="max-w-6xl mx-auto">
            <Skeleton className="h-5 w-24 bg-white/10 mb-4" />
            <Skeleton className="h-8 w-56 bg-white/10" />
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <button onClick={() => setLocation("/analytics")}
            className="flex items-center gap-1.5 text-white/50 hover:text-white/80 text-sm mb-4 transition-colors"
            data-testid="button-back-analytics">
            <ArrowLeft className="h-4 w-4" />Analytics
          </button>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <Youtube className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">YouTube Analytics</h1>
                {connected && status?.connectedEmail && (
                  <p className="text-white/40 text-xs mt-0.5">{status.connectedEmail}</p>
                )}
              </div>
            </div>
            {connected && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10"
                  onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}
                  data-testid="button-refresh-youtube">
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshMut.isPending ? "animate-spin" : ""}`} />Refresh
                </Button>
                <Button size="sm" variant="ghost" className="text-white/60 hover:text-rose-400 hover:bg-white/10"
                  onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}
                  data-testid="button-disconnect-youtube">
                  <LogOut className="h-3.5 w-3.5 mr-1.5" />Disconnect
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Not connected */}
        {!connected && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-red-500/10 flex items-center justify-center mb-5">
              <Youtube className="h-10 w-10 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Connect your YouTube channel</h2>
            <p className="text-muted-foreground text-sm max-w-md mb-8 leading-relaxed">
              Sign in with the Google account that owns your channel to unlock full analytics — views, watch time, CTR, search terms, audience demographics, and more.
            </p>
            <Button className="bg-gradient-to-r from-red-500 to-rose-600 text-white hover:opacity-90 px-6"
              onClick={() => { window.location.href = "/api/analytics/youtube/connect"; }}
              data-testid="button-connect-youtube">
              <Youtube className="h-4 w-4 mr-2" />Connect YouTube Channel
            </Button>
            <p className="text-xs text-muted-foreground mt-4 opacity-60">Read-only access — we never post or modify anything on your channel.</p>
          </div>
        )}

        {/* Connected */}
        {connected && status?.channel && (
          <div className="space-y-6">

            {/* Channel card */}
            <Card className="border-border bg-card overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-red-500 to-rose-600" />
              <CardContent className="p-5 flex items-center gap-4">
                {status.channel.thumbnail ? (
                  <img src={status.channel.thumbnail} alt={status.channel.title}
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-red-500/30" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
                    <Youtube className="h-7 w-7 text-red-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-foreground truncate">{status.channel.title}</h2>
                  {status.channel.handle && <p className="text-sm text-muted-foreground">@{status.channel.handle.replace(/^@/, "")}</p>}
                  <div className="flex flex-wrap gap-4 mt-1.5">
                    <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{fmt(status.channel.subscriberCount)}</span> subscribers</span>
                    <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{fmt(status.channel.viewCount)}</span> total views</span>
                    <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{fmt(status.channel.videoCount)}</span> videos</span>
                  </div>
                </div>
                <a href={`https://youtube.com/channel/${status.channel.id}`} target="_blank" rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-youtube-channel">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </CardContent>
            </Card>

            {/* Tab bar + period selector */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {(["overview", "videos", "audience"] as Tab[]).map((t) => (
                  <button key={t} onClick={() => setTab(t)} data-testid={`tab-${t}`}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    {t}
                  </button>
                ))}
              </div>
              <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-period"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="28">Last 28 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="365">Last 365 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reconnect banner */}
            {!analyticsLoading && analytics === null && <ReconnectBanner onConnect={() => { window.location.href = "/api/analytics/youtube/connect"; }} />}

            {/* ═══════════════════ OVERVIEW TAB ═══════════════════ */}
            {tab === "overview" && (
              <div className="space-y-5">
                {analyticsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                  </div>
                ) : totals && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <KpiCard label="Views" value={fmt(totals.views)} icon={Eye} iconColor="text-red-500" sub={`last ${days}d`} />
                    <KpiCard label="Watch Hours" value={fmt(totals.watchHours)} icon={Clock} iconColor="text-rose-500" sub={`last ${days}d`} />
                    <KpiCard label="Avg View Duration" value={fmtSecs(totals.avgViewDuration)} icon={Film} iconColor="text-pink-500" sub="per view" />
                    <KpiCard label="Shares" value={fmt(totals.shares)} icon={Share2} iconColor="text-orange-500" sub={`last ${days}d`} />
                    <KpiCard
                      label="Subscribers Gained"
                      value={`+${fmt(totals.subscribersGained)}`}
                      icon={UserPlus} iconColor="text-emerald-500"
                      sub={totals.subscribersLost > 0 ? `−${fmt(totals.subscribersLost)} lost` : `last ${days}d`}
                      trend={
                        totals.subscribersGained - totals.subscribersLost > 0
                          ? { value: `+${fmt(totals.subscribersGained - totals.subscribersLost)} net`, positive: true }
                          : totals.subscribersGained - totals.subscribersLost < 0
                          ? { value: `${fmt(totals.subscribersGained - totals.subscribersLost)} net`, positive: false }
                          : null
                      }
                    />
                    <KpiCard label="Impressions" value={fmt(totals.impressions)} icon={Eye} iconColor="text-blue-500" sub="thumbnail shown" />
                    <KpiCard label="Click-Through Rate" value={totals.ctr.toFixed(1) + "%"} icon={MousePointerClick} iconColor="text-violet-500" sub="impressions → clicks" />
                    <KpiCard label="Videos Published" value={fmt(status.channel.videoCount)} icon={Video} iconColor="text-muted-foreground" sub="all time" />
                  </div>
                )}

                {/* Views trend */}
                {analyticsLoading ? <Skeleton className="h-64 rounded-2xl" /> : chartData.length > 0 && (
                  <SectionCard title="Views Over Time" sub={`Daily views — last ${days} days`}>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={fmt} width={42} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [fmt(v), n]} />
                        <Line type="monotone" dataKey="Views" stroke="#ef4444" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </SectionCard>
                )}

                {/* Watch hours + Shares side by side */}
                {!analyticsLoading && chartData.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <SectionCard title="Watch Hours" sub={`Hours watched per day — last ${days} days`}>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={32} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Line type="monotone" dataKey="Watch Hrs" stroke="#f43f5e" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </SectionCard>
                    <SectionCard title="Shares" sub={`Content shares per day — last ${days} days`}>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Bar dataKey="Shares" fill="#f97316" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </SectionCard>
                  </div>
                )}

                {/* Subscriber activity */}
                {!analyticsLoading && chartData.length > 0 && (
                  <SectionCard title="Subscriber Activity" sub={`Gained vs. lost per day — last ${days} days`}>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Subs +" fill="#10b981" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="Subs −" fill="#ef4444" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </SectionCard>
                )}

                {/* Impressions + CTR */}
                {!analyticsLoading && chartData.length > 0 && timeSeries.some((d) => d.impressions > 0) && (
                  <SectionCard title="Impressions & Click-Through Rate" sub={`Thumbnail shown vs. clicked — last ${days} days`}>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart
                        data={timeSeries.map((d) => ({ date: fmtShortDate(d.date), Impressions: d.impressions, "CTR %": parseFloat(d.ctr.toFixed(2)) }))}
                        margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={fmt} width={42} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => v + "%"} width={36} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [n === "CTR %" ? v + "%" : fmt(v), n]} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line yAxisId="left" type="monotone" dataKey="Impressions" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="CTR %" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </SectionCard>
                )}
              </div>
            )}

            {/* ═══════════════════ VIDEOS TAB ═══════════════════ */}
            {tab === "videos" && (
              <div className="space-y-4">
                {/* Filter + sort bar */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  {/* Type filter */}
                  <div className="flex items-center gap-1.5">
                    {(["all", "regular", "shorts"] as const).map((f) => {
                      const count = f === "all" ? mergedVideos.length : f === "shorts" ? shortsCount : regularCount;
                      const label = f === "all" ? "All" : f === "regular" ? "Regular" : "Shorts";
                      const icon = f === "shorts" ? <Zap className="h-3 w-3" /> : f === "regular" ? <Video className="h-3 w-3" /> : null;
                      return (
                        <button key={f} data-testid={`filter-${f}`}
                          onClick={() => { setVideoFilter(f); setVideoPage(0); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${videoFilter === f ? "bg-red-500 text-white" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                          {icon}{label}
                          <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${videoFilter === f ? "bg-white/20 text-white" : "bg-background text-muted-foreground"}`}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Sort */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Sort by</span>
                    <Select value={videoSort} onValueChange={(v) => { setVideoSort(v as SortKey); setVideoPage(0); }}>
                      <SelectTrigger className="w-40 h-8 text-xs" data-testid="select-video-sort"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="views">Views</SelectItem>
                        <SelectItem value="watchTime">Watch Time</SelectItem>
                        <SelectItem value="retention">Avg Retention</SelectItem>
                        <SelectItem value="engagement">Engagement Rate</SelectItem>
                        <SelectItem value="shares">Shares</SelectItem>
                        <SelectItem value="date">Publish Date</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Status line */}
                {!videosLoading && mergedVideos.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Showing {videoPage * VIDEOS_PER_PAGE + 1}–{Math.min((videoPage + 1) * VIDEOS_PER_PAGE, filteredSortedVideos.length)} of {filteredSortedVideos.length} {videoFilter !== "all" ? videoFilter : ""} video{filteredSortedVideos.length !== 1 ? "s" : ""}
                    {videoAnalytics?.length ? ` · analytics for last ${days} days` : ""}
                  </p>
                )}

                {(videosLoading || videoAnalyticsLoading) ? (
                  <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
                ) : filteredSortedVideos.length === 0 ? (
                  <Card className="border-border bg-card"><CardContent className="p-8 text-center">
                    <Video className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {mergedVideos.length === 0 ? "No videos found on this channel." : `No ${videoFilter} videos found.`}
                    </p>
                  </CardContent></Card>
                ) : (
                  <>
                    <Card className="border-border bg-card overflow-hidden">
                      <div className="h-1 w-full bg-gradient-to-r from-red-500 to-rose-600" />
                      <CardContent className="p-0">
                        {/* Desktop column headers */}
                        <div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-2 px-5 py-2.5 border-b border-border bg-muted/30">
                          <span className="text-xs font-medium text-muted-foreground">Video</span>
                          <span className="text-xs font-medium text-muted-foreground text-right">Views · Likes · Shares</span>
                          <span className="text-xs font-medium text-muted-foreground text-right">Watch Time</span>
                          <span className="text-xs font-medium text-muted-foreground text-right">Avg Duration</span>
                          <span className="text-xs font-medium text-muted-foreground text-right">Retention</span>
                          <span className="text-xs font-medium text-muted-foreground text-right">Engagement</span>
                        </div>
                        <div className="divide-y divide-border">
                          {pagedVideos.map((v, i) => {
                            const engRate = v.viewCount > 0 ? ((v.likeCount + v.commentCount) / v.viewCount * 100) : 0;
                            const hasAnalytics = v.watchMinutes !== undefined;
                            const ret = v.avgViewPercentage || 0;
                            return (
                              <div key={v.id} className="flex lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-3 lg:gap-2 px-5 py-3.5 items-center hover:bg-muted/20 transition-colors" data-testid={`video-row-${i}`}>
                                {/* Thumbnail + title */}
                                <div className="flex items-center gap-3 min-w-0">
                                  <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                    {v.thumbnail
                                      ? <img src={v.thumbnail} alt="" className="w-20 h-12 object-cover rounded-lg" />
                                      : <div className="w-20 h-12 bg-muted rounded-lg flex items-center justify-center"><Video className="h-4 w-4 text-muted-foreground" /></div>}
                                  </a>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <a href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer"
                                        className="text-sm font-medium text-foreground hover:text-red-500 transition-colors line-clamp-2 leading-snug">{v.title}</a>
                                      {v.isShort && (
                                        <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/20">
                                          <Zap className="h-2.5 w-2.5" />Short
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-xs text-muted-foreground">{fmtDate(v.publishedAt)}</span>
                                      {v.duration && <span className="text-xs text-muted-foreground">{parseDuration(v.duration)}</span>}
                                    </div>
                                    {/* Mobile stats */}
                                    <div className="flex flex-wrap gap-3 mt-1 lg:hidden text-xs text-muted-foreground">
                                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{fmt(v.viewCount)}</span>
                                      <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{fmt(v.likeCount)}</span>
                                      <span className="flex items-center gap-1"><Share2 className="h-3 w-3" />{fmt(v.shares || 0)}</span>
                                      {hasAnalytics && ret > 0 && <span>{ret.toFixed(0)}% retained</span>}
                                    </div>
                                  </div>
                                </div>
                                {/* Desktop columns */}
                                <div className="hidden lg:block text-right">
                                  <p className="text-sm font-semibold text-foreground">{fmt(v.viewCount)}</p>
                                  <div className="flex items-center justify-end gap-2 mt-0.5">
                                    <span className="text-xs text-muted-foreground flex items-center gap-0.5"><ThumbsUp className="h-2.5 w-2.5" />{fmt(v.likeCount)}</span>
                                    <span className="text-xs text-muted-foreground flex items-center gap-0.5"><MessageSquare className="h-2.5 w-2.5" />{fmt(v.commentCount)}</span>
                                    <span className="text-xs text-orange-500 flex items-center gap-0.5"><Share2 className="h-2.5 w-2.5" />{fmt(v.shares || 0)}</span>
                                  </div>
                                </div>
                                <div className="hidden lg:block text-right">
                                  {hasAnalytics && v.watchMinutes
                                    ? <p className="text-sm font-medium text-foreground">{fmtWatchMins(v.watchMinutes)}</p>
                                    : <p className="text-sm text-muted-foreground">—</p>}
                                </div>
                                <div className="hidden lg:block text-right">
                                  {hasAnalytics && v.avgViewDuration
                                    ? <p className="text-sm font-medium text-foreground">{fmtSecs(v.avgViewDuration)}</p>
                                    : <p className="text-sm text-muted-foreground">—</p>}
                                </div>
                                <div className="hidden lg:block text-right">
                                  {hasAnalytics && ret > 0 ? (
                                    <div>
                                      <p className={`text-sm font-semibold ${ret >= 50 ? "text-emerald-500" : ret >= 30 ? "text-amber-500" : "text-rose-500"}`}>{ret.toFixed(1)}%</p>
                                      <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
                                        <div className={`h-full rounded-full ${ret >= 50 ? "bg-emerald-500" : ret >= 30 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${Math.min(ret, 100)}%` }} />
                                      </div>
                                    </div>
                                  ) : <p className="text-sm text-muted-foreground">—</p>}
                                </div>
                                <div className="hidden lg:block text-right">
                                  {v.viewCount > 0
                                    ? <p className="text-sm font-medium text-foreground">{engRate.toFixed(2)}%</p>
                                    : <p className="text-sm text-muted-foreground">—</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between">
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
                          onClick={() => setVideoPage((p) => Math.max(0, p - 1))}
                          disabled={videoPage === 0} data-testid="button-prev-page">
                          <ChevronLeft className="h-3.5 w-3.5" />Previous
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Page {videoPage + 1} of {totalPages}
                        </span>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
                          onClick={() => setVideoPage((p) => Math.min(totalPages - 1, p + 1))}
                          disabled={videoPage === totalPages - 1} data-testid="button-next-page">
                          Next<ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ═══════════════════ AUDIENCE TAB ═══════════════════ */}
            {tab === "audience" && (
              <div className="space-y-5">
                {breakdownsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
                  </div>
                ) : !breakdowns ? (
                  <ReconnectBanner onConnect={() => { window.location.href = "/api/analytics/youtube/connect"; }} />
                ) : (
                  <>
                    {/* ── Subscriber vs Non-Subscriber ── */}
                    {(breakdowns.subscriberStatus?.subscribedViews > 0 || breakdowns.subscriberStatus?.nonSubscribedViews > 0) && (() => {
                      const ss = breakdowns.subscriberStatus;
                      const totalViews = ss.subscribedViews + ss.nonSubscribedViews;
                      const subPct = totalViews > 0 ? Math.round(ss.subscribedViews / totalViews * 100) : 0;
                      const nonSubPct = 100 - subPct;
                      return (
                        <SectionCard title="Subscriber Insights" sub={`Who's watching — subscribers vs. new viewers — last ${days} days`}>
                          {/* Visual split bar */}
                          <div className="h-3 rounded-full overflow-hidden flex mb-5">
                            <div className="bg-emerald-500 h-full transition-all" style={{ width: `${subPct}%` }} />
                            <div className="bg-blue-400 h-full transition-all" style={{ width: `${nonSubPct}%` }} />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                <span className="text-xs font-medium text-muted-foreground">Subscribers</span>
                              </div>
                              <p className="text-3xl font-bold text-foreground">{subPct}%</p>
                              <div className="mt-2 space-y-0.5">
                                <p className="text-xs text-muted-foreground">{fmt(ss.subscribedViews)} views</p>
                                <p className="text-xs text-muted-foreground">{fmtWatchMins(ss.subscribedWatchMinutes)} watched</p>
                              </div>
                            </div>
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                                <span className="text-xs font-medium text-muted-foreground">New Viewers</span>
                              </div>
                              <p className="text-3xl font-bold text-foreground">{nonSubPct}%</p>
                              <div className="mt-2 space-y-0.5">
                                <p className="text-xs text-muted-foreground">{fmt(ss.nonSubscribedViews)} views</p>
                                <p className="text-xs text-muted-foreground">{fmtWatchMins(ss.nonSubscribedWatchMinutes)} watched</p>
                              </div>
                            </div>
                          </div>
                        </SectionCard>
                      );
                    })()}

                    {/* ── Demographics ── */}
                    {(breakdowns.demographics?.ageGroups?.length > 0 || breakdowns.demographics?.genderMalePct > 0) && (
                      <SectionCard title="Viewer Demographics" sub={`Age and gender breakdown — last ${days} days`}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Age groups */}
                          {breakdowns.demographics.ageGroups.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Age Groups</p>
                              <div className="space-y-2.5">
                                {breakdowns.demographics.ageGroups.map((ag) => (
                                  <div key={ag.age}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                      <span className="font-medium text-foreground w-12">{ag.label}</span>
                                      <div className="flex-1 mx-3">
                                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                                          <div className="h-full rounded-full bg-violet-500" style={{ width: `${ag.pct}%` }} />
                                        </div>
                                      </div>
                                      <span className="text-muted-foreground w-10 text-right">{ag.pct.toFixed(0)}%</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Gender */}
                          {(breakdowns.demographics.genderMalePct > 0 || breakdowns.demographics.genderFemalePct > 0) && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Gender</p>
                              <div className="space-y-4">
                                {/* Split bar */}
                                <div>
                                  <div className="h-3 rounded-full overflow-hidden flex mb-2">
                                    <div className="bg-blue-500 h-full" style={{ width: `${breakdowns.demographics.genderMalePct}%` }} />
                                    <div className="bg-pink-400 h-full" style={{ width: `${breakdowns.demographics.genderFemalePct}%` }} />
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                                      <span className="text-sm text-foreground font-medium">Male</span>
                                    </div>
                                    <span className="text-2xl font-bold text-foreground">{breakdowns.demographics.genderMalePct.toFixed(0)}%</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2.5 h-2.5 rounded-full bg-pink-400" />
                                      <span className="text-sm text-foreground font-medium">Female</span>
                                    </div>
                                    <span className="text-2xl font-bold text-foreground">{breakdowns.demographics.genderFemalePct.toFixed(0)}%</span>
                                  </div>
                                  {breakdowns.demographics.genderMalePct + breakdowns.demographics.genderFemalePct < 98 && (
                                    <p className="text-xs text-muted-foreground">Remaining {(100 - breakdowns.demographics.genderMalePct - breakdowns.demographics.genderFemalePct).toFixed(0)}% unspecified</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </SectionCard>
                    )}

                    {/* ── Traffic Sources ── */}
                    {breakdowns.traffic.length > 0 && (() => {
                      const total = breakdowns.traffic.reduce((s, t) => s + t.views, 0);
                      return (
                        <SectionCard title="Traffic Sources" sub={`Where viewers found your videos — last ${days} days`}>
                          <div className="space-y-3">
                            {breakdowns.traffic.map((t) => (
                              <div key={t.source}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="font-medium text-foreground">{t.label}</span>
                                  <span className="text-muted-foreground">{fmt(t.views)} · {total > 0 ? Math.round(t.views / total * 100) : 0}%</span>
                                </div>
                                <PercentBar value={t.views} total={total} color="bg-red-500" />
                              </div>
                            ))}
                          </div>
                        </SectionCard>
                      );
                    })()}

                    {/* ── Top Search Terms ── */}
                    {breakdowns.searchTerms?.length > 0 && (() => {
                      const maxViews = breakdowns.searchTerms[0]?.views || 1;
                      return (
                        <SectionCard title="Top YouTube Search Terms" sub={`Exact queries people typed to find your videos — last ${days} days`}>
                          <div className="space-y-2.5">
                            {breakdowns.searchTerms.map((st, i) => (
                              <div key={i}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="font-medium text-foreground flex items-center gap-2">
                                    <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                                    {st.term}
                                  </span>
                                  <span className="text-muted-foreground shrink-0 ml-3">{fmt(st.views)} views</span>
                                </div>
                                <PercentBar value={st.views} total={maxViews} color="bg-amber-500" />
                              </div>
                            ))}
                          </div>
                        </SectionCard>
                      );
                    })()}

                    {/* ── Device Types ── */}
                    {breakdowns.devices.length > 0 && (
                      <SectionCard title="Device Types" sub={`What devices your viewers use — last ${days} days`}>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          {breakdowns.devices.map((d) => (
                            <div key={d.device} className="flex flex-col items-center gap-2 p-4 bg-muted/40 rounded-xl">
                              <Monitor className="h-5 w-5 text-muted-foreground" />
                              <div className="text-center">
                                <p className="text-2xl font-bold text-foreground">{d.pct}%</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{d.label}</p>
                                <p className="text-xs text-muted-foreground">{fmt(d.views)} views</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </SectionCard>
                    )}

                    {/* ── Top Countries ── */}
                    {breakdowns.countries.length > 0 && (() => {
                      const total = breakdowns.countries.reduce((s, c) => s + c.views, 0);
                      return (
                        <SectionCard title="Top Countries" sub={`Where your audience comes from — last ${days} days`}>
                          <div className="space-y-3">
                            {breakdowns.countries.map((c) => (
                              <div key={c.country}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="font-medium text-foreground flex items-center gap-2">
                                    <Globe className="h-3 w-3 text-muted-foreground" />{c.country}
                                  </span>
                                  <span className="text-muted-foreground">{fmt(c.views)} views · {fmtWatchMins(c.watchMinutes)} · {total > 0 ? Math.round(c.views / total * 100) : 0}%</span>
                                </div>
                                <PercentBar value={c.views} total={total} color="bg-blue-500" />
                              </div>
                            ))}
                          </div>
                        </SectionCard>
                      );
                    })()}

                    {/* Empty state */}
                    {breakdowns.traffic.length === 0 && breakdowns.devices.length === 0 && breakdowns.countries.length === 0 &&
                      (!breakdowns.demographics?.ageGroups?.length) && (!breakdowns.searchTerms?.length) && (
                      <Card className="border-border bg-card"><CardContent className="p-8 text-center">
                        <Users className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                        <p className="text-sm font-medium text-foreground mb-1">No audience data yet</p>
                        <p className="text-xs text-muted-foreground max-w-xs mx-auto">Audience data appears once your channel has received views in the selected time period.</p>
                      </CardContent></Card>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
