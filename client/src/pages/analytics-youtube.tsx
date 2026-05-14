import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Youtube,
  Users,
  Eye,
  Video,
  ThumbsUp,
  MessageSquare,
  ExternalLink,
  RefreshCw,
  LogOut,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function parseDuration(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = parseInt(m[1] || "0");
  const min = parseInt(m[2] || "0");
  const sec = parseInt(m[3] || "0");
  if (h > 0) return `${h}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

type Status = { connected: boolean; connectedEmail?: string; channel?: { id: string; title: string; handle: string; thumbnail: string; subscriberCount: number; videoCount: number; viewCount: number } };
type VideoData = { id: string; title: string; thumbnail: string; publishedAt: string; viewCount: number; likeCount: number; commentCount: number; duration: string }[];

export default function AnalyticsYouTubePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: status, isLoading: statusLoading } = useQuery<Status>({
    queryKey: ["/api/analytics/youtube/status"],
  });

  const { data: videos, isLoading: videosLoading } = useQuery<VideoData>({
    queryKey: ["/api/analytics/youtube/videos"],
    enabled: status?.connected === true,
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
      toast({ title: "Refreshed", description: "Channel data updated." });
    },
    onError: () => toast({ title: "Error", description: "Could not refresh data.", variant: "destructive" }),
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
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
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
                <Youtube className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">YouTube Analytics</h1>
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
                  data-testid="button-refresh-youtube"
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
                  data-testid="button-disconnect-youtube"
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
            <div className="w-20 h-20 rounded-2xl bg-red-500/10 flex items-center justify-center mb-5">
              <Youtube className="h-10 w-10 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Connect your YouTube channel</h2>
            <p className="text-muted-foreground text-sm max-w-md mb-8 leading-relaxed">
              Sign in with the Google account that owns your YouTube channel. We'll pull in your channel stats and video performance data.
            </p>
            <Button
              className="bg-gradient-to-r from-red-500 to-rose-600 text-white hover:opacity-90 px-6"
              onClick={() => { window.location.href = "/api/analytics/youtube/connect"; }}
              data-testid="button-connect-youtube"
            >
              <Youtube className="h-4 w-4 mr-2" />
              Connect YouTube Channel
            </Button>
            <p className="text-xs text-muted-foreground mt-4 opacity-60">
              Read-only access — we never post or modify anything on your channel.
            </p>
          </div>
        )}

        {/* Connected — dashboard */}
        {status?.connected && status.channel && (
          <div className="space-y-6">
            {/* Channel identity card */}
            <Card className="border-border bg-card overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-red-500 to-rose-600" />
              <CardContent className="p-5 flex items-center gap-4">
                {status.channel.thumbnail ? (
                  <img
                    src={status.channel.thumbnail}
                    alt={status.channel.title}
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-red-500/30"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
                    <Youtube className="h-7 w-7 text-red-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-foreground truncate">{status.channel.title}</h2>
                  {status.channel.handle && (
                    <p className="text-sm text-muted-foreground">@{status.channel.handle.replace(/^@/, "")}</p>
                  )}
                </div>
                <a
                  href={`https://youtube.com/channel/${status.channel.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  data-testid="link-youtube-channel"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </CardContent>
            </Card>

            {/* KPI cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: "Subscribers", value: fmt(status.channel.subscriberCount), icon: Users, color: "text-red-500" },
                { label: "Total Views", value: fmt(status.channel.viewCount), icon: Eye, color: "text-rose-500" },
                { label: "Videos Published", value: fmt(status.channel.videoCount), icon: Video, color: "text-pink-500" },
              ].map((kpi) => (
                <Card key={kpi.label} className="border-border bg-card" data-testid={`kpi-${kpi.label.toLowerCase().replace(/ /g, "-")}`}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                      <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
                    </div>
                    <p className="text-3xl font-bold text-foreground">{kpi.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Video performance chart */}
            {videosLoading && (
              <Skeleton className="h-64 rounded-2xl" />
            )}
            {!videosLoading && videos && videos.length > 0 && (
              <Card className="border-border bg-card overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-red-500 to-rose-600" />
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-1">Views by Video</h3>
                  <p className="text-xs text-muted-foreground mb-4">Your most recent uploads ranked by view count</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={[...videos].sort((a, b) => b.viewCount - a.viewCount).slice(0, 10).map((v) => ({
                        name: v.title.length > 28 ? v.title.slice(0, 28) + "…" : v.title,
                        views: v.viewCount,
                      }))}
                      layout="vertical"
                      margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={fmt} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={170} axisLine={false} tickLine={false} />
                      <Tooltip
                        formatter={(v: number) => [fmt(v), "Views"]}
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                        cursor={{ fill: "hsl(var(--muted)/0.3)" }}
                      />
                      <Bar dataKey="views" fill="#ef4444" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Video table */}
            {!videosLoading && videos && videos.length > 0 && (
              <Card className="border-border bg-card overflow-hidden">
                <div className="h-1 w-full bg-gradient-to-r from-red-500 to-rose-600" />
                <CardContent className="p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Recent Videos</h3>
                  <div className="space-y-3">
                    {videos.map((v, i) => (
                      <div
                        key={v.id}
                        className="flex items-start gap-3 py-3 border-b border-border last:border-0"
                        data-testid={`video-row-${i}`}
                      >
                        {/* Thumbnail */}
                        <a
                          href={`https://youtube.com/watch?v=${v.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0"
                        >
                          {v.thumbnail ? (
                            <img src={v.thumbnail} alt="" className="w-24 h-14 object-cover rounded-lg" />
                          ) : (
                            <div className="w-24 h-14 bg-muted rounded-lg flex items-center justify-center">
                              <Video className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                        </a>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <a
                            href={`https://youtube.com/watch?v=${v.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-foreground hover:text-red-500 transition-colors line-clamp-2 leading-snug"
                          >
                            {v.title}
                          </a>
                          <div className="flex flex-wrap items-center gap-3 mt-1.5">
                            <span className="text-xs text-muted-foreground">{fmtDate(v.publishedAt)}</span>
                            {v.duration && <span className="text-xs text-muted-foreground">{parseDuration(v.duration)}</span>}
                          </div>
                        </div>
                        {/* Stats */}
                        <div className="shrink-0 flex flex-col items-end gap-1.5 text-right">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Eye className="h-3 w-3" />
                            <span className="font-medium text-foreground">{fmt(v.viewCount)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <ThumbsUp className="h-3 w-3" />
                            <span>{fmt(v.likeCount)}</span>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MessageSquare className="h-3 w-3" />
                            <span>{fmt(v.commentCount)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {!videosLoading && videos && videos.length === 0 && (
              <Card className="border-border bg-card">
                <CardContent className="p-8 text-center">
                  <Video className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">No videos found on this channel yet.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
