import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, ArrowLeft, Trash2, FileText, Bookmark } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SavedTopic, Topic, TopicIntent } from "@shared/schema";

function getOpportunityLevel(score: number): { color: string; label: string; bgClass: string } {
  if (score >= 70) return { color: "text-green-600 dark:text-green-400", label: "Great opportunity", bgClass: "bg-green-500/10" };
  if (score >= 50) return { color: "text-yellow-600 dark:text-yellow-400", label: "Good potential", bgClass: "bg-yellow-500/10" };
  return { color: "text-red-600 dark:text-red-400", label: "Challenging", bgClass: "bg-red-500/10" };
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
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to remove topic",
        description: err.message,
        variant: "destructive",
      });
    },
  });

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

      <ScrollArea className="flex-1">
        <div className="p-4 max-w-4xl mx-auto">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : savedTopics && savedTopics.length > 0 ? (
            <div className="space-y-2">
              {savedTopics.map((saved) => (
                <Card key={saved.id} className="hover-elevate" data-testid={`card-saved-${saved.id}`}>
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{saved.topic.topicTitle}</p>
                        <p className="text-sm text-muted-foreground truncate">{saved.topic.keywordQuery}</p>
                        {saved.notes && (
                          <p className="text-sm text-muted-foreground mt-2 italic">"{saved.notes}"</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {saved.topic.intent && (
                          <Badge variant="outline">
                            {intentLabels[saved.topic.intent]}
                          </Badge>
                        )}
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/topic-pulse/explore/${saved.topic.runId}`)}
                          data-testid={`button-view-${saved.id}`}
                        >
                          <FileText className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(saved.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${saved.id}`}
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
                <Bookmark className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No saved topics yet. Save topics from your search results!</p>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
