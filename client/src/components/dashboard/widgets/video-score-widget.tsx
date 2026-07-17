import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Video, TrendingUp, TrendingDown, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tile, TileTitle, scoreColor } from "../widget-registry";
import type { Session } from "@shared/schema";

function ScoreRing({ score, size = 76 }: { score: number; size?: number }) {
  const r = (size - 12) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const clr = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  const trackClr = score >= 70 ? "rgba(16,185,129,0.12)" : score >= 40 ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)";
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackClr} strokeWidth={8} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={clr} strokeWidth={8}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.7s ease" }}
      />
    </svg>
  );
}

export function VideoScoreWidget() {
  const { data: sessions = [] } = useQuery<Session[]>({ queryKey: ["/api/sessions"] });

  const scored = (sessions as any[]).filter(
    (s) => s.scoreStatus === "final" && s.scoreJson?.totalScore != null,
  );
  const latest = scored[0] ?? null;
  const latestScore: number | null = latest?.scoreJson?.totalScore ?? null;

  const trend = useMemo(() => {
    if (scored.length < 2) return null;
    const prev = scored[1].scoreJson?.totalScore;
    if (prev == null || latestScore == null) return null;
    return latestScore - prev;
  }, [scored, latestScore]);

  const miniScores: number[] = scored
    .slice(0, 7)
    .map((s: any) => s.scoreJson?.totalScore ?? 0)
    .reverse();
  const maxMini = Math.max(...miniScores, 1);

  return (
    <Tile accent="bg-gradient-to-r from-rose-500 to-orange-400" testId="card-video-score">
      <TileTitle
        icon={Video}
        title="Video Score"
        accent="bg-rose-500/10 text-rose-600 dark:text-rose-400"
        right={
          <Link
            href="/video-score"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
          >
            All sessions →
          </Link>
        }
      />

      {latestScore != null ? (
        <>
          <div className="mt-4 flex items-center gap-4">
            <div className="relative flex items-center justify-center shrink-0" style={{ width: 76, height: 76 }}>
              <ScoreRing score={latestScore} />
              <div className="absolute flex flex-col items-center justify-center">
                <span className={`text-2xl font-bold tabular-nums leading-none ${scoreColor(latestScore)}`}>
                  {latestScore}
                </span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wide">/100</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{latest?.title || "Latest session"}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {latest?.createdAt
                  ? new Date(String(latest.createdAt)).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  : ""}
              </p>
              {trend != null && (
                <div
                  className={`flex items-center gap-1 mt-2 text-xs font-semibold ${
                    trend >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-500 dark:text-rose-400"
                  }`}
                >
                  {trend >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {trend >= 0 ? "+" : ""}
                  {trend} pts vs previous
                </div>
              )}
            </div>
          </div>

          {miniScores.length > 1 && (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">
                Score history
              </p>
              <div className="flex items-end gap-1 h-9">
                {miniScores.map((s, i) => {
                  const clr =
                    s >= 70 ? "#10b981" : s >= 40 ? "#f59e0b" : "#ef4444";
                  return (
                    <div
                      key={i}
                      className="flex-1 rounded-sm"
                      style={{
                        height: `${Math.max(15, (s / maxMini) * 100)}%`,
                        background: clr,
                        opacity: i === miniScores.length - 1 ? 1 : 0.4,
                      }}
                      title={`${s}/100`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <Link href="/video-score-upload" className="block mt-4">
            <Button
              size="sm"
              variant="outline"
              className="w-full h-7 text-xs"
              data-testid="button-upload-new-video"
            >
              <UploadCloud className="h-3.5 w-3.5 mr-1" /> Upload new video
            </Button>
          </Link>
        </>
      ) : (
        <div className="mt-4 text-center py-4">
          <div className="h-14 w-14 rounded-full bg-rose-500/10 flex items-center justify-center mx-auto mb-3">
            <Video className="h-7 w-7 text-rose-500/60" />
          </div>
          <p className="text-sm font-semibold">No scored sessions yet</p>
          <p className="text-xs text-muted-foreground mt-0.5 mb-4">
            Upload a practice video to get AI coaching feedback.
          </p>
          <Link href="/video-score-upload">
            <Button
              size="sm"
              className="bg-rose-500 hover:bg-rose-600 text-white h-8 text-xs"
              data-testid="button-upload-video"
            >
              <UploadCloud className="h-3.5 w-3.5 mr-1.5" /> Upload Video
            </Button>
          </Link>
        </div>
      )}
    </Tile>
  );
}
