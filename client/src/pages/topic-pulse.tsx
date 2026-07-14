import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, TrendingUp, Zap, BookOpen, ShoppingBag, HelpCircle, ListChecks, Trash2, Clock, Sparkles, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TopicRun } from "@shared/schema";

interface RunsPage {
  runs: TopicRun[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface CreditsData {
  creditsUsed: number;
  monthlyLimit: number;
  windowStartedAt: string;
  remaining: number;
  resetsAt: string;
}

const PRESETS = [
  { label: "Review",      icon: ShoppingBag, type: "review",       color: "bg-violet-500/10 text-violet-600 dark:text-violet-400 ring-violet-500/30 hover:bg-violet-500/20",       activeColor: "bg-violet-500 text-white ring-violet-500" },
  { label: "Comparison",  icon: ListChecks,  type: "comparison",   color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-blue-500/30 hover:bg-blue-500/20",                 activeColor: "bg-blue-500 text-white ring-blue-500" },
  { label: "How-To",      icon: BookOpen,    type: "how-to",       color: "bg-teal-500/10 text-teal-600 dark:text-teal-400 ring-teal-500/30 hover:bg-teal-500/20",                 activeColor: "bg-teal-500 text-white ring-teal-500" },
  { label: "Problem Fix", icon: HelpCircle,  type: "problem-fix",  color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-amber-500/30 hover:bg-amber-500/20",            activeColor: "bg-amber-500 text-white ring-amber-500" },
];

const RUN_ACCENTS = [
  "border-l-violet-500",
  "border-l-blue-500",
  "border-l-teal-500",
  "border-l-rose-500",
  "border-l-amber-500",
  "border-l-indigo-500",
];

export default function TopicPulsePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [seedQuery, setSeedQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string | undefined>();
  const [runsPage, setRunsPage] = useState(1);
  const PAGE_SIZE = 15;

  const { data: runsData, isLoading: runsLoading } = useQuery<RunsPage>({
    queryKey: ["/api/topic-pulse/runs", runsPage],
    queryFn: async () => {
      const res = await fetch(`/api/topic-pulse/runs?page=${runsPage}&limit=${PAGE_SIZE}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load runs");
      return res.json();
    },
  });

  const { data: savedTopics } = useQuery<any[]>({
    queryKey: ["/api/topic-pulse/saved-topics"],
  });

  const { data: scripts } = useQuery<any[]>({
    queryKey: ["/api/topic-pulse/scripts"],
  });

  const { data: creditsData } = useQuery<CreditsData>({
    queryKey: ["/api/topic-pulse/credits"],
    staleTime: 60 * 1000,
  });

  const creditsRemaining = creditsData?.remaining ?? 0;
  const creditLimit = creditsData?.monthlyLimit ?? 0;
  const creditsExhausted = creditsData !== undefined && creditsRemaining < 1;
  const creditsLow = creditLimit > 0 && creditsRemaining / creditLimit < 0.1;
  const creditsMedium = creditLimit > 0 && creditsRemaining / creditLimit < 0.2;

  const searchMutation = useMutation({
    mutationFn: async (input: { seedQuery: string; videoType?: string }) => {
      const res = await apiRequest("POST", "/api/topic-pulse/search", input);
      return res.json();
    },
    onSuccess: (data: { runId: string }) => {
      setRunsPage(1);
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/credits"] });
      navigate(`/video-studio/research/explore/${data.runId}`);
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/credits"] });
      toast({ title: "Search failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      await apiRequest("DELETE", `/api/topic-pulse/runs/${runId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/runs"] });
      toast({ title: "Search deleted" });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteAllRunsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/topic-pulse/runs");
    },
    onSuccess: () => {
      setRunsPage(1);
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/runs"] });
      toast({ title: "All searches cleared" });
    },
    onError: (err: Error) => {
      toast({ title: "Clear failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSearch = () => {
    if (!seedQuery.trim()) {
      toast({ title: "Enter a topic", description: "Please enter a niche or keyword to search", variant: "destructive" });
      return;
    }
    searchMutation.mutate({ seedQuery: seedQuery.trim(), videoType: selectedType });
  };

  const handlePresetClick = (type: string) => {
    setSelectedType(selectedType === type ? undefined : type);
  };

  return (
    <div className="min-h-full flex flex-col">

      {/* ── Hero header (left-justified) ── */}
      <div className="relative overflow-hidden border-b border-border shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(32_60%_16%)]" />
        <div className="absolute -bottom-20 -right-10 h-64 w-64 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute -top-14 -left-6 h-56 w-56 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative max-w-4xl mx-auto px-6 py-6 flex items-center gap-4">
          <Link href="/video-studio">
            <button className="flex items-center gap-1 text-white/50 hover:text-white text-sm transition-colors shrink-0" data-testid="button-back-video-studio">
              <ArrowLeft className="h-4 w-4" />
              Video Studio
            </button>
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <Sparkles className="h-4 w-4 text-amber-400 shrink-0" />
              <h1 className="text-xl font-bold text-white" data-testid="text-page-title">Research</h1>
              {creditsData && (
                <div
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${
                    creditsExhausted || creditsLow
                      ? "bg-red-500/15 text-red-400 ring-red-500/30"
                      : creditsMedium
                      ? "bg-amber-500/15 text-amber-400 ring-amber-500/30"
                      : "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30"
                  }`}
                  data-testid="credits-display"
                >
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${creditsExhausted || creditsLow ? "bg-red-400" : creditsMedium ? "bg-amber-400" : "bg-emerald-400"}`} />
                  {creditsExhausted
                    ? "Credits exhausted"
                    : `${creditsRemaining.toLocaleString()} / ${creditLimit.toLocaleString()} credits`}
                </div>
              )}
            </div>
            <p className="text-white/50 text-xs mt-0.5">Find in-demand YouTube topics and generate scripts with Mark's 5-part formula</p>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-5 py-6 space-y-6">

          {/* Search + filters */}
          <div className="space-y-2.5">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  placeholder="Enter a niche or keyword (e.g. 'keto snacks')"
                  value={seedQuery}
                  onChange={(e) => setSeedQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  disabled={searchMutation.isPending}
                  className="pl-9"
                  data-testid="input-seed-query"
                />
              </div>
              <Button
                onClick={handleSearch}
                disabled={searchMutation.isPending || !seedQuery.trim() || creditsExhausted}
                className="bg-violet-500 hover:bg-violet-600 text-white border-0 font-semibold px-5"
                data-testid="button-search"
              >
                {searchMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Search className="h-4 w-4 mr-2" />
                )}
                {creditsExhausted ? "No Credits" : "Find Topics"}
              </Button>
            </div>

            {/* Preset pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Quick filter:</span>
              {PRESETS.map((preset) => {
                const active = selectedType === preset.type;
                return (
                  <button
                    key={preset.type}
                    onClick={() => handlePresetClick(preset.type)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ring-1 transition-all ${active ? preset.activeColor : preset.color}`}
                    data-testid={`badge-preset-${preset.type}`}
                  >
                    <preset.icon className="h-3 w-3" />
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Compact quick-access row */}
          <div className="grid grid-cols-2 gap-3">
            <button
              className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-card hover:shadow-sm hover:-translate-y-px transition-all text-left"
              onClick={() => navigate("/video-studio/research/saved")}
              data-testid="card-saved-topics"
            >
              <div className="p-1.5 rounded-lg bg-teal-500/10 shrink-0">
                <TrendingUp className="h-4 w-4 text-teal-500" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold">{savedTopics?.length ?? 0} Saved Topics</span>
                <p className="text-xs text-muted-foreground">saved for later</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>

            <button
              className="flex items-center gap-3 px-4 py-3 rounded-xl border bg-card hover:shadow-sm hover:-translate-y-px transition-all text-left"
              onClick={() => navigate("/video-studio/scripts")}
              data-testid="card-scripts"
            >
              <div className="p-1.5 rounded-lg bg-violet-500/10 shrink-0">
                <Zap className="h-4 w-4 text-violet-500" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold">{scripts?.length ?? 0} Scripts</span>
                <p className="text-xs text-muted-foreground">generated scripts</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          </div>

          {/* Recent searches */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold">Recent Searches</h2>
                {runsData && runsData.total > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {runsData.total}
                  </span>
                )}
              </div>
              {runsData && runsData.total > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => deleteAllRunsMutation.mutate()}
                  disabled={deleteAllRunsMutation.isPending}
                  data-testid="button-clear-all-searches"
                >
                  {deleteAllRunsMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                  )}
                  Clear All
                </Button>
              )}
            </div>

            {runsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : runsData && runsData.runs.length > 0 ? (
              <>
                <div className="space-y-2">
                  {runsData.runs.map((run, index) => {
                    const globalIndex = (runsPage - 1) * PAGE_SIZE + index;
                    return (
                      <div
                        key={run.id}
                        className={`group relative rounded-xl border bg-card shadow-sm border-l-4 ${RUN_ACCENTS[globalIndex % RUN_ACCENTS.length]} cursor-pointer transition-all hover:shadow-md hover:-translate-y-px`}
                        onClick={() => navigate(`/video-studio/research/explore/${run.id}`)}
                        data-testid={`card-run-${run.id}`}
                      >
                        <div className="px-5 py-3.5 flex items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm group-hover:text-primary transition-colors truncate">
                              {run.seedQuery}
                            </p>
                            <div className="flex items-center gap-3 mt-0.5">
                              <span className="text-xs text-muted-foreground">
                                {run.topicCount} topics found
                                {run.runtimeMs && ` · ${(run.runtimeMs / 1000).toFixed(1)}s`}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ${
                                run.status === "complete"
                                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20"
                                  : "bg-muted text-muted-foreground ring-border"
                              }`}
                            >
                              {run.status}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {new Date(run.createdAt).toLocaleDateString()}
                            </span>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteRunMutation.mutate(run.id);
                                }}
                                disabled={deleteRunMutation.isPending}
                                data-testid={`button-delete-run-${run.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination controls */}
                {runsData.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <span className="text-xs text-muted-foreground">
                      Page {runsData.page} of {runsData.totalPages} &mdash; {runsData.total} searches total
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3"
                        onClick={() => setRunsPage((p) => Math.max(1, p - 1))}
                        disabled={runsPage <= 1 || runsLoading}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3"
                        onClick={() => setRunsPage((p) => Math.min(runsData.totalPages, p + 1))}
                        disabled={runsPage >= runsData.totalPages || runsLoading}
                        data-testid="button-next-page"
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border bg-card py-12 flex flex-col items-center text-center">
                <div className="p-4 rounded-2xl bg-muted/50 mb-3">
                  <Search className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <p className="font-medium text-foreground/70">No searches yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Enter a niche or keyword above to discover trending video topics.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
