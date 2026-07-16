import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { 
  Loader2, ArrowLeft, Trash2, FileText, Bookmark, 
  HelpCircle, TrendingUp, TrendingDown, Minus, Sparkles,
  CheckCircle2, AlertCircle, Lightbulb, Check, RotateCcw, X, Search, Brain, ChevronDown
} from "lucide-react";
import { SiPinterest } from "react-icons/si";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SavedTopic, Topic, TopicIntent, DemandSignals, TrendDataPoint } from "@shared/schema";

function IntentAnalysisSection({ topicId, existingAnalysis }: { topicId: string; existingAnalysis?: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(existingAnalysis || null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const [hasRequested, setHasRequested] = useState(false);
  
  useEffect(() => {
    setAnalysis(existingAnalysis || null);
    setIsOpen(false);
    setIsLoading(false);
    setError(false);
    setHasRequested(false);
  }, [topicId, existingAnalysis]);
  
  const fetchAnalysis = async () => {
    if (analysis || isLoading || hasRequested) return;
    setHasRequested(true);
    setIsLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/topic-pulse/topics/${topicId}/intent-analysis`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to generate analysis");
      const data = await res.json();
      setAnalysis(data.analysis);
    } catch {
      setError(true);
      setHasRequested(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open && !analysis && !isLoading) {
      fetchAnalysis();
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger asChild>
        <div 
          role="button"
          tabIndex={0}
          className="flex items-center justify-between w-full p-3 rounded-md bg-muted/50 hover-elevate text-left cursor-pointer"
          data-testid="button-intent-analysis-toggle"
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenChange(!isOpen); } }}
        >
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-500" />
            <span className="font-medium text-sm">Intent Analysis</span>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <div className="p-3 rounded-md bg-muted/30 border border-border/50" data-testid="section-intent-analysis">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analyzing search intent...
            </div>
          ) : error ? (
            <div className="text-sm text-destructive">
              Failed to generate analysis. 
              <Button 
                variant="ghost" 
                size="sm" 
                className="p-0 h-auto ml-1 underline"
                onClick={() => { setHasRequested(false); fetchAnalysis(); }}
              >
                Try again
              </Button>
            </div>
          ) : analysis ? (
            <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-intent-analysis">
              {analysis}
            </p>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function getOpportunityLevel(score: number): { color: string; label: string; bgClass: string } {
  if (score >= 70) return { color: "text-green-600 dark:text-green-400", label: "Great opportunity", bgClass: "bg-green-500/10" };
  if (score >= 50) return { color: "text-yellow-600 dark:text-yellow-400", label: "Good potential", bgClass: "bg-yellow-500/10" };
  return { color: "text-red-600 dark:text-red-400", label: "Challenging", bgClass: "bg-red-500/10" };
}

function formatSearchVolume(volume: number | null | undefined): string {
  if (volume === null || volume === undefined) return "N/A";
  if (volume >= 1000000) return `${(volume / 1000000).toFixed(1)}M`;
  if (volume >= 1000) return `${(volume / 1000).toFixed(1)}K`;
  return volume.toString();
}

function formatCPC(cpc: number | null | undefined): string {
  if (cpc === null || cpc === undefined) return "N/A";
  return `$${cpc.toFixed(2)}`;
}

function formatCompetition(comp: number | null | undefined): { label: string; color: string; value: string } {
  if (comp === null || comp === undefined) return { label: "N/A", color: "text-muted-foreground", value: "" };
  const pct = Math.round(comp * 100);
  if (comp <= 0.33) return { label: "Low", color: "text-green-600 dark:text-green-400", value: `${pct}%` };
  if (comp <= 0.66) return { label: "Medium", color: "text-yellow-600 dark:text-yellow-400", value: `${pct}%` };
  return { label: "High", color: "text-red-600 dark:text-red-400", value: `${pct}%` };
}

function getTrendFromData(trendData: TrendDataPoint[] | null): { direction: "up" | "down" | "stable"; label: string } {
  if (!trendData || trendData.length < 2) return { direction: "stable", label: "Stable" };
  const recent = trendData.slice(-3);
  const older = trendData.slice(0, 3);
  const recentAvg = recent.reduce((sum, p) => sum + p.value, 0) / recent.length;
  const olderAvg = older.reduce((sum, p) => sum + p.value, 0) / older.length;
  const change = ((recentAvg - olderAvg) / (olderAvg || 1)) * 100;
  if (change > 10) return { direction: "up", label: "Rising" };
  if (change < -10) return { direction: "down", label: "Falling" };
  return { direction: "stable", label: "Stable" };
}

function TrendIcon({ direction }: { direction: "up" | "down" | "stable" }) {
  if (direction === "up") return <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />;
  if (direction === "down") return <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

const intentLabels: Record<TopicIntent, string> = {
  "review": "Review",
  "comparison": "Comparison",
  "how-to": "How-To",
  "problem-fix": "Problem Fix",
  "beginner-guide": "Beginner Guide",
  "top-list": "Top List",
  "buyer": "Buyer",
};

const intentColors: Record<TopicIntent, string> = {
  "review": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "comparison": "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  "how-to": "bg-green-500/10 text-green-600 dark:text-green-400",
  "problem-fix": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  "beginner-guide": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  "top-list": "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  "buyer": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

function SearchVolumeBadge({ volume }: { volume: number | null | undefined }) {
  const formatted = formatSearchVolume(volume);
  const hasData = volume !== null && volume !== undefined;
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="outline" 
          className={`font-mono cursor-help ${hasData ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}
        >
          {formatted}/mo
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-medium">Monthly Search Volume</p>
        <p className="text-xs text-muted-foreground">
          Estimated monthly searches on Google (via Keywords Everywhere)
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

function OpportunityBadge({ score }: { score: number }) {
  const { color, label, bgClass } = getOpportunityLevel(score);
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={`font-mono cursor-help ${bgClass} ${color} border-0`}>
          {score}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          Based on search demand, competition, and trend direction
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

export default function TopicPulseSavedPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);

  const { data: savedTopics, isLoading } = useQuery<(SavedTopic & { topic: Topic })[]>({
    queryKey: ["/api/topic-pulse/saved-topics"],
  });

  const { data: scripts } = useQuery<any[]>({
    queryKey: ["/api/topic-pulse/scripts"],
  });

  const topicHasScript = (topicId: string) => scripts?.some((s: any) => s.topicId === topicId) ?? false;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/topic-pulse/saved-topics/${id}`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Topic removed" });
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/saved-topics"] });
      setSelectedTopic(null);
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to remove topic",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/topic-pulse/saved-topics/${id}/complete`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Topic marked as complete" });
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/saved-topics"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to mark complete",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/topic-pulse/saved-topics/${id}/reset`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Topic moved back to active" });
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/saved-topics"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to reset topic",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const enrichMutation = useMutation({
    mutationFn: async (topicId: string) => {
      const res = await apiRequest("POST", `/api/topic-pulse/topics/${topicId}/enrich`, {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/saved-topics"] });
      setSelectedTopic(data);
      toast({ title: "Topic enriched with ideas" });
    },
    onError: (err: Error) => {
      toast({
        title: "Enrichment failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [pendingGenerateTopicId, setPendingGenerateTopicId] = useState<string | null>(null);
  const [genVideoLength, setGenVideoLength] = useState("6-10");
  const [genTone, setGenTone] = useState("friendly");
  const [showResearchConfirm, setShowResearchConfirm] = useState(false);
  const [pendingResearchQuery, setPendingResearchQuery] = useState<string | null>(null);
  const [showUnsaveConfirm, setShowUnsaveConfirm] = useState(false);
  const [pendingUnsaveId, setPendingUnsaveId] = useState<string | null>(null);

  const scriptMutation = useMutation({
    mutationFn: async ({ topicId, videoLengthTarget, tonePreference }: { topicId: string; videoLengthTarget: string; tonePreference: string }) => {
      const res = await apiRequest("POST", "/api/topic-pulse/scripts/generate", {
        topicId,
        videoLengthTarget,
        tonePreference,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Script generated!" });
      navigate(`/video-studio/scripts/${data.id}`);
    },
    onError: (err: Error) => {
      toast({
        title: "Script generation failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const researchDeeperMutation = useMutation({
    mutationFn: async (seedQuery: string) => {
      const res = await apiRequest("POST", "/api/topic-pulse/search", { seedQuery });
      return res.json();
    },
    onSuccess: (data: { runId: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/runs"] });
      toast({ title: "New search started!" });
      navigate(`/video-studio/research/explore/${data.runId}`);
    },
    onError: (err: Error) => {
      toast({
        title: "Search failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });


  const getSavedEntryForTopic = (topicId: string) => {
    return savedTopics?.find(s => s.topic.id === topicId);
  };

  const activeTopics = savedTopics?.filter(s => !s.completedAt) || [];
  const completedTopics = savedTopics?.filter(s => s.completedAt) || [];

  const TopicCard = ({ saved, isCompleted }: { saved: SavedTopic & { topic: Topic }; isCompleted?: boolean }) => {
    const hasScript = topicHasScript(saved.topic.id);
    return (
      <Card 
        key={saved.id} 
        className={`cursor-pointer transition-colors ${selectedTopic?.id === saved.topic.id ? "ring-2 ring-primary" : "hover-elevate"}`}
        onClick={() => setSelectedTopic(saved.topic)}
        data-testid={`card-saved-${saved.id}`}
      >
        <CardContent className="py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {isCompleted && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />}
                <p className={`font-medium ${isCompleted ? "text-muted-foreground" : ""}`}>{saved.topic.topicTitle}</p>
              </div>
              <p className="text-sm text-muted-foreground truncate">{saved.topic.keywordQuery}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {hasScript ? (
                <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-0 text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3" />Scripted
                </Badge>
              ) : (
                <Badge className="bg-violet-500/10 text-violet-600 dark:text-violet-400 border-0 text-xs">
                  Ready to Script
                </Badge>
              )}
              <SearchVolumeBadge volume={saved.topic.monthlySearchVolume} />
              <OpportunityBadge score={saved.topic.opportunityScore || 0} />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-full flex flex-col">
      <div className="relative overflow-hidden border-b border-border shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(32_60%_16%)]" />
        <div className="absolute -bottom-16 -right-10 h-56 w-56 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute -top-12 -left-6 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative max-w-4xl mx-auto w-full px-6 py-6 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/video-studio/research")} className="text-white/70 hover:text-white hover:bg-white/10" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold text-white" data-testid="text-page-title">Saved Topics</h1>
            <p className="text-sm text-white/60">
              {activeTopics.length} active, {completedTopics.length} completed
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="max-w-4xl mx-auto px-5 py-6 space-y-6">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : savedTopics && savedTopics.length > 0 ? (
              <>
                {/* Progress bar */}
                <div className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold">Your Progress</p>
                    <p className="text-sm text-muted-foreground">
                      {completedTopics.length} of {savedTopics.length} scripted
                    </p>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-all"
                      style={{ width: `${savedTopics.length > 0 ? (completedTopics.length / savedTopics.length) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    {savedTopics.length - completedTopics.length > 0
                      ? `${savedTopics.length - completedTopics.length} topic${savedTopics.length - completedTopics.length !== 1 ? "s" : ""} ready to script`
                      : "All topics scripted! 🎉"}
                  </p>
                </div>

                <div>
                  <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                    <Bookmark className="h-4 w-4" />
                    Active Topics ({activeTopics.length})
                  </h2>
                  {activeTopics.length > 0 ? (
                    <div className="space-y-2">
                      {activeTopics.map((saved) => (
                        <TopicCard key={saved.id} saved={saved} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-4">No active topics. All topics have been completed!</p>
                  )}
                </div>

                {completedTopics.length > 0 && (
                  <div>
                    <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                      Completed ({completedTopics.length})
                    </h2>
                    <div className="space-y-2">
                      {completedTopics.map((saved) => (
                        <TopicCard key={saved.id} saved={saved} isCompleted />
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border bg-card py-14 flex flex-col items-center text-center px-6">
                <div className="p-4 rounded-2xl bg-muted/50 mb-4">
                  <Bookmark className="h-10 w-10 text-muted-foreground/50" />
                </div>
                <p className="font-semibold text-foreground/80 text-lg mb-1">No saved topics yet</p>
                <p className="text-sm text-muted-foreground max-w-sm mb-5">
                  Go explore a search, then tap "Save to My List" on any topic that catches your eye — it'll appear here.
                </p>
                <Button onClick={() => navigate("/video-studio/research")} className="bg-violet-500 hover:bg-violet-600 text-white">
                  <Search className="h-4 w-4 mr-2" />
                  Find Topics to Save
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        {selectedTopic && (
          <div className="w-[480px] border-l flex flex-col">
            <div className="flex items-start justify-between gap-2 p-4 border-b">
              <h2 className="text-lg font-semibold" data-testid="text-topic-title">{selectedTopic.topicTitle}</h2>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setSelectedTopic(null)}
                data-testid="button-close-panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-6">
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <p className="text-sm text-muted-foreground">{selectedTopic.keywordQuery}</p>
                    <a
                      href={`https://trends.pinterest.com/?q=${encodeURIComponent(selectedTopic.keywordQuery)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#E60023] hover:opacity-80 transition-opacity"
                      title="View on Pinterest Trends"
                      data-testid="link-pinterest-trends"
                    >
                      <SiPinterest className="h-4 w-4" />
                    </a>
                  </div>
                  
                  {(() => {
                    const savedEntry = getSavedEntryForTopic(selectedTopic.id);
                    const isCompleted = savedEntry?.completedAt;
                    return (
                      <div className="space-y-2 mb-5">
                        <p className="text-xs text-muted-foreground">Looks like a good fit? Turn it into a full video script.</p>
                        <Button 
                          onClick={() => { setPendingGenerateTopicId(selectedTopic.id); setShowGenerateDialog(true); }}
                          disabled={scriptMutation.isPending}
                          className="w-full bg-violet-600 hover:bg-violet-700 text-white border-0 font-semibold h-11"
                          data-testid="button-generate-script"
                        >
                          {scriptMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4 mr-2" />
                          )}
                          {scriptMutation.isPending ? "Generating…" : "Generate Script →"}
                        </Button>
                        <div className="flex gap-2">
                          {isCompleted ? (
                            <Button 
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => {
                                if (savedEntry) resetMutation.mutate(savedEntry.id);
                              }}
                              disabled={resetMutation.isPending}
                              data-testid="button-reset-topic"
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                              Reset to Active
                            </Button>
                          ) : (
                            <Button 
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => {
                                if (savedEntry) completeMutation.mutate(savedEntry.id);
                              }}
                              disabled={completeMutation.isPending}
                              data-testid="button-mark-complete"
                            >
                              <Check className="h-3.5 w-3.5 mr-1.5" />
                              Mark Done
                            </Button>
                          )}
                          <Button 
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => { setPendingResearchQuery(selectedTopic.keywordQuery); setShowResearchConfirm(true); }}
                            disabled={researchDeeperMutation.isPending}
                            data-testid="button-research-deeper"
                          >
                            {researchDeeperMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Search className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            Find More Topics
                          </Button>
                          <Button 
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            onClick={() => {
                              if (savedEntry) { setPendingUnsaveId(savedEntry.id); setShowUnsaveConfirm(true); }
                            }}
                            disabled={deleteMutation.isPending}
                            data-testid="button-remove-saved"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-md bg-muted/50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">Monthly Searches</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs">Estimated monthly searches on Google</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="font-mono text-xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-search-volume">
                        {formatSearchVolume(selectedTopic.monthlySearchVolume)}
                      </p>
                    </div>
                    <div className="p-3 rounded-md bg-muted/50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">Opportunity</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs">Composite score based on volume, competition, CPC value, and trend</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className={`font-mono text-xl font-bold ${getOpportunityLevel(selectedTopic.opportunityScore || 0).color}`} data-testid="text-opportunity-score">
                        {selectedTopic.opportunityScore}/100
                      </p>
                      <p className={`text-xs ${getOpportunityLevel(selectedTopic.opportunityScore || 0).color}`}>
                        {getOpportunityLevel(selectedTopic.opportunityScore || 0).label}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 rounded-md bg-muted/50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">CPC</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs">Cost-per-click in Google Ads. Higher CPC = more commercial intent</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="font-mono text-lg font-semibold" data-testid="text-cpc">
                        {formatCPC(selectedTopic.cpc)}
                      </p>
                    </div>
                    <div className="p-3 rounded-md bg-muted/50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">Competition</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs">Ad competition level (0-1 scale). Lower = easier to rank</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className={`font-mono text-lg font-semibold ${formatCompetition(selectedTopic.competition).color}`} data-testid="text-competition">
                        {formatCompetition(selectedTopic.competition).label}
                        {formatCompetition(selectedTopic.competition).value && (
                          <span className="text-sm font-normal ml-1">({formatCompetition(selectedTopic.competition).value})</span>
                        )}
                      </p>
                    </div>
                    <div className="p-3 rounded-md bg-muted/50">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">Trend</span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="text-xs">Search interest trend over recent months</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <div className="flex items-center gap-1.5" data-testid="text-trend">
                        <TrendIcon direction={getTrendFromData(selectedTopic.trendData as TrendDataPoint[] | null).direction} />
                        <span className={`font-mono text-lg font-semibold ${
                          getTrendFromData(selectedTopic.trendData as TrendDataPoint[] | null).direction === "up" 
                            ? "text-green-600 dark:text-green-400" 
                            : getTrendFromData(selectedTopic.trendData as TrendDataPoint[] | null).direction === "down" 
                              ? "text-red-600 dark:text-red-400" 
                              : "text-muted-foreground"
                        }`}>
                          {getTrendFromData(selectedTopic.trendData as TrendDataPoint[] | null).label}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {selectedTopic.demandSignalsJson && (
                  <div>
                    <h3 className="font-medium mb-2">Additional Signals</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">In YouTube Autocomplete</span>
                        {(selectedTopic.demandSignalsJson as DemandSignals).autocompletePresent ? (
                          <span className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-4 w-4" />
                            Yes
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <AlertCircle className="h-4 w-4" />
                            No
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <IntentAnalysisSection 
                  topicId={selectedTopic.id} 
                  existingAnalysis={selectedTopic.intentAnalysis} 
                />

                {selectedTopic.whyText && (
                  <div>
                    <h3 className="font-medium mb-2 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" />
                      Why This Topic
                    </h3>
                    <p className="text-sm text-muted-foreground">{selectedTopic.whyText}</p>
                  </div>
                )}

                {!selectedTopic.suggestedAngles && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => enrichMutation.mutate(selectedTopic.id)}
                    disabled={enrichMutation.isPending}
                    data-testid="button-enrich"
                  >
                    {enrichMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Generate Ideas
                  </Button>
                )}

                {selectedTopic.suggestedAngles && (
                  <div>
                    <h3 className="font-medium mb-2">Video Angles</h3>
                    <ul className="space-y-1 text-sm">
                      {(selectedTopic.suggestedAngles as string[]).map((angle, i) => (
                        <li key={i} className="text-muted-foreground">• {angle}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedTopic.suggestedHooks && (
                  <div>
                    <h3 className="font-medium mb-2">Hook Ideas</h3>
                    <ul className="space-y-1 text-sm">
                      {(selectedTopic.suggestedHooks as string[]).map((hook, i) => (
                        <li key={i} className="text-muted-foreground">• {hook}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedTopic.suggestedTitles && (
                  <div>
                    <h3 className="font-medium mb-2">Title Ideas</h3>
                    <ul className="space-y-1 text-sm">
                      {(selectedTopic.suggestedTitles as string[]).slice(0, 5).map((title, i) => (
                        <li key={i} className="text-muted-foreground">• {title}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedTopic.commonQuestions && (
                  <div>
                    <h3 className="font-medium mb-2">Common Questions</h3>
                    <ul className="space-y-1 text-sm">
                      {(selectedTopic.commonQuestions as string[]).map((q, i) => (
                        <li key={i} className="text-muted-foreground">• {q}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Generate Script options dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={(open) => { if (!open) setShowGenerateDialog(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Generate Script</DialogTitle>
            <DialogDescription>Choose your video settings before generating.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Video Length</Label>
              <Select value={genVideoLength} onValueChange={setGenVideoLength}>
                <SelectTrigger data-testid="select-gen-video-length">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3-5">3–5 minutes</SelectItem>
                  <SelectItem value="6-10">6–10 minutes</SelectItem>
                  <SelectItem value="10-15">10–15 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tone</Label>
              <Select value={genTone} onValueChange={setGenTone}>
                <SelectTrigger data-testid="select-gen-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="energetic">Energetic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)} data-testid="button-gen-dialog-cancel">Cancel</Button>
            <Button
              onClick={() => {
                if (pendingGenerateTopicId) {
                  scriptMutation.mutate({ topicId: pendingGenerateTopicId, videoLengthTarget: genVideoLength, tonePreference: genTone });
                  setShowGenerateDialog(false);
                }
              }}
              disabled={scriptMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white"
              data-testid="button-confirm-generate-script"
            >
              {scriptMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Generate Script
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Research Deeper confirmation */}
      <AlertDialog open={showResearchConfirm} onOpenChange={setShowResearchConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new search?</AlertDialogTitle>
            <AlertDialogDescription>
              This uses one research credit to run a new search using "{pendingResearchQuery}" as the seed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-research-confirm-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingResearchQuery) researchDeeperMutation.mutate(pendingResearchQuery);
                setShowResearchConfirm(false);
              }}
              data-testid="button-research-confirm-go"
            >
              Yes, search
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsave (remove from saved) confirmation */}
      <AlertDialog open={showUnsaveConfirm} onOpenChange={setShowUnsaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this topic?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the topic from your saved list. You can always re-save it from a search later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-unsave-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingUnsaveId) deleteMutation.mutate(pendingUnsaveId);
                setShowUnsaveConfirm(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-unsave-confirm"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
