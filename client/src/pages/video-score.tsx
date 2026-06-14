import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
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
  TrendingUp,
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
  const circumference = 2 * Math.PI * 30;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const stroke = score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#f43f5e";
  const textColor = score >= 70 ? "text-emerald-500" : score >= 40 ? "text-amber-500" : "text-rose-500";

  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg className="h-[68px] w-[68px] -rotate-90" viewBox="0 0 68 68">
        <circle strokeWidth="5" stroke="currentColor" fill="transparent" r="30" cx="34" cy="34" className="text-muted" />
        <circle
          strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          stroke={stroke}
          fill="transparent"
          r="30"
          cx="34"
          cy="34"
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-sm font-bold ${textColor}`}>
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

function getScoreAccent(score: number | null) {
  if (score === null) return "border-l-muted-foreground/20";
  if (score >= 70) return "border-l-emerald-500";
  if (score >= 40) return "border-l-amber-500";
  return "border-l-rose-500";
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
  const dateStr = format(new Date(session.createdAt), "MMM d, yyyy");

  const handleSaveTitle = () => {
    updateTitleMutation.mutate(editTitle.trim());
  };

  const handleCancelEdit = () => {
    setEditTitle(session.title || "");
    setIsEditing(false);
  };

  return (
    <div
      className={`group rounded-xl border bg-card shadow-sm border-l-4 ${getScoreAccent(score)} transition-all hover:shadow-md ${isSelected ? "ring-2 ring-primary" : ""}`}
      data-testid={`card-session-${session.id}`}
    >
      <div className="px-4 py-3.5 flex items-center gap-4">
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
          {/* Title row */}
          <div className="flex items-center gap-1.5">
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
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleSaveTitle} disabled={updateTitleMutation.isPending} data-testid={`button-save-rename-${session.id}`}>
                  {updateTitleMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={handleCancelEdit} data-testid={`button-cancel-rename-${session.id}`}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <>
                <p className="font-semibold text-sm truncate" data-testid={`text-session-title-${session.id}`}>{displayTitle}</p>
                <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity" onClick={() => setIsEditing(true)} data-testid={`button-rename-session-${session.id}`}>
                  <Pencil className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>

          {/* Meta chips row */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5">
            <span className="text-xs text-muted-foreground">{dateStr}</span>
            <span className="text-muted-foreground/40 text-xs">·</span>
            <span className="text-xs text-muted-foreground">{formatDuration(session.durationSeconds)}</span>
            {session.finalVideoResolution && (() => {
              const q = getVideoQualityLabel(session.finalVideoResolution);
              return (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${q.isHighQuality ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-500"}`}>
                  {q.label}
                </span>
              );
            })()}
            {score !== null && (
              <span className={`text-xs font-semibold ${score >= 70 ? "text-emerald-600 dark:text-emerald-400" : score >= 40 ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`}>
                {score >= 70 ? "Great" : score >= 40 ? "Good" : "Needs work"}
              </span>
            )}
          </div>

          {quickSummary && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic">{quickSummary}</p>
          )}
        </div>

        {/* Score circle */}
        {score !== null && <ScoreCircle score={score} />}

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Link href={`/video-score-upload/${session.id}`}>
            <Button variant="outline" size="sm" className="h-8 text-xs" data-testid={`button-view-session-${session.id}`}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              View Report
            </Button>
          </Link>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(session.id)}
            data-testid={`button-delete-session-${session.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function SessionCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card shadow-sm border-l-4 border-l-muted">
      <div className="px-4 py-3.5 flex items-center gap-4">
        <Skeleton className="w-24 h-16 rounded-md shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-[68px] w-[68px] rounded-full shrink-0" />
        <Skeleton className="h-8 w-28 shrink-0" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border bg-card py-16 flex flex-col items-center text-center">
      <div className="p-4 rounded-2xl bg-muted/50 mb-4">
        <Video className="h-10 w-10 text-muted-foreground/60" />
      </div>
      <h3 className="text-lg font-semibold text-foreground/80 mb-2">No practice sessions yet</h3>
      <p className="max-w-sm text-sm text-muted-foreground mb-6">
        Record your first practice video to get AI-powered feedback on your delivery.
      </p>
      <Link href="/video-score-upload">
        <Button data-testid="button-empty-new-session">
          <Plus className="mr-2 h-4 w-4" />
          Score New Video
        </Button>
      </Link>
    </div>
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

const INITIAL_VISIBLE_COUNT = 8;
const LOAD_MORE_COUNT = 4;

const PART_LINES = [
  { key: "hook",     label: "Hook",         color: "#f97316" },
  { key: "setHook",  label: "Set the Hook", color: "#a855f7" },
  { key: "firstCTA", label: "First CTA",    color: "#eab308" },
  { key: "content",  label: "Content",      color: "#22c55e" },
  { key: "finalCTA", label: "Final CTA",    color: "#ec4899" },
] as const;

function ScoreProgressChart({ sessions }: { sessions: Session[] }) {
  const chartData = sessions
    .filter(s => s.scoreJson?.totalScore != null)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-30)
    .map((s, i) => {
      const parts = (s.scoreJson as any)?.partScores ?? {};
      return {
        label: `#${i + 1}`,
        title: s.title || `Practice Session`,
        date: format(new Date(s.createdAt), "MMM d"),
        total: (s.scoreJson as any).totalScore as number,
        hook:     parts.hook     != null ? Math.round(parts.hook * 5)     : null,
        setHook:  parts.setHook  != null ? Math.round(parts.setHook * 5)  : null,
        firstCTA: parts.firstCTA != null ? Math.round(parts.firstCTA * 5) : null,
        content:  parts.content  != null ? Math.round(parts.content * 5)  : null,
        finalCTA: parts.finalCTA != null ? Math.round(parts.finalCTA * 5) : null,
      };
    });

  if (chartData.length < 2) return null;

  const latest = chartData[chartData.length - 1].total;
  const first  = chartData[0].total;
  const delta  = latest - first;

  const getBarColor = (score: number) => {
    if (score >= 70) return "#22c55e";
    if (score >= 40) return "#f59e0b";
    return "#f43f5e";
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const entry = chartData.find(d => d.label === label);
    if (!entry) return null;
    const barColor = getBarColor(entry.total);
    return (
      <div className="rounded-xl border bg-background shadow-lg px-3.5 py-3 text-sm min-w-[190px]">
        <p className="font-semibold truncate max-w-[200px] mb-0.5">{entry.title}</p>
        <p className="text-xs text-muted-foreground mb-2">{entry.date}</p>
        <div className="flex items-center justify-between gap-4 mb-2 pb-2 border-b">
          <span className="text-xs text-muted-foreground">Overall Score</span>
          <span className="text-sm font-bold tabular-nums" style={{ color: barColor }}>{entry.total}</span>
        </div>
        <div className="space-y-1.5">
          {PART_LINES.map(({ key, label: partLabel, color }) => {
            const val = entry[key as keyof typeof entry] as number | null;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-xs text-muted-foreground flex-1">{partLabel}</span>
                <span className="text-xs font-semibold tabular-nums">{val ?? "—"}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden mb-6" data-testid="card-score-progress">
      <div className="h-1 bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-500" />
      <div className="px-5 pt-4 pb-2">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-violet-500/10">
              <TrendingUp className="h-4 w-4 text-violet-500" />
            </div>
            <span className="font-semibold text-sm">Score Progress</span>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ${
                delta >= 0
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20"
              }`}
              data-testid="text-score-delta"
            >
              {delta >= 0 ? "+" : ""}{delta} from first
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
            {PART_LINES.map(({ key, label, color }) => (
              <div key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block h-2 w-2 rounded-full shrink-0" style={{ background: color }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="px-2 pb-4">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData} margin={{ top: 8, right: 16, left: -16, bottom: 0 }} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} className="text-muted-foreground" />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} className="text-muted-foreground" />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148,163,184,0.07)" }} />
            <ReferenceLine y={70} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.45} />
            <ReferenceLine y={40} stroke="#f43f5e" strokeDasharray="4 4" strokeOpacity={0.45} />
            <Bar dataKey="total" name="Overall" radius={[5, 5, 0, 0]} maxBarSize={44}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.total)} fillOpacity={0.82} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-center text-xs text-muted-foreground">
          Dashed lines: 40 (needs work) · 70 (good) · Hover a bar to see part-by-part scores
        </p>
      </div>
    </div>
  );
}

export default function VideoScorePage() {
  const { toast } = useToast();
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

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
    <div className="min-h-full flex flex-col">
      {/* ── Hero header ── */}
      <div className="relative overflow-hidden border-b border-border shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(345_55%_16%)]" />
        <div className="absolute -bottom-16 -right-10 h-56 w-56 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="absolute -top-12 -left-6 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="relative max-w-4xl mx-auto px-6 py-6 flex items-center gap-4">
          <Link href="/video-tools">
            <button className="flex items-center gap-1 text-white/50 hover:text-white text-sm transition-colors" data-testid="button-back-video-tools">
              <ArrowLeft className="h-4 w-4" />
              Video Tools
            </button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white" data-testid="text-video-score-title">Video Score</h1>
            <p className="text-white/60 text-xs mt-0.5">AI-powered feedback on your video delivery</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sessions && sessions.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-white/60 hover:text-white hover:bg-white/10 border-0"
                onClick={handleSelectAll}
                data-testid="button-select-all"
              >
                {selectedSessionIds.size === sessions.length ? "Deselect All" : "Select All"}
              </Button>
            )}
            <Link href="/video-score-upload">
              <Button size="sm" className="bg-white text-sidebar hover:bg-white/90 font-semibold" data-testid="button-new-session">
                <Plus className="mr-1.5 h-4 w-4" />
                Score New Video
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-5 py-6">

          {sessions && sessions.length >= 2 && (
            <ScoreProgressChart sessions={sessions} />
          )}

          {selectionMode && (
            <BulkActionsBar
              selectedCount={selectedSessionIds.size}
              onDelete={() => setDeleteDialogOpen(true)}
              onClearSelection={() => setSelectedSessionIds(new Set())}
              isDeleting={deleteSessionsMutation.isPending}
            />
          )}

          {sessionsError && (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-destructive/50 bg-destructive/5 px-4 py-3">
              <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
              <p className="text-sm text-destructive">Failed to load sessions. Please try again.</p>
            </div>
          )}

          {sessionsLoading ? (
            <div className="space-y-3">
              <SessionCardSkeleton />
              <SessionCardSkeleton />
              <SessionCardSkeleton />
            </div>
          ) : sessions && sessions.length > 0 ? (
            <div className="space-y-3">
              {sessions.slice(0, visibleCount).map((session) => (
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
              {sessions.length > visibleCount && (
                <div className="flex justify-center pt-4">
                  <Button variant="outline" onClick={() => setVisibleCount(prev => prev + LOAD_MORE_COUNT)} data-testid="button-show-more">
                    Show More ({sessions.length - visibleCount} remaining)
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
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
