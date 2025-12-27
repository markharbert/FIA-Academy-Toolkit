import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Loader2, ArrowLeft, TrendingUp, TrendingDown, Minus, Bookmark, 
  FileText, Sparkles, CheckCircle2, AlertCircle, Lightbulb, HelpCircle 
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Topic, TopicRun, DemandSignals, TopicIntent, VideoLengthTarget, TonePreference, TrendDataPoint } from "@shared/schema";

const intentLabels: Record<TopicIntent, string> = {
  "review": "Review",
  "comparison": "Comparison",
  "how-to": "How-To",
  "problem-fix": "Problem Fix",
  "beginner-guide": "Beginner Guide",
  "top-list": "Top List",
};

const intentColors: Record<TopicIntent, string> = {
  "review": "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "comparison": "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  "how-to": "bg-green-500/10 text-green-600 dark:text-green-400",
  "problem-fix": "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  "beginner-guide": "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  "top-list": "bg-pink-500/10 text-pink-600 dark:text-pink-400",
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
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [scriptForm, setScriptForm] = useState({
    videoLengthTarget: "6-10" as VideoLengthTarget,
    affiliateOffer: "",
    affiliateLinkLabel: "",
    primaryPromise: "",
    personalAngle: "",
    tonePreference: "friendly" as TonePreference,
  });

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
    mutationFn: async (input: any) => {
      const res = await apiRequest("POST", "/api/topic-pulse/scripts/generate", input);
      return res.json();
    },
    onSuccess: (data) => {
      setScriptDialogOpen(false);
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

  const filteredTopics = topics?.filter((topic) => {
    if (intentFilter !== "all" && topic.intent !== intentFilter) return false;
    if ((topic.opportunityScore || 0) < minScore) return false;
    return true;
  }) || [];

  const handleGenerateScript = () => {
    if (!selectedTopic) return;
    scriptMutation.mutate({
      topicId: selectedTopic.id,
      ...scriptForm,
    });
  };

  if (runLoading || topicsLoading) {
    return (
      <div className="min-h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-full flex flex-col">
      <div className="border-b p-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/topic-pulse")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-run-query">{run?.seedQuery}</h1>
            <p className="text-sm text-muted-foreground">
              {filteredTopics.length} topics {intentFilter !== "all" && `(filtered from ${topics?.length})`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-56 border-r p-4 space-y-6">
          <div>
            <Label className="text-sm font-medium mb-2 block">Intent</Label>
            <Select value={intentFilter} onValueChange={setIntentFilter}>
              <SelectTrigger data-testid="select-intent-filter">
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

          <div>
            <Label className="text-sm font-medium mb-2 block">Min Score: {minScore}</Label>
            <Slider
              value={[minScore]}
              onValueChange={([v]) => setMinScore(v)}
              max={100}
              step={5}
              data-testid="slider-min-score"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {filteredTopics.map((topic) => (
              <Card 
                key={topic.id}
                className={`cursor-pointer transition-colors ${selectedTopic?.id === topic.id ? "ring-2 ring-primary" : "hover-elevate"}`}
                onClick={() => setSelectedTopic(topic)}
                data-testid={`card-topic-${topic.id}`}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{topic.topicTitle}</p>
                      <p className="text-sm text-muted-foreground truncate">{topic.keywordQuery}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <SearchVolumeBadge volume={topic.monthlySearchVolume} testId={`badge-volume-${topic.id}`} />
                      {topic.intent && (
                        <Badge variant="outline" className={intentColors[topic.intent]}>
                          {intentLabels[topic.intent]}
                        </Badge>
                      )}
                      <OpportunityBadge score={topic.opportunityScore || 0} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>

        {selectedTopic && (
          <div className="w-96 border-l">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1" data-testid="text-topic-title">{selectedTopic.topicTitle}</h2>
                  <p className="text-sm text-muted-foreground mb-4">{selectedTopic.keywordQuery}</p>
                  
                  <div className="flex gap-2 mb-4">
                    <Button 
                      onClick={() => setScriptDialogOpen(true)}
                      data-testid="button-generate-script"
                    >
                      <FileText className="h-4 w-4 mr-2" />
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

      <Dialog open={scriptDialogOpen} onOpenChange={setScriptDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generate Script</DialogTitle>
            <DialogDescription>
              Configure your script for "{selectedTopic?.topicTitle}"
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Video Length</Label>
              <Select 
                value={scriptForm.videoLengthTarget} 
                onValueChange={(v) => setScriptForm(f => ({ ...f, videoLengthTarget: v as VideoLengthTarget }))}
              >
                <SelectTrigger data-testid="select-video-length">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3-5">3-5 minutes</SelectItem>
                  <SelectItem value="6-10">6-10 minutes</SelectItem>
                  <SelectItem value="10-15">10-15 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Affiliate Offer Name</Label>
              <Input
                placeholder="e.g., ClickFunnels, Jasper AI"
                value={scriptForm.affiliateOffer}
                onChange={(e) => setScriptForm(f => ({ ...f, affiliateOffer: e.target.value }))}
                data-testid="input-affiliate-offer"
              />
            </div>

            <div>
              <Label>Link Label</Label>
              <Input
                placeholder="e.g., My ClickFunnels Link"
                value={scriptForm.affiliateLinkLabel}
                onChange={(e) => setScriptForm(f => ({ ...f, affiliateLinkLabel: e.target.value }))}
                data-testid="input-link-label"
              />
            </div>

            <div>
              <Label>Primary Promise (what will viewers learn/get?)</Label>
              <Textarea
                placeholder="e.g., By the end of this video, you'll know exactly how to set up your first sales funnel in under 30 minutes"
                value={scriptForm.primaryPromise}
                onChange={(e) => setScriptForm(f => ({ ...f, primaryPromise: e.target.value }))}
                data-testid="textarea-primary-promise"
              />
            </div>

            <div>
              <Label>Personal Angle (optional)</Label>
              <Textarea
                placeholder="Share a quick story or your experience with this topic"
                value={scriptForm.personalAngle}
                onChange={(e) => setScriptForm(f => ({ ...f, personalAngle: e.target.value }))}
                data-testid="textarea-personal-angle"
              />
            </div>

            <div>
              <Label>Tone</Label>
              <Select 
                value={scriptForm.tonePreference} 
                onValueChange={(v) => setScriptForm(f => ({ ...f, tonePreference: v as TonePreference }))}
              >
                <SelectTrigger data-testid="select-tone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="coach">Coach Style</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setScriptDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleGenerateScript}
              disabled={scriptMutation.isPending || !scriptForm.affiliateOffer || !scriptForm.affiliateLinkLabel || !scriptForm.primaryPromise}
              data-testid="button-confirm-generate"
            >
              {scriptMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Generate Script
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
