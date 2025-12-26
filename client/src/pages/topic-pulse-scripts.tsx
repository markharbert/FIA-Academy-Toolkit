import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ArrowLeft, Trash2, FileText, Zap } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Script, Topic } from "@shared/schema";

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
      toast({
        title: "Failed to delete script",
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
            <h1 className="text-xl font-semibold" data-testid="text-page-title">Generated Scripts</h1>
            <p className="text-sm text-muted-foreground">
              {scripts?.length || 0} scripts
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
          ) : scripts && scripts.length > 0 ? (
            <div className="space-y-2">
              {scripts.map((script) => (
                <Card 
                  key={script.id} 
                  className="cursor-pointer hover-elevate"
                  onClick={() => navigate(`/topic-pulse/scripts/${script.id}`)}
                  data-testid={`card-script-${script.id}`}
                >
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{script.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {(script.inputsJson as any)?.videoLengthTarget} min 
                          {(script.inputsJson as any)?.affiliateOffer && ` | ${(script.inputsJson as any).affiliateOffer}`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Created {new Date(script.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
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
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No scripts yet. Generate scripts from your topic results!</p>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
