import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Loader2, ArrowLeft, TrendingUp, TrendingDown, Minus, Bookmark, 
  FileText, Sparkles, Lightbulb, HelpCircle, CheckCircle2, AlertCircle,
  ArrowUpDown, ArrowDown, ArrowUp, X, Search, Brain, ChevronDown
} from "lucide-react";
import { SiPinterest } from "react-icons/si";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Topic, TopicRun, TopicIntent, TrendDataPoint, DemandSignals } from "@shared/schema";

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

function TrendIcon({ direction }: { direction: string }) {
  if (direction === "rising") return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (direction === "falling") return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
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

function formatCompetition(competition: number | null | undefined): { label: string; color: string; value: string } {
  if (competition === null || competition === undefined) {
    return { label: "N/A", color: "text-muted-foreground", value: "" };
  }
  const percent = Math.round(competition * 100);
  if (competition <= 0.33) return { label: "Low", color: "text-green-600 dark:text-green-400", value: `${percent}%` };
  if (competition <= 0.66) return { label: "Medium", color: "text-yellow-600 dark:text-yellow-400", value: `${percent}%` };
  return { label: "High", color: "text-red-600 dark:text-red-400", value: `${percent}%` };
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

function SearchVolumeBadge({ volume, testId }: { volume: number | null | undefined; testId?: string }) {
  const formatted = formatSearchVolume(volume);
  const hasData = volume !== null && volume !== undefined;
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge 
          variant="outline" 
          className={`font-mono cursor-help ${hasData ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" : "text-muted-foreground"}`}
          data-testid={testId || "badge-search-volume"}
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

export default function TopicPulseExplorePage() {
  const { runId } = useParams<{ runId: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [intentFilter, setIntentFilter] = useState<string>("all");
  const [minScore, setMinScore] = useState(0);
  const [sortBy, setSortBy] = useState<"score" | "volume" | "competition">("score");
  const [sortDirection, setSortDirection] = useState<"desc" | "asc">("desc");

  const { data: run, isLoading: runLoading } = useQuery<TopicRun>({
    queryKey: ["/api/topic-pulse/runs", runId],
    enabled: !!runId,
  });

  const { data: topics, isLoading: topicsLoading } = useQuery<Topic[]>({
    queryKey: ["/api/topic-pulse/runs", runId, "topics"],
    enabled: !!runId,
  });

  const enrichMutation = useMutation({
    mutationFn: async (topicId: string) => {
      const res = await apiRequest("POST", `/api/topic-pulse/topics/${topicId}/enrich`, {});
      return res.json();
    },
    onSuccess: (data) => {
      setSelectedTopic(data);
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/runs", runId, "topics"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Enrich failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (topicId: string) => {
      const res = await apiRequest("POST", `/api/topic-pulse/topics/${topicId}/save`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Topic saved!" });
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/saved-topics"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Save failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const scriptMutation = useMutation({
    mutationFn: async (topicId: string) => {
      const res = await apiRequest("POST", "/api/topic-pulse/scripts/generate", {
        topicId,
        videoLengthTarget: "6-10",
        tonePreference: "friendly",
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Script generated!" });
      navigate(`/topic-pulse/scripts/${data.id}`);
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
      navigate(`/topic-pulse/explore/${data.runId}`);
    },
    onError: (err: Error) => {
      toast({
        title: "Search failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const filteredTopics = (topics?.filter((topic) => {
    if (intentFilter !== "all" && !(topic.intents || []).includes(intentFilter as any)) return false;
    if ((topic.opportunityScore || 0) < minScore) return false;
    return true;
  }) || []).sort((a, b) => {
    let aVal = 0, bVal = 0;
    if (sortBy === "score") {
      aVal = a.opportunityScore || 0;
      bVal = b.opportunityScore || 0;
    } else if (sortBy === "volume") {
      aVal = a.monthlySearchVolume || 0;
      bVal = b.monthlySearchVolume || 0;
    } else if (sortBy === "competition") {
      aVal = a.competition || 0;
      bVal = b.competition || 0;
    }
    return sortDirection === "desc" ? bVal - aVal : aVal - bVal;
  });

  const toggleSort = (field: "score" | "volume" | "competition") => {
    if (sortBy === field) {
      setSortDirection(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setSortDirection("desc");
    }
  };


  if (runLoading || topicsLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const SortButton = ({ field, label }: { field: "score" | "volume" | "competition"; label: string }) => (
    <Button
      variant={sortBy === field ? "secondary" : "ghost"}
      size="sm"
      onClick={() => toggleSort(field)}
      className="gap-1"
      data-testid={`button-sort-${field}`}
    >
      {label}
      {sortBy === field ? (
        sortDirection === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </Button>
  );

  return (
    <div className="min-h-full flex flex-col">
      <div className="border-b p-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/topic-pulse")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold" data-testid="text-run-query">{run?.seedQuery}</h1>
            <p className="text-sm text-muted-foreground">
              {filteredTopics.length} topics {intentFilter !== "all" && `(filtered from ${topics?.length})`}
            </p>
          </div>
        </div>
      </div>

      <div className="border-b bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Filter:</span>
            <Select value={intentFilter} onValueChange={setIntentFilter}>
              <SelectTrigger className="w-40" data-testid="select-intent-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Intents</SelectItem>
                {Object.entries(intentLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Min Score:</span>
            <div className="flex items-center gap-2 w-40">
              <Slider
                value={[minScore]}
                onValueChange={([v]) => setMinScore(v)}
                max={100}
                step={5}
                className="flex-1"
                data-testid="slider-min-score"
              />
              <span className="text-sm font-mono w-8 text-right">{minScore}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <span className="text-sm font-medium text-muted-foreground mr-1">Sort:</span>
            <SortButton field="score" label="Score" />
            <SortButton field="volume" label="Volume" />
            <SortButton field="competition" label="Competition" />
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {filteredTopics.map((topic) => (
              <Card 
                key={topic.id}
                className={`cursor-pointer transition-colors ${selectedTopic?.id === topic.id ? "ring-2 ring-primary" : "hover-elevate"}`}
                onClick={() => setSelectedTopic(topic)}
                data-testid={`card-topic-${topic.id}`}
              >
                <CardContent className="py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{topic.topicTitle}</p>
                      <p className="text-sm text-muted-foreground truncate">{topic.keywordQuery}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <SearchVolumeBadge volume={topic.monthlySearchVolume} testId={`badge-volume-${topic.id}`} />
                      {(topic.intents || []).map((intent) => (
                        <Badge key={intent} variant="outline" className={intentColors[intent]} data-testid={`badge-intent-${topic.id}-${intent}`}>
                          {intentLabels[intent]}
                        </Badge>
                      ))}
                      <TrendIcon direction={getTrendFromData(topic.trendData as TrendDataPoint[] | null).direction} />
                      <OpportunityBadge score={topic.opportunityScore || 0} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
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
                  
                  <div className="flex gap-2 mb-4 flex-wrap">
                    <Button 
                      onClick={() => scriptMutation.mutate(selectedTopic.id)}
                      disabled={scriptMutation.isPending}
                      data-testid="button-generate-script"
                    >
                      {scriptMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4 mr-2" />
                      )}
                      Generate Script
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => saveMutation.mutate(selectedTopic.id)}
                      disabled={saveMutation.isPending}
                      data-testid="button-save-topic"
                    >
                      <Bookmark className="h-4 w-4 mr-2" />
                      Save
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => researchDeeperMutation.mutate(selectedTopic.keywordQuery)}
                      disabled={researchDeeperMutation.isPending}
                      data-testid="button-research-deeper"
                    >
                      {researchDeeperMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4 mr-2" />
                      )}
                      Research Deeper
                    </Button>
                  </div>
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
                          getTrendFromData(selectedTopic.trendData as TrendDataPoint[] | null).direction === "rising" 
                            ? "text-green-600 dark:text-green-400" 
                            : getTrendFromData(selectedTopic.trendData as TrendDataPoint[] | null).direction === "falling" 
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

    </div>
  );
}
