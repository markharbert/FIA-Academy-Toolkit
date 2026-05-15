import { Fragment, useState, useMemo, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  ArrowLeft, Youtube, Eye, Video, ThumbsUp, MessageSquare,
  ExternalLink, RefreshCw, LogOut, Clock, TrendingUp, TrendingDown,
  MousePointerClick, AlertCircle, UserPlus, Film,
  Share2, Search, Users, ChevronLeft, ChevronRight, Zap,
  ChevronDown, ChevronUp, X, BookMarked, Pencil, Trash2, Plus,
  CornerDownRight, Send,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";
import { useToast } from "@/hooks/use-toast";
import type { CannedResponse } from "@shared/schema";

// ── Formatters ────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}
function fmtDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtShortDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function parseDuration(iso: string): string {
  if (!iso) return "";
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return "";
  const h = parseInt(m[1] || "0"), min = parseInt(m[2] || "0"), sec = parseInt(m[3] || "0");
  if (h > 0) return `${h}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${min}:${String(sec).padStart(2, "0")}`;
}
function fmtSecs(s: number): string {
  if (!s || s <= 0) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}
function fmtWatchMins(mins: number): string {
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function relativeTime(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Channel = {
  id: string; title: string; handle: string; thumbnail: string;
  subscriberCount: number; videoCount: number; viewCount: number;
};
type Status = { connected: boolean; connectedEmail?: string; channel?: Channel; isAdmin?: boolean; channelId?: string };
type VideoItem = {
  id: string; title: string; thumbnail: string; publishedAt: string;
  viewCount: number; likeCount: number; commentCount: number; duration: string;
  isShort: boolean;
};
type AnalyticsDay = {
  date: string; views: number; watchMinutes: number;
  subscribersGained: number; subscribersLost: number;
  impressions: number; ctr: number; shares: number;
};
type AnalyticsTotals = {
  views: number; watchHours: number; avgViewDuration: number;
  subscribersGained: number; subscribersLost: number;
  impressions: number; ctr: number; shares: number;
};
type AnalyticsData = { timeSeries: AnalyticsDay[]; totals: AnalyticsTotals } | null;
type TrafficSource = { source: string; label: string; views: number; watchMinutes: number };
type DeviceBreakdown = { device: string; label: string; views: number; pct: number };
type CountryViews = { country: string; views: number; watchMinutes: number };
type SearchTerm = { term: string; views: number };
type AgeGroup = { age: string; label: string; pct: number };
type DemographicsData = { ageGroups: AgeGroup[]; genderMalePct: number; genderFemalePct: number };
type SubscriberStatusData = {
  subscribedViews: number; subscribedWatchMinutes: number;
  nonSubscribedViews: number; nonSubscribedWatchMinutes: number;
};
type BreakdownData = {
  traffic: TrafficSource[]; devices: DeviceBreakdown[]; countries: CountryViews[];
  searchTerms: SearchTerm[]; demographics: DemographicsData;
  subscriberStatus: SubscriberStatusData;
};
type VideoAnalytics = {
  videoId: string; views: number; watchMinutes: number; avgViewDuration: number;
  avgViewPercentage: number; likes: number; comments: number; shares: number;
};
type MergedVideo = VideoItem & Partial<VideoAnalytics>;

type CachedThread = CommentThread & {
  videoId: string;
  videoTitle: string;
  videoThumbnail: string;
  isReplied: boolean;
};

type CommentReply = {
  id: string; authorName: string; authorAvatar: string; authorChannelId: string;
  text: string; likeCount: number; publishedAt: string;
};
type CommentThread = {
  threadId: string; commentId: string; authorName: string; authorAvatar: string;
  authorChannelId: string; text: string; likeCount: number; publishedAt: string;
  totalReplyCount: number; replies: CommentReply[];
};
type CommentsData = { threads: CommentThread[]; nextPageToken?: string; totalResults?: number };

// ── Shared UI ─────────────────────────────────────────────────────────────────

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))", border: "1px solid hsl(var(--border))",
  borderRadius: 8, fontSize: 12,
};

function KpiCard({ label, value, sub, icon: Icon, iconColor, trend }: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  iconColor: string; trend?: { value: string; positive: boolean } | null;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
        </div>
        <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        {trend && (
          <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trend.positive ? "text-emerald-500" : "text-rose-500"}`}>
            {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend.value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Card className="border-border bg-card overflow-hidden">
      <div className="h-1 w-full bg-gradient-to-r from-red-500 to-rose-600" />
      <CardContent className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-0.5">{title}</h3>
        {sub && <p className="text-xs text-muted-foreground mb-4">{sub}</p>}
        {!sub && <div className="mb-4" />}
        {children}
      </CardContent>
    </Card>
  );
}

function PercentBar({ value, total, color = "bg-red-500" }: { value: number; total: number; color?: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="h-2 rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ReconnectBanner({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
      <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">Deep analytics require a reconnect</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Disconnect and reconnect your channel to unlock watch time, CTR, traffic sources, demographics, search terms, and more.
        </p>
      </div>
      <Button size="sm" variant="outline" className="shrink-0 text-xs" onClick={onConnect}>Reconnect</Button>
    </div>
  );
}

function CommentAvatar({ src, name }: { src: string; name: string }) {
  const initials = name ? name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "?";
  if (src) {
    return <img src={src} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0 ring-1 ring-border" />;
  }
  return (
    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 text-[10px] font-bold text-muted-foreground">
      {initials}
    </div>
  );
}

// ── CannedResponsesDialog ────────────────────────────────────────────────────

function CannedResponsesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");

  const { data: cannedList = [], isLoading } = useQuery<CannedResponse[]>({
    queryKey: ["/api/analytics/youtube/canned-responses"],
    enabled: open,
  });

  const createMut = useMutation({
    mutationFn: (data: { title: string; body: string }) =>
      apiRequest("POST", "/api/analytics/youtube/canned-responses", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/analytics/youtube/canned-responses"] });
      setNewTitle(""); setNewBody("");
      toast({ title: "Saved!", description: "Canned response added." });
    },
    onError: () => toast({ title: "Error", description: "Could not save.", variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, title, body }: { id: string; title: string; body: string }) =>
      apiRequest("PATCH", `/api/analytics/youtube/canned-responses/${id}`, { title, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/analytics/youtube/canned-responses"] });
      setEditingId(null);
      toast({ title: "Updated!" });
    },
    onError: () => toast({ title: "Error", description: "Could not update.", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/analytics/youtube/canned-responses/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/analytics/youtube/canned-responses"] });
      toast({ title: "Deleted." });
    },
    onError: () => toast({ title: "Error", description: "Could not delete.", variant: "destructive" }),
  });

  function startEdit(r: CannedResponse) {
    setEditingId(r.id); setEditTitle(r.title); setEditBody(r.body);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookMarked className="h-4 w-4 text-red-500" />
            Canned Responses
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Save pre-written replies to respond to comments faster.
        </p>

        {/* Saved responses */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
          ) : cannedList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No canned responses yet. Add one below.
            </div>
          ) : cannedList.map((r) => (
            <div key={r.id} className="border border-border rounded-xl p-3 bg-card">
              {editingId === r.id ? (
                <div className="space-y-2">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Title"
                    className="h-8 text-sm"
                    data-testid={`input-edit-title-${r.id}`}
                  />
                  <Textarea
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    placeholder="Response text…"
                    className="text-sm resize-none min-h-[64px]"
                    data-testid={`textarea-edit-body-${r.id}`}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" size="sm" className="h-7 text-xs"
                      onClick={() => setEditingId(null)}>Cancel</Button>
                    <Button size="sm" className="h-7 text-xs bg-red-500 hover:bg-red-600 text-white"
                      disabled={!editTitle.trim() || !editBody.trim() || updateMut.isPending}
                      onClick={() => updateMut.mutate({ id: r.id, title: editTitle, body: editBody })}
                      data-testid={`button-save-edit-${r.id}`}>
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.body}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => startEdit(r)} data-testid={`button-edit-canned-${r.id}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-500"
                      onClick={() => deleteMut.mutate(r.id)} disabled={deleteMut.isPending}
                      data-testid={`button-delete-canned-${r.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add new */}
        <div className="border-t border-border pt-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add New</p>
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Short title (e.g. Thank you)"
            className="h-8 text-sm"
            data-testid="input-new-canned-title"
          />
          <Textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            placeholder="Response text… (e.g. Thanks so much for watching! 🙏)"
            className="text-sm resize-none min-h-[72px]"
            data-testid="textarea-new-canned-body"
          />
          <Button
            className="w-full bg-red-500 hover:bg-red-600 text-white h-8 text-sm gap-1.5"
            disabled={!newTitle.trim() || !newBody.trim() || createMut.isPending}
            onClick={() => createMut.mutate({ title: newTitle.trim(), body: newBody.trim() })}
            data-testid="button-add-canned">
            <Plus className="h-3.5 w-3.5" />Save Response
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── CommentItem ───────────────────────────────────────────────────────────────

function CommentItem({
  thread, channelId, isReplying, replyText,
  onReplyClick, onReplyTextChange, onReplySubmit, onCancelReply,
  cannedResponses, isPending,
}: {
  thread: CommentThread;
  channelId: string;
  isReplying: boolean;
  replyText: string;
  onReplyClick: () => void;
  onReplyTextChange: (t: string) => void;
  onReplySubmit: () => void;
  onCancelReply: () => void;
  cannedResponses: CannedResponse[];
  isPending: boolean;
}) {
  const isOwn = thread.authorChannelId === channelId;

  return (
    <div className="py-3 border-b border-border/50 last:border-0">
      {/* Top-level comment */}
      <div className="flex gap-2.5">
        <CommentAvatar src={thread.authorAvatar} name={thread.authorName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${isOwn ? "text-red-500" : "text-foreground"}`}>
              {thread.authorName}
              {isOwn && <span className="ml-1 text-[10px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded-full border border-red-500/20">You</span>}
            </span>
            <span className="text-[11px] text-muted-foreground">{relativeTime(thread.publishedAt)}</span>
          </div>
          <p
            className="text-sm text-foreground mt-1 leading-relaxed break-words"
            dangerouslySetInnerHTML={{ __html: thread.text }}
          />
          <div className="flex items-center gap-3 mt-1.5">
            {thread.likeCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ThumbsUp className="h-3 w-3" />{fmt(thread.likeCount)}
              </span>
            )}
            <button
              className="text-[11px] text-muted-foreground hover:text-foreground font-medium transition-colors"
              onClick={onReplyClick}
              data-testid={`button-reply-${thread.commentId}`}>
              Reply
            </button>
          </div>

          {/* Reply form */}
          {isReplying && (
            <div className="mt-3 space-y-2">
              <Textarea
                value={replyText}
                onChange={(e) => onReplyTextChange(e.target.value)}
                placeholder="Add a public reply…"
                className="text-sm resize-none min-h-[72px] bg-muted/30"
                autoFocus
                data-testid={`textarea-reply-${thread.commentId}`}
              />
              <div className="flex items-center gap-2 flex-wrap">
                {cannedResponses.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                        data-testid={`button-canned-picker-${thread.commentId}`}>
                        <BookMarked className="h-3 w-3" />Canned
                        <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-1" align="start">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1.5">
                        Select a canned response
                      </p>
                      {cannedResponses.map((cr) => (
                        <button
                          key={cr.id}
                          className="w-full text-left px-2 py-2 rounded-lg hover:bg-muted transition-colors"
                          onClick={() => onReplyTextChange(cr.body)}
                          data-testid={`button-use-canned-${cr.id}`}>
                          <p className="text-xs font-medium text-foreground">{cr.title}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{cr.body}</p>
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}
                <div className="flex-1" />
                <Button variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={onCancelReply} data-testid={`button-cancel-reply-${thread.commentId}`}>
                  Cancel
                </Button>
                <Button size="sm"
                  className="h-7 text-xs bg-red-500 hover:bg-red-600 text-white gap-1"
                  disabled={!replyText.trim() || isPending}
                  onClick={onReplySubmit}
                  data-testid={`button-post-reply-${thread.commentId}`}>
                  <Send className="h-3 w-3" />
                  {isPending ? "Posting…" : "Reply"}
                </Button>
              </div>
            </div>
          )}

          {/* Existing replies */}
          {thread.replies.length > 0 && (
            <div className="mt-3 space-y-2.5 pl-3 border-l-2 border-border/40">
              {thread.replies.map((reply) => {
                const replyIsOwn = reply.authorChannelId === channelId;
                return (
                  <div key={reply.id} className="flex gap-2">
                    <CommentAvatar src={reply.authorAvatar} name={reply.authorName} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-semibold ${replyIsOwn ? "text-red-500" : "text-foreground"}`}>
                          {reply.authorName}
                          {replyIsOwn && <span className="ml-1 text-[10px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded-full border border-red-500/20">You</span>}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{relativeTime(reply.publishedAt)}</span>
                      </div>
                      <p
                        className="text-sm text-foreground mt-0.5 leading-relaxed break-words"
                        dangerouslySetInnerHTML={{ __html: reply.text }}
                      />
                      {reply.likeCount > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                          <ThumbsUp className="h-3 w-3" />{fmt(reply.likeCount)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              {thread.totalReplyCount > thread.replies.length && (
                <p className="text-[11px] text-muted-foreground pl-0.5 flex items-center gap-1">
                  <CornerDownRight className="h-3 w-3" />
                  {thread.totalReplyCount - thread.replies.length} more {thread.totalReplyCount - thread.replies.length === 1 ? "reply" : "replies"} on YouTube
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── VideoExpandPanel ─────────────────────────────────────────────────────────

function VideoExpandPanel({
  video, channelId, cannedResponses, onClose,
}: {
  video: MergedVideo;
  channelId: string;
  cannedResponses: CannedResponse[];
  onClose: () => void;
}) {
  const { toast } = useToast();
  type CommentSort = "relevance" | "time" | "oldest";
  const [commentSort, setCommentSort] = useState<CommentSort>("relevance");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const [allThreads, setAllThreads] = useState<CommentThread[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(undefined);
  const [requiresReconnect, setRequiresReconnect] = useState(false);
  const processedRef = useRef<string>("__unset__");

  function changeSort(newSort: CommentSort) {
    setCommentSort(newSort);
    setPageToken(undefined);
    setAllThreads([]);
    setNextPageToken(undefined);
    processedRef.current = "__unset__";
  }

  const apiOrder = commentSort === "oldest" ? "time" : commentSort;

  const { data: commentsData, isLoading: commentsLoading, error: commentsError } = useQuery<CommentsData>({
    queryKey: ["/api/analytics/youtube/video", video.id, "comments", commentSort, pageToken ?? "__first__"],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("order", apiOrder);
      if (pageToken) params.set("pageToken", pageToken);
      const url = `/api/analytics/youtube/video/${video.id}/comments?${params.toString()}`;
      const r = await fetch(url, { credentials: "include" });
      if (r.status === 403) {
        const e = new Error("requires_reconnect") as any;
        e.requiresReconnect = true;
        throw e;
      }
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (commentsError && (commentsError as any)?.requiresReconnect) {
      setRequiresReconnect(true);
    }
  }, [commentsError]);

  useEffect(() => {
    if (!commentsData) return;
    const key = pageToken ?? "__first__";
    if (processedRef.current === key) return;
    processedRef.current = key;
    const incoming = commentsData.threads || [];
    const ordered = commentSort === "oldest" ? [...incoming].reverse() : incoming;
    if (!pageToken) {
      setAllThreads(ordered);
    } else {
      setAllThreads((prev) => commentSort === "oldest" ? [...ordered, ...prev] : [...prev, ...ordered]);
    }
    setNextPageToken(commentsData.nextPageToken);
  }, [commentsData, pageToken, commentSort]);

  const replyMut = useMutation({
    mutationFn: ({ commentId, text }: { commentId: string; text: string }) =>
      apiRequest("POST", `/api/analytics/youtube/comments/${commentId}/reply`, { text }),
    onSuccess: async (res, { commentId }) => {
      const data = await res.json();
      setAllThreads((prev) => prev.map((t) =>
        t.commentId === commentId ? {
          ...t,
          totalReplyCount: t.totalReplyCount + 1,
          replies: [...t.replies, {
            id: data.id || Date.now().toString(),
            authorName: "You",
            authorAvatar: "",
            authorChannelId: channelId,
            text: replyText,
            likeCount: 0,
            publishedAt: new Date().toISOString(),
          }],
        } : t
      ));
      setReplyingToId(null);
      setReplyText("");
      toast({ title: "Reply posted!", description: "Your reply was added successfully." });
    },
    onError: (err: any) => {
      const msg = String(err?.message || "");
      if (msg.includes("403") || msg.includes("requires_reconnect")) {
        setRequiresReconnect(true);
      } else {
        toast({ title: "Failed to post reply", description: "Something went wrong.", variant: "destructive" });
      }
    },
  });

  function handleReplySubmit(commentId: string) {
    if (!replyText.trim()) return;
    replyMut.mutate({ commentId, text: replyText.trim() });
  }

  const totalStr = commentsData?.totalResults ? ` (${fmt(commentsData.totalResults)})` : "";

  return (
    <div className="border-t-2 border-red-500/30 bg-gradient-to-b from-red-500/[0.03] to-transparent">
      <div className="px-5 py-5">
        {/* Reconnect banner */}
        {requiresReconnect && (
          <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 mb-5">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Reconnect to enable replies</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Disconnect and reconnect your channel to grant reply permission, then try again.
              </p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 text-xs"
              onClick={() => { window.location.href = "/api/analytics/youtube/connect"; }}>
              Reconnect
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[5fr_7fr] gap-6">
          {/* ── Left: Player + meta ── */}
          <div className="space-y-3">
            <div className="aspect-video rounded-2xl overflow-hidden bg-black shadow-lg ring-1 ring-white/10">
              <iframe
                src={`https://www.youtube.com/embed/${video.id}?rel=0&modestbranding=1`}
                className="w-full h-full"
                allowFullScreen
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">{video.title}</p>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Eye className="h-3 w-3 text-red-500" />{fmt(video.viewCount)} views</span>
                <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3 text-rose-400" />{fmt(video.likeCount)} likes</span>
                {video.shares !== undefined && video.shares > 0 && (
                  <span className="flex items-center gap-1"><Share2 className="h-3 w-3 text-orange-400" />{fmt(video.shares)} shares</span>
                )}
                <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3 text-blue-400" />{fmt(video.commentCount)} comments</span>
              </div>
              <p className="text-xs text-muted-foreground">{fmtDate(video.publishedAt)}{video.duration ? ` · ${parseDuration(video.duration)}` : ""}</p>
            </div>
          </div>

          {/* ── Right: Comments ── */}
          <div className="flex flex-col min-h-0">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-red-500" />
                  Comments{totalStr}
                </h4>
                {/* Sort pills */}
                <div className="flex items-center gap-1 mt-2">
                  {([
                    { value: "relevance", label: "Top" },
                    { value: "time",      label: "Newest" },
                    { value: "oldest",    label: "Oldest" },
                  ] as { value: CommentSort; label: string }[]).map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => changeSort(opt.value)}
                      data-testid={`button-sort-comments-${opt.value}`}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                        commentSort === opt.value
                          ? "bg-red-500 text-white"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground shrink-0"
                data-testid="button-close-video-panel">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Comment list */}
            <div className="flex-1 overflow-y-auto max-h-[440px] pr-1 scrollbar-thin">
              {commentsLoading && allThreads.length === 0 ? (
                <div className="space-y-4 pt-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex gap-2.5 py-2">
                      <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-3/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : requiresReconnect ? null : allThreads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">No comments yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Comments may be disabled on this video</p>
                </div>
              ) : (
                allThreads.map((thread) => (
                  <CommentItem
                    key={thread.threadId}
                    thread={thread}
                    channelId={channelId}
                    isReplying={replyingToId === thread.commentId}
                    replyText={replyingToId === thread.commentId ? replyText : ""}
                    onReplyClick={() => {
                      if (replyingToId === thread.commentId) {
                        setReplyingToId(null); setReplyText("");
                      } else {
                        setReplyingToId(thread.commentId); setReplyText("");
                      }
                    }}
                    onReplyTextChange={setReplyText}
                    onReplySubmit={() => handleReplySubmit(thread.commentId)}
                    onCancelReply={() => { setReplyingToId(null); setReplyText(""); }}
                    cannedResponses={cannedResponses}
                    isPending={replyMut.isPending && replyingToId === thread.commentId}
                  />
                ))
              )}

              {/* Load more */}
              {nextPageToken && (
                <div className="pt-3 pb-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs h-8"
                    onClick={() => setPageToken(nextPageToken)}
                    disabled={commentsLoading}
                    data-testid="button-load-more-comments">
                    {commentsLoading ? "Loading…" : "Load more comments"}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Bulk Edit types + helpers ─────────────────────────────────────────────────

type BulkVideoMeta = {
  id: string; title: string; description: string; tags: string[];
  thumbnail: string; publishedAt: string; categoryId: string;
  defaultLanguage: string; isShort: boolean;
};
type BulkField = "title" | "description" | "tags";
type BulkOp = "find_replace" | "prepend" | "append" | "remove" | "add_tag" | "remove_tag";
type BulkStep = "configure" | "preview" | "applying" | "done";
type BulkResult = { id: string; title: string; success: boolean; error?: string };
type BulkPreviewItem = {
  video: BulkVideoMeta;
  result: { title: string; description: string; tags: string[] };
  selected: boolean;
};

function escRegex(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function applyBulkTransform(
  video: BulkVideoMeta, field: BulkField, op: BulkOp,
  findText: string, replaceText: string, addText: string, cs: boolean
): { title: string; description: string; tags: string[] } | null {
  let title = video.title, description = video.description, tags = [...video.tags];
  const flags = cs ? "g" : "gi";

  if (field === "title") {
    const orig = title;
    if (op === "find_replace" && findText) title = title.replace(new RegExp(escRegex(findText), flags), replaceText);
    else if (op === "prepend" && addText) title = addText + title;
    else if (op === "append" && addText) title = title + addText;
    else if (op === "remove" && findText) title = title.replace(new RegExp(escRegex(findText), flags), "");
    if (title === orig) return null;
  } else if (field === "description") {
    const orig = description;
    if (op === "find_replace" && findText) description = description.replace(new RegExp(escRegex(findText), flags), replaceText);
    else if (op === "prepend" && addText) description = addText + (description ? "\n\n" + description : "");
    else if (op === "append" && addText) description = (description ? description + "\n\n" : "") + addText;
    else if (op === "remove" && findText) description = description.replace(new RegExp(escRegex(findText), flags), "");
    if (description === orig) return null;
  } else if (field === "tags") {
    const origJ = JSON.stringify(tags);
    if (op === "add_tag" && addText) {
      const exists = tags.some((t) => cs ? t === addText : t.toLowerCase() === addText.toLowerCase());
      if (!exists) tags.push(addText);
    } else if (op === "remove_tag" && findText) {
      tags = tags.filter((t) => cs ? t !== findText : t.toLowerCase() !== findText.toLowerCase());
    } else if (op === "find_replace" && findText) {
      tags = tags.map((t) => (cs ? t === findText : t.toLowerCase() === findText.toLowerCase()) ? replaceText : t);
    }
    if (JSON.stringify(tags) === origJ) return null;
  }
  return { title, description, tags };
}

function MarkText({ text, mark, cs, variant }: { text: string; mark: string; cs: boolean; variant: "del" | "add" }) {
  if (!mark || !text) return <span className="font-mono text-xs break-all">{text || <em className="text-muted-foreground">(empty)</em>}</span>;
  const esc = escRegex(mark);
  const flags = cs ? "g" : "gi";
  const parts = text.split(new RegExp(`(${esc})`, flags));
  return (
    <span className="font-mono text-xs break-all">
      {parts.map((p, i) =>
        i % 2 === 1
          ? <mark key={i} className={variant === "del" ? "bg-red-500/20 text-red-600 dark:text-red-400 line-through rounded" : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded not-italic"}>{p}</mark>
          : <Fragment key={i}>{p}</Fragment>
      )}
    </span>
  );
}

function TagChips({ tags, added, removed }: { tags: string[]; added?: string; removed?: string }) {
  return (
    <div className="flex flex-wrap gap-1">
      {tags.length === 0 && <span className="text-xs text-muted-foreground italic">No tags</span>}
      {tags.map((t) => (
        <span key={t} className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium border ${
          t === added ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" :
          t === removed ? "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30 line-through" :
          "bg-muted text-muted-foreground border-border"
        }`}>{t}</span>
      ))}
    </div>
  );
}

// ── BulkEditTab ───────────────────────────────────────────────────────────────

function BulkEditTab() {
  const { toast } = useToast();
  const [step, setStep] = useState<BulkStep>("configure");
  const [field, setField] = useState<BulkField>("title");
  const [op, setOp] = useState<BulkOp>("find_replace");
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [addText, setAddText] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [videoFilter, setVideoFilter] = useState<"all" | "regular" | "shorts">("all");
  const [titleSearch, setTitleSearch] = useState("");
  const [previewItems, setPreviewItems] = useState<BulkPreviewItem[]>([]);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [progress, setProgress] = useState(0);

  const { data: metadata = [], isLoading: metaLoading, isError: metaError } = useQuery<BulkVideoMeta[]>({
    queryKey: ["/api/analytics/youtube/video-metadata"],
    staleTime: 5 * 60 * 1000,
  });

  // Reset op when field changes
  useEffect(() => {
    if (field === "tags") setOp("add_tag");
    else setOp("find_replace");
    setFindText(""); setReplaceText(""); setAddText("");
  }, [field]);

  const filteredVideos = useMemo(() => {
    return metadata.filter((v) => {
      if (videoFilter === "regular" && v.isShort) return false;
      if (videoFilter === "shorts" && !v.isShort) return false;
      if (titleSearch && !v.title.toLowerCase().includes(titleSearch.toLowerCase())) return false;
      return true;
    });
  }, [metadata, videoFilter, titleSearch]);

  const canPreview = useMemo(() => {
    if (field === "tags") return op === "add_tag" ? !!addText.trim() : !!findText.trim();
    if (op === "find_replace" || op === "remove") return !!findText.trim();
    return !!addText.trim();
  }, [field, op, findText, addText]);

  function handlePreview() {
    const items = filteredVideos
      .map((v) => {
        const result = applyBulkTransform(v, field, op, findText, replaceText, addText, caseSensitive);
        return result ? { video: v, result, selected: true } : null;
      })
      .filter(Boolean) as BulkPreviewItem[];
    if (items.length === 0) {
      toast({ title: "No matches found", description: "The search text wasn't found in any of your videos." });
      return;
    }
    setPreviewItems(items);
    setStep("preview");
  }

  const applyMut = useMutation({
    mutationFn: async (updates: { id: string; title: string; description: string; tags: string[]; categoryId: string; defaultLanguage?: string }[]) => {
      const BATCH = 10;
      const all: BulkResult[] = [];
      setProgress(0);
      for (let i = 0; i < updates.length; i += BATCH) {
        const batch = updates.slice(i, i + BATCH);
        const r = await apiRequest("POST", "/api/analytics/youtube/bulk-update", { updates: batch });
        const data = await r.json();
        all.push(...(data.results || []));
        setProgress(i + batch.length);
      }
      return all;
    },
    onSuccess: (data) => { setResults(data); setStep("done"); },
    onError: () => { toast({ title: "Apply failed", variant: "destructive" }); setStep("preview"); },
  });

  function handleApply() {
    const selected = previewItems.filter((i) => i.selected);
    if (!selected.length) return;
    setStep("applying");
    applyMut.mutate(selected.map((i) => ({
      id: i.video.id,
      title: i.result.title,
      description: i.result.description,
      tags: i.result.tags,
      categoryId: i.video.categoryId,
      defaultLanguage: i.video.defaultLanguage,
    })));
  }

  function handleReset() {
    setStep("configure"); setFindText(""); setReplaceText(""); setAddText("");
    setPreviewItems([]); setResults([]); setProgress(0);
  }

  const selectedCount = previewItems.filter((i) => i.selected).length;
  const quotaCost = selectedCount * 50;

  // ── Loading / Error ─────────────────────────────────────────────────────────
  if (metaLoading) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Loading your video library…</p>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
      </div>
    );
  }
  if (metaError || !metadata.length) {
    return (
      <div className="text-center py-16">
        <Video className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No videos found or failed to load. Make sure your channel is connected.</p>
      </div>
    );
  }

  // ── Configure step ──────────────────────────────────────────────────────────
  if (step === "configure") {
    const fieldOps: { value: BulkOp; label: string }[] = field === "tags"
      ? [{ value: "add_tag", label: "Add Tag" }, { value: "remove_tag", label: "Remove Tag" }, { value: "find_replace", label: "Replace Tag" }]
      : [{ value: "find_replace", label: "Find & Replace" }, { value: "prepend", label: "Prepend" }, { value: "append", label: "Append" }, { value: "remove", label: "Remove Text" }];

    const showFind = op === "find_replace" || op === "remove" || op === "remove_tag";
    const showReplace = op === "find_replace";
    const showAdd = op === "prepend" || op === "append" || op === "add_tag";
    const showCase = (showFind || showReplace) && field !== "tags";

    return (
      <div className="space-y-6 max-w-2xl">
        {/* Header */}
        <div>
          <h3 className="text-base font-semibold text-foreground">Bulk Find & Replace</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Make the same change across multiple videos at once. You'll preview before anything is saved.</p>
        </div>

        {/* Step 1: Field */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">1. What field do you want to edit?</p>
          <div className="flex gap-2">
            {(["title", "description", "tags"] as BulkField[]).map((f) => (
              <button key={f} onClick={() => setField(f)} data-testid={`bulk-field-${f}`}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${field === f ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Step 2: Operation */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">2. What do you want to do?</p>
          <div className="flex flex-wrap gap-2">
            {fieldOps.map((o) => (
              <button key={o.value} onClick={() => setOp(o.value)} data-testid={`bulk-op-${o.value}`}
                className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${op === o.value ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"}`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Step 3: Text inputs */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">3. Enter the text</p>

          {showFind && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                {op === "remove" || op === "remove_tag" ? "Text to remove" : "Find text"}
              </label>
              <div className="flex gap-2">
                <Input
                  value={findText} onChange={(e) => setFindText(e.target.value)}
                  placeholder={field === "tags" ? "Exact tag text…" : "Search for this text…"}
                  className="flex-1 text-sm font-mono"
                  data-testid="bulk-input-find"
                />
                {showCase && (
                  <button
                    onClick={() => setCaseSensitive((c) => !c)}
                    title="Case sensitive"
                    data-testid="bulk-toggle-case"
                    className={`px-3 rounded-lg border text-xs font-bold transition-colors ${caseSensitive ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"}`}>
                    Aa
                  </button>
                )}
              </div>
            </div>
          )}

          {showReplace && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Replace with {field === "tags" ? "(new tag)" : ""}
              </label>
              <Input
                value={replaceText} onChange={(e) => setReplaceText(e.target.value)}
                placeholder={field === "tags" ? "New tag text…" : "Replace with this text… (leave blank to delete)"}
                className="text-sm font-mono"
                data-testid="bulk-input-replace"
              />
            </div>
          )}

          {showAdd && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                {op === "prepend" ? "Text to add at the beginning" :
                 op === "append" ? "Text to add at the end" : "Tag to add"}
              </label>
              {field === "description" ? (
                <Textarea
                  value={addText} onChange={(e) => setAddText(e.target.value)}
                  placeholder={op === "prepend" ? "This text will appear at the top of every description…" : "This text will appear at the bottom of every description…"}
                  className="text-sm font-mono resize-none min-h-[80px]"
                  data-testid="bulk-input-add"
                />
              ) : (
                <Input
                  value={addText} onChange={(e) => setAddText(e.target.value)}
                  placeholder={op === "add_tag" ? "e.g. #privatepractice" : "Text to add…"}
                  className="text-sm font-mono"
                  data-testid="bulk-input-add"
                />
              )}
            </div>
          )}
        </div>

        {/* Step 4: Filter */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">4. Which videos? ({filteredVideos.length} selected)</p>
          <div className="flex flex-wrap gap-2">
            {([["all", "All videos"], ["regular", "Regular videos"], ["shorts", "Shorts only"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setVideoFilter(v)} data-testid={`bulk-filter-${v}`}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${videoFilter === v ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"}`}>
                {label}
              </button>
            ))}
          </div>
          <Input
            value={titleSearch} onChange={(e) => setTitleSearch(e.target.value)}
            placeholder="Optionally filter by title keyword…"
            className="text-sm max-w-sm mt-1"
            data-testid="bulk-filter-title"
          />
        </div>

        <Button
          onClick={handlePreview}
          disabled={!canPreview || filteredVideos.length === 0}
          className="gap-2 bg-red-500 hover:bg-red-600 text-white"
          data-testid="button-bulk-preview">
          <Search className="h-4 w-4" />Preview Changes
        </Button>
      </div>
    );
  }

  // ── Preview step ────────────────────────────────────────────────────────────
  if (step === "preview") {
    const allSelected = previewItems.every((i) => i.selected);
    const unaffectedCount = filteredVideos.length - previewItems.length;

    return (
      <div className="space-y-4 max-w-3xl">
        {/* Summary bar */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {selectedCount} video{selectedCount !== 1 ? "s" : ""} will be updated
            </h3>
            <p className="text-sm text-muted-foreground">
              {unaffectedCount > 0 && `${unaffectedCount} unchanged · `}
              Estimated quota cost: {quotaCost.toLocaleString()} units
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setStep("configure")} data-testid="button-bulk-back">
              ← Back
            </Button>
            <Button
              size="sm" className="gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs"
              disabled={selectedCount === 0}
              onClick={handleApply}
              data-testid="button-bulk-apply">
              Apply to {selectedCount} video{selectedCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </div>

        {/* Select all */}
        <div className="flex items-center gap-2">
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setPreviewItems((prev) => prev.map((i) => ({ ...i, selected: !allSelected })))}>
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        </div>

        {/* Affected videos list */}
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {previewItems.map((item) => (
            <div key={item.video.id}
              className={`border rounded-xl p-3 transition-colors ${item.selected ? "border-border bg-card" : "border-border/40 bg-muted/30 opacity-60"}`}>
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <button
                  className={`mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${item.selected ? "bg-red-500 border-red-500" : "border-border"}`}
                  onClick={() => setPreviewItems((prev) => prev.map((p) => p.video.id === item.video.id ? { ...p, selected: !p.selected } : p))}
                  data-testid={`bulk-select-${item.video.id}`}>
                  {item.selected && <X className="h-2.5 w-2.5 text-white" style={{ transform: "rotate(45deg)" }} />}
                </button>

                {/* Thumbnail + title */}
                <img src={item.video.thumbnail} alt="" className="w-14 h-10 rounded object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{item.video.title}</p>

                  {/* Diff display */}
                  {field === "title" && (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide shrink-0 w-12 pt-0.5">Before</span>
                        <MarkText text={item.video.title} mark={findText} cs={caseSensitive} variant="del" />
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide shrink-0 w-12 pt-0.5">After</span>
                        <MarkText text={item.result.title} mark={op === "find_replace" ? replaceText : op === "prepend" ? addText : op === "append" ? addText : ""} cs={caseSensitive} variant="add" />
                      </div>
                    </div>
                  )}

                  {field === "description" && (
                    <div className="mt-1.5 space-y-1">
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide shrink-0 w-12 pt-0.5">Before</span>
                        <span className="font-mono text-xs text-muted-foreground break-all line-clamp-2">{item.video.description.slice(0, 200) || <em>Empty</em>}</span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide shrink-0 w-12 pt-0.5">After</span>
                        <span className="font-mono text-xs text-foreground break-all line-clamp-2">{item.result.description.slice(0, 200) || <em>Empty</em>}</span>
                      </div>
                    </div>
                  )}

                  {field === "tags" && (
                    <div className="mt-1.5 space-y-1.5">
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide shrink-0 w-12 pt-0.5">Before</span>
                        <TagChips tags={item.video.tags} removed={op === "remove_tag" ? findText : undefined} />
                      </div>
                      <div className="flex items-start gap-1.5">
                        <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wide shrink-0 w-12 pt-0.5">After</span>
                        <TagChips tags={item.result.tags} added={op === "add_tag" ? addText : op === "find_replace" ? replaceText : undefined} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Quota warning */}
        {quotaCost > 5000 && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-foreground">
              This operation will use approximately <strong>{quotaCost.toLocaleString()}</strong> quota units — more than half the daily limit.
              Consider splitting into smaller batches if needed.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Applying step ───────────────────────────────────────────────────────────
  if (step === "applying") {
    const total = previewItems.filter((i) => i.selected).length;
    const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
    return (
      <div className="space-y-5 max-w-lg">
        <div>
          <h3 className="text-base font-semibold text-foreground">Updating videos…</h3>
          <p className="text-sm text-muted-foreground mt-0.5">{progress} of {total} complete — please don't close this page</p>
        </div>
        <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-red-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-sm font-medium text-foreground">{pct}%</p>
      </div>
    );
  }

  // ── Done step ───────────────────────────────────────────────────────────────
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  return (
    <div className="space-y-5 max-w-lg">
      <div>
        <h3 className="text-base font-semibold text-foreground">All done!</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          {succeeded.length} video{succeeded.length !== 1 ? "s" : ""} updated successfully
          {failed.length > 0 && ` · ${failed.length} failed`}
        </p>
      </div>

      {failed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Failed</p>
          {failed.map((r) => (
            <div key={r.id} className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-foreground truncate">{r.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{r.error}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReset} data-testid="button-bulk-new">
        <Plus className="h-3.5 w-3.5" />Start a new bulk edit
      </Button>
    </div>
  );
}

// ── CachedCommentCard ─────────────────────────────────────────────────────────

function CachedCommentCard({
  thread, channelId, isReplying, replyText,
  onReplyClick, onReplyTextChange, onReplySubmit, onCancelReply,
  cannedResponses, isPending,
}: {
  thread: CachedThread;
  channelId: string;
  isReplying: boolean;
  replyText: string;
  onReplyClick: () => void;
  onReplyTextChange: (t: string) => void;
  onReplySubmit: () => void;
  onCancelReply: () => void;
  cannedResponses: CannedResponse[];
  isPending: boolean;
}) {
  const isOwn = thread.authorChannelId === channelId;

  return (
    <div className="border border-border rounded-2xl bg-card p-4 space-y-3">
      {/* Video attribution pill */}
      <a
        href={`https://youtube.com/watch?v=${thread.videoId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 bg-muted/50 hover:bg-muted border border-border rounded-full px-2.5 py-1 transition-colors group max-w-full"
        data-testid={`link-comment-video-${thread.threadId}`}>
        {thread.videoThumbnail
          ? <img src={thread.videoThumbnail} alt="" className="w-8 h-5 rounded object-cover shrink-0" />
          : <div className="w-8 h-5 rounded bg-muted-foreground/20 shrink-0 flex items-center justify-center"><Video className="h-2.5 w-2.5 text-muted-foreground" /></div>}
        <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground truncate max-w-[280px] transition-colors">{thread.videoTitle}</span>
        <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/50 shrink-0" />
      </a>

      {/* Comment body */}
      <div className="flex gap-2.5">
        <CommentAvatar src={thread.authorAvatar} name={thread.authorName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold ${isOwn ? "text-red-500" : "text-foreground"}`}>
              {thread.authorName}
              {isOwn && <span className="ml-1 text-[10px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded-full border border-red-500/20">You</span>}
            </span>
            <span className="text-[11px] text-muted-foreground">{relativeTime(thread.publishedAt)}</span>
            {thread.isReplied
              ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">✓ Replied</span>
              : null}
          </div>

          <p
            className="text-sm text-foreground mt-1 leading-relaxed break-words"
            dangerouslySetInnerHTML={{ __html: thread.text }}
          />

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {thread.likeCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ThumbsUp className="h-3 w-3" />{fmt(thread.likeCount)}
              </span>
            )}
            {thread.totalReplyCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <CornerDownRight className="h-3 w-3" />{thread.totalReplyCount} {thread.totalReplyCount === 1 ? "reply" : "replies"}
              </span>
            )}
            <button
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={onReplyClick}
              data-testid={`button-reply-cached-${thread.commentId}`}>
              {isReplying ? "Cancel" : thread.isReplied ? "Reply again" : "Reply"}
            </button>
          </div>

          {/* Reply form */}
          {isReplying && (
            <div className="mt-3 space-y-2">
              <Textarea
                value={replyText}
                onChange={(e) => onReplyTextChange(e.target.value)}
                placeholder="Add a public reply…"
                className="text-sm resize-none min-h-[72px] bg-muted/30"
                autoFocus
                data-testid={`textarea-reply-cached-${thread.commentId}`}
              />
              <div className="flex items-center gap-2 flex-wrap">
                {cannedResponses.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                        data-testid={`button-canned-cached-${thread.commentId}`}>
                        <BookMarked className="h-3 w-3" />Canned
                        <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-1" align="start">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1.5">Select a canned response</p>
                      {cannedResponses.map((cr) => (
                        <button key={cr.id} className="w-full text-left px-2 py-2 rounded-lg hover:bg-muted transition-colors"
                          onClick={() => onReplyTextChange(cr.body)}
                          data-testid={`button-use-canned-cached-${cr.id}`}>
                          <p className="text-xs font-medium text-foreground">{cr.title}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{cr.body}</p>
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}
                <div className="flex-1" />
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancelReply}>Cancel</Button>
                <Button size="sm" className="h-7 text-xs bg-red-500 hover:bg-red-600 text-white gap-1"
                  disabled={!replyText.trim() || isPending}
                  onClick={onReplySubmit}
                  data-testid={`button-post-cached-reply-${thread.commentId}`}>
                  <Send className="h-3 w-3" />{isPending ? "Posting…" : "Reply"}
                </Button>
              </div>
            </div>
          )}

          {/* Existing replies preview */}
          {!isReplying && thread.replies.length > 0 && (
            <div className="mt-2.5 pl-3 border-l-2 border-border/40 space-y-2">
              {thread.replies.slice(0, 2).map((reply) => (
                <div key={reply.id} className="flex gap-2">
                  <CommentAvatar src={reply.authorAvatar} name={reply.authorName} />
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs font-semibold mr-1.5 ${reply.authorChannelId === channelId ? "text-red-500" : "text-foreground"}`}>{reply.authorName}</span>
                    <span className="text-[11px] text-muted-foreground">{relativeTime(reply.publishedAt)}</span>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1" dangerouslySetInnerHTML={{ __html: reply.text }} />
                  </div>
                </div>
              ))}
              {thread.replies.length > 2 && (
                <p className="text-[11px] text-muted-foreground">+{thread.replies.length - 2} more replies</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CommentsTab ───────────────────────────────────────────────────────────────

const COMMENT_BATCH_SIZE = 10;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function CommentsTab({
  videos, channelId, cannedResponses,
}: {
  videos: VideoItem[];
  channelId: string;
  cannedResponses: CannedResponse[];
}) {
  const { toast } = useToast();
  const [showAll, setShowAll] = useState(false);
  const [allThreads, setAllThreads] = useState<CachedThread[]>([]);
  const [loadedBatchCount, setLoadedBatchCount] = useState(0);
  const [cacheInfo, setCacheInfo] = useState({ hits: 0, fetches: 0 });
  const [requiresReconnect, setRequiresReconnect] = useState(false);
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const didInitRef = useRef(false);

  // Only videos from the last 12 months
  const recentVideos = useMemo(() => {
    const cutoff = Date.now() - ONE_YEAR_MS;
    return videos.filter((v) => v.publishedAt && new Date(v.publishedAt).getTime() > cutoff);
  }, [videos]);

  const videoBatches = useMemo(() => {
    const batches: VideoItem[][] = [];
    for (let i = 0; i < recentVideos.length; i += COMMENT_BATCH_SIZE) {
      batches.push(recentVideos.slice(i, i + COMMENT_BATCH_SIZE));
    }
    return batches;
  }, [recentVideos]);

  const hasMore = loadedBatchCount < videoBatches.length;

  const loadBatchMut = useMutation({
    mutationFn: async ({ batchVideos, forceRefresh }: { batchVideos: VideoItem[]; forceRefresh: boolean }) => {
      const r = await fetch("/api/analytics/youtube/all-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          videos: batchVideos.map((v) => ({ id: v.id, title: v.title, thumbnail: v.thumbnail, publishedAt: v.publishedAt })),
          forceRefresh,
        }),
      });
      if (r.status === 403) { const e = new Error("requires_reconnect") as any; e.requiresReconnect = true; throw e; }
      if (!r.ok) throw new Error(await r.text());
      return r.json() as Promise<{ threads: CachedThread[]; cacheHits: number; apiFetches: number }>;
    },
    onSuccess: (data) => {
      setAllThreads((prev) => {
        const existing = new Set(prev.map((t) => t.threadId));
        return [...prev, ...data.threads.filter((t) => !existing.has(t.threadId))];
      });
      setLoadedBatchCount((c) => c + 1);
      setCacheInfo((prev) => ({ hits: prev.hits + data.cacheHits, fetches: prev.fetches + data.apiFetches }));
    },
    onError: (err: any) => {
      if (err?.requiresReconnect) setRequiresReconnect(true);
      else toast({ title: "Failed to load comments", variant: "destructive" });
    },
  });

  const refreshMut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/analytics/youtube/all-comments/refresh", {
        method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
      });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => {
      setAllThreads([]);
      setLoadedBatchCount(0);
      setCacheInfo({ hits: 0, fetches: 0 });
      didInitRef.current = false;
    },
    onError: () => toast({ title: "Failed to refresh cache", variant: "destructive" }),
  });

  // Auto-load first batch when videos are ready
  useEffect(() => {
    if (didInitRef.current || videoBatches.length === 0 || loadBatchMut.isPending || refreshMut.isPending) return;
    didInitRef.current = true;
    loadBatchMut.mutate({ batchVideos: videoBatches[0], forceRefresh: false });
  }, [videoBatches, refreshMut.isSuccess]);

  const replyMut = useMutation({
    mutationFn: ({ commentId, text }: { commentId: string; text: string }) =>
      apiRequest("POST", `/api/analytics/youtube/comments/${commentId}/reply`, { text }),
    onSuccess: async (res, { commentId }) => {
      const data = await res.json();
      setAllThreads((prev) => prev.map((t) =>
        t.commentId === commentId ? {
          ...t,
          isReplied: true,
          totalReplyCount: t.totalReplyCount + 1,
          replies: [...t.replies, {
            id: data.id || String(Date.now()),
            authorName: "You",
            authorAvatar: "",
            authorChannelId: channelId,
            text: replyText,
            likeCount: 0,
            publishedAt: new Date().toISOString(),
          }],
        } : t
      ));
      setReplyingToId(null);
      setReplyText("");
      toast({ title: "Reply posted!" });
    },
    onError: (err: any) => {
      if (String(err?.message || "").includes("403")) setRequiresReconnect(true);
      else toast({ title: "Failed to post reply", description: "Something went wrong.", variant: "destructive" });
    },
  });

  const displayedThreads = showAll ? allThreads : allThreads.filter((t) => !t.isReplied);
  const unrepliedCount = allThreads.filter((t) => !t.isReplied).length;
  const repliedCount = allThreads.filter((t) => t.isReplied).length;

  if (requiresReconnect) {
    return (
      <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
        <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-foreground">Reconnect required</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Disconnect and reconnect your channel to grant comment-reading permission, then try again.
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 text-xs"
          onClick={() => { window.location.href = "/api/analytics/youtube/connect"; }}>
          Reconnect
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3 flex-wrap">
          {/* Filter toggle */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            <button
              onClick={() => setShowAll(false)}
              data-testid="button-filter-unreplied"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${!showAll ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              <MessageSquare className="h-3 w-3" />
              Needs Reply
              {unrepliedCount > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${!showAll ? "bg-red-500 text-white" : "bg-muted-foreground/20 text-muted-foreground"}`}>
                  {unrepliedCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowAll(true)}
              data-testid="button-filter-all"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${showAll ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              All
              {allThreads.length > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${showAll ? "bg-muted-foreground/20 text-foreground" : "bg-muted-foreground/20 text-muted-foreground"}`}>
                  {allThreads.length}
                </span>
              )}
            </button>
          </div>

          {/* Cache status */}
          {(cacheInfo.hits > 0 || cacheInfo.fetches > 0) && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {cacheInfo.hits > 0 && <span>{cacheInfo.hits} from cache</span>}
              {cacheInfo.hits > 0 && cacheInfo.fetches > 0 && <span>·</span>}
              {cacheInfo.fetches > 0 && <span>{cacheInfo.fetches} live</span>}
            </div>
          )}
        </div>

        <Button
          variant="outline" size="sm"
          className="h-8 text-xs gap-1.5"
          onClick={() => refreshMut.mutate()}
          disabled={refreshMut.isPending || loadBatchMut.isPending}
          data-testid="button-refresh-comments">
          <RefreshCw className={`h-3.5 w-3.5 ${refreshMut.isPending ? "animate-spin" : ""}`} />
          {refreshMut.isPending ? "Clearing…" : "Refresh cache"}
        </Button>
      </div>

      {/* Scope note */}
      <p className="text-xs text-muted-foreground">
        Showing comments from your {recentVideos.length} video{recentVideos.length !== 1 ? "s" : ""} published in the last 12 months
        {loadedBatchCount < videoBatches.length
          ? ` · ${loadedBatchCount * COMMENT_BATCH_SIZE} of ${recentVideos.length} videos loaded`
          : ` · all videos loaded`}
      </p>

      {/* Initial loading state */}
      {loadBatchMut.isPending && allThreads.length === 0 && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border border-border rounded-2xl p-4 space-y-3">
              <Skeleton className="h-7 w-48 rounded-full" />
              <div className="flex gap-2.5">
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loadBatchMut.isPending && displayedThreads.length === 0 && allThreads.length > 0 && !showAll && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
            <MessageSquare className="h-8 w-8 text-emerald-500" />
          </div>
          <h3 className="text-lg font-bold text-foreground mb-1">All caught up!</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            You've replied to every comment in your last 12 months of videos.
            {hasMore && " Load more videos to check further back."}
          </p>
          {!hasMore && (
            <Button variant="outline" size="sm" className="mt-4 text-xs" onClick={() => setShowAll(true)}>
              View all {repliedCount} replied comments
            </Button>
          )}
        </div>
      )}

      {!loadBatchMut.isPending && allThreads.length === 0 && !loadBatchMut.isPending && recentVideos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Video className="h-8 w-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">No videos published in the last 12 months.</p>
        </div>
      )}

      {/* Comment cards */}
      {displayedThreads.length > 0 && (
        <div className="space-y-3">
          {displayedThreads.map((thread) => (
            <CachedCommentCard
              key={thread.threadId}
              thread={thread}
              channelId={channelId}
              isReplying={replyingToId === thread.commentId}
              replyText={replyingToId === thread.commentId ? replyText : ""}
              onReplyClick={() => {
                if (replyingToId === thread.commentId) { setReplyingToId(null); setReplyText(""); }
                else { setReplyingToId(thread.commentId); setReplyText(""); }
              }}
              onReplyTextChange={setReplyText}
              onReplySubmit={() => {
                if (!replyText.trim()) return;
                replyMut.mutate({ commentId: thread.commentId, text: replyText.trim() });
              }}
              onCancelReply={() => { setReplyingToId(null); setReplyText(""); }}
              cannedResponses={cannedResponses}
              isPending={replyMut.isPending && replyingToId === thread.commentId}
            />
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && allThreads.length > 0 && (
        <div className="pt-2">
          <Button
            variant="outline"
            className="w-full text-sm h-10 gap-2"
            onClick={() => loadBatchMut.mutate({ batchVideos: videoBatches[loadedBatchCount], forceRefresh: false })}
            disabled={loadBatchMut.isPending}
            data-testid="button-load-more-videos">
            {loadBatchMut.isPending
              ? <><RefreshCw className="h-4 w-4 animate-spin" />Loading next {COMMENT_BATCH_SIZE} videos…</>
              : <>Load next {Math.min(COMMENT_BATCH_SIZE, recentVideos.length - loadedBatchCount * COMMENT_BATCH_SIZE)} videos ({recentVideos.length - loadedBatchCount * COMMENT_BATCH_SIZE} remaining)</>}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "overview" | "videos" | "audience" | "comments" | "bulk";
type SortKey = "views" | "watchTime" | "retention" | "engagement" | "shares" | "date";

export default function AnalyticsYouTubePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("overview");
  const [days, setDays] = useState(28);
  const [videoSort, setVideoSort] = useState<SortKey>("views");
  const [videoFilter, setVideoFilter] = useState<"all" | "regular" | "shorts">("all");
  const [videoPage, setVideoPage] = useState(0);
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null);
  const [showCannedDialog, setShowCannedDialog] = useState(false);
  const VIDEOS_PER_PAGE = 25;

  const ANALYTICS_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

  const { data: status, isLoading: statusLoading } = useQuery<Status>({
    queryKey: ["/api/analytics/youtube/status"],
    staleTime: ANALYTICS_CACHE_MS,
    gcTime: ANALYTICS_CACHE_MS,
  });
  const connected = status?.connected === true;

  const { data: videos, isLoading: videosLoading } = useQuery<VideoItem[]>({
    queryKey: ["/api/analytics/youtube/videos"],
    enabled: connected,
    staleTime: ANALYTICS_CACHE_MS,
    gcTime: ANALYTICS_CACHE_MS,
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics/youtube/channel-analytics", days],
    queryFn: () => fetch(`/api/analytics/youtube/channel-analytics?days=${days}`, { credentials: "include" }).then((r) => r.json()),
    enabled: connected,
    staleTime: ANALYTICS_CACHE_MS,
    gcTime: ANALYTICS_CACHE_MS,
  });

  const { data: breakdowns, isLoading: breakdownsLoading } = useQuery<BreakdownData>({
    queryKey: ["/api/analytics/youtube/breakdowns", days],
    queryFn: () => fetch(`/api/analytics/youtube/breakdowns?days=${days}`, { credentials: "include" }).then((r) => r.json()),
    enabled: connected && tab === "audience",
    staleTime: ANALYTICS_CACHE_MS,
    gcTime: ANALYTICS_CACHE_MS,
  });

  const { data: videoAnalytics, isLoading: videoAnalyticsLoading } = useQuery<VideoAnalytics[]>({
    queryKey: ["/api/analytics/youtube/video-analytics", days],
    queryFn: () => fetch(`/api/analytics/youtube/video-analytics?days=${days}`, { credentials: "include" }).then((r) => r.json()),
    enabled: connected && tab === "videos",
    staleTime: ANALYTICS_CACHE_MS,
    gcTime: ANALYTICS_CACHE_MS,
  });

  const { data: cannedResponses = [] } = useQuery<CannedResponse[]>({
    queryKey: ["/api/analytics/youtube/canned-responses"],
    enabled: connected && (tab === "videos" || tab === "comments"),
  });

  const disconnectMut = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/analytics/youtube/disconnect"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/analytics/youtube/status"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics/youtube/videos"] });
      toast({ title: "Disconnected", description: "YouTube channel has been unlinked." });
    },
  });
  const refreshMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/analytics/youtube/refresh"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/analytics/youtube/status"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics/youtube/videos"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics/youtube/channel-analytics", days] });
      toast({ title: "Refreshed", description: "Channel data updated." });
    },
    onError: () => toast({ title: "Error", description: "Could not refresh.", variant: "destructive" }),
  });

  const analyticsAvailable = analytics !== null && (analytics?.timeSeries?.length ?? 0) > 0;
  const totals = analytics?.totals;
  const timeSeries = analytics?.timeSeries || [];

  const mergedVideos = useMemo<MergedVideo[]>(() => {
    if (!videos) return [];
    const map = new Map<string, VideoAnalytics>();
    (videoAnalytics || []).forEach((va) => map.set(va.videoId, va));
    return videos.map((v) => ({ ...v, ...(map.get(v.id) || {}) }));
  }, [videos, videoAnalytics]);

  const filteredSortedVideos = useMemo(() => {
    const filtered = videoFilter === "all" ? mergedVideos
      : videoFilter === "shorts" ? mergedVideos.filter((v) => v.isShort)
      : mergedVideos.filter((v) => !v.isShort);
    return [...filtered].sort((a, b) => {
      switch (videoSort) {
        case "views": return (b.viewCount || 0) - (a.viewCount || 0);
        case "watchTime": return (b.watchMinutes || 0) - (a.watchMinutes || 0);
        case "retention": return (b.avgViewPercentage || 0) - (a.avgViewPercentage || 0);
        case "shares": return (b.shares || 0) - (a.shares || 0);
        case "engagement": {
          const eA = a.viewCount > 0 ? (a.likeCount + a.commentCount) / a.viewCount : 0;
          const eB = b.viewCount > 0 ? (b.likeCount + b.commentCount) / b.viewCount : 0;
          return eB - eA;
        }
        case "date": return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
        default: return 0;
      }
    });
  }, [mergedVideos, videoSort, videoFilter]);

  const totalPages = Math.ceil(filteredSortedVideos.length / VIDEOS_PER_PAGE);
  const pagedVideos = filteredSortedVideos.slice(videoPage * VIDEOS_PER_PAGE, (videoPage + 1) * VIDEOS_PER_PAGE);
  const shortsCount = mergedVideos.filter((v) => v.isShort).length;
  const regularCount = mergedVideos.filter((v) => !v.isShort).length;

  const chartData = timeSeries.map((d) => ({
    date: fmtShortDate(d.date),
    Views: d.views,
    "Watch Hrs": Math.round(d.watchMinutes / 60 * 10) / 10,
    "Subs +": d.subscribersGained,
    "Subs −": d.subscribersLost,
    Shares: d.shares,
  }));

  function toggleExpand(videoId: string) {
    setExpandedVideoId((prev) => prev === videoId ? null : videoId);
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (statusLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-sidebar text-sidebar-foreground px-6 py-8">
          <div className="max-w-6xl mx-auto">
            <Skeleton className="h-5 w-24 bg-white/10 mb-4" />
            <Skeleton className="h-8 w-56 bg-white/10" />
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <button onClick={() => setLocation("/analytics")}
            className="flex items-center gap-1.5 text-white/50 hover:text-white/80 text-sm mb-4 transition-colors"
            data-testid="button-back-analytics">
            <ArrowLeft className="h-4 w-4" />Analytics
          </button>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <Youtube className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">YouTube Analytics</h1>
                {connected && status?.connectedEmail && (
                  <p className="text-white/40 text-xs mt-0.5">{status.connectedEmail}</p>
                )}
              </div>
            </div>
            {connected && (
              <div className="flex items-center gap-2">
                {status?.isAdmin && (
                  <Button size="sm" variant="ghost" className="text-white/60 hover:text-white hover:bg-white/10"
                    onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}
                    data-testid="button-refresh-youtube">
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshMut.isPending ? "animate-spin" : ""}`} />Refresh
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="text-white/60 hover:text-rose-400 hover:bg-white/10"
                  onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}
                  data-testid="button-disconnect-youtube">
                  <LogOut className="h-3.5 w-3.5 mr-1.5" />Disconnect
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Not connected */}
        {!connected && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl bg-red-500/10 flex items-center justify-center mb-5">
              <Youtube className="h-10 w-10 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">Connect your YouTube channel</h2>
            <p className="text-muted-foreground text-sm max-w-md mb-8 leading-relaxed">
              Sign in with the Google account that owns your channel to unlock full analytics — views, watch time, CTR, search terms, audience demographics, and more.
            </p>
            <Button className="bg-gradient-to-r from-red-500 to-rose-600 text-white hover:opacity-90 px-6"
              onClick={() => { window.location.href = "/api/analytics/youtube/connect"; }}
              data-testid="button-connect-youtube">
              <Youtube className="h-4 w-4 mr-2" />Connect YouTube Channel
            </Button>
            <p className="text-xs text-muted-foreground mt-4 opacity-60">Read-only access by default — posting replies requires an extra permission grant.</p>
          </div>
        )}

        {/* Connected */}
        {connected && status?.channel && (
          <div className="space-y-6">

            {/* Channel card */}
            <Card className="border-border bg-card overflow-hidden">
              <div className="h-1 w-full bg-gradient-to-r from-red-500 to-rose-600" />
              <CardContent className="p-5 flex items-center gap-4">
                {status.channel.thumbnail ? (
                  <img src={status.channel.thumbnail} alt={status.channel.title}
                    className="w-14 h-14 rounded-full object-cover ring-2 ring-red-500/30" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
                    <Youtube className="h-7 w-7 text-red-500" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-foreground truncate">{status.channel.title}</h2>
                  {status.channel.handle && <p className="text-sm text-muted-foreground">@{status.channel.handle.replace(/^@/, "")}</p>}
                  <div className="flex flex-wrap gap-4 mt-1.5">
                    <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{fmt(status.channel.subscriberCount)}</span> subscribers</span>
                    <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{fmt(status.channel.viewCount)}</span> total views</span>
                    <span className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{fmt(status.channel.videoCount)}</span> videos</span>
                  </div>
                </div>
                <a href={`https://youtube.com/channel/${status.channel.id}`} target="_blank" rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground transition-colors" data-testid="link-youtube-channel">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </CardContent>
            </Card>

            {/* Tab bar + period selector */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                {(["overview", "videos", "audience", "comments", ...(status?.isAdmin ? ["bulk"] : [])] as Tab[]).map((t) => (
                  <button key={t} onClick={() => setTab(t)} data-testid={`tab-${t}`}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    {t === "comments" ? (
                      <span className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5" />Comments</span>
                    ) : t === "bulk" ? (
                      <span className="flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" />Bulk Edit</span>
                    ) : t}
                  </button>
                ))}
              </div>
              {tab !== "comments" && tab !== "bulk" && (
                <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
                  <SelectTrigger className="w-36 h-8 text-xs" data-testid="select-period"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="28">Last 28 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="365">Last 365 days</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Reconnect banner */}
            {!analyticsLoading && analytics === null && <ReconnectBanner onConnect={() => { window.location.href = "/api/analytics/youtube/connect"; }} />}

            {/* ═══════════════════ OVERVIEW TAB ═══════════════════ */}
            {tab === "overview" && (
              <div className="space-y-5">

                {/* ── All-time hero ── */}
                <div className="rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-white/10">
                  <div className="px-6 pt-5 pb-1">
                    <p className="text-xs font-semibold uppercase tracking-widest text-white/40">Channel Totals — All Time</p>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-white/10">
                    {[
                      { label: "Subscribers", value: fmt(status.channel.subscriberCount), icon: Users, color: "text-emerald-400" },
                      { label: "Total Views", value: fmt(status.channel.viewCount), icon: Eye, color: "text-red-400" },
                      { label: "Videos", value: fmt(status.channel.videoCount), icon: Video, color: "text-blue-400" },
                    ].map(({ label, value, icon: Icon, color }) => (
                      <div key={label} className="px-6 py-5 text-center">
                        <Icon className={`h-5 w-5 ${color} mx-auto mb-2 opacity-80`} />
                        <p className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-none">{value}</p>
                        <p className="text-xs text-white/40 mt-1.5 font-medium">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Period KPI ribbon ── */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                    Last {days} Days
                  </p>
                  {analyticsLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                    </div>
                  ) : totals && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <KpiCard label="Views" value={fmt(totals.views)} icon={Eye} iconColor="text-red-500" sub="in period" />
                      <KpiCard label="Watch Hours" value={fmt(totals.watchHours)} icon={Clock} iconColor="text-rose-500" sub="in period" />
                      <KpiCard label="Avg View Duration" value={fmtSecs(totals.avgViewDuration)} icon={Film} iconColor="text-pink-500" sub="per view" />
                      <KpiCard label="Shares" value={fmt(totals.shares)} icon={Share2} iconColor="text-orange-500" sub="in period" />
                      <KpiCard
                        label="Subscribers Gained"
                        value={`+${fmt(totals.subscribersGained)}`}
                        icon={UserPlus} iconColor="text-emerald-500"
                        sub={totals.subscribersLost > 0 ? `−${fmt(totals.subscribersLost)} lost` : "in period"}
                        trend={
                          totals.subscribersGained - totals.subscribersLost > 0
                            ? { value: `+${fmt(totals.subscribersGained - totals.subscribersLost)} net`, positive: true }
                            : totals.subscribersGained - totals.subscribersLost < 0
                            ? { value: `${fmt(totals.subscribersGained - totals.subscribersLost)} net`, positive: false }
                            : null
                        }
                      />
                      <KpiCard label="Impressions" value={fmt(totals.impressions)} icon={Eye} iconColor="text-blue-500" sub="thumbnails shown" />
                      <KpiCard label="Click-Through Rate" value={totals.ctr.toFixed(1) + "%"} icon={MousePointerClick} iconColor="text-violet-500" sub="impressions → clicks" />
                      <KpiCard label="Net Subscribers" value={(totals.subscribersGained - totals.subscribersLost >= 0 ? "+" : "") + fmt(totals.subscribersGained - totals.subscribersLost)} icon={TrendingUp} iconColor={totals.subscribersGained - totals.subscribersLost >= 0 ? "text-emerald-500" : "text-rose-500"} sub="gained minus lost" />
                    </div>
                  )}
                </div>

                {/* ── Views trend ── */}
                {analyticsLoading ? <Skeleton className="h-64 rounded-2xl" /> : chartData.length > 0 && (
                  <SectionCard title="Views Over Time" sub={`Daily views — last ${days} days`}>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={fmt} width={42} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [fmt(v), n]} />
                        <Line type="monotone" dataKey="Views" stroke="#ef4444" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </SectionCard>
                )}

                {/* ── Watch hours + Shares side by side ── */}
                {!analyticsLoading && chartData.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <SectionCard title="Watch Hours" sub={`Hours watched per day — last ${days} days`}>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={32} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Line type="monotone" dataKey="Watch Hrs" stroke="#f43f5e" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </SectionCard>
                    <SectionCard title="Shares" sub={`Content shares per day — last ${days} days`}>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Bar dataKey="Shares" fill="#f97316" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </SectionCard>
                  </div>
                )}

                {/* ── Subscriber activity ── */}
                {!analyticsLoading && chartData.length > 0 && (
                  <SectionCard title="Subscriber Activity" sub={`Gained vs. lost per day — last ${days} days`}>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} width={28} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Subs +" fill="#10b981" radius={[2, 2, 0, 0]} />
                        <Bar dataKey="Subs −" fill="#ef4444" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </SectionCard>
                )}

                {/* ── Impressions + CTR ── */}
                {!analyticsLoading && chartData.length > 0 && timeSeries.some((d) => d.impressions > 0) && (
                  <SectionCard title="Impressions & Click-Through Rate" sub={`Thumbnail shown vs. clicked — last ${days} days`}>
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart
                        data={timeSeries.map((d) => ({ date: fmtShortDate(d.date), Impressions: d.impressions, "CTR %": parseFloat(d.ctr.toFixed(2)) }))}
                        margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                        <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={fmt} width={42} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => v + "%"} width={36} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, n: string) => [n === "CTR %" ? v + "%" : fmt(v), n]} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Line yAxisId="left" type="monotone" dataKey="Impressions" stroke="#3b82f6" strokeWidth={2} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="CTR %" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </SectionCard>
                )}

                {/* ── Top 10 videos (all-time) ── */}
                {!videosLoading && videos && videos.length > 0 && (() => {
                  const top10 = [...videos].sort((a, b) => b.viewCount - a.viewCount).slice(0, 10);
                  const maxViews = top10[0]?.viewCount || 1;
                  return (
                    <SectionCard title="Top 10 Videos" sub="Ranked by all-time view count">
                      <div className="space-y-0 -mx-1">
                        {top10.map((v, i) => (
                          <a key={v.id} href={`https://youtube.com/watch?v=${v.id}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-3 px-1 py-2.5 rounded-xl hover:bg-muted/40 transition-colors group"
                            data-testid={`top-video-${i}`}>
                            <span className={`shrink-0 w-6 text-center text-sm font-bold ${i === 0 ? "text-yellow-500" : i === 1 ? "text-slate-400" : i === 2 ? "text-amber-600" : "text-muted-foreground"}`}>
                              {i + 1}
                            </span>
                            {v.thumbnail
                              ? <img src={v.thumbnail} alt="" className="shrink-0 w-16 h-10 object-cover rounded-lg" />
                              : <div className="shrink-0 w-16 h-10 bg-muted rounded-lg flex items-center justify-center"><Video className="h-3.5 w-3.5 text-muted-foreground" /></div>}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground group-hover:text-red-500 transition-colors truncate leading-snug">{v.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                  <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-rose-400"
                                    style={{ width: `${(v.viewCount / maxViews) * 100}%` }} />
                                </div>
                                <span className="text-xs text-muted-foreground shrink-0">{fmtDate(v.publishedAt)}</span>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-bold text-foreground">{fmt(v.viewCount)}</p>
                              <div className="flex items-center gap-1.5 justify-end mt-0.5">
                                <span className="text-xs text-muted-foreground flex items-center gap-0.5"><ThumbsUp className="h-2.5 w-2.5" />{fmt(v.likeCount)}</span>
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                    </SectionCard>
                  );
                })()}
                {videosLoading && <Skeleton className="h-80 rounded-2xl" />}

              </div>
            )}

            {/* ═══════════════════ VIDEOS TAB ═══════════════════ */}
            {tab === "videos" && (
              <div className="space-y-4">
                {/* Filter + sort bar */}
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Type filter */}
                    {(["all", "regular", "shorts"] as const).map((f) => {
                      const count = f === "all" ? mergedVideos.length : f === "shorts" ? shortsCount : regularCount;
                      const label = f === "all" ? "All" : f === "regular" ? "Regular" : "Shorts";
                      const icon = f === "shorts" ? <Zap className="h-3 w-3" /> : f === "regular" ? <Video className="h-3 w-3" /> : null;
                      return (
                        <button key={f} data-testid={`filter-${f}`}
                          onClick={() => { setVideoFilter(f); setVideoPage(0); setExpandedVideoId(null); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${videoFilter === f ? "bg-red-500 text-white" : "bg-muted text-muted-foreground hover:text-foreground"}`}>
                          {icon}{label}
                          <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${videoFilter === f ? "bg-white/20 text-white" : "bg-background text-muted-foreground"}`}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Canned responses button */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs gap-1.5"
                      onClick={() => setShowCannedDialog(true)}
                      data-testid="button-manage-canned">
                      <BookMarked className="h-3.5 w-3.5" />
                      Canned Responses
                      {cannedResponses.length > 0 && (
                        <span className="bg-red-500/10 text-red-500 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
                          {cannedResponses.length}
                        </span>
                      )}
                    </Button>
                    {/* Sort */}
                    <span className="text-xs text-muted-foreground hidden sm:block">Sort by</span>
                    <Select value={videoSort} onValueChange={(v) => { setVideoSort(v as SortKey); setVideoPage(0); }}>
                      <SelectTrigger className="w-40 h-8 text-xs" data-testid="select-video-sort"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="views">Views</SelectItem>
                        <SelectItem value="watchTime">Watch Time</SelectItem>
                        <SelectItem value="retention">Avg Retention</SelectItem>
                        <SelectItem value="engagement">Engagement Rate</SelectItem>
                        <SelectItem value="shares">Shares</SelectItem>
                        <SelectItem value="date">Publish Date</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Status line */}
                {!videosLoading && mergedVideos.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Showing {videoPage * VIDEOS_PER_PAGE + 1}–{Math.min((videoPage + 1) * VIDEOS_PER_PAGE, filteredSortedVideos.length)} of {filteredSortedVideos.length} {videoFilter !== "all" ? videoFilter : ""} video{filteredSortedVideos.length !== 1 ? "s" : ""}
                    {videoAnalytics?.length ? ` · analytics for last ${days} days` : ""}
                    {expandedVideoId && " · click a row to expand"}
                  </p>
                )}

                {(videosLoading || videoAnalyticsLoading) ? (
                  <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
                ) : filteredSortedVideos.length === 0 ? (
                  <Card className="border-border bg-card"><CardContent className="p-8 text-center">
                    <Video className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">
                      {mergedVideos.length === 0 ? "No videos found on this channel." : `No ${videoFilter} videos found.`}
                    </p>
                  </CardContent></Card>
                ) : (
                  <>
                    <Card className="border-border bg-card overflow-hidden">
                      <div className="h-1 w-full bg-gradient-to-r from-red-500 to-rose-600" />
                      <CardContent className="p-0">
                        {/* Desktop column headers */}
                        <div className="hidden lg:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-2 px-5 py-2.5 border-b border-border bg-muted/30">
                          <span className="text-xs font-medium text-muted-foreground">Video</span>
                          <span className="text-xs font-medium text-muted-foreground text-right">Views · Likes · Shares</span>
                          <span className="text-xs font-medium text-muted-foreground text-right">Watch Time</span>
                          <span className="text-xs font-medium text-muted-foreground text-right">Avg Duration</span>
                          <span className="text-xs font-medium text-muted-foreground text-right">Retention</span>
                          <span className="text-xs font-medium text-muted-foreground text-right">Engagement</span>
                          <span className="w-6" />
                        </div>
                        <div className="divide-y divide-border">
                          {pagedVideos.map((v) => {
                            const engRate = v.viewCount > 0 ? ((v.likeCount + v.commentCount) / v.viewCount * 100) : 0;
                            const hasAnalytics = v.watchMinutes !== undefined;
                            const ret = v.avgViewPercentage || 0;
                            const isExpanded = expandedVideoId === v.id;
                            return (
                              <Fragment key={v.id}>
                                {/* Video row */}
                                <div
                                  className={`flex lg:grid lg:grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 lg:gap-2 px-5 py-3.5 items-center cursor-pointer transition-colors ${isExpanded ? "bg-red-500/5 border-l-2 border-l-red-500" : "hover:bg-muted/20"}`}
                                  onClick={() => toggleExpand(v.id)}
                                  data-testid={`video-row-${v.id}`}>
                                  {/* Thumbnail + title */}
                                  <div className="flex items-center gap-3 min-w-0">
                                    <div className="shrink-0 relative group/thumb">
                                      {v.thumbnail
                                        ? <img src={v.thumbnail} alt="" className="w-20 h-12 object-cover rounded-lg" />
                                        : <div className="w-20 h-12 bg-muted rounded-lg flex items-center justify-center"><Video className="h-4 w-4 text-muted-foreground" /></div>}
                                      {/* Play overlay hint */}
                                      <div className={`absolute inset-0 rounded-lg flex items-center justify-center bg-black/40 transition-opacity ${isExpanded ? "opacity-100" : "opacity-0 group-hover/thumb:opacity-100"}`}>
                                        <div className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center">
                                          <div className="w-0 h-0 border-y-[5px] border-y-transparent border-l-[8px] border-l-red-500 ml-0.5" />
                                        </div>
                                      </div>
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{v.title}</p>
                                        {v.isShort && (
                                          <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-500 border border-amber-500/20">
                                            <Zap className="h-2.5 w-2.5" />Short
                                          </span>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-muted-foreground">{fmtDate(v.publishedAt)}</span>
                                        {v.duration && <span className="text-xs text-muted-foreground">{parseDuration(v.duration)}</span>}
                                        {/* Open in YouTube link */}
                                        <a
                                          href={`https://youtube.com/watch?v=${v.id}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-muted-foreground/50 hover:text-red-500 transition-colors"
                                          onClick={(e) => e.stopPropagation()}
                                          data-testid={`link-open-youtube-${v.id}`}>
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      </div>
                                      {/* Mobile stats */}
                                      <div className="flex flex-wrap gap-3 mt-1 lg:hidden text-xs text-muted-foreground">
                                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{fmt(v.viewCount)}</span>
                                        <span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3" />{fmt(v.likeCount)}</span>
                                        <span className="flex items-center gap-1"><Share2 className="h-3 w-3" />{fmt(v.shares || 0)}</span>
                                        {hasAnalytics && ret > 0 && <span>{ret.toFixed(0)}% retained</span>}
                                      </div>
                                    </div>
                                  </div>
                                  {/* Desktop columns */}
                                  <div className="hidden lg:block text-right">
                                    <p className="text-sm font-semibold text-foreground">{fmt(v.viewCount)}</p>
                                    <div className="flex items-center justify-end gap-2 mt-0.5">
                                      <span className="text-xs text-muted-foreground flex items-center gap-0.5"><ThumbsUp className="h-2.5 w-2.5" />{fmt(v.likeCount)}</span>
                                      <span className="text-xs text-muted-foreground flex items-center gap-0.5"><MessageSquare className="h-2.5 w-2.5" />{fmt(v.commentCount)}</span>
                                      <span className="text-xs text-orange-500 flex items-center gap-0.5"><Share2 className="h-2.5 w-2.5" />{fmt(v.shares || 0)}</span>
                                    </div>
                                  </div>
                                  <div className="hidden lg:block text-right">
                                    {hasAnalytics && v.watchMinutes
                                      ? <p className="text-sm font-medium text-foreground">{fmtWatchMins(v.watchMinutes)}</p>
                                      : <p className="text-sm text-muted-foreground">—</p>}
                                  </div>
                                  <div className="hidden lg:block text-right">
                                    {hasAnalytics && v.avgViewDuration
                                      ? <p className="text-sm font-medium text-foreground">{fmtSecs(v.avgViewDuration)}</p>
                                      : <p className="text-sm text-muted-foreground">—</p>}
                                  </div>
                                  <div className="hidden lg:block text-right">
                                    {hasAnalytics && ret > 0 ? (
                                      <div>
                                        <p className={`text-sm font-semibold ${ret >= 50 ? "text-emerald-500" : ret >= 30 ? "text-amber-500" : "text-rose-500"}`}>{ret.toFixed(1)}%</p>
                                        <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
                                          <div className={`h-full rounded-full ${ret >= 50 ? "bg-emerald-500" : ret >= 30 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${Math.min(ret, 100)}%` }} />
                                        </div>
                                      </div>
                                    ) : <p className="text-sm text-muted-foreground">—</p>}
                                  </div>
                                  <div className="hidden lg:block text-right">
                                    {v.viewCount > 0
                                      ? <p className="text-sm font-medium text-foreground">{engRate.toFixed(2)}%</p>
                                      : <p className="text-sm text-muted-foreground">—</p>}
                                  </div>
                                  {/* Expand chevron */}
                                  <div className="hidden lg:flex items-center justify-center w-6">
                                    {isExpanded
                                      ? <ChevronUp className="h-4 w-4 text-red-500" />
                                      : <ChevronDown className="h-4 w-4 text-muted-foreground/50" />}
                                  </div>
                                </div>

                                {/* Expanded panel */}
                                {isExpanded && (
                                  <VideoExpandPanel
                                    video={v}
                                    channelId={status.channel?.id || ""}
                                    cannedResponses={cannedResponses}
                                    onClose={() => setExpandedVideoId(null)}
                                  />
                                )}
                              </Fragment>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between">
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
                          onClick={() => { setVideoPage((p) => Math.max(0, p - 1)); setExpandedVideoId(null); }}
                          disabled={videoPage === 0} data-testid="button-prev-page">
                          <ChevronLeft className="h-3.5 w-3.5" />Previous
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          Page {videoPage + 1} of {totalPages}
                        </span>
                        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5"
                          onClick={() => { setVideoPage((p) => Math.min(totalPages - 1, p + 1)); setExpandedVideoId(null); }}
                          disabled={videoPage === totalPages - 1} data-testid="button-next-page">
                          Next<ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ═══════════════════ AUDIENCE TAB ═══════════════════ */}
            {tab === "audience" && (
              <div className="space-y-5">
                {breakdownsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}
                  </div>
                ) : !breakdowns ? (
                  <ReconnectBanner onConnect={() => { window.location.href = "/api/analytics/youtube/connect"; }} />
                ) : (
                  <>
                    {/* ── Subscriber vs Non-Subscriber ── */}
                    {(breakdowns.subscriberStatus?.subscribedViews > 0 || breakdowns.subscriberStatus?.nonSubscribedViews > 0) && (() => {
                      const ss = breakdowns.subscriberStatus;
                      const totalViews = ss.subscribedViews + ss.nonSubscribedViews;
                      const subPct = totalViews > 0 ? Math.round(ss.subscribedViews / totalViews * 100) : 0;
                      const nonSubPct = 100 - subPct;
                      return (
                        <SectionCard title="Subscriber Insights" sub={`Who's watching — subscribers vs. new viewers — last ${days} days`}>
                          <div className="h-3 rounded-full overflow-hidden flex mb-5">
                            <div className="bg-emerald-500 h-full transition-all" style={{ width: `${subPct}%` }} />
                            <div className="bg-blue-400 h-full transition-all" style={{ width: `${nonSubPct}%` }} />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                <span className="text-xs font-medium text-muted-foreground">Subscribers</span>
                              </div>
                              <p className="text-3xl font-bold text-foreground">{subPct}%</p>
                              <div className="mt-2 space-y-0.5">
                                <p className="text-xs text-muted-foreground">{fmt(ss.subscribedViews)} views</p>
                                <p className="text-xs text-muted-foreground">{fmtWatchMins(ss.subscribedWatchMinutes)} watched</p>
                              </div>
                            </div>
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                                <span className="text-xs font-medium text-muted-foreground">New Viewers</span>
                              </div>
                              <p className="text-3xl font-bold text-foreground">{nonSubPct}%</p>
                              <div className="mt-2 space-y-0.5">
                                <p className="text-xs text-muted-foreground">{fmt(ss.nonSubscribedViews)} views</p>
                                <p className="text-xs text-muted-foreground">{fmtWatchMins(ss.nonSubscribedWatchMinutes)} watched</p>
                              </div>
                            </div>
                          </div>
                        </SectionCard>
                      );
                    })()}

                    {/* ── Demographics ── */}
                    {(breakdowns.demographics?.ageGroups?.length > 0 || breakdowns.demographics?.genderMalePct > 0) && (
                      <SectionCard title="Viewer Demographics" sub={`Age and gender breakdown — last ${days} days`}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {breakdowns.demographics.ageGroups.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Age Groups</p>
                              <div className="space-y-2.5">
                                {breakdowns.demographics.ageGroups.map((ag) => (
                                  <div key={ag.age}>
                                    <div className="flex items-center justify-between text-xs mb-1">
                                      <span className="font-medium text-foreground w-12">{ag.label}</span>
                                      <div className="flex-1 mx-3">
                                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                                          <div className="h-full rounded-full bg-violet-500" style={{ width: `${ag.pct}%` }} />
                                        </div>
                                      </div>
                                      <span className="text-muted-foreground w-10 text-right">{ag.pct.toFixed(0)}%</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {(breakdowns.demographics.genderMalePct > 0 || breakdowns.demographics.genderFemalePct > 0) && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Gender</p>
                              <div className="space-y-4">
                                <div>
                                  <div className="h-3 rounded-full overflow-hidden flex mb-2">
                                    <div className="bg-blue-500 h-full" style={{ width: `${breakdowns.demographics.genderMalePct}%` }} />
                                    <div className="bg-pink-400 h-full" style={{ width: `${breakdowns.demographics.genderFemalePct}%` }} />
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                                      <span className="text-sm text-foreground font-medium">Male</span>
                                    </div>
                                    <span className="text-2xl font-bold text-foreground">{breakdowns.demographics.genderMalePct.toFixed(0)}%</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2.5 h-2.5 rounded-full bg-pink-400" />
                                      <span className="text-sm text-foreground font-medium">Female</span>
                                    </div>
                                    <span className="text-2xl font-bold text-foreground">{breakdowns.demographics.genderFemalePct.toFixed(0)}%</span>
                                  </div>
                                  {breakdowns.demographics.genderMalePct + breakdowns.demographics.genderFemalePct < 98 && (
                                    <p className="text-xs text-muted-foreground">Remaining {(100 - breakdowns.demographics.genderMalePct - breakdowns.demographics.genderFemalePct).toFixed(0)}% unspecified</p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </SectionCard>
                    )}

                    {/* ── Traffic Sources ── */}
                    {breakdowns.traffic.length > 0 && (() => {
                      const total = breakdowns.traffic.reduce((s, t) => s + t.views, 0);
                      return (
                        <SectionCard title="Traffic Sources" sub={`Where viewers found your videos — last ${days} days`}>
                          <div className="space-y-3">
                            {breakdowns.traffic.map((t) => (
                              <div key={t.source}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="font-medium text-foreground">{t.label}</span>
                                  <span className="text-muted-foreground">{fmt(t.views)} · {total > 0 ? Math.round(t.views / total * 100) : 0}%</span>
                                </div>
                                <PercentBar value={t.views} total={total} color="bg-red-500" />
                              </div>
                            ))}
                          </div>
                        </SectionCard>
                      );
                    })()}

                    {/* ── Top Search Terms ── */}
                    {breakdowns.searchTerms?.length > 0 && (() => {
                      const maxViews = breakdowns.searchTerms[0]?.views || 1;
                      return (
                        <SectionCard title="Top YouTube Search Terms" sub={`Exact queries people typed to find your videos — last ${days} days`}>
                          <div className="space-y-2.5">
                            {breakdowns.searchTerms.map((st, i) => (
                              <div key={i}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="font-medium text-foreground flex items-center gap-2">
                                    <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                                    {st.term}
                                  </span>
                                  <span className="text-muted-foreground shrink-0 ml-3">{fmt(st.views)} views</span>
                                </div>
                                <PercentBar value={st.views} total={maxViews} color="bg-emerald-500" />
                              </div>
                            ))}
                          </div>
                        </SectionCard>
                      );
                    })()}

                    {/* ── Device breakdown ── */}
                    {breakdowns.devices?.length > 0 && (() => {
                      const totalDeviceViews = breakdowns.devices.reduce((s, d) => s + d.views, 0);
                      return (
                        <SectionCard title="Device Types" sub={`How viewers watch — last ${days} days`}>
                          <div className="space-y-3">
                            {breakdowns.devices.map((d) => (
                              <div key={d.device}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="font-medium text-foreground">{d.label}</span>
                                  <span className="text-muted-foreground">{fmt(d.views)} · {d.pct.toFixed(0)}%</span>
                                </div>
                                <PercentBar value={d.views} total={totalDeviceViews} color="bg-blue-500" />
                              </div>
                            ))}
                          </div>
                        </SectionCard>
                      );
                    })()}

                    {/* ── Top Countries ── */}
                    {breakdowns.countries?.length > 0 && (() => {
                      const maxCountryViews = breakdowns.countries[0]?.views || 1;
                      return (
                        <SectionCard title="Top Countries" sub={`Geographic distribution — last ${days} days`}>
                          <div className="space-y-2.5">
                            {breakdowns.countries.slice(0, 10).map((c, i) => (
                              <div key={c.country}>
                                <div className="flex items-center justify-between text-xs mb-1">
                                  <span className="font-medium text-foreground flex items-center gap-2">
                                    <span className="text-muted-foreground w-4 text-center shrink-0">{i + 1}</span>
                                    {c.country}
                                  </span>
                                  <span className="text-muted-foreground shrink-0 ml-3">{fmt(c.views)} views · {fmtWatchMins(c.watchMinutes)}</span>
                                </div>
                                <PercentBar value={c.views} total={maxCountryViews} color="bg-orange-500" />
                              </div>
                            ))}
                          </div>
                        </SectionCard>
                      );
                    })()}
                  </>
                )}
              </div>
            )}

            {/* ═══════════════════ BULK EDIT TAB ═══════════════════ */}
            {tab === "bulk" && status?.isAdmin && (
              <div className="space-y-5">
                <BulkEditTab />
              </div>
            )}

            {/* ═══════════════════ COMMENTS TAB ═══════════════════ */}
            {tab === "comments" && (
              <div className="space-y-5">
                {videosLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="border border-border rounded-2xl p-4 space-y-3">
                        <Skeleton className="h-7 w-48 rounded-full" />
                        <div className="flex gap-2.5">
                          <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                          <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-3 w-32" />
                            <Skeleton className="h-3 w-full" />
                            <Skeleton className="h-3 w-3/4" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !videos ? (
                  <ReconnectBanner onConnect={() => { window.location.href = "/api/analytics/youtube/connect"; }} />
                ) : (
                  <CommentsTab
                    videos={videos}
                    channelId={status?.channelId || ""}
                    cannedResponses={cannedResponses}
                  />
                )}
              </div>
            )}

          </div>
        )}
      </div>

      {/* Canned Responses Dialog */}
      <CannedResponsesDialog open={showCannedDialog} onOpenChange={setShowCannedDialog} />
    </div>
  );
}
