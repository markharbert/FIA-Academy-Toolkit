import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Globe,
  MousePointerClick,
  Eye,
  Percent,
  TrendingUp,
  RefreshCw,
  LogOut,
  ExternalLink,
  Monitor,
  Smartphone,
  Tablet,
  MapPin,
  Sparkles,
  FileSearch,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function fmtPct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function fmtPos(n: number): string {
  return n.toFixed(1);
}

function shortDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function relativeDate(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

const DEVICE_COLORS: Record<string, string> = {
  DESKTOP: "#3b82f6",
  MOBILE: "#f59e0b",
  TABLET: "#10b981",
};

const DEVICE_LABELS: Record<string, string> = {
  DESKTOP: "Desktop",
  MOBILE: "Mobile",
  TABLET: "Tablet",
};

const DEVICE_ICONS: Record<string, typeof Monitor> = {
  DESKTOP: Monitor,
  MOBILE: Smartphone,
  TABLET: Tablet,
};

const COUNTRY_NAMES: Record<string, string> = {
  usa: "United States", gbr: "United Kingdom", can: "Canada", aus: "Australia",
  ind: "India", deu: "Germany", fra: "France", bra: "Brazil", mex: "Mexico",
  esp: "Spain", ita: "Italy", jpn: "Japan", nld: "Netherlands", swe: "Sweden",
  nzl: "New Zealand", zaf: "South Africa", irl: "Ireland", sgp: "Singapore",
  nga: "Nigeria", phl: "Philippines", prt: "Portugal", che: "Switzerland",
  bel: "Belgium", aut: "Austria", pol: "Poland", nor: "Norway", dnk: "Denmark",
  fin: "Finland", tur: "Turkey", mys: "Malaysia", idn: "Indonesia", kor: "South Korea",
  chn: "China", pak: "Pakistan", bgd: "Bangladesh", ken: "Kenya", gha: "Ghana",
  arg: "Argentina", col: "Colombia", chl: "Chile", per: "Peru", hrv: "Croatia",
  cze: "Czech Republic", svk: "Slovakia", hun: "Hungary", rou: "Romania",
  ukr: "Ukraine", grc: "Greece", isr: "Israel", sau: "Saudi Arabia", are: "UAE",
  tha: "Thailand", vnm: "Vietnam", twn: "Taiwan", hkg: "Hong Kong", rus: "Russia",
  svn: "Slovenia", est: "Estonia", lva: "Latvia", ltu: "Lithuania", srb: "Serbia",
  irq: "Iraq", irn: "Iran", egy: "Egypt", mar: "Morocco", tun: "Tunisia",
};

const APPEARANCE_LABELS: Record<string, string> = {
  "AMP_BLUE_LINK": "AMP",
  "AMP_IMAGE_RESULT": "AMP Image",
  "AMP_STORY": "AMP Story",
  "AMP_TOP_STORIES": "AMP Top Stories",
  "APP_DEEPLINK_ANDROID": "Android App Link",
  "APP_DEEPLINK_IOS": "iOS App Link",
  "BREADCRUMBS": "Breadcrumbs",
  "CORPORATE_CONTACTS": "Corporate Contacts",
  "DISCUSSION_FORUM_SNIPPET": "Discussion Forum",
  "EVENTS_RICH_RESULT": "Events",
  "FACETED_NAVIGATION": "Faceted Navigation",
  "FAQ_RICH_RESULT": "FAQ",
  "HowTo": "How-To Guide",
  "IMAGE_RESULT": "Image Result",
  "JOB_LISTING": "Job Listing",
  "LOGO": "Logo",
  "MATH_SOLVERS": "Math Solver",
  "MERCHANT_LISTINGS_FILTER": "Merchant Listings",
  "ORGANIC_SHOPPING": "Organic Shopping",
  "PAYWALLED_CONTENT": "Paywalled Content",
  "PRODUCT_SNIPPET": "Product Snippet",
  "Q_AND_A_RICH_RESULT": "Q&A",
  "RECIPE_RICH_RESULT": "Recipe",
  "REVIEW_SNIPPET": "Review Snippet",
  "SITE_LINKS_SEARCH_BOX": "Sitelinks Search Box",
  "SITELINKS": "Sitelinks",
  "SPECIAL_ANNOUNCEMENT_RICH_RESULT": "Special Announcement",
  "SUBSCRIBED_CONTENT": "Subscribed Content",
  "TRANSLATED_RESULT": "Translated Result",
  "VIDEO_RICH_RESULT": "Video",
  "WEB_LIGHT_RESULTS": "Web Light",
};

// ─── Types ───────────────────────────────────────────────────────────────────

type Status = {
  connected: boolean;
  connectedEmail?: string;
  selectedSiteUrl?: string;
  sites?: string[];
};

type GscRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type GscData = {
  overview: { totalClicks: number; totalImpressions: number; avgCtr: number; avgPosition: number };
  topQueries: GscRow[];
  topPages: GscRow[];
  timeline: { date: string; clicks: number; impressions: number; ctr: number; position: number }[];
  devices: { device: string; clicks: number; impressions: number; ctr: number; position: number }[];
  countries: { country: string; clicks: number; impressions: number; ctr: number; position: number }[];
  searchAppearances: { appearance: string; clicks: number; impressions: number; ctr: number; position: number }[];
  sitemaps: { path: string; lastSubmitted: string | null; lastDownloaded: string | null; isPending: boolean; warnings: number; errors: number; submitted: number; indexed: number }[];
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AnalyticsGscPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [days, setDays] = useState("28");
  const [showAllQueries, setShowAllQueries] = useState(false);
  const [showAllPages, setShowAllPages] = useState(false);

  const { data: status, isLoading: statusLoading } = useQuery<Status>({
    queryKey: ["/api/analytics/gsc/status"],
  });

  const siteUrl = status?.selectedSiteUrl;
  const { data: gscData, isLoading: dataLoading } = useQuery<GscData>({
    queryKey: ["/api/analytics/gsc/data", siteUrl, days],
    enabled: status?.connected === true && !!siteUrl,
    queryFn: async () => {
      const params = new URLSearchParams({ days });
      if (siteUrl) params.set("siteUrl", siteUrl);
      const res = await fetch(`/api/analytics/gsc/data?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  });

  const disconnectMut = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/analytics/gsc/disconnect"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/analytics/gsc/status"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics/gsc/data"] });
      toast({ title: "Disconnected", description: "Google Search Console unlinked." });
    },
  });

  const refreshMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/analytics/gsc/refresh"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/analytics/gsc/data"] });
      toast({ title: "Refreshed", description: "Search Console data updated." });
    },
    onError: () => toast({ title: "Error", description: "Could not refresh data.", variant: "destructive" }),
  });

  const setSiteMut = useMutation({
    mutationFn: (siteUrl: string) =>
      apiRequest("POST", "/api/analytics/gsc/select-site", { siteUrl }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/analytics/gsc/status"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics/gsc/data"] });
    },
  });

  if (statusLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-sidebar text-sidebar-foreground px-6 py-8">
          <div className="max-w-6xl mx-auto">
            <Skeleton className="h-6 w-32 bg-white/10 mb-4" />
            <Skeleton className="h-8 w-64 bg-white/10" />
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
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
          <button
            onClick={() => setLocation("/analytics")}
            className="flex items-center gap-1.5 text-white/50 hover:text-white/80 text-sm mb-4 transition-colors"
            data-testid="button-back-analytics"
          >
            <ArrowLeft className="h-4 w-4" />
            Analytics
          </button>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <Globe className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Website Analytics</h1>
                {status?.connected && status.connectedEmail && (
                  <p className="text-white/40 text-xs mt-0.5">{status.connectedEmail}</p>
                )}
              </div>
            </div>
            {status?.connected && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white/60 hover:text-white hover:bg-white/10"
                  onClick={() => refreshMut.mutate()}
                  disabled={refreshMut.isPending}
                  data-testid="button-refresh-gsc"
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshMut.isPending ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white/60 hover:text-rose-400 hover:bg-white/10"
                  onClick={() => disconnectMut.mutate()}
                  disabled={disconnectMut.isPending}
                  data-testid="button-disconnect-gsc"
                >
                  <LogOut className="h-3.5 w-3.5 mr-1.5" />
                  Disconnect
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Not connected */}
        {!status?.connected && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-5">
              <Globe className="h-10 w-10 text-blue-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Connect Google Search Console</h2>
            <p className="text-muted-foreground text-sm max-w-md mb-8 leading-relaxed">
              Sign in with the Google account that has access to your Google Search Console property. You'll see exactly what people are searching to find your website, how you rank, and how traffic is trending.
            </p>
            <Button
              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:opacity-90 px-6"
              onClick={() => { window.location.href = "/api/analytics/gsc/connect"; }}
              data-testid="button-connect-gsc"
            >
              <Globe className="h-4 w-4 mr-2" />
              Connect Search Console
            </Button>
            <p className="text-xs text-muted-foreground mt-4 opacity-60">
              Read-only access — we only pull reporting data, nothing is modified.
            </p>
          </div>
        )}

        {/* Connected — no site selected */}
        {status?.connected && !status.selectedSiteUrl && status.sites && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Globe className="h-10 w-10 text-blue-500 mb-4" />
            <h2 className="text-lg font-bold text-foreground mb-2">Choose a website to analyze</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm">
              Your Google account has access to the following Search Console properties.
            </p>
            <div className="w-full max-w-sm space-y-2">
              {status.sites.map((site) => (
                <button
                  key={site}
                  onClick={() => setSiteMut.mutate(site)}
                  disabled={setSiteMut.isPending}
                  className="w-full text-left px-4 py-3 rounded-xl border border-border bg-card hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-sm font-medium text-foreground"
                  data-testid={`site-option-${site}`}
                >
                  {stripProtocol(site)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Connected — with site selected */}
        {status?.connected && status.selectedSiteUrl && (
          <div className="space-y-6">

            {/* Site selector + date range row */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <a
                  href={status.selectedSiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-blue-500 transition-colors"
                  data-testid="link-gsc-site"
                >
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  {stripProtocol(status.selectedSiteUrl)}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </a>
                {status.sites && status.sites.length > 1 && (
                  <Select value={status.selectedSiteUrl} onValueChange={(v) => setSiteMut.mutate(v)}>
                    <SelectTrigger className="h-7 w-auto text-xs border-border" data-testid="select-site">
                      <SelectValue placeholder="Switch site" />
                    </SelectTrigger>
                    <SelectContent>
                      {status.sites.map((s) => (
                        <SelectItem key={s} value={s}>{stripProtocol(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Select value={days} onValueChange={setDays} data-testid="select-days">
                <SelectTrigger className="h-7 w-40 text-xs border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="28">Last 28 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 6 months</SelectItem>
                  <SelectItem value="365">Last 12 months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Loading skeletons */}
            {dataLoading && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
                </div>
                <Skeleton className="h-64 rounded-2xl" />
                <Skeleton className="h-48 rounded-2xl" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Skeleton className="h-80 rounded-2xl" />
                  <Skeleton className="h-80 rounded-2xl" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Skeleton className="h-64 rounded-2xl" />
                  <Skeleton className="h-64 rounded-2xl" />
                </div>
              </>
            )}

            {!dataLoading && gscData && (
              <>
                {/* ── 1. KPI CARDS ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Total Clicks", value: fmtNum(gscData.overview.totalClicks), icon: MousePointerClick, color: "text-blue-500", tip: "Times someone clicked through to your site" },
                    { label: "Total Impressions", value: fmtNum(gscData.overview.totalImpressions), icon: Eye, color: "text-indigo-500", tip: "Times your site appeared in search results" },
                    { label: "Avg Click-Through Rate", value: fmtPct(gscData.overview.avgCtr), icon: Percent, color: "text-sky-500", tip: "% of impressions that turned into clicks" },
                    { label: "Avg Position", value: fmtPos(gscData.overview.avgPosition), icon: TrendingUp, color: "text-cyan-500", tip: "Your average ranking position (lower = better)" },
                  ].map((kpi) => (
                    <Card key={kpi.label} className="border-border bg-card" data-testid={`kpi-${kpi.label.toLowerCase().replace(/ /g, "-")}`}>
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-2">
                          <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                          <span className="text-xs text-muted-foreground font-medium leading-tight">{kpi.label}</span>
                        </div>
                        <p className="text-3xl font-bold text-foreground">{kpi.value}</p>
                        <p className="text-xs text-muted-foreground mt-1 opacity-60 leading-tight">{kpi.tip}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* ── 2. TRAFFIC OVER TIME ── */}
                {gscData.timeline.length > 0 && (
                  <Card className="border-border bg-card overflow-hidden">
                    <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
                    <CardContent className="p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-1">Search Traffic Over Time</h3>
                      <p className="text-xs text-muted-foreground mb-4">Clicks and impressions from Google Search</p>
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={gscData.timeline.map((r) => ({ ...r, date: shortDate(r.date) }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
                          <Tooltip
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                            formatter={(v: number, name: string) => [fmtNum(v), name === "clicks" ? "Clicks" : "Impressions"]}
                          />
                          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => v === "clicks" ? "Clicks" : "Impressions"} />
                          <Line type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="impressions" stroke="#a5b4fc" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* ── 3. POSITION OVER TIME ── */}
                {gscData.timeline.length > 0 && (
                  <Card className="border-border bg-card overflow-hidden">
                    <div className="h-1 w-full bg-gradient-to-r from-cyan-500 to-teal-500" />
                    <CardContent className="p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-1">Average Ranking Position Over Time</h3>
                      <p className="text-xs text-muted-foreground mb-4">Lower is better — position 1 means you ranked #1 in search results</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={gscData.timeline.map((r) => ({ date: shortDate(r.date), position: parseFloat(r.position.toFixed(1)) }))}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                          <YAxis reversed tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                          <Tooltip
                            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                            formatter={(v: number) => [`#${v}`, "Avg Position"]}
                          />
                          <Line type="monotone" dataKey="position" stroke="#06b6d4" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* ── 4. TOP QUERIES + TOP PAGES ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Top Queries */}
                  <Card className="border-border bg-card overflow-hidden">
                    <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
                    <CardContent className="p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-1">Top Search Queries</h3>
                      <p className="text-xs text-muted-foreground mb-4">What people searched to find you ({gscData.topQueries.length} keywords)</p>
                      {gscData.topQueries.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">No data for this period.</p>
                      ) : (
                        <>
                          <div className="space-y-0">
                            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 pb-2 mb-1 border-b border-border text-xs text-muted-foreground font-medium">
                              <span>Query</span>
                              <span className="text-right">Clicks</span>
                              <span className="text-right">Impr.</span>
                              <span className="text-right">CTR</span>
                              <span className="text-right">Pos.</span>
                            </div>
                            {(showAllQueries ? gscData.topQueries : gscData.topQueries.slice(0, 20)).map((q, i) => (
                              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 py-2 border-b border-border/50 last:border-0 text-sm" data-testid={`query-row-${i}`}>
                                <span className="text-foreground truncate" title={q.key}>{q.key}</span>
                                <span className="text-right text-foreground font-medium">{fmtNum(q.clicks)}</span>
                                <span className="text-right text-muted-foreground">{fmtNum(q.impressions)}</span>
                                <span className="text-right text-muted-foreground">{fmtPct(q.ctr)}</span>
                                <span className="text-right text-muted-foreground">{fmtPos(q.position)}</span>
                              </div>
                            ))}
                          </div>
                          {gscData.topQueries.length > 20 && (
                            <button
                              onClick={() => setShowAllQueries((v) => !v)}
                              className="mt-3 text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
                            >
                              {showAllQueries ? "Show less" : `Show all ${gscData.topQueries.length} queries`}
                            </button>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>

                  {/* Top Pages */}
                  <Card className="border-border bg-card overflow-hidden">
                    <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
                    <CardContent className="p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-1">Top Pages</h3>
                      <p className="text-xs text-muted-foreground mb-4">Pages driving the most search traffic ({gscData.topPages.length} pages)</p>
                      {gscData.topPages.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">No data for this period.</p>
                      ) : (
                        <>
                          <div className="space-y-0">
                            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 pb-2 mb-1 border-b border-border text-xs text-muted-foreground font-medium">
                              <span>Page</span>
                              <span className="text-right">Clicks</span>
                              <span className="text-right">Impr.</span>
                              <span className="text-right">CTR</span>
                              <span className="text-right">Pos.</span>
                            </div>
                            {(showAllPages ? gscData.topPages : gscData.topPages.slice(0, 20)).map((p, i) => {
                              const path = (() => { try { return new URL(p.key).pathname; } catch { return p.key; } })();
                              return (
                                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 py-2 border-b border-border/50 last:border-0 text-sm" data-testid={`page-row-${i}`}>
                                  <a href={p.key} target="_blank" rel="noopener noreferrer" className="text-foreground hover:text-blue-500 truncate transition-colors" title={p.key}>
                                    {path || "/"}
                                  </a>
                                  <span className="text-right text-foreground font-medium">{fmtNum(p.clicks)}</span>
                                  <span className="text-right text-muted-foreground">{fmtNum(p.impressions)}</span>
                                  <span className="text-right text-muted-foreground">{fmtPct(p.ctr)}</span>
                                  <span className="text-right text-muted-foreground">{fmtPos(p.position)}</span>
                                </div>
                              );
                            })}
                          </div>
                          {gscData.topPages.length > 20 && (
                            <button
                              onClick={() => setShowAllPages((v) => !v)}
                              className="mt-3 text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
                            >
                              {showAllPages ? "Show less" : `Show all ${gscData.topPages.length} pages`}
                            </button>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* ── 5. DEVICE BREAKDOWN + COUNTRIES ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                  {/* Device Breakdown */}
                  {gscData.devices.length > 0 && (
                    <Card className="border-border bg-card overflow-hidden">
                      <div className="h-1 w-full bg-gradient-to-r from-amber-400 to-orange-500" />
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-1">
                          <Monitor className="h-4 w-4 text-amber-500" />
                          <h3 className="text-sm font-semibold text-foreground">Device Breakdown</h3>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">Where your search traffic is coming from</p>
                        <div className="flex items-center gap-4">
                          <ResponsiveContainer width={140} height={140}>
                            <PieChart>
                              <Pie
                                data={gscData.devices}
                                dataKey="clicks"
                                nameKey="device"
                                cx="50%"
                                cy="50%"
                                innerRadius={38}
                                outerRadius={60}
                                paddingAngle={2}
                              >
                                {gscData.devices.map((d, i) => (
                                  <Cell key={i} fill={DEVICE_COLORS[d.device] || "#94a3b8"} />
                                ))}
                              </Pie>
                              <Tooltip
                                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                                formatter={(v: number, name: string) => [fmtNum(v) + " clicks", DEVICE_LABELS[name] || name]}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="flex-1 space-y-3">
                            {gscData.devices.map((d) => {
                              const total = gscData.devices.reduce((s, x) => s + x.clicks, 0);
                              const pct = total > 0 ? (d.clicks / total) * 100 : 0;
                              const DevIcon = DEVICE_ICONS[d.device] || Monitor;
                              return (
                                <div key={d.device} data-testid={`device-${d.device.toLowerCase()}`}>
                                  <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5">
                                      <DevIcon className="h-3.5 w-3.5" style={{ color: DEVICE_COLORS[d.device] || "#94a3b8" }} />
                                      <span className="text-xs font-medium text-foreground">{DEVICE_LABELS[d.device] || d.device}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{fmtNum(d.clicks)} ({pct.toFixed(0)}%)</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: DEVICE_COLORS[d.device] || "#94a3b8" }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        {/* Device table */}
                        <div className="mt-4 pt-4 border-t border-border">
                          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 pb-1.5 text-xs text-muted-foreground font-medium">
                            <span>Device</span>
                            <span className="text-right">Clicks</span>
                            <span className="text-right">Impr.</span>
                            <span className="text-right">CTR</span>
                          </div>
                          {gscData.devices.map((d) => (
                            <div key={d.device} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 py-1.5 border-b border-border/40 last:border-0 text-sm">
                              <span className="text-foreground">{DEVICE_LABELS[d.device] || d.device}</span>
                              <span className="text-right text-foreground font-medium">{fmtNum(d.clicks)}</span>
                              <span className="text-right text-muted-foreground">{fmtNum(d.impressions)}</span>
                              <span className="text-right text-muted-foreground">{fmtPct(d.ctr)}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Countries */}
                  {gscData.countries.length > 0 && (
                    <Card className="border-border bg-card overflow-hidden">
                      <div className="h-1 w-full bg-gradient-to-r from-emerald-400 to-teal-500" />
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-1">
                          <MapPin className="h-4 w-4 text-emerald-500" />
                          <h3 className="text-sm font-semibold text-foreground">Traffic by Country</h3>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">Top countries sending you search traffic</p>
                        <div className="space-y-0">
                          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 pb-2 mb-1 border-b border-border text-xs text-muted-foreground font-medium">
                            <span>Country</span>
                            <span className="text-right">Clicks</span>
                            <span className="text-right">Impr.</span>
                            <span className="text-right">Pos.</span>
                          </div>
                          {gscData.countries.map((c, i) => (
                            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 py-2 border-b border-border/50 last:border-0 text-sm" data-testid={`country-row-${i}`}>
                              <span className="text-foreground">{COUNTRY_NAMES[c.country.toLowerCase()] || c.country.toUpperCase()}</span>
                              <span className="text-right text-foreground font-medium">{fmtNum(c.clicks)}</span>
                              <span className="text-right text-muted-foreground">{fmtNum(c.impressions)}</span>
                              <span className="text-right text-muted-foreground">{fmtPos(c.position)}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* ── 6. SEARCH APPEARANCES + SITEMAPS ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                  {/* Search Appearances */}
                  {gscData.searchAppearances.length > 0 && (
                    <Card className="border-border bg-card overflow-hidden">
                      <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-purple-600" />
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-1">
                          <Sparkles className="h-4 w-4 text-violet-500" />
                          <h3 className="text-sm font-semibold text-foreground">Search Appearances</h3>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">Rich result types showing up in Google Search for your site</p>
                        <ResponsiveContainer width="100%" height={Math.max(120, gscData.searchAppearances.length * 34)}>
                          <BarChart
                            data={gscData.searchAppearances.map((a) => ({
                              name: APPEARANCE_LABELS[a.appearance] || a.appearance,
                              impressions: a.impressions,
                              clicks: a.clicks,
                            }))}
                            layout="vertical"
                            margin={{ left: 8, right: 8, top: 0, bottom: 0 }}
                          >
                            <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} axisLine={false} tickLine={false} width={140} />
                            <Tooltip
                              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                              formatter={(v: number, name: string) => [fmtNum(v), name === "impressions" ? "Impressions" : "Clicks"]}
                            />
                            <Bar dataKey="impressions" fill="#8b5cf6" radius={[0, 3, 3, 0]} maxBarSize={14} />
                            <Bar dataKey="clicks" fill="#c4b5fd" radius={[0, 3, 3, 0]} maxBarSize={14} />
                          </BarChart>
                        </ResponsiveContainer>
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-500 inline-block" />Impressions</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-violet-300 inline-block" />Clicks</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Sitemaps */}
                  {gscData.sitemaps.length > 0 && (
                    <Card className="border-border bg-card overflow-hidden">
                      <div className="h-1 w-full bg-gradient-to-r from-slate-400 to-slate-500" />
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-1">
                          <FileSearch className="h-4 w-4 text-slate-500" />
                          <h3 className="text-sm font-semibold text-foreground">Sitemaps</h3>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">Submitted sitemaps and their index coverage</p>
                        <div className="space-y-3">
                          {gscData.sitemaps.map((s, i) => {
                            const coverage = s.submitted > 0 ? (s.indexed / s.submitted) * 100 : 0;
                            const hasIssues = s.errors > 0 || s.warnings > 0;
                            const path = (() => { try { return new URL(s.path).pathname; } catch { return s.path; } })();
                            return (
                              <div key={i} className="rounded-xl border border-border bg-muted/20 p-3.5" data-testid={`sitemap-${i}`}>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <a href={s.path} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-foreground hover:text-blue-500 transition-colors truncate">
                                    {path}
                                  </a>
                                  {hasIssues ? (
                                    <span className="flex items-center gap-1 text-xs text-amber-500 shrink-0">
                                      <AlertTriangle className="h-3 w-3" />
                                      {s.errors > 0 ? `${s.errors} error${s.errors > 1 ? "s" : ""}` : `${s.warnings} warning${s.warnings > 1 ? "s" : ""}`}
                                    </span>
                                  ) : (
                                    <span className="flex items-center gap-1 text-xs text-emerald-500 shrink-0">
                                      <CheckCircle2 className="h-3 w-3" />
                                      OK
                                    </span>
                                  )}
                                </div>
                                {s.submitted > 0 && (
                                  <>
                                    <div className="flex items-center justify-between text-xs mb-1.5">
                                      <span className="text-muted-foreground">Indexed / Submitted</span>
                                      <span className="font-medium text-foreground">{fmtNum(s.indexed)} / {fmtNum(s.submitted)} ({coverage.toFixed(0)}%)</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(coverage, 100)}%` }} />
                                    </div>
                                  </>
                                )}
                                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Submitted {relativeDate(s.lastSubmitted)}</span>
                                  {s.lastDownloaded && <span>Crawled {relativeDate(s.lastDownloaded)}</span>}
                                  {s.isPending && <span className="text-amber-500">Pending</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
