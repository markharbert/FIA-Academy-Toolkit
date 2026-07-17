import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ScrollText, PenLine, ChevronRight } from "lucide-react";
import { Tile, TileTitle, timeAgo } from "../widget-registry";
import type { Script } from "@shared/schema";

export function ScriptsWidget() {
  const { data: scripts = [] } = useQuery<Script[]>({
    queryKey: ["/api/topic-pulse/scripts"],
  });

  return (
    <Tile accent="bg-gradient-to-r from-emerald-500 to-green-400" testId="card-scripts">
      <TileTitle
        icon={ScrollText}
        title="Scripts"
        accent="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        right={
          <Link
            href="/video-studio/scripts"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
          >
            All scripts <ChevronRight className="h-3 w-3" />
          </Link>
        }
      />

      <div className="mt-4 flex items-end gap-2">
        <span className="text-4xl font-bold tabular-nums leading-none text-emerald-600 dark:text-emerald-400">
          {scripts.length}
        </span>
        <span className="text-muted-foreground text-sm mb-1">
          script{scripts.length !== 1 ? "s" : ""} written
        </span>
      </div>

      <div className="mt-4">
        {scripts.length > 0 ? (
          <>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">
              Recent scripts
            </p>
            <div className="rounded-lg border border-border overflow-hidden">
              {scripts.slice(0, 3).map((s, i) => (
                <Link key={s.id} href={`/video-studio/scripts/${s.id}`}>
                  <div
                    className={`flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/30 transition-colors group cursor-pointer ${
                      i < Math.min(scripts.length, 3) - 1 ? "border-b border-border" : ""
                    }`}
                    data-testid={`script-row-${s.id}`}
                  >
                    <div className="h-6 w-6 rounded bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <PenLine className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate">
                        {s.title || "Untitled script"}
                      </p>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
                      {timeAgo(new Date(s.createdAt))}
                    </span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-4 text-center">
            <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-2">
              <ScrollText className="h-5 w-5 text-emerald-500/60" />
            </div>
            <p className="text-xs font-medium text-foreground mb-0.5">No scripts yet</p>
            <p className="text-[11px] text-muted-foreground mb-2.5">
              Generate AI scripts using the 5-part formula.
            </p>
            <Link href="/video-studio/scripts">
              <Button
                size="sm"
                className="bg-emerald-500 hover:bg-emerald-600 text-white h-7 text-xs"
                data-testid="button-write-script"
              >
                <PenLine className="h-3.5 w-3.5 mr-1" /> Write Script
              </Button>
            </Link>
          </div>
        )}
      </div>
    </Tile>
  );
}
