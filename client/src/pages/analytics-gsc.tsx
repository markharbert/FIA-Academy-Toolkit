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
} from "recharts";
import { useToast } from "@/hooks/use-toast";

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

type Status = {
  connected: boolean;
  connectedEmail?: string;
  selectedSiteUrl?: string;
  sites?: string[];
};

type GscData = {
  overview: { totalClicks: number; totalImpressions: number; avgCtr: number; avgPosition: number };
  topQueries: { key: string; clicks: number; impressions: number; ctr: number; position: number }[];
  topPages: { key: string; clicks: number; impressions: number; ctr: number; position: number }[];
  timeline: { date: string; clicks: number; impressions: number }[];
};

export default function AnalyticsGscPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [days, setDays] = useState("28");

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
          <div className="max-w-5xl mx-auto">
            <Skeleton className="h-6 w-32 bg-white/10 mb-4" />
            <Skeleton className="h-8 w-64 bg-white/10" />
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-4">
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
        <div className="max-w-5xl mx-auto">
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

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
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
            {/* Site selector row */}
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
                  <Select
                    value={status.selectedSiteUrl}
                    onValueChange={(v) => setSiteMut.mutate(v)}
                  >
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
                <SelectTrigger className="h-7 w-36 text-xs border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="28">Last 28 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {dataLoading && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
                </div>
                <Skeleton className="h-64 rounded-2xl" />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Skeleton className="h-80 rounded-2xl" />
                  <Skeleton className="h-80 rounded-2xl" />
                </div>
              </>
            )}

            {!dataLoading && gscData && (
              <>
                {/* KPI cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: "Total Clicks", value: fmtNum(gscData.overview.totalClicks), icon: MousePointerClick, color: "text-blue-500", tip: "Times someone clicked through to your site" },
                    { label: "Total Impressions", value: fmtNum(gscData.overview.totalImpressions), icon: Eye, color: "text-indigo-500", tip: "Times your site appeared in search results" },
                    { label: "Avg Click-Through Rate", value: fmtPct(gscData.overview.avgCtr), icon: Percent, color: "text-sky-500", tip: "% of impressions that turned into clicks" },
                    { label: "Avg Position", value: fmtPos(gscData.overview.avgPosition), icon: TrendingUp, color: "text-cyan-500", tip: "Your average ranking position (lower is better)" },
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

                {/* Timeline chart */}
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

                {/* Top queries + top pages */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Top Queries */}
                  <Card className="border-border bg-card overflow-hidden">
                    <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
                    <CardContent className="p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-1">Top Search Queries</h3>
                      <p className="text-xs text-muted-foreground mb-4">What people searched to find you</p>
                      {gscData.topQueries.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">No data for this period.</p>
                      ) : (
                        <div className="space-y-0">
                          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 pb-2 mb-1 border-b border-border text-xs text-muted-foreground font-medium">
                            <span>Query</span>
                            <span className="text-right">Clicks</span>
                            <span className="text-right">Impr.</span>
                            <span className="text-right">Pos.</span>
                          </div>
                          {gscData.topQueries.map((q, i) => (
                            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 py-2 border-b border-border/50 last:border-0 text-sm" data-testid={`query-row-${i}`}>
                              <span className="text-foreground truncate" title={q.key}>{q.key}</span>
                              <span className="text-right text-foreground font-medium">{fmtNum(q.clicks)}</span>
                              <span className="text-right text-muted-foreground">{fmtNum(q.impressions)}</span>
                              <span className="text-right text-muted-foreground">{fmtPos(q.position)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Top Pages */}
                  <Card className="border-border bg-card overflow-hidden">
                    <div className="h-1 w-full bg-gradient-to-r from-blue-500 to-indigo-600" />
                    <CardContent className="p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-1">Top Pages</h3>
                      <p className="text-xs text-muted-foreground mb-4">Pages driving the most search traffic</p>
                      {gscData.topPages.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">No data for this period.</p>
                      ) : (
                        <div className="space-y-0">
                          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 pb-2 mb-1 border-b border-border text-xs text-muted-foreground font-medium">
                            <span>Page</span>
                            <span className="text-right">Clicks</span>
                            <span className="text-right">Impr.</span>
                            <span className="text-right">Pos.</span>
                          </div>
                          {gscData.topPages.map((p, i) => {
                            const path = (() => { try { return new URL(p.key).pathname; } catch { return p.key; } })();
                            return (
                              <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 py-2 border-b border-border/50 last:border-0 text-sm" data-testid={`page-row-${i}`}>
                                <a
                                  href={p.key}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-foreground hover:text-blue-500 truncate transition-colors"
                                  title={p.key}
                                >
                                  {path || "/"}
                                </a>
                                <span className="text-right text-foreground font-medium">{fmtNum(p.clicks)}</span>
                                <span className="text-right text-muted-foreground">{fmtNum(p.impressions)}</span>
                                <span className="text-right text-muted-foreground">{fmtPos(p.position)}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
