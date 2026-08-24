import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Radar, ChevronRight, Plus } from "lucide-react";
import { Tile, TileTitle, StatChip, anomalyMeta } from "../widget-registry";
import type { InsightsResponse } from "@shared/schema";

export function CompetitorPulseWidget() {
  const { data: insights, isError, refetch } = useQuery<InsightsResponse>({
    queryKey: ["/api/inbox-intel/insights"],
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });

  return (
    <Tile accent="bg-violet-500" testId="card-competitor-pulse">
      <TileTitle
        icon={Radar}
        title="Competitor Pulse"
        accent="bg-violet-500/10 text-violet-600 dark:text-violet-400"
        right={
          <Link
            href="/email-tools/inbox-intel"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
            data-testid="link-pulse-open"
          >
            Open <ChevronRight className="h-3 w-3" />
          </Link>
        }
      />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatChip value={insights?.activeTrackerCount ?? 0} label="Active" />
        <StatChip value={insights?.totalEmails7d ?? 0} label="7-day" />
        <StatChip value={insights?.totalEmails30d ?? 0} label="30-day" />
      </div>
      <div className="mt-4">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">
          Alerts
        </p>
        {isError ? (
          <div className="rounded-md border border-dashed border-border p-2 text-center">
            <p className="text-xs text-muted-foreground">Alerts could not be loaded.</p>
            <Button size="sm" variant="ghost" className="mt-1 h-6 text-xs" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : insights?.anomalies && insights.anomalies.length > 0 ? (
          <div className="space-y-1.5">
            {insights.anomalies.slice(0, 2).map((a) => {
              const meta = anomalyMeta(a.type);
              return (
                <Link key={a.id} href={`/email-tools/inbox-intel/${a.trackerId}`}>
                  <div
                    className={`flex items-center gap-2 rounded-md p-1.5 ring-1 ${meta.bg} ${meta.ring} hover:brightness-105 transition-all cursor-pointer`}
                    data-testid={`anomaly-${a.id}`}
                  >
                    <meta.icon className={`h-3.5 w-3.5 shrink-0 ${meta.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">{a.trackerName}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{meta.label}</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-1">All quiet this week.</p>
        )}
      </div>
      {(insights?.totalTrackers ?? 0) === 0 && (
        <div className="mt-3 rounded-md border border-dashed border-border p-2 text-center">
          <Link href="/email-tools/inbox-intel">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              data-testid="button-create-tracker"
            >
              <Plus className="h-3 w-3 mr-1" /> Track a competitor
            </Button>
          </Link>
        </div>
      )}
    </Tile>
  );
}
