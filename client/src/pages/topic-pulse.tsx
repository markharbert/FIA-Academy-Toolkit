import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, TrendingUp, Zap, BookOpen, ShoppingBag, HelpCircle, ListChecks, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { TopicRun, Topic } from "@shared/schema";

interface CreditsData {
  creditsUsed: number;
  monthlyLimit: number;
  windowStartedAt: string;
  remaining: number;
  resetsAt: string;
}

const presets = [
  { label: "Review", icon: ShoppingBag, type: "review" as const },
  { label: "Comparison", icon: ListChecks, type: "vs" as const },
  { label: "How-To", icon: BookOpen, type: "tutorial" as const },
  { label: "Problem Fix", icon: HelpCircle, type: "problem-fix" as const },
];

export default function TopicPulsePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [seedQuery, setSeedQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string | undefined>();

  const { data: recentRuns, isLoading: runsLoading } = useQuery<TopicRun[]>({
    queryKey: ["/api/topic-pulse/runs"],
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

  const creditsRemaining = creditsData?.remaining ?? 1000;
  const creditsExhausted = creditsRemaining < 1;

  const searchMutation = useMutation({
    mutationFn: async (input: { seedQuery: string; videoType?: string }) => {
      const res = await apiRequest("POST", "/api/topic-pulse/search", input);
      return res.json();
    },
    onSuccess: (data: { runId: string; topics: Topic[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/credits"] });
      navigate(`/topic-pulse/explore/${data.runId}`);
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/credits"] });
      toast({
        title: "Search failed",
        description: err.message,
        variant: "destructive",
      });
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
      toast({
        title: "Delete failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const deleteAllRunsMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/topic-pulse/runs");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/topic-pulse/runs"] });
      toast({ title: "All searches cleared" });
    },
    onError: (err: Error) => {
      toast({
        title: "Clear failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleSearch = () => {
    if (!seedQuery.trim()) {
      toast({
        title: "Enter a topic",
        description: "Please enter a niche or keyword to search",
        variant: "destructive",
      });
      return;
    }
    searchMutation.mutate({ seedQuery: seedQuery.trim(), videoType: selectedType });
  };

  const handlePresetClick = (type: string) => {
    setSelectedType(selectedType === type ? undefined : type);
  };

  return (
    <div className="min-h-full p-6 space-y-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">Video Trends</h1>
          <p className="text-muted-foreground">
            Find in-demand YouTube video topics and generate scripts using Mark's 5-part formula
          </p>
          {creditsData && (
            <div className="mt-4 flex items-center justify-center gap-2" data-testid="credits-display">
              {creditsExhausted ? (
                <Badge variant="destructive" className="text-sm py-1 px-3">
                  Credits exhausted - Resets {new Date(creditsData.resetsAt).toLocaleDateString()}
                </Badge>
              ) : creditsRemaining < 100 ? (
                <Badge className="text-sm py-1 px-3 bg-yellow-500 dark:bg-yellow-600 text-black border-yellow-600 dark:border-yellow-700">
                  {creditsRemaining} / {creditsData.monthlyLimit} credits remaining
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-sm py-1 px-3">
                  {creditsRemaining} / {creditsData.monthlyLimit} credits this month
                </Badge>
              )}
            </div>
          )}
        </div>

        <Card className="mb-8">
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Enter a niche or keyword (e.g., 'keto snacks', 'email marketing')"
                  value={seedQuery}
                  onChange={(e) => setSeedQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  disabled={searchMutation.isPending}
                  className="flex-1"
                  data-testid="input-seed-query"
                />
                <Button 
                  onClick={handleSearch} 
                  disabled={searchMutation.isPending || !seedQuery.trim() || creditsExhausted}
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

              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-muted-foreground self-center mr-2">Quick presets:</span>
                {presets.map((preset) => (
                  <Badge
                    key={preset.type}
                    variant={selectedType === preset.type ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => handlePresetClick(preset.type)}
                    data-testid={`badge-preset-${preset.type}`}
                  >
                    <preset.icon className="h-3 w-3 mr-1" />
                    {preset.label}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card 
            className="cursor-pointer hover-elevate"
            onClick={() => navigate("/topic-pulse/saved")}
            data-testid="card-saved-topics"
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Saved Topics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{savedTopics?.length || 0}</div>
              <p className="text-sm text-muted-foreground">Topics saved for later</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover-elevate"
            onClick={() => navigate("/topic-pulse/scripts")}
            data-testid="card-scripts"
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Scripts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{scripts?.length || 0}</div>
              <p className="text-sm text-muted-foreground">Generated scripts</p>
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover-elevate"
            onClick={() => navigate("/topic-pulse/settings")}
            data-testid="card-settings"
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">API keys & preferences</p>
            </CardContent>
          </Card>
        </div>

        <div>
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-semibold">Recent Searches</h2>
            {recentRuns && recentRuns.length > 0 && (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => deleteAllRunsMutation.mutate()}
                disabled={deleteAllRunsMutation.isPending}
                data-testid="button-clear-all-searches"
              >
                {deleteAllRunsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Clear All
              </Button>
            )}
          </div>
          {runsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : recentRuns && recentRuns.length > 0 ? (
            <div className="space-y-2">
              {recentRuns.map((run) => (
                <Card 
                  key={run.id} 
                  className="cursor-pointer hover-elevate"
                  onClick={() => navigate(`/topic-pulse/explore/${run.id}`)}
                  data-testid={`card-run-${run.id}`}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{run.seedQuery}</p>
                        <p className="text-sm text-muted-foreground">
                          {run.topicCount} topics found
                          {run.runtimeMs && ` in ${(run.runtimeMs / 1000).toFixed(1)}s`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={run.status === "complete" ? "default" : "secondary"}>
                          {run.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {new Date(run.createdAt).toLocaleDateString()}
                        </span>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRunMutation.mutate(run.id);
                          }}
                          disabled={deleteRunMutation.isPending}
                          data-testid={`button-delete-run-${run.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <Search className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No searches yet. Enter a topic above to get started!</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
