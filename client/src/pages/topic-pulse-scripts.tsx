import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, ArrowLeft, Trash2, FileText, Zap, TrendingUp, TrendingDown, Minus, Calendar, Clock, Sparkles } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Script, Topic } from "@shared/schema";

type TrendDataPoint = { year: number; month: string; value: number };

function formatSearchVolume(volume: number | null | undefined): string {
  if (volume === null || volume === undefined) return "N/A";
  if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
  return volume.toString();
}

function getTrendFromData(trend: TrendDataPoint[] | null | undefined): { direction: string; label: string } {
  if (!trend || trend.length < 6) return { direction: "unknown", label: "Unknown" };
  const recentMonths = trend.slice(-3);
  const olderMonths = trend.slice(-6, -3);
  const recentAvg = recentMonths.reduce((sum, t) => sum + t.value, 0) / recentMonths.length;
  const olderAvg = olderMonths.reduce((sum, t) => sum + t.value, 0) / olderMonths.length;
  if (olderAvg === 0) return { direction: "unknown", label: "Unknown" };
  const growthRate = (recentAvg - olderAvg) / olderAvg;
  const percentChange = Math.round(growthRate * 100);
  if (growthRate > 0.1) return { direction: "rising", label: `+${percentChange}%` };
  if (growthRate < -0.1) return { direction: "falling", label: `${percentChange}%` };
  return { direction: "steady", label: "Steady" };
}

function getOpportunityLevel(score: number): { color: string; label: string; chipClass: string } {
  if (score >= 70) return { color: "text-emerald-600 dark:text-emerald-400", label: "Great opportunity", chipClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20" };
  if (score >= 50) return { color: "text-amber-600 dark:text-amber-400", label: "Good potential", chipClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/20" };
  return { color: "text-red-600 dark:text-red-400", label: "Challenging", chipClass: "bg-red-500/10 text-red-600 dark:text-red-400 ring-red-500/20" };
}

function TrendChip({ direction, label }: { direction: string; label: string }) {
  if (direction === "rising") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 ring-1 ring-green-500/20">
      <TrendingUp className="h-3 w-3" /> {label}
    </span>
  );
  if (direction === "falling") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 ring-1 ring-red-500/20">
      <TrendingDown className="h-3 w-3" /> {label}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground ring-1 ring-border">
      <Minus className="h-3 w-3" /> Steady
    </span>
  );
}

const CARD_ACCENTS = [
  "border-l-violet-500",
  "border-l-blue-500",
  "border-l-teal-500",
  "border-l-rose-500",
  "border-l-amber-500",
  "border-l-indigo-500",
];

function getAccentClass(index: number) {
  return CARD_ACCENTS[index % CARD_ACCENTS.length];
}

export default function TopicPulseScriptsPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: scripts, isLoading } = useQuery<(Script & { topic?: Topic })[]>({
    queryKey: ["/api/topic-pulse/scripts"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/topic-pulse/scripts/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Script deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/scripts"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete script", description: err.message, variant: "destructive" });
    },
  });

  const count = scripts?.length ?? 0;

  return (
    <div className="min-h-full flex flex-col">
      {/* ── Hero header ── */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-6 shrink-0">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate("/video-tools")}
            className="flex items-center gap-1 text-white/50 hover:text-white text-sm transition-colors shrink-0"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
            Video Tools
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white" data-testid="text-page-title">Generated Scripts</h1>
              {!isLoading && count > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                  {count} {count === 1 ? "script" : "scripts"}
                </span>
              )}
            </div>
            <p className="text-white/40 text-xs mt-0.5">Your saved scripts, ready to edit and use</p>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 max-w-4xl mx-auto">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : scripts && scripts.length > 0 ? (
            <div className="space-y-3">
              {scripts.map((script, index) => {
                const trend = getTrendFromData(script.topic?.trendData as TrendDataPoint[] | null);
                const opp = script.topic ? getOpportunityLevel(script.topic.opportunityScore || 0) : null;
                const videoLength = (script.inputsJson as any)?.videoLengthTarget;
                const accent = getAccentClass(index);

                return (
                  <div
                    key={script.id}
                    className={`group relative rounded-xl border bg-card shadow-sm border-l-4 ${accent} cursor-pointer transition-all hover:shadow-md hover:-translate-y-px`}
                    onClick={() => navigate(`/video-trends/scripts/${script.id}`)}
                    data-testid={`card-script-${script.id}`}
                  >
                    <div className="px-5 py-4 flex items-start gap-4">
                      {/* Icon */}
                      <div className="mt-0.5 p-2 rounded-lg bg-muted/60 shrink-0">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        {/* Title row */}
                        <p className="font-semibold text-base leading-snug group-hover:text-primary transition-colors">
                          {script.title}
                        </p>

                        {/* Meta row */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {new Date(script.createdAt).toLocaleDateString()}
                          </span>
                          {videoLength && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {videoLength} min video
                            </span>
                          )}
                        </div>

                        {/* Topic keyword + stat chips inline */}
                        {script.topic && (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              <span className="font-medium text-foreground/70">Topic:</span> {script.topic.keywordQuery}
                            </span>
                            <span className="text-muted-foreground/40 text-xs">·</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/20 cursor-help font-mono">
                                  {formatSearchVolume(script.topic.monthlySearchVolume)}/mo
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top"><p className="text-xs">Monthly Search Volume</p></TooltipContent>
                            </Tooltip>
                            <TrendChip direction={trend.direction} label={trend.label} />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ring-1 cursor-help font-mono ${opp?.chipClass}`}>
                                  <Sparkles className="h-3 w-3" />
                                  {script.topic.opportunityScore}/100
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p className="font-medium text-xs">{opp?.label}</p>
                                <p className="text-xs text-muted-foreground">Opportunity score</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        )}
                      </div>

                      {/* Delete button */}
                      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(script.id);
                          }}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${script.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-16 flex flex-col items-center text-center">
              <div className="p-4 rounded-2xl bg-muted/50 mb-4">
                <Zap className="h-10 w-10 text-muted-foreground/60" />
              </div>
              <p className="text-lg font-semibold text-foreground/80">No scripts yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Head over to Video Trends, find a great topic, and generate your first script.
              </p>
              <Button
                className="mt-5"
                onClick={() => navigate("/video-trends")}
                data-testid="button-go-to-trends"
              >
                Explore Topics
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
