import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import Player from "@vimeo/player";
import DOMPurify from "dompurify";
import { ArrowLeft, CheckCircle2, ChevronDown, Clock, CornerDownRight, ExternalLink, FileText, Loader2, MessageCircle, Play, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TrainingResourceIcon } from "@/components/training-resource-icon";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { formatTranscriptParagraphs } from "@shared/transcript-format";

type Resource = { id: string; name: string; url: string; subtitle?: string | null; kind?: string };
type Chapter = { startSeconds: number; title: string };
type Cue = { startSeconds: number; text: string };
type ReplayComment = {
  id: string;
  replayId: string;
  userId: string;
  parentCommentId?: string | null;
  body: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  canEdit?: boolean;
};
type Replay = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  durationMinutes?: number | null;
  videoUrl?: string | null;
  content?: string | null;
  resources?: Resource[];
  transcriptText?: string | null;
  transcriptCues?: Cue[];
  transcriptChapters?: Chapter[];
  comments?: ReplayComment[];
  completed?: boolean;
  completedAt?: string | null;
};

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "include", ...init });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(payload?.message || "This replay is not available.");
  }
  return response.json();
}

function safeHref(url: string) {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "https:" || protocol === "http:" ? url : "#";
  } catch {
    return "#";
  }
}

function formatTimestamp(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = String(total % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${remaining}`
    : `${minutes}:${remaining}`;
}

function formatCommentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(date);
}

function getEmbedUrl(videoUrl?: string | null) {
  if (!videoUrl) return null;
  try {
    const url = new URL(videoUrl);
    if (url.hostname.includes("vimeo.com")) {
      const videoId = url.pathname.match(/(?:^|\/)(?:video\/)?(\d+)(?:\/|$)/)?.[1];
      if (!videoId) return null;
      const params = new URLSearchParams(url.search);
      params.set("api", "1");
      return `https://player.vimeo.com/video/${videoId}?${params.toString()}`;
    }
    if (url.hostname.includes("youtube.com")) {
      const videoId = url.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }
    if (url.hostname.includes("youtu.be")) {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}` : null;
    }
    return null;
  } catch {
    return null;
  }
}

export default function TrainingReplayPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, go] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: replay, isLoading, isError } = useQuery<Replay>({
    queryKey: ["/api/training/replays", slug],
    queryFn: () => api(`/api/training/replays/${slug}`),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const [commentBody, setCommentBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const completionMutation = useMutation({
    mutationFn: (completed: boolean) => api(`/api/training/replays/${slug}/progress`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed }),
    }),
    onMutate: async (completed: boolean) => {
      await queryClient.cancelQueries({ queryKey: ["/api/training/replays", slug] });
      const previous = queryClient.getQueryData<Replay>(["/api/training/replays", slug]);
      queryClient.setQueryData<Replay>(["/api/training/replays", slug], (current) =>
        current ? { ...current, completed, completedAt: completed ? new Date().toISOString() : null } : current,
      );
      return { previous };
    },
    onError: (error: Error, _completed, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/training/replays", slug], context.previous);
      }
      toast({ title: "Couldn’t update completion", description: error.message, variant: "destructive" });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/training/replays", slug] });
      void queryClient.invalidateQueries({ queryKey: ["/api/training/library"] });
    },
  });
  const commentMutation = useMutation({
    mutationFn: (input: { body: string; parentCommentId?: string | null }): Promise<ReplayComment> => api(`/api/training/replays/${slug}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    onSuccess: (comment, input) => {
      queryClient.setQueryData<Replay>(["/api/training/replays", slug], (current) =>
        current ? { ...current, comments: [...(current.comments || []), comment] } : current,
      );
      if (input.parentCommentId) {
        setReplyBody("");
        setReplyingTo(null);
      } else {
        setCommentBody("");
      }
    },
    onError: (error: Error) => {
      toast({ title: "Couldn’t post comment", description: error.message, variant: "destructive" });
    },
  });
  const editCommentMutation = useMutation({
    mutationFn: (input: { commentId: string; body: string }): Promise<ReplayComment> =>
      api(`/api/training/replays/${slug}/comments/${input.commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: input.body }),
      }),
    onSuccess: (comment) => {
      queryClient.setQueryData<Replay>(["/api/training/replays", slug], (current) =>
        current
          ? { ...current, comments: (current.comments || []).map((item) => item.id === comment.id ? comment : item) }
          : current,
      );
      setEditingCommentId(null);
      setEditBody("");
    },
    onError: (error: Error) => {
      toast({ title: "Couldn’t edit comment", description: error.message, variant: "destructive" });
    },
  });
  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: string): Promise<{ comments: ReplayComment[] }> =>
      api(`/api/training/replays/${slug}/comments/${commentId}`, { method: "DELETE" }),
    onSuccess: ({ comments }) => {
      queryClient.setQueryData<Replay>(["/api/training/replays", slug], (current) =>
        current ? { ...current, comments } : current,
      );
      setConfirmDeleteId(null);
      setEditingCommentId(null);
      setReplyingTo(null);
    },
    onError: (error: Error) => {
      toast({ title: "Couldn’t delete comment", description: error.message, variant: "destructive" });
    },
  });
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [transcriptTab, setTranscriptTab] = useState<"chapters" | "transcript">("chapters");
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const vimeoPlayerRef = useRef<HTMLIFrameElement>(null);
  const vimeoPlayerApiRef = useRef<Player | null>(null);
  const transcriptScrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTranscriptWordRef = useRef<HTMLSpanElement>(null);
  const lastScrolledWordRef = useRef<number | null>(null);

  const embedUrl = getEmbedUrl(replay?.videoUrl);
  const isVimeoReplay = Boolean(replay?.videoUrl?.includes("vimeo.com"));
  const chapters = replay?.transcriptChapters ?? [];
  const transcriptCues = replay?.transcriptCues ?? [];
  const transcriptText = replay?.transcriptText ? formatTranscriptParagraphs(replay.transcriptText) : "";
  const transcriptTokens = transcriptText.split(/(\s+)/);
  let transcriptWordCount = 0;
  const transcriptTokenWordIndexes = transcriptTokens.map((token) => {
    if (!token || /^\s+$/.test(token)) return -1;
    return transcriptWordCount++;
  });
  const activeCueIndex = transcriptCues.findIndex((cue, index) => {
    const nextCue = transcriptCues[index + 1];
    return videoCurrentTime >= cue.startSeconds
      && videoCurrentTime < (nextCue?.startSeconds ?? cue.startSeconds + 8);
  });
  const activeCue = activeCueIndex >= 0 ? transcriptCues[activeCueIndex] : null;
  const activeCueEnd = activeCueIndex >= 0
    ? (transcriptCues[activeCueIndex + 1]?.startSeconds ?? activeCue!.startSeconds + 8)
    : 0;
  const activeCueWords = activeCue?.text.trim().split(/\s+/).filter(Boolean) ?? [];
  const activeWordInCue = activeCue
    ? Math.min(
        activeCueWords.length - 1,
        Math.floor(
          Math.min(
            0.999,
            Math.max(
              0,
              (videoCurrentTime - activeCue.startSeconds)
                / Math.max(0.1, activeCueEnd - activeCue.startSeconds),
            ),
          ) * activeCueWords.length,
        ),
      )
    : -1;
  const activeWordIndex = activeCue
    ? transcriptCues
        .slice(0, activeCueIndex)
        .reduce((count, cue) => count + cue.text.trim().split(/\s+/).filter(Boolean).length, 0)
      + activeWordInCue
    : -1;

  useEffect(() => {
    const iframe = vimeoPlayerRef.current;
    if (!iframe || !isVimeoReplay || !embedUrl) return;
    const player = new Player(iframe);
    const update = ({ seconds }: { seconds: number }) => setVideoCurrentTime(seconds);
    vimeoPlayerApiRef.current = player;
    player.on("timeupdate", update);
    const initialTime = Number(new URLSearchParams(window.location.search).get("t"));
    if (Number.isFinite(initialTime) && initialTime > 0) void player.setCurrentTime(initialTime);
    return () => {
      player.off("timeupdate", update);
      if (vimeoPlayerApiRef.current === player) vimeoPlayerApiRef.current = null;
    };
  }, [embedUrl, isVimeoReplay]);

  useEffect(() => {
    if (!transcriptOpen || transcriptTab !== "transcript" || activeWordIndex < 0) return;
    if (lastScrolledWordRef.current === activeWordIndex) return;
    lastScrolledWordRef.current = activeWordIndex;
    const container = transcriptScrollContainerRef.current;
    const word = activeTranscriptWordRef.current;
    if (!container || !word) return;
    const containerRect = container.getBoundingClientRect();
    const wordRect = word.getBoundingClientRect();
    if (wordRect.top < containerRect.top || wordRect.bottom > containerRect.bottom) {
      const offset = wordRect.top - containerRect.top - (container.clientHeight - wordRect.height) / 2;
      container.scrollBy({ top: offset, behavior: "smooth" });
    }
  }, [activeWordIndex, transcriptOpen, transcriptTab]);

  useEffect(() => {
    setTranscriptOpen(false);
    setTranscriptTab("chapters");
    setVideoCurrentTime(0);
    setCommentBody("");
    setReplyingTo(null);
    setReplyBody("");
    setEditingCommentId(null);
    setEditBody("");
    setConfirmDeleteId(null);
    lastScrolledWordRef.current = null;
  }, [slug]);

  const seekToChapter = (seconds: number) => {
    if (!isVimeoReplay) return;
    void vimeoPlayerApiRef.current?.setCurrentTime(seconds);
    vimeoPlayerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const commentsByParent = new Map<string, ReplayComment[]>();
  const rootComments: ReplayComment[] = [];
  for (const comment of replay?.comments ?? []) {
    if (comment.parentCommentId) {
      const children = commentsByParent.get(comment.parentCommentId) ?? [];
      children.push(comment);
      commentsByParent.set(comment.parentCommentId, children);
    } else {
      rootComments.push(comment);
    }
  }

  const renderComment = (comment: ReplayComment, depth = 0): JSX.Element => {
    const children = commentsByParent.get(comment.id) ?? [];
    const isEditing = editingCommentId === comment.id;
    const isReplying = replyingTo === comment.id;
    const isConfirmingDelete = confirmDeleteId === comment.id;
    const wasEdited = new Date(comment.updatedAt).getTime() > new Date(comment.createdAt).getTime() + 1000;

    return (
      <div key={comment.id} className={cn(depth > 0 && "relative ml-4 border-l-2 border-violet-100 pl-5 sm:ml-8")}>
        {depth > 0 && (
          <CornerDownRight
            className="absolute -left-[2px] top-5 h-5 w-5 bg-slate-50 pr-0.5 text-violet-400"
            aria-hidden="true"
          />
        )}
        <article className={cn(
          "flex gap-3 rounded-2xl border p-4 shadow-sm sm:p-5",
          depth > 0 ? "border-violet-100 bg-violet-50/40" : "border-slate-200 bg-white",
        )}>
          <Avatar className="h-10 w-10 shrink-0">
            {comment.authorAvatarUrl && <AvatarImage src={comment.authorAvatarUrl} alt="" />}
            <AvatarFallback className="bg-violet-700 text-sm font-extrabold uppercase text-white">
              {comment.authorName.trim().charAt(0) || "M"}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="font-bold text-slate-950">{comment.authorName}</h3>
              <time className="text-xs font-medium text-slate-400" dateTime={comment.createdAt}>
                {formatCommentDate(comment.createdAt)}
              </time>
            </div>

            {comment.deletedAt ? (
              <p className="mt-2 text-sm italic text-slate-400">This comment was deleted.</p>
            ) : isEditing ? (
              <div className="mt-3">
                <Textarea
                  value={editBody}
                  onChange={(event) => setEditBody(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  autoFocus
                  className="resize-y border-slate-200 bg-slate-50 text-slate-900 focus-visible:ring-violet-600"
                  disabled={editCommentMutation.isPending}
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setEditingCommentId(null); setEditBody(""); }}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-violet-700 text-white hover:bg-violet-800"
                    disabled={!editBody.trim() || editCommentMutation.isPending}
                    onClick={() => editCommentMutation.mutate({ commentId: comment.id, body: editBody })}
                  >
                    {editCommentMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Save Edit
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{comment.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="text-xs font-bold text-violet-700 hover:text-violet-900"
                    onClick={() => { setReplyingTo(comment.id); setReplyBody(""); setEditingCommentId(null); }}
                  >
                    Reply
                  </button>
                  {comment.canEdit && (
                    <>
                      <button
                        type="button"
                        className="text-xs font-bold text-slate-500 hover:text-slate-800"
                        onClick={() => { setEditingCommentId(comment.id); setEditBody(comment.body); setReplyingTo(null); setConfirmDeleteId(null); }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-800"
                        onClick={() => { setConfirmDeleteId(comment.id); setEditingCommentId(null); setReplyingTo(null); }}
                      >
                        <Trash2 className="h-3 w-3" />
                        Delete
                      </button>
                    </>
                  )}
                  {wasEdited && <span className="text-xs text-slate-400">Edited</span>}
                </div>
              </>
            )}

            {isConfirmingDelete && !comment.deletedAt && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5">
                <span className="text-xs font-semibold text-red-800">
                  {children.length > 0
                    ? "Delete this comment and every reply in its thread?"
                    : "Delete this comment?"}
                </span>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-red-600 text-white hover:bg-red-700"
                    disabled={deleteCommentMutation.isPending}
                    onClick={() => deleteCommentMutation.mutate(comment.id)}
                  >
                    {deleteCommentMutation.isPending && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    Delete
                  </Button>
                </div>
              </div>
            )}

            {isReplying && !isEditing && !comment.deletedAt && (
              <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                <Textarea
                  value={replyBody}
                  onChange={(event) => setReplyBody(event.target.value)}
                  maxLength={2000}
                  rows={3}
                  autoFocus
                  placeholder={`Reply to ${comment.authorName}…`}
                  className="resize-y border-violet-100 bg-white text-slate-900 focus-visible:ring-violet-600"
                  disabled={commentMutation.isPending}
                />
                <div className="mt-2 flex justify-end gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setReplyingTo(null); setReplyBody(""); }}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="bg-violet-700 text-white hover:bg-violet-800"
                    disabled={!replyBody.trim() || commentMutation.isPending}
                    onClick={() => commentMutation.mutate({ body: replyBody, parentCommentId: comment.id })}
                  >
                    {commentMutation.isPending ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Send className="mr-2 h-3.5 w-3.5" />}
                    Post Reply
                  </Button>
                </div>
              </div>
            )}
          </div>
        </article>
        {children.length > 0 && (
          <div className="mt-4 space-y-4">
            {children.map((child) => renderComment(child, Math.min(depth + 1, 4)))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <main className="mx-auto max-w-[1400px] space-y-5 px-4 py-8 sm:px-8">
        <div className="h-8 w-72 animate-pulse rounded bg-muted" />
        <div className="aspect-video animate-pulse rounded-xl bg-muted" />
      </main>
    );
  }
  if (isError || !replay) {
    return (
      <main className="p-10 text-center">
        <h1 className="text-xl font-bold">Replay unavailable</h1>
        <p className="mt-2 text-muted-foreground">It may no longer be published or you may not have access.</p>
        <Button className="mt-5" onClick={() => go("/training/library")}>Back to library</Button>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-3rem)] bg-slate-50">
      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto w-full max-w-[1100px]">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="border-slate-200 bg-slate-100 font-bold text-slate-700 shadow-sm hover:bg-slate-200 hover:text-slate-900"
              onClick={() => go("/training/library")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Training Library
            </Button>
            <Button
              type="button"
              size="lg"
              variant={replay.completed ? "default" : "outline"}
              className={cn(
                "min-w-[190px] font-bold shadow-sm",
                replay.completed && "border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-700",
              )}
              disabled={completionMutation.isPending}
              onClick={() => completionMutation.mutate(!replay.completed)}
            >
              {completionMutation.isPending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className={cn("mr-2 h-5 w-5", replay.completed && "text-white")} />
              )}
              {replay.completed ? "Training Completed" : "Mark Training Complete"}
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {replay.category && (
              <span className="inline-flex rounded-full border border-red-700 bg-red-600 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white shadow-sm">
                {replay.category}
              </span>
            )}
            {replay.durationMinutes && (
              <span className="flex items-center gap-1 text-sm text-slate-500">
                <Clock className="h-4 w-4" />
                {replay.durationMinutes} min
              </span>
            )}
          </div>

          <h1 className="mb-3 text-[28px] font-bold leading-tight tracking-tight text-slate-950 sm:text-4xl">
            {replay.title}
          </h1>
          {replay.description && (
            <p className="mb-7 w-full text-base leading-7 text-slate-600 sm:text-lg">
              {replay.description}
            </p>
          )}
        </div>

        {embedUrl ? (
          <div className="mx-auto mb-8 w-full max-w-[1100px]">
            <div className="aspect-video overflow-hidden rounded-xl bg-slate-950 shadow-sm">
              <iframe
                ref={isVimeoReplay ? vimeoPlayerRef : undefined}
                src={embedUrl}
                className="h-full w-full"
                allowFullScreen
                title={replay.title}
              />
            </div>
          </div>
        ) : (
          <div className="mx-auto mb-8 flex aspect-video w-full max-w-[1100px] items-center justify-center rounded-xl bg-slate-900 text-slate-300">
            <Play className="mr-2 h-5 w-5" />
            Video coming soon
          </div>
        )}

        <div className="mx-auto max-w-[780px]">
          {transcriptText && (
            <div className="mx-auto mb-8 mt-8 w-full overflow-hidden rounded-xl border border-blue-100 bg-blue-50/60">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => setTranscriptOpen((open) => !open)}
                aria-expanded={transcriptOpen}
              >
                <span className="flex items-center gap-2 text-[13px] font-semibold text-blue-900">
                  <FileText className="h-4 w-4" />
                  View Chapters / Transcript
                </span>
                <ChevronDown className={cn("h-4 w-4 text-blue-900 transition-transform", transcriptOpen && "rotate-180")} />
              </button>

              {transcriptOpen && (
                <div className="border-t border-blue-100 bg-white">
                  <div className="flex gap-1 border-b border-blue-50 px-4 pt-3" role="tablist" aria-label="Replay transcript">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={transcriptTab === "chapters"}
                      onClick={() => setTranscriptTab("chapters")}
                      className={cn(
                        "rounded-t-md px-3 py-2 text-[12px] font-semibold transition-colors",
                        transcriptTab === "chapters"
                          ? "border border-b-blue-50 border-blue-100 bg-blue-50 text-blue-900"
                          : "text-slate-500",
                      )}
                    >
                      Chapters
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={transcriptTab === "transcript"}
                      onClick={() => setTranscriptTab("transcript")}
                      className={cn(
                        "rounded-t-md px-3 py-2 text-[12px] font-semibold transition-colors",
                        transcriptTab === "transcript"
                          ? "border border-b-blue-50 border-blue-100 bg-blue-50 text-blue-900"
                          : "text-slate-500",
                      )}
                    >
                      Transcript
                    </button>
                  </div>

                  <div ref={transcriptScrollContainerRef} className="max-h-[360px] overflow-y-auto">
                    {transcriptTab === "chapters" ? (
                      <div className="p-3">
                        {chapters.length > 0 ? (
                          <div className="space-y-1">
                            {chapters.map((chapter) => (
                              <button
                                key={`${chapter.startSeconds}-${chapter.title}`}
                                type="button"
                                onClick={() => seekToChapter(chapter.startSeconds)}
                                disabled={!isVimeoReplay}
                                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors enabled:hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <span className="w-10 shrink-0 font-mono text-[12px] font-semibold text-blue-600">
                                  {formatTimestamp(chapter.startSeconds)}
                                </span>
                                <span className="text-[13px] font-medium text-slate-700">{chapter.title}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="px-2 py-3 text-[13px] text-slate-500">
                            Chapters have not been created for this replay yet.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap px-5 py-4 text-[14px] leading-7 text-slate-700">
                        {transcriptCues.length > 0
                          ? transcriptTokens.map((token, index) => {
                              const wordIndex = transcriptTokenWordIndexes[index];
                              const isWord = wordIndex >= 0;
                              return (
                                <span
                                  key={index}
                                  ref={isWord && wordIndex === activeWordIndex ? activeTranscriptWordRef : undefined}
                                  className={isWord && wordIndex === activeWordIndex
                                    ? "rounded-sm bg-yellow-300 px-0.5 text-slate-900 shadow-sm"
                                    : undefined}
                                >
                                  {token}
                                </span>
                              );
                            })
                          : transcriptText}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {replay.content && (
            <section
              className="prose prose-slate mb-10 max-w-none text-[15px] leading-7"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(replay.content, {
                  ALLOWED_TAGS: ["p", "br", "b", "i", "em", "strong", "ul", "ol", "li", "a", "h1", "h2", "h3", "h4", "blockquote", "code", "pre", "hr", "img", "span"],
                  ALLOWED_ATTR: ["href", "target", "rel", "src", "alt", "class", "style"],
                  ALLOW_DATA_ATTR: false,
                  FORCE_BODY: true,
                }),
              }}
            />
          )}

          {replay.resources?.length ? (
            <section className="mb-10">
              <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">Replay Resources</h2>
              <div className="space-y-2">
                {replay.resources.map((resource) => (
                  <a
                    key={resource.id}
                    href={safeHref(resource.url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-4 shadow-sm transition-colors hover:bg-blue-50"
                  >
                    <TrainingResourceIcon kind={resource.kind} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-slate-950">{resource.name}</p>
                      {resource.subtitle && <p className="truncate text-[11px] text-slate-400">{resource.subtitle}</p>}
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                  </a>
                ))}
              </div>
            </section>
          ) : null}

          <section className="mb-12 border-t border-slate-200 pt-8">
            <div className="mb-5 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                <MessageCircle className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-xl font-bold text-slate-950">Member Discussion</h2>
                <p className="text-sm text-slate-500">Share what stood out or how you plan to use it.</p>
              </div>
            </div>

            <form
              className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm sm:p-5"
              onSubmit={(event) => {
                event.preventDefault();
                if (!commentBody.trim() || commentMutation.isPending) return;
                commentMutation.mutate({ body: commentBody });
              }}
            >
              <Textarea
                value={commentBody}
                onChange={(event) => setCommentBody(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="Add your comment about this training…"
                className="min-h-[110px] resize-y border-slate-200 bg-slate-50 text-slate-900 focus-visible:ring-violet-600"
                disabled={commentMutation.isPending}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-400">{commentBody.length}/2,000</span>
                <Button
                  type="submit"
                  className="bg-violet-700 font-bold text-white hover:bg-violet-800"
                  disabled={!commentBody.trim() || commentMutation.isPending}
                >
                  {commentMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Post Comment
                </Button>
              </div>
            </form>

            <div className="mt-6 space-y-4">
              {rootComments.length ? (
                rootComments.map((comment) => renderComment(comment))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
                  <MessageCircle className="mx-auto h-7 w-7 text-slate-300" />
                  <p className="mt-2 font-semibold text-slate-700">Start the conversation</p>
                  <p className="mt-1 text-sm text-slate-500">Be the first member to comment on this training.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}