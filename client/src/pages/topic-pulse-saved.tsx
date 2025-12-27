import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Loader2, ArrowLeft, Trash2, FileText, Bookmark, 
  HelpCircle, TrendingUp, TrendingDown, Minus, Sparkles,
  CheckCircle2, AlertCircle, Lightbulb
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SavedTopic, Topic, TopicIntent, DemandSignals, VideoLengthTarget, TonePreference, TrendDataPoint } from "@shared/schema";

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
};

export default function TopicPulseSavedPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
  const [scriptForm, setScriptForm] = useState({
    videoLengthTarget: "6-10" as VideoLengthTarget,
    affiliateOffer: "",
    affiliateLinkLabel: "",
    tonePreference: "conversational" as TonePreference,
  });

  const { data: savedTopics, isLoading } = useQuery<(SavedTopic & { topic: Topic })[]>({
    queryKey: ["/api/topic-pulse/saved-topics"],
  });

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

  const scriptMutation = useMutation({
    mutationFn: async (input: { topicId: string; videoLengthTarget: VideoLengthTarget; affiliateOffer?: string; affiliateLinkLabel?: string; tonePreference: TonePreference }) => {
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

  const handleGenerateScript = () => {
    if (!selectedTopic) return;
    scriptMutation.mutate({
      topicId: selectedTopic.id,
      ...scriptForm,
    });
  };

  const getSavedEntryForTopic = (topicId: string) => {
    return savedTopics?.find(s => s.topic.id === topicId);
  };

  return (
    <div className="min-h-full flex flex-col">
      <div className="border-b p-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/topic-pulse")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Saved Topics</h1>
            <p className="text-sm text-muted-foreground">
              {savedTopics?.length || 0} topics saved
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-2">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : savedTopics && savedTopics.length > 0 ? (
              savedTopics.map((saved) => (
                <Card 
                  key={saved.id} 
                  className={`cursor-pointer transition-colors ${selectedTopic?.id === saved.topic.id ? "ring-2 ring-primary" : "hover-elevate"}`}
                  onClick={() => setSelectedTopic(saved.topic)}
                  data-testid={`card-saved-${saved.id}`}
                >
                  <CardContent className="py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{saved.topic.topicTitle}</p>
                        <p className="text-sm text-muted-foreground truncate">{saved.topic.keywordQuery}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge 
                              variant="outline" 
                              className="font-mono cursor-help bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            >
                              {formatSearchVolume(saved.topic.monthlySearchVolume)}/mo
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="font-medium">Monthly Search Volume</p>
                          </TooltipContent>
                        </Tooltip>
                        {saved.topic.intent && (
                          <Badge variant="outline">
                            {intentLabels[saved.topic.intent]}
                          </Badge>
                        )}
                        <TrendIcon direction={getTrendFromData(saved.topic.trendData as TrendDataPoint[] | null).direction} />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge 
                              variant="outline" 
                              className={`font-mono cursor-help border-0 ${getOpportunityLevel(saved.topic.opportunityScore || 0).bgClass} ${getOpportunityLevel(saved.topic.opportunityScore || 0).color}`}
                            >
                              {saved.topic.opportunityScore}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            <p className="font-medium">{getOpportunityLevel(saved.topic.opportunityScore || 0).label}</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <Bookmark className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No saved topics yet. Save topics from your search results!</p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>

        {selectedTopic && (
          <div className="w-96 border-l">
            <ScrollArea className="h-full">
              <div className="p-4 space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1" data-testid="text-topic-title">{selectedTopic.topicTitle}</h2>
                  <p className="text-sm text-muted-foreground mb-4">{selectedTopic.keywordQuery}</p>
                  
                  <div className="flex gap-2 mb-4 flex-wrap">
                    <Button 
                      onClick={() => setScriptDialogOpen(true)}
                      data-testid="button-generate-script"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Generate Script
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        const savedEntry = getSavedEntryForTopic(selectedTopic.id);
                        if (savedEntry) deleteMutation.mutate(savedEntry.id);
                      }}
                      disabled={deleteMutation.isPending}
                      data-testid="button-remove-saved"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Video Script</DialogTitle>
            <DialogDescription>
              Create a script using Mark's 5-part formula for "{selectedTopic?.topicTitle}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
                  <SelectItem value="under-3">Under 3 minutes (Short)</SelectItem>
                  <SelectItem value="3-5">3-5 minutes</SelectItem>
                  <SelectItem value="6-10">6-10 minutes (Recommended)</SelectItem>
                  <SelectItem value="10-15">10-15 minutes</SelectItem>
                  <SelectItem value="15+">15+ minutes (Long form)</SelectItem>
                </SelectContent>
              </Select>
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
                  <SelectItem value="conversational">Conversational</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
                  <SelectItem value="educational">Educational</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Affiliate Offer (optional)</Label>
              <Input
                placeholder="e.g., ClickFunnels, AWeber, etc."
                value={scriptForm.affiliateOffer}
                onChange={(e) => setScriptForm(f => ({ ...f, affiliateOffer: e.target.value }))}
                data-testid="input-affiliate-offer"
              />
            </div>
            <div>
              <Label>Affiliate Link Label (optional)</Label>
              <Input
                placeholder="e.g., 'link in description'"
                value={scriptForm.affiliateLinkLabel}
                onChange={(e) => setScriptForm(f => ({ ...f, affiliateLinkLabel: e.target.value }))}
                data-testid="input-affiliate-label"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScriptDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleGenerateScript} 
              disabled={scriptMutation.isPending}
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
