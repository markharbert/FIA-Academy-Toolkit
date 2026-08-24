import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Compass, Search, Bookmark, ChevronRight, Plus, CheckCircle2 } from "lucide-react";
import { Tile, TileTitle, StatChip } from "../widget-registry";

type TopicRun = {
  id: string;
  seedQuery: string;
  status: string;
  topicCount: number;
  createdAt: string;
};

type SavedTopic = {
  id: string;
  completedAt: string | null;
  topic: { topicTitle: string };
};

export function TopicPulseWidget() {
  const { data: runsData } = useQuery<{ runs: TopicRun[]; total: number }>({
    queryKey: ["/api/topic-pulse/runs"],
  });
  const { data: saved = [] } = useQuery<SavedTopic[]>({
    queryKey: ["/api/topic-pulse/saved-topics"],
  });

  const runs = runsData?.runs ?? [];
  const latestRun = runs[0] ?? null;
  const totalRuns = runsData?.total ?? 0;
  const savedPending = saved.filter((s) => !s.completedAt).length;
  const savedDone = saved.filter((s) => !!s.completedAt).length;

  return (
    <Tile accent="bg-gradient-to-r from-teal-500 to-cyan-400" testId="card-topic-pulse">
      <TileTitle
        icon={Compass}
        title="Topic Pulse"
        accent="bg-teal-500/10 text-teal-600 dark:text-teal-400"
        right={
          <Link
            href="/video-studio/research"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
          >
            Research <ChevronRight className="h-3 w-3" />
          </Link>
        }
      />

      <div className="mt-4 grid grid-cols-3 gap-2">
        <StatChip value={totalRuns} label="Runs" tone="teal" />
        <StatChip value={savedPending} label="Saved" tone={savedPending > 0 ? "amber" : "neutral"} />
        <StatChip value={savedDone} label="Done" tone={savedDone > 0 ? "emerald" : "neutral"} />
      </div>

      <div className="mt-4">
        {latestRun ? (
          <div className="rounded-xl border border-border bg-gradient-to-br from-teal-500/5 to-cyan-500/5 p-3">
            <div className="flex items-center gap-2 mb-1">
              <Search className="h-3.5 w-3.5 text-teal-500 shrink-0" />
              <p className="text-xs font-semibold truncate flex-1 text-foreground">
                "{latestRun.seedQuery}"
              </p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                {latestRun.topicCount} topics found
              </p>
              <p className="text-[11px] text-muted-foreground">
                {Number.isFinite(new Date(latestRun.createdAt).getTime())
                  ? new Date(latestRun.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  })
                  : "Unknown date"}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-4 text-center">
            <Compass className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground mb-2.5">No research runs yet</p>
            <Link href="/video-studio/research">
              <Button
                size="sm"
                className="bg-teal-500 hover:bg-teal-600 text-white h-7 text-xs"
                data-testid="button-start-research"
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Start Research
              </Button>
            </Link>
          </div>
        )}

        {saved.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">
              Saved topics
            </p>
            <div className="space-y-1">
              {saved.slice(0, 3).map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  {s.completedAt ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : (
                    <Bookmark className="h-3.5 w-3.5 shrink-0 text-teal-500" />
                  )}
                  <p
                    className={`text-xs truncate flex-1 ${
                      s.completedAt
                        ? "line-through text-muted-foreground"
                        : "text-foreground font-medium"
                    }`}
                  >
                    {s.topic?.topicTitle || "Untitled topic"}
                  </p>
                </div>
              ))}
              {saved.length > 3 && (
                <Link
                  href="/video-studio/research/saved"
                  className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline"
                >
                  +{saved.length - 3} more →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </Tile>
  );
}
