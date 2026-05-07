import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronUp,
  Plus,
  Loader2,
  MessageSquare,
  Bug,
  Lightbulb,
  CheckCircle2,
  Clock,
  Rocket,
  X,
  ArrowLeft,
  Send,
  Lock,
  ImagePlus,
  ZoomIn,
} from "lucide-react";
import { format } from "date-fns";
import type { FeedbackPostWithMeta, FeedbackCommentWithUser } from "@shared/schema";

type FeedbackPostDetail = FeedbackPostWithMeta & { comments: FeedbackCommentWithUser[] };

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open: { label: "Open", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300", icon: <Clock className="h-3 w-3" /> },
  under_review: { label: "Under Review", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300", icon: <Clock className="h-3 w-3" /> },
  planned: { label: "Planned", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300", icon: <Rocket className="h-3 w-3" /> },
  in_progress: { label: "In Progress", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300", icon: <Loader2 className="h-3 w-3" /> },
  completed: { label: "Completed", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", icon: <CheckCircle2 className="h-3 w-3" /> },
  resolved: { label: "Resolved", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", icon: <CheckCircle2 className="h-3 w-3" /> },
  closed: { label: "Closed", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400", icon: <X className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "bg-gray-100 text-gray-600", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function VoteButton({
  post,
  onVote,
  isPending,
}: {
  post: FeedbackPostWithMeta;
  onVote: (id: string) => void;
  isPending: boolean;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onVote(post.id); }}
      disabled={isPending}
      data-testid={`button-vote-${post.id}`}
      className={`flex flex-col items-center justify-center gap-0.5 w-14 min-h-[56px] rounded-lg border-2 transition-colors
        ${post.hasVoted
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
        }`}
    >
      <ChevronUp className={`h-4 w-4 ${isPending ? "animate-bounce" : ""}`} />
      <span className="text-sm font-bold leading-none">{post.voteCount}</span>
    </button>
  );
}

function PostCard({
  post,
  onVote,
  votingId,
  onClick,
}: {
  post: FeedbackPostWithMeta;
  onVote: (id: string) => void;
  votingId: string | null;
  onClick: (post: FeedbackPostWithMeta) => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onClick(post)}
      data-testid={`card-feedback-${post.id}`}
    >
      <CardContent className="p-4 flex gap-4 items-start">
        {post.type === "feature" && (
          <VoteButton post={post} onVote={onVote} isPending={votingId === post.id} />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 flex-wrap">
            <h3 className="font-semibold text-base leading-snug flex-1 min-w-0" data-testid={`text-post-title-${post.id}`}>
              {post.title}
            </h3>
            <StatusBadge status={post.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{post.description}</p>
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground/70">Posted by {post.userName}</span>
            <span>·</span>
            <span>{format(new Date(post.createdAt), "MMM d, yyyy")}</span>
            {post.commentCount > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}
                </span>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const FEEDBACK_STATUS_OPTIONS: Record<string, string[]> = {
  feature: ["open", "under_review", "planned", "in_progress", "completed", "closed"],
  bug: ["open", "under_review", "in_progress", "resolved", "closed"],
};

function PostDetailView({
  post,
  onBack,
  isAdmin,
  onLightbox,
}: {
  post: FeedbackPostDetail;
  onBack: () => void;
  isAdmin: boolean;
  onLightbox?: (src: string) => void;
}) {
  const { toast } = useToast();
  const [commentBody, setCommentBody] = useState("");
  const [isAdminNote, setIsAdminNote] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);

  const statusOptions = FEEDBACK_STATUS_OPTIONS[post.type] ?? ["open", "closed"];

  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      apiRequest("PATCH", `/api/feedback/${post.id}`, { status: newStatus }),
    onSuccess: () => {
      setPendingStatus(null);
      toast({ title: "Status updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback", post.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
    },
    onError: () => {
      setPendingStatus(null);
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });

  const commentMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/feedback/${post.id}/comments`, { body: commentBody, isAdminNote }),
    onSuccess: () => {
      setCommentBody("");
      setIsAdminNote(false);
      queryClient.invalidateQueries({ queryKey: ["/api/feedback", post.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
    },
    onError: () => toast({ title: "Failed to post comment", variant: "destructive" }),
  });

  const voteMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/feedback/${post.id}/vote`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feedback", post.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
    },
    onError: () => toast({ title: "Failed to toggle vote", variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="button-back-to-list">
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
      </div>

      {isAdmin && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-muted/40 px-4 py-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mr-1">Set status:</span>
          {statusOptions.map((s) => {
            const cfg = STATUS_CONFIG[s] ?? { label: s, color: "bg-gray-100 text-gray-600", icon: null };
            const isCurrent = (pendingStatus ?? post.status) === s;
            return (
              <button
                key={s}
                onClick={() => {
                  if (s === post.status) return;
                  setPendingStatus(s);
                  updateStatusMutation.mutate(s);
                }}
                disabled={updateStatusMutation.isPending}
                data-testid={`button-set-status-${s}`}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all border
                  ${isCurrent
                    ? `${cfg.color} border-current opacity-100 ring-2 ring-offset-1 ring-current`
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
              >
                {updateStatusMutation.isPending && pendingStatus === s
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : cfg.icon}
                {cfg.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-4 items-start">
        {post.type === "feature" && (
          <button
            onClick={() => voteMutation.mutate()}
            disabled={voteMutation.isPending}
            data-testid="button-vote-detail"
            className={`flex flex-col items-center justify-center gap-0.5 w-14 min-h-[56px] rounded-lg border-2 transition-colors shrink-0
              ${post.hasVoted
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"
              }`}
          >
            <ChevronUp className="h-4 w-4" />
            <span className="text-sm font-bold leading-none">{post.voteCount}</span>
          </button>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-xl font-bold">{post.title}</h1>
            <StatusBadge status={post.status} />
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            Submitted by {post.userName} · {format(new Date(post.createdAt), "MMM d, yyyy")}
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{post.description}</p>
          {post.screenshotPath && (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Attached Screenshot</p>
              <img
                src={`/api/feedback-screenshots/${post.screenshotPath.replace("feedback-screenshots/", "")}`}
                alt="Bug report screenshot"
                className="rounded-lg border max-h-64 object-contain cursor-zoom-in"
                onClick={() => onLightbox?.(`/api/feedback-screenshots/${post.screenshotPath!.replace("feedback-screenshots/", "")}`)}
                data-testid="img-post-screenshot"
              />
            </div>
          )}
        </div>
      </div>

      {post.adminResponse && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-xs font-semibold text-primary mb-1">Official Response</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{post.adminResponse}</p>
        </div>
      )}

      <div className="space-y-3">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Comments ({post.comments.length})
        </h2>
        {post.comments.length === 0 && (
          <p className="text-sm text-muted-foreground">No comments yet. Be the first!</p>
        )}
        {post.comments.map((c) => (
          <div
            key={c.id}
            className={`rounded-lg p-3 text-sm ${
              c.isAdminNote
                ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700"
                : "bg-muted"
            }`}
            data-testid={`comment-${c.id}`}
          >
            {c.isAdminNote && (
              <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 mb-1 flex items-center gap-1">
                <Lock className="h-3 w-3" /> Admin Note (visible to admins only)
              </p>
            )}
            <p className="whitespace-pre-wrap">{c.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {c.userName} · {format(new Date(c.createdAt), "MMM d, yyyy 'at' h:mm a")}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-t pt-4">
        <Textarea
          placeholder="Add a comment..."
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          className="min-h-[80px]"
          data-testid="input-comment-body"
        />
        <div className="flex items-center justify-between">
          {isAdmin && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={isAdminNote}
                onChange={(e) => setIsAdminNote(e.target.checked)}
                data-testid="checkbox-admin-note"
              />
              Admin note (private)
            </label>
          )}
          <div className="ml-auto">
            <Button
              size="sm"
              onClick={() => commentMutation.mutate()}
              disabled={!commentBody.trim() || commentMutation.isPending}
              data-testid="button-submit-comment"
            >
              {commentMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4 mr-1" /> Comment
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("feature");
  const [statusFilter, setStatusFilter] = useState("all");
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitType, setSubmitType] = useState<"feature" | "bug">("feature");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("post");
  });
  const [votingId, setVotingId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const postParam = params.get("post");
    if (postParam) setSelectedPostId(postParam);
  }, []);
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const isAdmin = !!user?.isAdmin;

  const { data: posts = [], isLoading } = useQuery<FeedbackPostWithMeta[]>({
    queryKey: ["/api/feedback", activeTab, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ type: activeTab });
      if (statusFilter !== "all") params.set("status", statusFilter);
      return fetch(`/api/feedback?${params}`, { credentials: "include" }).then((r) => r.json());
    },
  });

  const { data: selectedPost, isLoading: detailLoading } = useQuery<FeedbackPostDetail>({
    queryKey: ["/api/feedback", selectedPostId],
    queryFn: () =>
      fetch(`/api/feedback/${selectedPostId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!selectedPostId,
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("description", description);
      formData.append("type", submitType);
      if (screenshotFile && submitType === "bug") formData.append("screenshot", screenshotFile);
      return fetch("/api/feedback", {
        method: "POST",
        credentials: "include",
        body: formData,
      }).then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json();
      });
    },
    onSuccess: () => {
      toast({ title: "Submitted! Thank you for your feedback." });
      setSubmitOpen(false);
      setTitle("");
      setDescription("");
      setScreenshotFile(null);
      setScreenshotPreview(null);
      queryClient.invalidateQueries({ queryKey: ["/api/feedback"] });
    },
    onError: () => toast({ title: "Failed to submit. Please try again.", variant: "destructive" }),
  });

  const voteMutation = useMutation({
    mutationFn: (postId: string) => apiRequest("POST", `/api/feedback/${postId}/vote`),
    onMutate: (postId) => setVotingId(postId),
    onSettled: () => setVotingId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/feedback"] }),
    onError: () => toast({ title: "Failed to toggle vote", variant: "destructive" }),
  });

  const openSubmit = (type: "feature" | "bug") => {
    setSubmitType(type);
    setSubmitOpen(true);
  };

  const featureStatuses = ["all", "open", "under_review", "planned", "in_progress", "completed", "closed"];
  const bugStatuses = ["all", "open", "under_review", "resolved", "closed"];

  if (selectedPostId) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        {detailLoading || !selectedPost ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <PostDetailView
            post={selectedPost}
            onBack={() => setSelectedPostId(null)}
            isAdmin={isAdmin}
            onLightbox={setLightboxSrc}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-feedback-title">
            Bug Reports &amp; Feature Requests
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Report a problem or suggest a new feature. Vote on ideas you'd like to see built.
          </p>
        </div>
        <Button onClick={() => openSubmit(activeTab === "feature" ? "feature" : "bug")} data-testid="button-new-feedback">
          <Plus className="h-4 w-4 mr-1" />
          {activeTab === "feature" ? "Request a Feature" : "Report a Bug"}
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => { setActiveTab(v); setStatusFilter("all"); }}
        className="space-y-4"
      >
        <TabsList data-testid="tabs-feedback">
          <TabsTrigger value="feature" data-testid="tab-features">
            <Lightbulb className="h-4 w-4 mr-1.5" />
            Feature Requests
          </TabsTrigger>
          <TabsTrigger value="bug" data-testid="tab-bugs">
            <Bug className="h-4 w-4 mr-1.5" />
            Bug Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feature" className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filter:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 h-8 text-sm" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {featureStatuses.map((s) => (
                  <SelectItem key={s} value={s} data-testid={`filter-${s}`}>
                    {s === "all" ? "All Statuses" : STATUS_CONFIG[s]?.label ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground ml-auto">
              {posts.length} {posts.length === 1 ? "request" : "requests"}
            </span>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Lightbulb className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground">No feature requests yet.</p>
              <Button variant="outline" size="sm" onClick={() => openSubmit("feature")} data-testid="button-first-feature">
                Be the first to suggest one
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onVote={(id) => voteMutation.mutate(id)}
                  votingId={votingId}
                  onClick={(p) => setSelectedPostId(p.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="bug" className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filter:</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 h-8 text-sm" data-testid="select-bug-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {bugStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s === "all" ? "All Statuses" : STATUS_CONFIG[s]?.label ?? s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isAdmin && (
              <span className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                <Lock className="h-3 w-3" /> Showing your reports only
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Bug className="h-10 w-10 mx-auto text-muted-foreground/50" />
              <p className="text-muted-foreground">No bug reports yet.</p>
              <Button variant="outline" size="sm" onClick={() => openSubmit("bug")} data-testid="button-first-bug">
                Report a bug
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onVote={(id) => voteMutation.mutate(id)}
                  votingId={votingId}
                  onClick={(p) => setSelectedPostId(p.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={submitOpen} onOpenChange={(open) => { setSubmitOpen(open); if (!open) { setScreenshotFile(null); setScreenshotPreview(null); } }}>
        <DialogContent className="sm:max-w-lg" data-testid="dialog-submit-feedback">
          <DialogHeader>
            <DialogTitle>
              {submitType === "feature" ? (
                <span className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-yellow-500" /> Request a Feature
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Bug className="h-5 w-5 text-red-500" /> Report a Bug
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {submitType === "feature"
                ? "Describe the feature you'd like to see. Be as specific as possible — it helps us understand the use case."
                : "Describe what happened, what you expected, and the steps to reproduce it."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={submitType === "feature" ? "default" : "outline"}
                onClick={() => setSubmitType("feature")}
                data-testid="button-type-feature"
              >
                <Lightbulb className="h-3.5 w-3.5 mr-1" /> Feature
              </Button>
              <Button
                size="sm"
                variant={submitType === "bug" ? "default" : "outline"}
                onClick={() => setSubmitType("bug")}
                data-testid="button-type-bug"
              >
                <Bug className="h-3.5 w-3.5 mr-1" /> Bug
              </Button>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Title</label>
              <Input
                placeholder={submitType === "feature" ? "e.g. Ability to export DMO data to CSV" : "e.g. Video upload fails on Safari"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                data-testid="input-feedback-title"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">
                {submitType === "feature" ? "Description" : "What happened?"}
              </label>
              <Textarea
                placeholder={
                  submitType === "feature"
                    ? "Describe the feature and why it would be helpful..."
                    : "Describe the bug, steps to reproduce it, and what you expected to happen..."
                }
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="min-h-[120px]"
                data-testid="input-feedback-description"
              />
            </div>

            {submitType === "bug" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <ImagePlus className="h-4 w-4 text-muted-foreground" />
                  Screenshot <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                {screenshotPreview ? (
                  <div className="relative inline-block">
                    <img
                      src={screenshotPreview}
                      alt="Screenshot preview"
                      className="rounded-lg border max-h-48 object-contain cursor-pointer"
                      onClick={() => setLightboxSrc(screenshotPreview)}
                    />
                    <button
                      type="button"
                      onClick={() => { setScreenshotFile(null); setScreenshotPreview(null); }}
                      className="absolute -top-2 -right-2 bg-background border rounded-full p-0.5 hover:bg-muted"
                      data-testid="button-remove-screenshot"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label
                    className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-4 cursor-pointer hover:bg-muted/40 transition-colors text-muted-foreground text-sm"
                    data-testid="label-screenshot-upload"
                  >
                    <ImagePlus className="h-6 w-6" />
                    <span>Click to attach a screenshot (PNG, JPG, GIF — max 5MB)</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      data-testid="input-screenshot-file"
                      onChange={(e) => {
                        const file = e.target.files?.[0] ?? null;
                        setScreenshotFile(file);
                        if (file) {
                          const url = URL.createObjectURL(file);
                          setScreenshotPreview(url);
                        } else {
                          setScreenshotPreview(null);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setSubmitOpen(false); setScreenshotFile(null); setScreenshotPreview(null); }} data-testid="button-cancel-feedback">
              Cancel
            </Button>
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={!title.trim() || !description.trim() || submitMutation.isPending}
              data-testid="button-submit-feedback"
            >
              {submitMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Submit"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxSrc(null)}
          data-testid="lightbox-overlay"
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300"
            onClick={() => setLightboxSrc(null)}
            data-testid="button-close-lightbox"
          >
            <X className="h-7 w-7" />
          </button>
          <img
            src={lightboxSrc}
            alt="Screenshot"
            className="max-w-full max-h-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
