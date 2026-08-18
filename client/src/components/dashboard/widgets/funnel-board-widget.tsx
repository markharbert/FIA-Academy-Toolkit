import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Network, ChevronRight, Plus } from "lucide-react";
import { Tile, TileTitle, timeAgo } from "../widget-registry";

type Funnel = {
  id: string;
  name: string;
  description: string | null;
  thumbnailData: string | null;
  updatedAt: string;
};

function parseThumbnailSrc(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { data?: string };
    return parsed.data ?? null;
  } catch {
    // Fallback: if it's already a plain data URL (old format), use it directly
    return raw.startsWith("data:") ? raw : null;
  }
}

export function FunnelBoardWidget() {
  const { data: funnels = [] } = useQuery<Funnel[]>({
    queryKey: ["/api/funnels"],
  });

  return (
    <Tile accent="bg-gradient-to-r from-orange-500 to-amber-400" testId="card-funnel-board">
      <TileTitle
        icon={Network}
        title="Funnel Board"
        accent="bg-orange-500/10 text-orange-600 dark:text-orange-400"
        right={
          <Link
            href="/funnel-grid"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
          >
            All funnels <ChevronRight className="h-3 w-3" />
          </Link>
        }
      />

      <div className="mt-4 flex items-end gap-2">
        <span className="text-4xl font-bold tabular-nums leading-none text-orange-600 dark:text-orange-400">
          {funnels.length}
        </span>
        <span className="text-muted-foreground text-sm mb-1">
          funnel{funnels.length !== 1 ? "s" : ""}
        </span>
        {funnels.length > 0 && (
          <Link href="/funnel-grid" className="ml-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              data-testid="button-new-funnel"
            >
              <Plus className="h-3 w-3 mr-1" /> New
            </Button>
          </Link>
        )}
      </div>

      {funnels.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-2">
            Recent funnels
          </p>
          <div className="space-y-2">
            {funnels.slice(0, 3).map((f) => (
              <Link key={f.id} href={`/funnel-grid/${f.id}`}>
                <div
                  className="flex items-center gap-2.5 rounded-xl border border-border bg-background/40 p-2 hover:bg-muted/30 transition-colors group cursor-pointer"
                  data-testid={`funnel-row-${f.id}`}
                >
                  {parseThumbnailSrc(f.thumbnailData) ? (
                    <img
                      src={parseThumbnailSrc(f.thumbnailData)!}
                      alt={f.name}
                      className="h-10 w-16 object-cover rounded-lg shrink-0 border border-border"
                    />
                  ) : (
                    <div className="h-10 w-16 rounded-lg bg-gradient-to-br from-orange-500/20 to-amber-400/10 flex items-center justify-center shrink-0 border border-orange-200/30 dark:border-orange-700/20">
                      <Network className="h-4 w-4 text-orange-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{f.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {timeAgo(new Date(f.updatedAt))}
                    </p>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center">
          <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto mb-2">
            <Network className="h-5 w-5 text-orange-500/60" />
          </div>
          <p className="text-xs font-medium text-foreground mb-0.5">No funnels yet</p>
          <p className="text-[11px] text-muted-foreground mb-2.5">
            Design your marketing funnel visually.
          </p>
          <Link href="/funnel-grid">
            <Button
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white h-7 text-xs"
              data-testid="button-create-funnel"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> New Funnel
            </Button>
          </Link>
        </div>
      )}
    </Tile>
  );
}
