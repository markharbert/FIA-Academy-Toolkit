import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, Globe, MousePointerClick, Eye, Percent, TrendingUp,
  RefreshCw, LogOut, ExternalLink, Monitor, Smartphone, Tablet,
  MapPin, Sparkles, FileSearch, AlertTriangle, CheckCircle2, Clock,
  XCircle, ChevronDown, ChevronRight, Search, Loader2, MinusCircle,
  AlertCircle, Info,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtNum = (n: number) =>
  n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + "M" :
  n >= 1_000 ? (n / 1_000).toFixed(1) + "K" :
  n.toLocaleString();

const fmtPct = (n: number) => (n * 100).toFixed(1) + "%";
const fmtPos = (n: number) => n.toFixed(1);

const shortDate = (iso: string) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const stripProto = (url: string) => url.replace(/^https?:\/\//, "").replace(/\/$/, "");

const relativeDate = (iso: string | null) => {
  if (!iso) return "Never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

const pagePath = (url: string) => {
  try { return new URL(url).pathname || "/"; } catch { return url; }
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEVICE_COLORS: Record<string, string> = { DESKTOP: "#3b82f6", MOBILE: "#f59e0b", TABLET: "#10b981" };
const DEVICE_LABELS: Record<string, string> = { DESKTOP: "Desktop", MOBILE: "Mobile", TABLET: "Tablet" };
const DEVICE_ICONS: Record<string, any> = { DESKTOP: Monitor, MOBILE: Smartphone, TABLET: Tablet };

const COUNTRY_NAMES: Record<string, string> = {
  usa: "United States", gbr: "United Kingdom", can: "Canada", aus: "Australia",
  ind: "India", deu: "Germany", fra: "France", bra: "Brazil", mex: "Mexico",
  esp: "Spain", ita: "Italy", jpn: "Japan", nld: "Netherlands", swe: "Sweden",
  nzl: "New Zealand", zaf: "South Africa", irl: "Ireland", sgp: "Singapore",
  nga: "Nigeria", phl: "Philippines", prt: "Portugal", che: "Switzerland",
  bel: "Belgium", aut: "Austria", pol: "Poland", nor: "Norway", dnk: "Denmark",
  fin: "Finland", tur: "Turkey", mys: "Malaysia", idn: "Indonesia", kor: "South Korea",
  chn: "China", pak: "Pakistan", bgd: "Bangladesh", ken: "Kenya", gha: "Ghana",
  arg: "Argentina", col: "Colombia", chl: "Chile", hrv: "Croatia", cze: "Czech Republic",
  svk: "Slovakia", hun: "Hungary", rou: "Romania", ukr: "Ukraine", grc: "Greece",
  isr: "Israel", sau: "Saudi Arabia", are: "UAE", tha: "Thailand", vnm: "Vietnam",
  twn: "Taiwan", hkg: "Hong Kong", rus: "Russia", irn: "Iran", egy: "Egypt",
  mar: "Morocco",
};

const APPEARANCE_LABELS: Record<string, string> = {
  AMP_BLUE_LINK: "AMP", AMP_IMAGE_RESULT: "AMP Image", AMP_TOP_STORIES: "AMP Top Stories",
  BREADCRUMBS: "Breadcrumbs", CORPORATE_CONTACTS: "Corporate Contacts",
  DISCUSSION_FORUM_SNIPPET: "Discussion Forum", EVENTS_RICH_RESULT: "Events",
  FAQ_RICH_RESULT: "FAQ", HowTo: "How-To Guide", IMAGE_RESULT: "Image Result",
  JOB_LISTING: "Job Listing", LOGO: "Logo", ORGANIC_SHOPPING: "Shopping",
  PRODUCT_SNIPPET: "Product Snippet", Q_AND_A_RICH_RESULT: "Q&A",
  RECIPE_RICH_RESULT: "Recipe", REVIEW_SNIPPET: "Review Snippet",
  SITE_LINKS_SEARCH_BOX: "Sitelinks Search Box", SITELINKS: "Sitelinks",
  VIDEO_RICH_RESULT: "Video", WEB_LIGHT_RESULTS: "Web Light",
};

const COVERAGE_LABELS: Record<string, { label: string; color: string }> = {
  "Submitted and indexed": { label: "Submitted and indexed", color: "text-emerald-500" },
  "Indexed, not submitted in sitemap": { label: "Indexed (no sitemap)", color: "text-blue-500" },
  "Crawled - currently not indexed": { label: "Crawled, not indexed", color: "text-amber-500" },
  "Discovered - currently not indexed": { label: "Discovered, not indexed", color: "text-amber-500" },
  "Page with redirect": { label: "Redirects", color: "text-sky-500" },
  "Excluded by 'noindex' tag": { label: "Excluded (noindex)", color: "text-muted-foreground" },
  "Blocked by robots.txt": { label: "Blocked (robots.txt)", color: "text-orange-500" },
  "Not found (404)": { label: "Not found (404)", color: "text-red-500" },
  "Soft 404": { label: "Soft 404", color: "text-red-500" },
  "Server error (5xx)": { label: "Server error", color: "text-red-500" },
};

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = {
  connected: boolean; connectedEmail?: string; selectedSiteUrl?: string; sites?: string[];
};
type GscRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };
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
type GscPageKeyword = { page: string; query: string; clicks: number; impressions: number; ctr: number; position: number };
type GscInspection = {
  inspectionUrl: string;
  indexStatus: { verdict: string; coverageState: string; robotsTxtState: string; indexingState: string; lastCrawlTime: string | null; pageFetchState: string; googleCanonical: string | null; userCanonical: string | null; sitemap: string[]; referringUrls: string[]; crawledAs: string | null };
  mobileUsability: { verdict: string; issues: { type: string; message: string; severity: string }[] };
  richResults: { verdict: string; detectedItems: { richResultType: string; items: { name: string; issues: { message: string; severity: string }[] }[] }[] };
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function VerdictBadge({ verdict }: { verdict: string }) {
  if (verdict === "PASS") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
      <CheckCircle2 className="h-3 w-3" /> Pass
    </span>
  );
  if (verdict === "FAIL") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-500/10 px-2 py-0.5 rounded-full">
      <XCircle className="h-3 w-3" /> Fail
    </span>
  );
  if (verdict === "PARTIAL") return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
      <AlertTriangle className="h-3 w-3" /> Partial
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
      <MinusCircle className="h-3 w-3" /> N/A
    </span>
  );
}

function SectionCard({ accent, title, subtitle, icon: Icon, children }: {
  accent: string; title: string; subtitle?: string; icon: any; children: React.ReactNode;
}) {
  return (
    <Card className="border-border bg-card overflow-hidden">
      <div className={`h-1 w-full ${accent}`} />
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mb-4">{subtitle}</p>}
        {children}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview",  label: "Overview"  },
  { id: "keywords",  label: "Keywords"  },
  { id: "pages",     label: "Pages"     },
  { id: "audience",  label: "Audience"  },
  { id: "technical", label: "Technical" },
] as const;
type TabId = typeof TABS[number]["id"];

export default function AnalyticsGscPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [days, setDays]   = useState("28");
  const [tab, setTab]     = useState<TabId>("overview");

  // Queries / pages "show all" toggles
  const [showAllQ, setShowAllQ] = useState(false);
  const [showAllP, setShowAllP] = useState(false);

  // Expanded pages (for keyword drill-down)
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());

  // URL Inspector
  const [inspectUrl,    setInspectUrl]    = useState("");
  const [inspectResult, setInspectResult] = useState<GscInspection | null>(null);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: status, isLoading: statusLoading } = useQuery<Status>({
    queryKey: ["/api/analytics/gsc/status"],
  });

  const siteUrl   = status?.selectedSiteUrl;
  const connected = status?.connected === true && !!siteUrl;

  const { data: gscData, isLoading: dataLoading } = useQuery<GscData>({
    queryKey: ["/api/analytics/gsc/data", siteUrl, days],
    enabled: connected,
    queryFn: async () => {
      const p = new URLSearchParams({ days });
      if (siteUrl) p.set("siteUrl", siteUrl);
      const r = await fetch(`/api/analytics/gsc/data?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
  });

  const { data: pageKeywords, isLoading: pkLoading } = useQuery<GscPageKeyword[]>({
    queryKey: ["/api/analytics/gsc/page-keywords", siteUrl, days],
    enabled: connected && tab === "pages",
    queryFn: async () => {
      const p = new URLSearchParams({ days });
      if (siteUrl) p.set("siteUrl", siteUrl);
      const r = await fetch(`/api/analytics/gsc/page-keywords?${p}`, { credentials: "include" });
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json();
    },
  });

  // Group page-keyword rows by page URL
  const keywordsByPage = useMemo(() => {
    if (!pageKeywords) return {} as Record<string, GscPageKeyword[]>;
    return pageKeywords.reduce((acc, row) => {
      (acc[row.page] = acc[row.page] || []).push(row);
      return acc;
    }, {} as Record<string, GscPageKeyword[]>);
  }, [pageKeywords]);

  // ── Mutations ──────────────────────────────────────────────────────────────

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
    onError: () => toast({ title: "Error", description: "Could not refresh.", variant: "destructive" }),
  });

  const setSiteMut = useMutation({
    mutationFn: (s: string) => apiRequest("POST", "/api/analytics/gsc/select-site", { siteUrl: s }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/analytics/gsc/status"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics/gsc/data"] });
    },
  });

  const inspectMut = useMutation({
    mutationFn: (url: string) => apiRequest("POST", "/api/analytics/gsc/inspect-url", { url }),
    onSuccess: (data: any) => setInspectResult(data),
    onError: (err: any) => toast({ title: "Inspection failed", description: err?.message || "Could not inspect that URL.", variant: "destructive" }),
  });

  // Pre-fill inspector with site URL on connect
  useEffect(() => {
    if (siteUrl && !inspectUrl) setInspectUrl(siteUrl);
  }, [siteUrl]);

  // Reset expanded pages when data changes
  useEffect(() => { setExpandedPages(new Set()); }, [siteUrl, days]);

  // ── Loading ────────────────────────────────────────────────────────────────

  if (statusLoading) return (
    <div className="min-h-screen bg-background">
      <div className="bg-sidebar px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-6 w-32 bg-white/10 mb-4" />
          <Skeleton className="h-8 w-64 bg-white/10" />
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i=><Skeleton key={i} className="h-28 rounded-2xl"/>)}</div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">

      {/* ── Header ── */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <button onClick={() => setLocation("/analytics")}
            className="flex items-center gap-1.5 text-white/50 hover:text-white/80 text-sm mb-4 transition-colors"
            data-testid="button-back-analytics">
            <ArrowLeft className="h-4 w-4" /> Analytics
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
                <Button size="sm" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10"
                  onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending} data-testid="button-refresh-gsc">
                  <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshMut.isPending ? "animate-spin" : ""}`} />Refresh
                </Button>
                <Button size="sm" variant="ghost" className="text-white/60 hover:text-rose-400 hover:bg-white/10"
                  onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending} data-testid="button-disconnect-gsc">
                  <LogOut className="h-3.5 w-3.5 mr-1.5" />Disconnect
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* ── Not connected ── */}
        {!status?.connected && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-5">
              <Globe className="h-10 w-10 text-blue-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Connect Google Search Console</h2>
            <p className="text-muted-foreground text-sm max-w-md mb-8 leading-relaxed">
              See exactly what people are searching to find your website, how you rank, and how traffic is trending — all in one place.
            </p>
            <Button className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white hover:opacity-90 px-6"
              onClick={() => { window.location.href = "/api/analytics/gsc/connect"; }} data-testid="button-connect-gsc">
              <Globe className="h-4 w-4 mr-2" />Connect Search Console
            </Button>
            <p className="text-xs text-muted-foreground mt-4 opacity-60">Read-only access — we never modify your data.</p>
          </div>
        )}

        {/* ── Pick a site ── */}
        {status?.connected && !siteUrl && status.sites && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Globe className="h-10 w-10 text-blue-500 mb-4" />
            <h2 className="text-lg font-bold text-foreground mb-2">Choose a website to analyze</h2>
            <p className="text-muted-foreground text-sm mb-6 max-w-sm">Your Google account has access to these Search Console properties.</p>
            <div className="w-full max-w-sm space-y-2">
              {status.sites.map((s) => (
                <button key={s} onClick={() => setSiteMut.mutate(s)} disabled={setSiteMut.isPending}
                  className="w-full text-left px-4 py-3 rounded-xl border border-border bg-card hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-sm font-medium"
                  data-testid={`site-option-${s}`}>{stripProto(s)}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── Connected with site ── */}
        {status?.connected && siteUrl && (
          <div className="space-y-6">

            {/* Site + date selector row */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <a href={siteUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-blue-500 transition-colors" data-testid="link-gsc-site">
                  <Globe className="h-4 w-4 text-muted-foreground" />{stripProto(siteUrl)}
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </a>
                {status.sites && status.sites.length > 1 && (
                  <Select value={siteUrl} onValueChange={(v) => setSiteMut.mutate(v)}>
                    <SelectTrigger className="h-7 w-auto text-xs border-border" data-testid="select-site"><SelectValue /></SelectTrigger>
                    <SelectContent>{status.sites.map((s) => <SelectItem key={s} value={s}>{stripProto(s)}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              </div>
              <Select value={days} onValueChange={(v) => { setDays(v); setExpandedPages(new Set()); }} data-testid="select-days">
                <SelectTrigger className="h-7 w-40 text-xs border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="28">Last 28 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                  <SelectItem value="180">Last 6 months</SelectItem>
                  <SelectItem value="365">Last 12 months</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Tab bar */}
            <div className="flex gap-0.5 border-b border-border overflow-x-auto">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                    tab === t.id
                      ? "border-blue-500 text-blue-500"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  data-testid={`tab-${t.id}`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Loading skeletons ── */}
            {dataLoading && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[1,2,3,4].map(i=><Skeleton key={i} className="h-28 rounded-2xl"/>)}</div>
                <Skeleton className="h-64 rounded-2xl" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5"><Skeleton className="h-80 rounded-2xl"/><Skeleton className="h-80 rounded-2xl"/></div>
              </div>
            )}

            {!dataLoading && gscData && (
              <>

                {/* ════════════════════════════════════════════════════════
                    OVERVIEW TAB
                ════════════════════════════════════════════════════════ */}
                {tab === "overview" && (
                  <div className="space-y-5">
                    {/* KPI cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {[
                        { label: "Total Clicks", value: fmtNum(gscData.overview.totalClicks), icon: MousePointerClick, color: "text-blue-500", tip: "Times someone clicked to your site" },
                        { label: "Impressions", value: fmtNum(gscData.overview.totalImpressions), icon: Eye, color: "text-indigo-500", tip: "Times your site appeared in results" },
                        { label: "Avg CTR", value: fmtPct(gscData.overview.avgCtr), icon: Percent, color: "text-sky-500", tip: "% of impressions that became clicks" },
                        { label: "Avg Position", value: fmtPos(gscData.overview.avgPosition), icon: TrendingUp, color: "text-cyan-500", tip: "Average ranking position (lower = better)" },
                      ].map((kpi) => (
                        <Card key={kpi.label} className="border-border bg-card" data-testid={`kpi-${kpi.label.toLowerCase().replace(/ /g,"-")}`}>
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

                    {/* Traffic chart */}
                    {gscData.timeline.length > 0 && (
                      <SectionCard accent="bg-gradient-to-r from-blue-500 to-indigo-600" title="Search Traffic Over Time" subtitle="Clicks and impressions from Google Search" icon={MousePointerClick}>
                        <ResponsiveContainer width="100%" height={220}>
                          <LineChart data={gscData.timeline.map(r => ({ ...r, date: shortDate(r.date) }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                            <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
                            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                              formatter={(v: number, n: string) => [fmtNum(v), n === "clicks" ? "Clicks" : "Impressions"]} />
                            <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => v === "clicks" ? "Clicks" : "Impressions"} />
                            <Line type="monotone" dataKey="clicks" stroke="#3b82f6" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="impressions" stroke="#a5b4fc" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                          </LineChart>
                        </ResponsiveContainer>
                      </SectionCard>
                    )}

                    {/* Position chart */}
                    {gscData.timeline.length > 0 && (
                      <SectionCard accent="bg-gradient-to-r from-cyan-500 to-teal-500" title="Average Ranking Position Over Time" subtitle="Lower is better — position 1 means you ranked #1 in Google" icon={TrendingUp}>
                        <ResponsiveContainer width="100%" height={200}>
                          <LineChart data={gscData.timeline.map(r => ({ date: shortDate(r.date), position: parseFloat(r.position.toFixed(1)) }))}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                            <YAxis reversed tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                              formatter={(v: number) => [`#${v}`, "Avg Position"]} />
                            <Line type="monotone" dataKey="position" stroke="#06b6d4" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </SectionCard>
                    )}
                  </div>
                )}

                {/* ════════════════════════════════════════════════════════
                    KEYWORDS TAB
                ════════════════════════════════════════════════════════ */}
                {tab === "keywords" && (
                  <SectionCard accent="bg-gradient-to-r from-blue-500 to-indigo-600" title="Top Search Queries" subtitle={`What people search to find your site — ${gscData.topQueries.length} keywords`} icon={Search}>
                    {gscData.topQueries.length === 0
                      ? <p className="text-sm text-muted-foreground text-center py-8">No keyword data for this period.</p>
                      : <>
                          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 pb-2 mb-1 border-b border-border text-xs text-muted-foreground font-medium">
                            <span>Keyword</span>
                            <span className="text-right">Clicks</span>
                            <span className="text-right">Impr.</span>
                            <span className="text-right">CTR</span>
                            <span className="text-right">Pos.</span>
                          </div>
                          {(showAllQ ? gscData.topQueries : gscData.topQueries.slice(0, 20)).map((q, i) => (
                            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 py-2 border-b border-border/50 last:border-0 text-sm" data-testid={`query-row-${i}`}>
                              <span className="text-foreground truncate" title={q.key}>{q.key}</span>
                              <span className="text-right text-foreground font-medium">{fmtNum(q.clicks)}</span>
                              <span className="text-right text-muted-foreground">{fmtNum(q.impressions)}</span>
                              <span className="text-right text-muted-foreground">{fmtPct(q.ctr)}</span>
                              <span className="text-right text-muted-foreground">{fmtPos(q.position)}</span>
                            </div>
                          ))}
                          {gscData.topQueries.length > 20 && (
                            <button onClick={() => setShowAllQ(v => !v)} className="mt-3 text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors">
                              {showAllQ ? "Show less" : `Show all ${gscData.topQueries.length} keywords`}
                            </button>
                          )}
                        </>
                    }
                  </SectionCard>
                )}

                {/* ════════════════════════════════════════════════════════
                    PAGES TAB
                ════════════════════════════════════════════════════════ */}
                {tab === "pages" && (
                  <div className="space-y-2">
                    <Card className="border-border bg-card overflow-hidden">
                      <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-1">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          <h3 className="text-sm font-semibold text-foreground">Top Pages</h3>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">
                          Pages driving the most search traffic — click any row to see its keywords
                          {pkLoading && <span className="ml-2 inline-flex items-center gap-1 text-blue-500"><Loader2 className="h-3 w-3 animate-spin" />Loading keywords…</span>}
                        </p>

                        {gscData.topPages.length === 0
                          ? <p className="text-sm text-muted-foreground text-center py-8">No page data for this period.</p>
                          : <>
                              <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 pb-2 mb-1 border-b border-border text-xs text-muted-foreground font-medium">
                                <span className="w-4" />
                                <span>Page</span>
                                <span className="text-right">Clicks</span>
                                <span className="text-right">Impr.</span>
                                <span className="text-right">CTR</span>
                                <span className="text-right">Pos.</span>
                              </div>
                              {(showAllP ? gscData.topPages : gscData.topPages.slice(0, 20)).map((p, i) => {
                                const path = pagePath(p.key);
                                const isExpanded = expandedPages.has(p.key);
                                const kws = keywordsByPage[p.key] || [];
                                return (
                                  <div key={i}>
                                    <div
                                      className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 py-2 border-b border-border/50 text-sm cursor-pointer hover:bg-muted/30 transition-colors rounded-lg px-1 -mx-1"
                                      onClick={() => setExpandedPages(prev => { const n = new Set(prev); n.has(p.key) ? n.delete(p.key) : n.add(p.key); return n; })}
                                      data-testid={`page-row-${i}`}
                                    >
                                      <span className="w-4 flex items-center text-muted-foreground">
                                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                      </span>
                                      <a href={p.key} target="_blank" rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        className="text-foreground hover:text-blue-500 truncate transition-colors" title={p.key}>{path}</a>
                                      <span className="text-right text-foreground font-medium">{fmtNum(p.clicks)}</span>
                                      <span className="text-right text-muted-foreground">{fmtNum(p.impressions)}</span>
                                      <span className="text-right text-muted-foreground">{fmtPct(p.ctr)}</span>
                                      <span className="text-right text-muted-foreground">{fmtPos(p.position)}</span>
                                    </div>
                                    {isExpanded && (
                                      <div className="ml-7 mb-2 rounded-lg bg-muted/30 border border-border/50 overflow-hidden">
                                        {pkLoading
                                          ? <p className="text-xs text-muted-foreground p-3 flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Loading keywords…</p>
                                          : kws.length === 0
                                          ? <p className="text-xs text-muted-foreground p-3">No keyword data for this page.</p>
                                          : <>
                                              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 border-b border-border/50 text-xs text-muted-foreground font-medium">
                                                <span>Keyword</span>
                                                <span className="text-right">Clicks</span>
                                                <span className="text-right">Impr.</span>
                                                <span className="text-right">CTR</span>
                                                <span className="text-right">Pos.</span>
                                              </div>
                                              {kws.slice(0, 15).map((kw, ki) => (
                                                <div key={ki} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-3 py-1.5 border-b border-border/30 last:border-0 text-xs">
                                                  <span className="text-foreground truncate" title={kw.query}>{kw.query}</span>
                                                  <span className="text-right text-foreground font-medium">{fmtNum(kw.clicks)}</span>
                                                  <span className="text-right text-muted-foreground">{fmtNum(kw.impressions)}</span>
                                                  <span className="text-right text-muted-foreground">{fmtPct(kw.ctr)}</span>
                                                  <span className="text-right text-muted-foreground">{fmtPos(kw.position)}</span>
                                                </div>
                                              ))}
                                              {kws.length > 15 && <p className="text-xs text-muted-foreground px-3 py-1.5">+{kws.length - 15} more keywords</p>}
                                            </>
                                        }
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {gscData.topPages.length > 20 && (
                                <button onClick={() => setShowAllP(v => !v)} className="mt-3 text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors">
                                  {showAllP ? "Show less" : `Show all ${gscData.topPages.length} pages`}
                                </button>
                              )}
                            </>
                        }
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* ════════════════════════════════════════════════════════
                    AUDIENCE TAB
                ════════════════════════════════════════════════════════ */}
                {tab === "audience" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

                    {/* Devices */}
                    {gscData.devices.length > 0 && (
                      <SectionCard accent="bg-gradient-to-r from-amber-400 to-orange-500" title="Device Breakdown" subtitle="Where your search traffic is coming from" icon={Monitor}>
                        <div className="flex items-center gap-4 mb-4">
                          <ResponsiveContainer width={130} height={130}>
                            <PieChart>
                              <Pie data={gscData.devices} dataKey="clicks" nameKey="device" cx="50%" cy="50%" innerRadius={35} outerRadius={58} paddingAngle={2}>
                                {gscData.devices.map((d, i) => <Cell key={i} fill={DEVICE_COLORS[d.device] || "#94a3b8"} />)}
                              </Pie>
                              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                                formatter={(v: number, n: string) => [fmtNum(v) + " clicks", DEVICE_LABELS[n] || n]} />
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
                                      <span className="text-xs font-medium">{DEVICE_LABELS[d.device] || d.device}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{fmtNum(d.clicks)} ({pct.toFixed(0)}%)</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: DEVICE_COLORS[d.device] || "#94a3b8" }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <div className="pt-3 border-t border-border">
                          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 pb-1 text-xs text-muted-foreground font-medium">
                            <span>Device</span><span className="text-right">Clicks</span><span className="text-right">Impr.</span><span className="text-right">CTR</span>
                          </div>
                          {gscData.devices.map((d) => (
                            <div key={d.device} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 py-1.5 border-b border-border/40 last:border-0 text-sm">
                              <span>{DEVICE_LABELS[d.device] || d.device}</span>
                              <span className="text-right font-medium">{fmtNum(d.clicks)}</span>
                              <span className="text-right text-muted-foreground">{fmtNum(d.impressions)}</span>
                              <span className="text-right text-muted-foreground">{fmtPct(d.ctr)}</span>
                            </div>
                          ))}
                        </div>
                      </SectionCard>
                    )}

                    {/* Countries */}
                    {gscData.countries.length > 0 && (
                      <SectionCard accent="bg-gradient-to-r from-emerald-400 to-teal-500" title="Traffic by Country" subtitle="Top countries sending you search traffic" icon={MapPin}>
                        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 pb-2 mb-1 border-b border-border text-xs text-muted-foreground font-medium">
                          <span>Country</span><span className="text-right">Clicks</span><span className="text-right">Impr.</span><span className="text-right">Pos.</span>
                        </div>
                        {gscData.countries.map((c, i) => (
                          <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 py-2 border-b border-border/50 last:border-0 text-sm" data-testid={`country-row-${i}`}>
                            <span>{COUNTRY_NAMES[c.country.toLowerCase()] || c.country.toUpperCase()}</span>
                            <span className="text-right font-medium">{fmtNum(c.clicks)}</span>
                            <span className="text-right text-muted-foreground">{fmtNum(c.impressions)}</span>
                            <span className="text-right text-muted-foreground">{fmtPos(c.position)}</span>
                          </div>
                        ))}
                      </SectionCard>
                    )}
                  </div>
                )}

                {/* ════════════════════════════════════════════════════════
                    TECHNICAL TAB
                ════════════════════════════════════════════════════════ */}
                {tab === "technical" && (
                  <div className="space-y-5">

                    {/* URL Inspector */}
                    <Card className="border-border bg-card overflow-hidden">
                      <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-purple-600" />
                      <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-1">
                          <Search className="h-4 w-4 text-violet-500" />
                          <h3 className="text-sm font-semibold text-foreground">URL Inspector</h3>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4">
                          Enter any URL on your site to check its index status, mobile usability, and rich result detection.
                        </p>
                        <div className="flex gap-2">
                          <Input
                            value={inspectUrl}
                            onChange={(e) => setInspectUrl(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter" && inspectUrl.trim()) inspectMut.mutate(inspectUrl.trim()); }}
                            placeholder="https://yoursite.com/page"
                            className="text-sm"
                            data-testid="input-inspect-url"
                          />
                          <Button
                            onClick={() => inspectUrl.trim() && inspectMut.mutate(inspectUrl.trim())}
                            disabled={inspectMut.isPending || !inspectUrl.trim()}
                            className="bg-violet-500 hover:bg-violet-600 text-white shrink-0"
                            data-testid="button-inspect"
                          >
                            {inspectMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                            <span className="ml-1.5 hidden sm:inline">Inspect</span>
                          </Button>
                        </div>

                        {/* Inspection results */}
                        {inspectResult && (
                          <div className="mt-5 space-y-4">
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <Globe className="h-3.5 w-3.5" />
                              <span className="font-medium truncate">{inspectResult.inspectionUrl}</span>
                            </div>

                            {/* Index Status */}
                            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-foreground flex items-center gap-1.5"><FileSearch className="h-4 w-4 text-blue-500" />Index Status</span>
                                <VerdictBadge verdict={inspectResult.indexStatus.verdict} />
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
                                {[
                                  { label: "Coverage", value: (() => { const c = COVERAGE_LABELS[inspectResult.indexStatus.coverageState]; return <span className={c?.color}>{c?.label || inspectResult.indexStatus.coverageState || "—"}</span>; })() },
                                  { label: "Last Crawled", value: inspectResult.indexStatus.lastCrawlTime ? relativeDate(inspectResult.indexStatus.lastCrawlTime) : "Never" },
                                  { label: "Crawled As", value: inspectResult.indexStatus.crawledAs?.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c=>c.toUpperCase()) || "—" },
                                  { label: "Page Fetch", value: inspectResult.indexStatus.pageFetchState?.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c=>c.toUpperCase()) || "—" },
                                  { label: "Robots.txt", value: inspectResult.indexStatus.robotsTxtState === "ALLOWED" ? <span className="text-emerald-500">Allowed</span> : <span className="text-red-500">Blocked</span> },
                                  { label: "Indexing", value: inspectResult.indexStatus.indexingState?.replace("INDEXING_", "").replace("BLOCKED_BY_", "Blocked: ").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c=>c.toUpperCase()) || "—" },
                                ].map(row => (
                                  <div key={row.label} className="flex items-baseline justify-between gap-2 border-b border-border/30 pb-1.5">
                                    <span className="text-muted-foreground shrink-0">{row.label}</span>
                                    <span className="text-foreground font-medium text-right">{row.value}</span>
                                  </div>
                                ))}
                              </div>
                              {inspectResult.indexStatus.googleCanonical && inspectResult.indexStatus.userCanonical &&
                               inspectResult.indexStatus.googleCanonical !== inspectResult.indexStatus.userCanonical && (
                                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-medium text-amber-600">Canonical mismatch</span>
                                    <p className="text-muted-foreground mt-0.5">Google is using a different canonical than your page declares. This can dilute ranking signals.</p>
                                    <p className="mt-1">Google: <span className="font-mono text-foreground">{inspectResult.indexStatus.googleCanonical}</span></p>
                                    <p>Yours: <span className="font-mono text-foreground">{inspectResult.indexStatus.userCanonical}</span></p>
                                  </div>
                                </div>
                              )}
                              {inspectResult.indexStatus.sitemap.length > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  <span className="font-medium">In sitemaps: </span>
                                  {inspectResult.indexStatus.sitemap.join(", ")}
                                </div>
                              )}
                            </div>

                            {/* Mobile Usability */}
                            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-amber-500" />Mobile Usability</span>
                                <VerdictBadge verdict={inspectResult.mobileUsability.verdict} />
                              </div>
                              {inspectResult.mobileUsability.issues.length === 0
                                ? <p className="text-xs text-emerald-500 flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" />No mobile usability issues found.</p>
                                : inspectResult.mobileUsability.issues.map((issue, i) => (
                                    <div key={i} className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs">
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                                      <span className="text-foreground">{issue.message || issue.type}</span>
                                    </div>
                                  ))
                              }
                            </div>

                            {/* Rich Results */}
                            <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-violet-500" />Rich Results</span>
                                <VerdictBadge verdict={inspectResult.richResults.verdict} />
                              </div>
                              {inspectResult.richResults.detectedItems.length === 0
                                ? <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Info className="h-3.5 w-3.5" />No rich result types detected on this page.</p>
                                : inspectResult.richResults.detectedItems.map((item, i) => (
                                    <div key={i} className="rounded-lg bg-card border border-border/50 p-2.5">
                                      <p className="text-xs font-medium text-foreground mb-1">{item.richResultType.replace(/_/g," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase())}</p>
                                      {item.items.map((it, j) => (
                                        <div key={j} className="ml-2 text-xs">
                                          <span className="text-muted-foreground">{it.name}</span>
                                          {it.issues.map((iss, k) => (
                                            <div key={k} className="flex items-start gap-1.5 mt-0.5">
                                              <AlertCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />
                                              <span className="text-red-400">{iss.message}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ))}
                                    </div>
                                  ))
                              }
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Search Appearances */}
                    {gscData.searchAppearances.length > 0 && (
                      <SectionCard accent="bg-gradient-to-r from-indigo-400 to-blue-500" title="Search Appearances" subtitle="Rich result types showing up in Google for your site" icon={Sparkles}>
                        <ResponsiveContainer width="100%" height={Math.max(100, gscData.searchAppearances.length * 34)}>
                          <BarChart
                            data={gscData.searchAppearances.map(a => ({ name: APPEARANCE_LABELS[a.appearance] || a.appearance, impressions: a.impressions, clicks: a.clicks }))}
                            layout="vertical" margin={{ left: 8, right: 8, top: 0, bottom: 0 }}>
                            <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={fmtNum} />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }} axisLine={false} tickLine={false} width={145} />
                            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                              formatter={(v: number, n: string) => [fmtNum(v), n === "impressions" ? "Impressions" : "Clicks"]} />
                            <Bar dataKey="impressions" fill="#6366f1" radius={[0,3,3,0]} maxBarSize={14} />
                            <Bar dataKey="clicks" fill="#a5b4fc" radius={[0,3,3,0]} maxBarSize={14} />
                          </BarChart>
                        </ResponsiveContainer>
                        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" />Impressions</span>
                          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-indigo-300 inline-block" />Clicks</span>
                        </div>
                      </SectionCard>
                    )}

                    {/* Sitemaps */}
                    {gscData.sitemaps.length > 0 && (
                      <SectionCard accent="bg-gradient-to-r from-slate-400 to-slate-500" title="Sitemaps" subtitle="Submitted sitemaps and their index coverage" icon={FileSearch}>
                        <div className="space-y-3">
                          {gscData.sitemaps.map((s, i) => {
                            const coverage = s.submitted > 0 ? (s.indexed / s.submitted) * 100 : 0;
                            const hasIssues = s.errors > 0 || s.warnings > 0;
                            const path = pagePath(s.path);
                            return (
                              <div key={i} className="rounded-xl border border-border bg-muted/20 p-3.5" data-testid={`sitemap-${i}`}>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <a href={s.path} target="_blank" rel="noopener noreferrer"
                                    className="text-xs font-medium hover:text-blue-500 transition-colors truncate">{path}</a>
                                  {hasIssues
                                    ? <span className="flex items-center gap-1 text-xs text-amber-500 shrink-0"><AlertTriangle className="h-3 w-3" />{s.errors > 0 ? `${s.errors} error${s.errors > 1 ? "s" : ""}` : `${s.warnings} warning${s.warnings > 1 ? "s" : ""}`}</span>
                                    : <span className="flex items-center gap-1 text-xs text-emerald-500 shrink-0"><CheckCircle2 className="h-3 w-3" />OK</span>
                                  }
                                </div>
                                {s.submitted > 0 && <>
                                  <div className="flex items-center justify-between text-xs mb-1.5">
                                    <span className="text-muted-foreground">Indexed / Submitted</span>
                                    <span className="font-medium">{fmtNum(s.indexed)} / {fmtNum(s.submitted)} ({coverage.toFixed(0)}%)</span>
                                  </div>
                                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(coverage, 100)}%` }} />
                                  </div>
                                </>}
                                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Submitted {relativeDate(s.lastSubmitted)}</span>
                                  {s.lastDownloaded && <span>Crawled {relativeDate(s.lastDownloaded)}</span>}
                                  {s.isPending && <span className="text-amber-500">Pending</span>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </SectionCard>
                    )}
                  </div>
                )}

              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
