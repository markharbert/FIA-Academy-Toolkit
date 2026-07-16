import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Trash2, FileText, Zap, Calendar, Clock, ChevronRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Script, Topic } from "@shared/schema";

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
      <div className="relative overflow-hidden border-b border-border shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(345_55%_16%)]" />
        <div className="absolute -bottom-16 -right-10 h-56 w-56 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="absolute -top-12 -left-6 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center gap-2.5 flex-wrap">
            <FileText className="h-4 w-4 text-amber-400 shrink-0" />
            <h1 className="text-xl font-bold text-white" data-testid="text-page-title">Generated Scripts</h1>
            {!isLoading && count > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 text-white/70 ring-1 ring-white/15">
                {count} {count === 1 ? "script" : "scripts"}
              </span>
            )}
          </div>
          <p className="text-white/50 text-xs mt-0.5">Your saved script outlines, ready to open and develop</p>
          {/* Breadcrumb */}
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
            >
              Research
            </button>
            <ChevronRight className="h-3 w-3 text-white/25 shrink-0" />
            <span className="text-white/75 text-xs font-medium">Generated Scripts</span>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-5 max-w-6xl mx-auto">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            </div>
          ) : scripts && scripts.length > 0 ? (
            <div className="space-y-2">
              {scripts.map((script, index) => {
                const videoLength = (script.inputsJson as any)?.videoLengthTarget;
                const accent = getAccentClass(index);

                return (
                  <div
                    key={script.id}
                    className={`group relative rounded-xl border bg-card shadow-sm border-l-4 ${accent} cursor-pointer transition-all hover:shadow-md hover:-translate-y-px`}
                    onClick={() => navigate(`/video-studio/scripts/${script.id}`)}
                    data-testid={`card-script-${script.id}`}
                  >
                    <div className="px-4 py-3 flex items-center gap-3">
                      {/* Icon */}
                      <div className="p-1.5 rounded-md bg-muted/60 shrink-0">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>

                      {/* Main content */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-snug truncate group-hover:text-primary transition-colors">
                          {script.title}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {new Date(script.createdAt).toLocaleDateString()}
                          </span>
                          {videoLength && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {videoLength} min
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Delete button */}
                      <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(script.id);
                          }}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${script.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
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
                Head over to Research, find a great topic, and generate your first script.
              </p>
              <Button
                className="mt-5"
                onClick={() => navigate("/video-studio/research")}
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
