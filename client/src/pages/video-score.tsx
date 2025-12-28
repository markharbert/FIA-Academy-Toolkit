import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  Plus,
  Video,
  Eye,
  X,
  Loader2,
  Trash2,
  Pencil,
  Check,
  ArrowLeft,
  AlertCircle,
} from "lucide-react";
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

function getVideoQualityLabel(resolution: string | null): { label: string; isHighQuality: boolean } {
  if (!resolution) return { label: "Unknown", isHighQuality: false };
  
  const parts = resolution.split('x');
  if (parts.length !== 2) return { label: resolution, isHighQuality: false };
  
  const height = parseInt(parts[1], 10);
  
  if (height >= 2160) return { label: "4K", isHighQuality: true };
  if (height >= 1440) return { label: "2K", isHighQuality: true };
  if (height >= 1080) return { label: "1080p", isHighQuality: true };
  if (height >= 720) return { label: "720p", isHighQuality: false };
  if (height >= 480) return { label: "480p", isHighQuality: false };
  return { label: `${height}p`, isHighQuality: false };
}

function ScoreCircle({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 28;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "text-green-500" : score >= 40 ? "text-yellow-500" : "text-red-500";

  return (
    <div className="relative h-16 w-16">
      <svg className="h-16 w-16 -rotate-90">
        <circle
          className="text-muted"
          strokeWidth="5"
          stroke="currentColor"
          fill="transparent"
          r="28"
          cx="32"
          cy="32"
        />
        <circle
          className={color}
          strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke="currentColor"
          fill="transparent"
          r="28"
          cx="32"
          cy="32"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-base font-bold">
        {score}
      </span>
    </div>
  );
}

function VideoThumbnail({ session }: { session: Session }) {
  const hasPoster = session.previewPosterPath || session.thumbnailPath;
  
  if (hasPoster) {
    return (
      <div className="shrink-0 w-20 h-14 sm:w-24 sm:h-16">
        <img
          src={`/api/sessions/${session.id}/poster`}
          alt="Video preview"
          className="w-full h-full object-cover rounded-md"
          data-testid={`thumbnail-session-${session.id}`}
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            target.parentElement!.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-muted rounded-md"><svg class="h-5 w-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg></div>';
          }}
        />
      </div>
    );
  }

  return (
    <div className="shrink-0 w-20 h-14 sm:w-24 sm:h-16 flex items-center justify-center bg-muted rounded-md">
      <Video className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}

interface SessionCardProps {
  session: Session;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  selectionMode: boolean;
  selectedSessionIds: Set<string>;
  onDelete: (sessionId: string) => void;
}

function getQuickSummary(session: Session): string | null {
  const scoreJson = session.scoreJson as { summary?: { overallSummary?: string; strengths?: string[] } } | null;
  if (!scoreJson?.summary) return null;
  
  if (scoreJson.summary.overallSummary) {
    const firstSentences = scoreJson.summary.overallSummary.split(/[.!?]+/).slice(0, 2).join('. ').trim();
    return firstSentences ? firstSentences + '.' : null;
  }
  
  if (scoreJson.summary.strengths?.length) {
    return scoreJson.summary.strengths[0];
  }
  
  return null;
}

function SessionCard({ session, isSelected, onSelect, selectionMode, selectedSessionIds, onDelete }: SessionCardProps) {
  const { toast } = useToast();
  const score = session.scoreJson?.totalScore ?? null;
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title || "");
  const quickSummary = getQuickSummary(session);

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
  const dateStr = format(new Date(session.createdAt), "MMM d");

  const handleSaveTitle = () => {
    const trimmed = editTitle.trim();
    updateTitleMutation.mutate(trimmed);
  };

  const handleCancelEdit = () => {
    setEditTitle(session.title || "");
    setIsEditing(false);
  };

  const handleDragStart = (e: React.DragEvent) => {
    const sessionIds = isSelected && selectedSessionIds.size > 0 
      ? Array.from(selectedSessionIds) 
      : [session.id];
    e.dataTransfer.setData("application/json", JSON.stringify({ sessionIds }));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <Card 
      className={`transition-shadow hover:shadow-md cursor-grab active:cursor-grabbing ${isSelected ? 'ring-2 ring-primary' : ''}`} 
      data-testid={`card-session-${session.id}`}
      draggable
      onDragStart={handleDragStart}
    >
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          {selectionMode && (
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => onSelect(session.id, !!checked)}
                data-testid={`checkbox-session-${session.id}`}
              />
            </div>
          )}
          
          <VideoThumbnail session={session} />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isEditing ? (
                <div className="flex items-center gap-1 flex-1">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    maxLength={80}
                    className="h-7 text-sm"
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
                    className="h-7 w-7 shrink-0"
                    onClick={handleSaveTitle}
                    disabled={updateTitleMutation.isPending}
                    data-testid={`button-save-rename-${session.id}`}
                  >
                    {updateTitleMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                  </Button>
                  <Button 
                    size="icon" 
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={handleCancelEdit}
                    data-testid={`button-cancel-rename-${session.id}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <p className="font-medium text-sm truncate" data-testid={`text-session-title-${session.id}`}>
                    {displayTitle}
                  </p>
                  <Button 
                    size="icon" 
                    variant="ghost"
                    className="h-6 w-6 shrink-0 opacity-60 hover:opacity-100"
                    onClick={() => setIsEditing(true)}
                    data-testid={`button-rename-session-${session.id}`}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-xs text-muted-foreground">{dateStr}</span>
              <span className="text-xs text-muted-foreground">·</span>
              <span className="text-xs text-muted-foreground">Video Length: {formatDuration(session.durationSeconds)}</span>
              {session.finalVideoResolution && (() => {
                const qualityInfo = getVideoQualityLabel(session.finalVideoResolution);
                return (
                  <>
                    <span className="text-xs text-muted-foreground">·</span>
                    <Badge 
                      className={`text-[10px] px-1.5 py-0 ${qualityInfo.isHighQuality 
                        ? "bg-green-600 hover:bg-green-700 text-white" 
                        : "bg-red-600 hover:bg-red-700 text-white"
                      }`}
                    >
                      {qualityInfo.label}
                    </Badge>
                  </>
                );
              })()}
            </div>
            {quickSummary && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {quickSummary}
              </p>
            )}
          </div>
          
          {score !== null && (
            <div className="shrink-0">
              <ScoreCircle score={score} />
            </div>
          )}
          
          <div className="flex items-center gap-1 shrink-0">
            <Link href={`/video-score-upload/${session.id}`}>
              <Button variant="outline" size="sm" data-testid={`button-view-session-${session.id}`}>
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                View Detailed Report
              </Button>
            </Link>
            <Button 
              size="icon" 
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(session.id)}
              data-testid={`button-delete-session-${session.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-20 h-14 sm:w-24 sm:h-16 rounded-md shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-12 w-12 rounded-full shrink-0" />
          <Skeleton className="h-8 w-32 shrink-0" />
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
        <Link href="/video-score-upload">
          <Button data-testid="button-empty-new-session">
            <Plus className="mr-2 h-4 w-4" />
            Score New Video
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

interface BulkActionsBarProps {
  selectedCount: number;
  onDelete: () => void;
  onClearSelection: () => void;
  isDeleting: boolean;
}

function BulkActionsBar({
  selectedCount,
  onDelete,
  onClearSelection,
  isDeleting,
}: BulkActionsBarProps) {
  return (
    <div className="sticky top-0 z-20 mb-4 flex items-center justify-between gap-4 rounded-md border bg-card p-3 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{selectedCount} selected</span>
        <Button variant="ghost" size="sm" onClick={onClearSelection}>
          <X className="mr-1 h-4 w-4" />
          Clear
        </Button>
      </div>
      <Button
        variant="destructive"
        size="sm"
        onClick={onDelete}
        disabled={isDeleting}
        data-testid="button-bulk-delete"
      >
        {isDeleting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="mr-2 h-4 w-4" />
        )}
        Delete
      </Button>
    </div>
  );
}

export default function VideoScorePage() {
  const { toast } = useToast();
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null);

  const { data: sessions, isLoading: sessionsLoading, error: sessionsError } = useQuery<Session[]>({
    queryKey: ["/api/sessions"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const deleteSessionsMutation = useMutation({
    mutationFn: async (sessionIds: string[]) => {
      const res = await apiRequest("DELETE", "/api/sessions/bulk", { sessionIds });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete sessions");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sessions"] });
      setSelectedSessionIds(new Set());
      setDeleteDialogOpen(false);
      setSingleDeleteId(null);
      toast({ title: `Deleted ${data.deletedCount} session(s)` });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const handleSelectSession = (id: string, selected: boolean) => {
    setSelectedSessionIds(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!sessions) return;
    if (selectedSessionIds.size === sessions.length) {
      setSelectedSessionIds(new Set());
    } else {
      setSelectedSessionIds(new Set(sessions.map(s => s.id)));
    }
  };

  const handleBulkDelete = () => {
    deleteSessionsMutation.mutate(Array.from(selectedSessionIds));
  };

  const handleSingleDelete = (sessionId: string) => {
    setSingleDeleteId(sessionId);
  };

  const confirmSingleDelete = () => {
    if (singleDeleteId) {
      deleteSessionsMutation.mutate([singleDeleteId]);
    }
  };

  const selectionMode = selectedSessionIds.size > 0;

  return (
    <div className="flex-1 overflow-auto">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" data-testid="button-back-dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>

        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-video-score-title">Video Score</h1>
            <p className="text-muted-foreground">Score your video with AI Feedback</p>
          </div>
          <div className="flex items-center gap-2">
            {sessions && sessions.length > 0 && (
              <Button
                variant="outline"
                onClick={handleSelectAll}
                data-testid="button-select-all"
              >
                {selectedSessionIds.size === sessions.length ? "Deselect All" : "Select All"}
              </Button>
            )}
            <Link href="/video-score-upload">
              <Button size="lg" data-testid="button-new-session">
                <Plus className="mr-2 h-5 w-5" />
                Score New Video
              </Button>
            </Link>
          </div>
        </div>

        {selectionMode && (
          <BulkActionsBar
            selectedCount={selectedSessionIds.size}
            onDelete={() => setDeleteDialogOpen(true)}
            onClearSelection={() => setSelectedSessionIds(new Set())}
            isDeleting={deleteSessionsMutation.isPending}
          />
        )}

        {sessionsError && (
          <Card className="mb-6 border-destructive">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <p className="text-sm text-destructive">Failed to load sessions. Please try again.</p>
            </CardContent>
          </Card>
        )}

        {sessionsLoading ? (
          <div className="space-y-3">
            <SessionCardSkeleton />
            <SessionCardSkeleton />
            <SessionCardSkeleton />
          </div>
        ) : sessions && sessions.length > 0 ? (
          <div className="space-y-3">
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isSelected={selectedSessionIds.has(session.id)}
                onSelect={handleSelectSession}
                selectionMode={selectionMode}
                selectedSessionIds={selectedSessionIds}
                onDelete={handleSingleDelete}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedSessionIds.size} session(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The videos and all associated data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSessionsMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!singleDeleteId} onOpenChange={(open) => !open && setSingleDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this video score?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The video score and all associated data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSingleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteSessionsMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
