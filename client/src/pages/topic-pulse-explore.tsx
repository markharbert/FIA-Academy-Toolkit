import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Loader2, ArrowLeft, TrendingUp, TrendingDown, Minus, Bookmark, 
  FileText, Sparkles, Lightbulb, HelpCircle, CheckCircle2, AlertCircle,
  ArrowUpDown, ArrowDown, ArrowUp, X, Search, Brain, ChevronDown, ChevronRight
} from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Topic, TopicRun, TopicIntent, TrendDataPoint, DemandSignals, Script } from "@shared/schema";

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

interface PlatformData {
  volume: number | null;
  cpc: number | null;
  competition: number | null;
  trend: TrendDataPoint[] | null;
}


function PlatformMetricCard({ 
  label, 
  value, 
  helpText, 
  colorClass = "text-foreground",
  testId 
}: { 
  label: string; 
  value: string; 
  helpText: string;
  colorClass?: string;
  testId?: string;
}) {
  return (
    <div className="p-2 rounded-md bg-muted/30">
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <p className="text-xs">{helpText}</p>
          </TooltipContent>
        </Tooltip>
      </div>
      <p className={`font-mono text-sm font-semibold ${colorClass}`} data-testid={testId}>
        {value}
      </p>
    </div>
  );
}

function PlatformSection({ 
  platform, 
  data, 
  icon, 
  color,
  platformDescription
}: { 
  platform: string; 
  data: PlatformData | null;
  icon: JSX.Element;
  color: string;
  platformDescription: string;
}) {
  const trendInfo = getTrendFromData(data?.trend);
  const competitionInfo = data?.competition !== null && data?.competition !== undefined
    ? formatCompetition(data.competition)
    : { label: "N/A", color: "text-muted-foreground", value: "" };
  
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
        <span className={color}>{icon}</span>
        <div>
          <span className="text-sm font-semibold">{platform} Search Data</span>
          <p className="text-xs text-muted-foreground">{platformDescription}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <PlatformMetricCard
          label={`${platform} Volume`}
          value={formatSearchVolume(data?.volume)}
          helpText={`Estimated monthly searches on ${platform}`}
          colorClass={data?.volume ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground"}
          testId={`text-${platform.toLowerCase()}-volume`}
        />
        <PlatformMetricCard
          label={`${platform} CPC`}
          value={formatCPC(data?.cpc)}
          helpText={`Cost per click on ${platform}. Higher = more commercial value.`}
          testId={`text-${platform.toLowerCase()}-cpc`}
        />
        <PlatformMetricCard
          label={`${platform} Competition`}
          value={competitionInfo.value ? `${competitionInfo.label} (${competitionInfo.value})` : competitionInfo.label}
          helpText={`Ad competition on ${platform} (0-1 scale)`}
          colorClass={competitionInfo.color}
          testId={`text-${platform.toLowerCase()}-competition`}
        />
        <div className="p-2 rounded-md bg-muted/30">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-xs text-muted-foreground">{platform} Trend</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-3 w-3 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">Search interest trend on {platform} over recent months</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex items-center gap-1" data-testid={`text-${platform.toLowerCase()}-trend`}>
            <TrendIcon direction={trendInfo.direction} />
            <span className={`font-mono text-sm font-semibold ${
              trendInfo.direction === "rising" 
                ? "text-green-600 dark:text-green-400" 
                : trendInfo.direction === "falling" 
                  ? "text-red-600 dark:text-red-400" 
                  : "text-muted-foreground"
            }`}>
              {trendInfo.label}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatformKeywordDataSection({ 
  topic 
}: { 
  topic: Topic;
}) {
  const googleData: PlatformData = {
    volume: topic.monthlySearchVolume ?? null,
    cpc: topic.cpc ?? null,
    competition: topic.competition ?? null,
    trend: topic.trendData as TrendDataPoint[] ?? null,
  };

  return (
    <PlatformSection 
      platform="Google" 
      data={googleData} 
      icon={<SiGoogle className="h-4 w-4" />}
      color="text-blue-500"
      platformDescription="Google Search keyword metrics"
    />
  );
}


const intentLabels: Record<TopicIntent, string> = {
  "review": "Review",
  "comparison": "Comparison",
  "how-to": "How-To",
  "problem-fix": "Problem Fix",
  "beginner-guide": "Beginner Guide",
  "top-list": "Top List",
  "buyer": "Buy/Price",
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

function formatSearchVolume(volume: number | string | null | undefined): string {
  if (volume === null || volume === undefined) return "N/A";
  const numVolume = typeof volume === 'string' ? parseFloat(volume) : volume;
  if (isNaN(numVolume)) return "N/A";
  if (numVolume >= 1000000) return `${(numVolume / 1000000).toFixed(1)}M`;
  if (numVolume >= 1000) return `${(numVolume / 1000).toFixed(1)}K`;
  return numVolume.toString();
}

function formatCPC(cpc: number | string | null | undefined): string {
  if (cpc === null || cpc === undefined) return "N/A";
  const numCpc = typeof cpc === 'string' ? parseFloat(cpc) : cpc;
  if (isNaN(numCpc)) return "N/A";
  return `$${numCpc.toFixed(2)}`;
}

function formatCompetition(competition: number | string | null | undefined): { label: string; color: string; value: string } {
  if (competition === null || competition === undefined) {
    return { label: "N/A", color: "text-muted-foreground", value: "" };
  }
  const numComp = typeof competition === 'string' ? parseFloat(competition) : competition;
  if (isNaN(numComp)) {
    return { label: "N/A", color: "text-muted-foreground", value: "" };
  }
  const percent = Math.round(numComp * 100);
  if (numComp <= 0.33) return { label: "Low", color: "text-green-600 dark:text-green-400", value: `${percent}%` };
  if (numComp <= 0.66) return { label: "Medium", color: "text-yellow-600 dark:text-yellow-400", value: `${percent}%` };
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
  const [scorePreset, setScorePreset] = useState<"all" | "great" | "popular" | "untapped">("all");
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

  const { data: scripts } = useQuery<(Script & { topic?: Topic })[]>({
    queryKey: ["/api/topic-pulse/scripts"],
  });

  // Two maps: exact topicId match (primary) + topic title match (fallback for re-searched keywords)
  const { scriptById, scriptByTitle } = useMemo(() => {
    const byId = new Map<string, Script>();
    const byTitle = new Map<string, Script>();
    scripts?.forEach((s) => {
      if (s.topicId) byId.set(s.topicId, s);
      if (s.title) byTitle.set(s.title.toLowerCase().trim(), s);
    });
    return { scriptById: byId, scriptByTitle: byTitle };
  }, [scripts]);

  // Returns an existing script for a topic — first by exact DB link, then by matching title
  function getScriptForTopic(topic: Topic): Script | undefined {
    return scriptById.get(topic.id) ?? scriptByTitle.get(topic.topicTitle.toLowerCase().trim());
  }

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
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/scripts"] });
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

  const filteredTopics = (topics?.filter((topic) => {
    if (intentFilter !== "all" && !(topic.intents || []).includes(intentFilter as any)) return false;
    if (scorePreset === "great" && (topic.opportunityScore || 0) < 70) return false;
    if (scorePreset === "popular" && (topic.monthlySearchVolume || 0) < 10000) return false;
    if (scorePreset === "untapped") {
      const comp = typeof topic.competition === "string" ? parseFloat(topic.competition as string) : (topic.competition || 0);
      if (comp > 0.33) return false;
    }
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
      <div className="relative overflow-hidden border-b border-border shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(32_60%_16%)]" />
        <div className="absolute -bottom-16 -right-10 h-56 w-56 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute -top-12 -left-6 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative px-5 py-6 max-w-6xl mx-auto w-full">
          {/* Title row — matches hub hero pattern */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <Search className="h-4 w-4 text-amber-400 shrink-0" />
            <h1 className="text-xl font-bold text-white" data-testid="text-run-query">
              {runLoading
                ? <span className="h-6 w-48 rounded bg-white/15 animate-pulse inline-block align-middle" />
                : run?.seedQuery}
            </h1>
          </div>
          {/* Subtitle */}
          <p className="text-white/50 text-xs mt-0.5">
            {runLoading
              ? <span className="h-3 w-40 rounded bg-white/15 animate-pulse inline-block" />
              : `${topics?.length ?? filteredTopics.length} topics found · searched ${run?.createdAt ? new Date(run.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}`}
          </p>
          {/* Breadcrumb — at bottom, matching hub position */}
          <div className="flex items-center gap-1.5 mt-2.5">
            <button
              onClick={() => navigate("/video-studio")}
              className="text-white/45 hover:text-white/75 text-xs font-medium transition-colors"
              data-testid="button-back-video-studio"
            >
              Video Studio
            </button>
            <ChevronRight className="h-3 w-3 text-white/25 shrink-0" />
            <button
              onClick={() => navigate("/video-studio/research")}
              className="text-white/45 hover:text-white/75 text-xs font-medium transition-colors"
              data-testid="button-back"
            >
              Research
            </button>
            <ChevronRight className="h-3 w-3 text-white/25 shrink-0" />
            {runLoading
              ? <span className="h-3 w-24 rounded bg-white/15 animate-pulse inline-block" />
              : <span className="text-white/75 text-xs font-medium truncate">{run?.seedQuery}</span>}
          </div>
        </div>
      </div>

      <div className="border-b bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-4 max-w-6xl mx-auto">
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

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-muted-foreground">Show:</span>
            {([
              { key: "all", label: "All Topics" },
              { key: "great", label: "🟢 Easy Wins" },
              { key: "popular", label: "📈 High Volume" },
              { key: "untapped", label: "💎 Untapped" },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setScorePreset(key)}
                className={`px-3 py-1 rounded-full text-xs font-semibold ring-1 transition-all ${
                  scorePreset === key
                    ? "bg-violet-500 text-white ring-violet-500"
                    : "bg-muted text-muted-foreground ring-border hover:bg-muted/80"
                }`}
                data-testid={`button-preset-${key}`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <span className="text-sm font-medium text-muted-foreground mr-1">Sort:</span>
            <SortButton field="score" label="Score" />
            <SortButton field="volume" label="Volume" />
            <SortButton field="competition" label="Competition" />
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden max-w-6xl mx-auto w-full">
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
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <p className="text-sm font-medium">{topic.topicTitle}</p>
                      {!!getScriptForTopic(topic) && (
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20 shrink-0">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                          Script ready
                        </span>
                      )}
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

        {selectedTopic ? (
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
                  
                  <div className="space-y-2 mb-5">
                    {getScriptForTopic(selectedTopic) ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Script already generated for this topic</p>
                        </div>
                        <Button
                          onClick={() => navigate(`/video-studio/scripts/${getScriptForTopic(selectedTopic)!.id}`)}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white border-0 font-semibold h-11"
                          data-testid="button-go-to-script"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Go to Script →
                        </Button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">Looks like a good fit? Turn it into a full video script.</p>
                        <Button
                          onClick={() => scriptMutation.mutate({ topicId: selectedTopic.id, videoLengthTarget: "6-10", tonePreference: "friendly" })}
                          disabled={scriptMutation.isPending}
                          className="w-full bg-violet-600 hover:bg-violet-700 text-white border-0 font-semibold h-11"
                          data-testid="button-generate-script"
                        >
                          {scriptMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4 mr-2" />
                          )}
                          {scriptMutation.isPending ? "Generating…" : "Generate Script Outline →"}
                        </Button>
                      </>
                    )}
                    <div className="flex gap-2">
                      <Button 
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => saveMutation.mutate(selectedTopic.id)}
                        disabled={saveMutation.isPending}
                        data-testid="button-save-topic"
                      >
                        {saveMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Bookmark className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Save to My List
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-md bg-muted/50">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <span className="text-sm font-medium">Opportunity Rating</span>
                      <p className="text-xs text-muted-foreground mt-0.5">High demand + low competition = better score</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={`font-mono text-2xl font-bold ${getOpportunityLevel(selectedTopic.opportunityScore || 0).color}`} data-testid="text-opportunity-score">
                        {selectedTopic.opportunityScore}/100
                      </p>
                      <Badge variant="outline" className={`${getOpportunityLevel(selectedTopic.opportunityScore || 0).bgClass} ${getOpportunityLevel(selectedTopic.opportunityScore || 0).color} border-0`}>
                        {getOpportunityLevel(selectedTopic.opportunityScore || 0).label}
                      </Badge>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        (selectedTopic.opportunityScore || 0) >= 70 ? "bg-green-500" :
                        (selectedTopic.opportunityScore || 0) >= 50 ? "bg-yellow-500" : "bg-red-500"
                      }`}
                      style={{ width: `${selectedTopic.opportunityScore || 0}%` }}
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border/50 p-3">
                  <PlatformKeywordDataSection topic={selectedTopic} />
                </div>

                {selectedTopic.demandSignalsJson && (
                  <div className="rounded-lg border border-border/50 p-3">
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
        ) : (
          <div className="hidden lg:flex w-[480px] border-l flex-col items-center justify-center text-center p-8 bg-muted/10">
            <div className="p-4 rounded-2xl bg-muted/50 mb-3">
              <FileText className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <p className="font-medium text-foreground/60 mb-1">Pick a topic to explore it</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Click any topic on the left to see its scores and turn it into a script.
            </p>
          </div>
        )}
      </div>


    </div>
  );
}
