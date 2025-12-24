import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Plus, Video, Clock, TrendingUp, Download, Eye, AlertCircle, Pencil, Check, X, Loader2 } from "lucide-react";
import type { Session } from "@shared/schema";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

function formatDuration(seconds: number | null): string {
  if (!seconds) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function ScoreCircle({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 36;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "text-green-500" : score >= 40 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="relative h-20 w-20">
      <svg className="h-20 w-20 -rotate-90">
        <circle
          className="text-muted"
          strokeWidth="6"
          stroke="currentColor"
          fill="transparent"
          r="36"
          cx="40"
          cy="40"
        />
        <circle
          className={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r="36"
          cx="40"
          cy="40"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-lg font-bold">
        {score}
      </span>
    </div>
  );
}

function VideoThumbnail({ session, isExpired }: { session: Session; isExpired: boolean | Date | null }) {
  if (isExpired) {
    return (
      <div className="flex aspect-video w-full items-center justify-center bg-muted sm:w-40">
        <div className="flex flex-col items-center gap-1 text-muted-foreground">
          <AlertCircle className="h-6 w-6" />
          <span className="text-xs font-medium">Expired</span>
        </div>
      </div>
    );
  }

  if (session.thumbnailPath) {
    return (
      <Link href={`/session/${session.id}`} className="block sm:w-40">
        <img
          src={`/api/sessions/${session.id}/thumbnail`}
          alt="Video preview"
          className="aspect-video w-full object-cover sm:w-40"
          data-testid={`thumbnail-session-${session.id}`}
        />
      </Link>
    );
  }

  return (
    <Link href={`/session/${session.id}`} className="flex aspect-video w-full items-center justify-center bg-muted sm:w-40">
      <Video className="h-8 w-8 text-muted-foreground" />
    </Link>
  );
}

function SessionCard({ session }: { session: Session }) {
  const { toast } = useToast();
  const isExpired = session.videoDeletedAt || (session.expiresAt && new Date(session.expiresAt) < new Date());
  const score = session.scoreJson?.totalScore ?? null;
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title || "");

  const updateTitleMutation = useMutation({
    mutationFn: async (title: string) => {
      const res = await apiRequest("PATCH", `/api/sessions/${session.id}`, { title: title || null });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to update title");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sessions", session.id] });
      setIsEditing(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const displayTitle = session.title || `Practice Session`;
  const dateStr = format(new Date(session.createdAt), "MMM d, yyyy");

  const handleSaveTitle = () => {
    const trimmed = editTitle.trim();
    updateTitleMutation.mutate(trimmed);
  };

  const handleCancelEdit = () => {
    setEditTitle(session.title || "");
    setIsEditing(false);
  };

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-md" data-testid={`card-session-${session.id}`}>
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          <VideoThumbnail session={session} isExpired={isExpired} />
          <div className="flex flex-1 flex-col justify-between p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 flex-1">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      maxLength={80}
                      className="h-8"
                      data-testid={`input-rename-session-${session.id}`}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveTitle();
                        if (e.key === "Escape") handleCancelEdit();
                      }}
                    />
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={handleSaveTitle}
                      disabled={updateTitleMutation.isPending}
                      data-testid={`button-save-rename-${session.id}`}
                    >
                      {updateTitleMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={handleCancelEdit}
                      data-testid={`button-cancel-rename-${session.id}`}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="font-semibold" data-testid={`text-session-title-${session.id}`}>
                      {displayTitle}
                    </p>
                    <Button 
                      size="icon" 
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => setIsEditing(true)}
                      data-testid={`button-rename-session-${session.id}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                )}
                <p className="text-sm text-muted-foreground">
                  {dateStr} at {format(new Date(session.createdAt), "h:mm a")}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {session.goalType}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDuration(session.durationSeconds)}
                  </span>
                  {isExpired ? (
                    <Badge variant="secondary" className="text-xs">
                      Video Expired
                    </Badge>
                  ) : (
                    <Badge variant="default" className="text-xs bg-green-600">
                      Video Available
                    </Badge>
                  )}
                </div>
              </div>
              {score !== null && (
                <ScoreCircle score={score} />
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Link href={`/session/${session.id}`}>
                <Button variant="outline" size="sm" data-testid={`button-view-session-${session.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View Details
                </Button>
              </Link>
              {!isExpired && session.videoPath && (
                <a href={`/api/sessions/${session.id}/download`} download>
                  <Button variant="ghost" size="sm" data-testid={`button-download-session-${session.id}`}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex flex-col sm:flex-row">
          <Skeleton className="aspect-video w-full sm:w-40" />
          <div className="flex-1 p-4 space-y-4">
            <div className="flex justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-20 w-20 rounded-full" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-9 w-28" />
              <Skeleton className="h-9 w-24" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="py-12">
      <CardContent className="flex flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
          <Video className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">No practice sessions yet</h3>
        <p className="mb-6 max-w-sm text-sm text-muted-foreground">
          Record your first practice video to get AI-powered feedback on your delivery.
        </p>
        <Link href="/session">
          <Button data-testid="button-empty-new-session">
            <Plus className="mr-2 h-4 w-4" />
            New Practice Session
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { data: sessions, isLoading, error } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-muted-foreground">Your video practice sessions</p>
        </div>
        <Link href="/session">
          <Button size="lg" data-testid="button-new-session">
            <Plus className="mr-2 h-5 w-5" />
            New Practice Session
          </Button>
        </Link>
      </div>

      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">Failed to load sessions. Please try again.</p>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <SessionCardSkeleton />
          <SessionCardSkeleton />
          <SessionCardSkeleton />
        </div>
      ) : sessions && sessions.length > 0 ? (
        <div className="space-y-4">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
