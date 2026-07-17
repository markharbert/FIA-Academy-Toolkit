import { useQuery } from "@tanstack/react-query";
import { Flame, Trophy } from "lucide-react";
import { Tile, TileTitle, DMO_ACTIVITIES, calcActivityPts, dmoTotalPts } from "../widget-registry";
import type { DmoEntry } from "@shared/schema";

export function DmoWidget() {
  const { data: streak } = useQuery<{ current: number; best: number; totalDays: number }>({
    queryKey: ["/api/dmo/streak"],
  });
  const { data: dmoToday } = useQuery<{ entry: DmoEntry | null; date: string }>({
    queryKey: ["/api/dmo/today"],
  });
  const { data: dmoRecentRaw = [] } = useQuery<DmoEntry[]>({
    queryKey: ["/api/dmo/history", 3],
    queryFn: () =>
      fetch("/api/dmo/history?limit=3", { credentials: "include" }).then((r) => r.json()),
  });

  const todayEntry = dmoToday?.entry ?? null;
  const todayPts = dmoTotalPts(todayEntry);
  const currentStreak = streak?.current ?? 0;
  const bestStreak = streak?.best ?? 0;

  return (
    <Tile accent="bg-amber-500" href="/dmo-tracker" testId="card-dmo-streak">
      <TileTitle
        icon={Flame}
        title="DMO Streak"
        accent="bg-amber-500/10 text-amber-600 dark:text-amber-400"
      />
      <div className="mt-4 flex items-end gap-2">
        <span className="text-4xl font-bold tabular-nums leading-none">{currentStreak}</span>
        <span className="text-muted-foreground text-sm mb-1">days</span>
        {bestStreak > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Trophy className="h-3 w-3" /> Best {bestStreak}
          </span>
        )}
      </div>
      <div className="mt-4 flex items-center gap-1.5">
        {DMO_ACTIVITIES.map((a) => {
          const pts = todayEntry
            ? calcActivityPts((todayEntry[a.secondsKey] as number) ?? 0, a.target)
            : 0;
          return (
            <div
              key={a.key}
              title={`${a.label}: ${pts}/5 pts`}
              className={`h-2.5 w-2.5 rounded-full transition-colors ${
                pts > 0 ? a.dot : "bg-muted-foreground/20"
              } ${pts === 5 ? `ring-2 ${a.ring}` : ""}`}
            />
          );
        })}
        <span className="ml-auto text-xs text-muted-foreground font-medium tabular-nums">
          {todayPts}/25 today
        </span>
      </div>
      {todayPts === 25 ? (
        <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
          Perfect day — streak extended.
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {todayPts === 0
            ? "Log activities to keep your streak alive."
            : `${25 - todayPts} pts left for a perfect day.`}
        </p>
      )}
      {dmoRecentRaw.length > 0 && (
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">
            Recent
          </p>
          <div className="space-y-1.5">
            {dmoRecentRaw.slice(0, 3).map((entry, i) => {
              const pts = dmoTotalPts(entry);
              const label = new Date(entry.date + "T12:00:00").toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              return (
                <div key={(entry as any).id ?? i} className="flex items-center gap-1.5">
                  <p className="text-xs font-medium truncate flex-1 text-foreground">{label}</p>
                  <span
                    className={`text-xs font-bold shrink-0 tabular-nums ${
                      pts === 25
                        ? "text-emerald-600 dark:text-emerald-400"
                        : pts >= 15
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-muted-foreground"
                    }`}
                  >
                    {pts}/25
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Tile>
  );
}
