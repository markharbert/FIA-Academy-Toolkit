import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Search, MousePointerClick, BarChart3, Hash, Globe, ChevronRight } from "lucide-react";
import { Tile, TileTitle, fmtNum } from "../widget-registry";

type GscStatus = {
  connected: boolean;
  connectedEmail?: string;
  sites?: string[];
  selectedSiteUrl?: string | null;
};

type GscData = {
  overview?: {
    totalClicks?: number;
    totalImpressions?: number;
    avgCtr?: number;
    avgPosition?: number;
  } | null;
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

export function SearchConsoleWidget() {
  const { data: status } = useQuery<GscStatus>({
    queryKey: ["/api/analytics/gsc/status"],
  });
  const { data: gscData, isError: isAnalyticsError, refetch } = useQuery<GscData>({
    queryKey: ["/api/analytics/gsc/data", status?.selectedSiteUrl ?? null, 28],
    enabled: status?.connected === true,
    queryFn: () =>
      fetch("/api/analytics/gsc/data?days=28", { credentials: "include" }).then((r) =>
        r.json(),
      ),
  });

  const clicks = gscData?.overview?.totalClicks ?? gscData?.clicks;
  const impressions = gscData?.overview?.totalImpressions ?? gscData?.impressions;
  const ctr = gscData?.overview?.avgCtr ?? gscData?.ctr;
  const position = gscData?.overview?.avgPosition ?? gscData?.position;
  const numericCtr = Number(ctr);
  const numericPosition = Number(position);

  return (
    <Tile accent="bg-gradient-to-r from-blue-500 to-indigo-500" testId="card-search-console">
      <TileTitle
        icon={Search}
        title="Search Console"
        accent="bg-blue-500/10 text-blue-600 dark:text-blue-400"
        right={
          <Link
            href="/analytics/search-console"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
          >
            Analytics <ChevronRight className="h-3 w-3" />
          </Link>
        }
      />

      {status?.connected ? (
        <>
          {status.selectedSiteUrl && (
            <div className="mt-2 flex items-center gap-1.5">
              <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
              <p className="text-[11px] text-muted-foreground truncate">{status.selectedSiteUrl}</p>
            </div>
          )}

          {isAnalyticsError ? (
            <div className="mt-4 rounded-lg border border-dashed border-border p-3 text-center">
              <p className="text-xs text-muted-foreground">Search data could not be loaded.</p>
              <Button size="sm" variant="ghost" className="mt-1 h-7 text-xs" onClick={() => refetch()}>
                Try again
              </Button>
            </div>
          ) : <><div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-blue-500/10 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <MousePointerClick className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Clicks
                </p>
              </div>
              <p className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
                {fmtNum(clicks)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Last 28 days</p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <BarChart3 className="h-3 w-3 text-muted-foreground" />
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  Impressions
                </p>
              </div>
              <p className="text-2xl font-bold tabular-nums">{fmtNum(impressions)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Last 28 days</p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs px-1">
            <div className="flex items-center gap-2">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Avg CTR</span>
              <span className="font-bold text-foreground">
                {Number.isFinite(numericCtr) ? `${(numericCtr * 100).toFixed(1)}%` : "—"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Avg position</span>
              <span className="font-bold text-foreground">
                {Number.isFinite(numericPosition) ? numericPosition.toFixed(1) : "—"}
              </span>
            </div>
          </div>
          </>}
        </>
      ) : (
        <div className="mt-4 text-center py-4">
          <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
            <Search className="h-6 w-6 text-blue-500/70" />
          </div>
          <p className="text-sm font-semibold">Search Console not connected</p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">
            Connect Google Search Console to track search traffic.
          </p>
          <Link href="/analytics/search-console">
            <Button
              size="sm"
              className="bg-blue-500 hover:bg-blue-600 text-white h-8 text-xs"
              data-testid="button-connect-gsc"
            >
              Connect GSC
            </Button>
          </Link>
        </div>
      )}
    </Tile>
  );
}
