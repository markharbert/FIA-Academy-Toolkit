import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Youtube, Users, Eye, Clock, TrendingUp, ChevronRight } from "lucide-react";
import { Tile, TileTitle, fmtNum } from "../widget-registry";

type YtStatus = {
  connected: boolean;
  connectedEmail?: string;
  channel?: {
    id: string;
    title: string;
    handle?: string;
    thumbnail?: string;
    subscriberCount?: number;
    videoCount?: number;
    viewCount?: number;
  } | null;
};

type YtAnalytics = {
  totals?: {
    views?: number;
    watchTimeMinutes?: number;
    estimatedMinutesWatched?: number;
    subscribersGained?: number;
    subscribersLost?: number;
  } | null;
  timeSeries?: any[];
  error?: string | null;
};

export function YoutubeAnalyticsWidget() {
  const { data: status } = useQuery<YtStatus>({
    queryKey: ["/api/analytics/youtube/status"],
  });
  const { data: analytics } = useQuery<YtAnalytics>({
    queryKey: ["/api/analytics/youtube/channel-analytics"],
    enabled: status?.connected === true,
    queryFn: () =>
      fetch("/api/analytics/youtube/channel-analytics?days=28", {
        credentials: "include",
      }).then((r) => r.json()),
  });

  const channel = status?.channel;
  const totals = analytics?.totals;
  const watchHours =
    totals?.watchTimeMinutes != null
      ? Math.round(totals.watchTimeMinutes / 60)
      : totals?.estimatedMinutesWatched != null
      ? Math.round(totals.estimatedMinutesWatched / 60)
      : null;

  const netSubs =
    totals?.subscribersGained != null
      ? (totals.subscribersGained ?? 0) - (totals.subscribersLost ?? 0)
      : null;

  return (
    <Tile accent="bg-gradient-to-r from-red-600 to-rose-500" testId="card-youtube-analytics">
      <TileTitle
        icon={Youtube}
        title="YouTube"
        accent="bg-red-500/10 text-red-600 dark:text-red-400"
        right={
          <Link
            href="/analytics/youtube"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
          >
            Analytics <ChevronRight className="h-3 w-3" />
          </Link>
        }
      />

      {status?.connected ? (
        <>
          {channel?.title && (
            <div className="mt-2 flex items-center gap-2">
              {channel.thumbnail && (
                <img
                  src={channel.thumbnail}
                  alt={channel.title}
                  className="h-5 w-5 rounded-full object-cover shrink-0"
                />
              )}
              <p className="text-[11px] text-muted-foreground truncate">{channel.title}</p>
            </div>
          )}

          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-red-500/10 p-2.5 text-center">
              <Users className="h-3.5 w-3.5 text-red-500 mx-auto mb-1" />
              <p className="text-base font-bold tabular-nums text-red-600 dark:text-red-400">
                {fmtNum(channel?.subscriberCount)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Subscribers</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-2.5 text-center">
              <Eye className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-1" />
              <p className="text-base font-bold tabular-nums">
                {fmtNum(totals?.views)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Views 28d</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-2.5 text-center">
              <Clock className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-1" />
              <p className="text-base font-bold tabular-nums">{fmtNum(watchHours)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">Watch hrs</p>
            </div>
          </div>

          {netSubs != null && (
            <div className="mt-3 flex items-center gap-2 px-1">
              <TrendingUp
                className={`h-3.5 w-3.5 shrink-0 ${
                  netSubs >= 0 ? "text-emerald-500" : "text-rose-500"
                }`}
              />
              <p className="text-xs text-muted-foreground">
                <span
                  className={`font-semibold ${
                    netSubs >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-500"
                  }`}
                >
                  {netSubs >= 0 ? "+" : ""}
                  {fmtNum(netSubs)}
                </span>{" "}
                net subscribers last 28 days
              </p>
            </div>
          )}

          {analytics?.error === "analytics_unavailable" && (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
              Analytics data requires YouTube Partner Program access.
            </p>
          )}
        </>
      ) : (
        <div className="mt-4 text-center py-4">
          <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-3">
            <Youtube className="h-6 w-6 text-red-500/70" />
          </div>
          <p className="text-sm font-semibold">YouTube not connected</p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">
            Connect your channel to see performance data.
          </p>
          <Link href="/analytics/youtube">
            <Button
              size="sm"
              className="bg-red-500 hover:bg-red-600 text-white h-8 text-xs"
              data-testid="button-connect-youtube"
            >
              Connect YouTube
            </Button>
          </Link>
        </div>
      )}
    </Tile>
  );
}
