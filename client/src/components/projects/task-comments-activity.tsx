import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { TaskComment, TaskActivity } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  MessageCircle,
  Activity as ActivityIcon,
  Trash2,
  Send,
  Plus,
  CheckCircle2,
  Flag,
  CalendarClock,
  Pencil,
  FileText,
  Link2,
  CornerDownRight,
  History,
} from "lucide-react";

type CommentRow = TaskComment & { authorName: string | null; authorEmail: string | null };
type ActivityRow = TaskActivity & { authorName: string | null; authorEmail: string | null };

interface Props {
  taskId: string;
  currentUserId?: string;
}

const STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

const PRIORITY_LABELS: Record<string, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

function authorDisplay(a: { authorName: string | null; authorEmail: string | null }) {
  return a.authorName?.trim() || a.authorEmail?.split("@")[0] || "Someone";
}

function initials(s: string) {
  return s
    .split(/\s+/)
    .map(w => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

function relativeTime(d: Date | string) {
  const date = new Date(d);
  const diffMs = Date.now() - date.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return date.toLocaleDateString();
}

function formatDateMaybe(v: unknown): string {
  if (!v) return "no date";
  try {
    return new Date(v as string).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return String(v);
  }
}

function activityVisual(type: string): { icon: React.ReactNode; tone: string } {
  switch (type) {
    case "created":         return { icon: <Plus className="h-3.5 w-3.5" />,           tone: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };
    case "status_changed":  return { icon: <CheckCircle2 className="h-3.5 w-3.5" />,   tone: "bg-sky-500/15 text-sky-600 dark:text-sky-400" };
    case "priority_changed":return { icon: <Flag className="h-3.5 w-3.5" />,           tone: "bg-orange-500/15 text-orange-600 dark:text-orange-400" };
    case "due_changed":     return { icon: <CalendarClock className="h-3.5 w-3.5" />,  tone: "bg-violet-500/15 text-violet-600 dark:text-violet-400" };
    case "title_changed":   return { icon: <Pencil className="h-3.5 w-3.5" />,         tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300" };
    case "notes_changed":   return { icon: <FileText className="h-3.5 w-3.5" />,       tone: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400" };
    case "links_changed":   return { icon: <Link2 className="h-3.5 w-3.5" />,          tone: "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400" };
    case "subtask_added":   return { icon: <CornerDownRight className="h-3.5 w-3.5" />,tone: "bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400" };
    case "comment_added":   return { icon: <MessageCircle className="h-3.5 w-3.5" />,  tone: "bg-pink-500/15 text-pink-600 dark:text-pink-400" };
    default:                return { icon: <History className="h-3.5 w-3.5" />,        tone: "bg-muted text-muted-foreground" };
  }
}

function describeActivity(row: ActivityRow): React.ReactNode {
  const meta = (row.meta || {}) as Record<string, unknown>;
  const author = authorDisplay(row);
  switch (row.type) {
    case "created":
      return <><strong>{author}</strong> created this task</>;
    case "status_changed":
      return <><strong>{author}</strong> changed status from <em className="not-italic font-medium">{STATUS_LABELS[String(meta.from)] ?? String(meta.from)}</em> to <em className="not-italic font-medium">{STATUS_LABELS[String(meta.to)] ?? String(meta.to)}</em></>;
    case "priority_changed":
      return <><strong>{author}</strong> set priority to <em className="not-italic font-medium">{PRIORITY_LABELS[String(meta.to)] ?? String(meta.to)}</em></>;
    case "due_changed":
      return <><strong>{author}</strong> changed due date to <em className="not-italic font-medium">{meta.to ? formatDateMaybe(meta.to) : "no date"}</em></>;
    case "title_changed":
      return <><strong>{author}</strong> renamed to <em className="not-italic font-medium">"{String(meta.to ?? "")}"</em></>;
    case "notes_changed":
      return <><strong>{author}</strong> updated the notes</>;
    case "links_changed":
      return <><strong>{author}</strong> updated links ({String(meta.from ?? 0)} → {String(meta.to ?? 0)})</>;
    case "subtask_added":
      return <><strong>{author}</strong> added subtask <em className="not-italic font-medium">"{String(meta.title ?? "")}"</em></>;
    case "comment_added":
      return <><strong>{author}</strong> added a comment</>;
    default:
      return <><strong>{author}</strong> {row.type.replace(/_/g, " ")}</>;
  }
}

export function TaskCommentsActivity({ taskId, currentUserId }: Props) {
  const { toast } = useToast();
  const [body, setBody] = useState("");

  const commentsQ = useQuery<CommentRow[]>({
    queryKey: ["/api/tasks", taskId, "comments"],
  });
  const activityQ = useQuery<ActivityRow[]>({
    queryKey: ["/api/tasks", taskId, "activity"],
  });

  const addComment = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", `/api/tasks/${taskId}/comments`, { body: text });
      return res.json();
    },
    onSuccess: () => {
      setBody("");
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "comments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "activity"] });
    },
    onError: () => toast({ title: "Failed to add comment", variant: "destructive" }),
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      await apiRequest("DELETE", `/api/tasks/${taskId}/comments/${commentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId, "comments"] });
    },
    onError: () => toast({ title: "Failed to delete comment", variant: "destructive" }),
  });

  const comments = commentsQ.data ?? [];
  const activity = activityQ.data ?? [];

  const submit = () => {
    const t = body.trim();
    if (!t) return;
    addComment.mutate(t);
  };

  return (
    <Tabs defaultValue="comments" className="w-full">
      <TabsList className="grid w-full grid-cols-2 h-9" data-testid="tabs-task-comments-activity">
        <TabsTrigger value="comments" className="text-xs gap-1.5" data-testid="tab-comments">
          <MessageCircle className="h-3.5 w-3.5" />
          Comments {comments.length > 0 && <span className="ml-0.5 text-[10px] opacity-70">({comments.length})</span>}
        </TabsTrigger>
        <TabsTrigger value="activity" className="text-xs gap-1.5" data-testid="tab-activity">
          <ActivityIcon className="h-3.5 w-3.5" />
          Activity {activity.length > 0 && <span className="ml-0.5 text-[10px] opacity-70">({activity.length})</span>}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="comments" className="mt-3 space-y-3" data-testid="content-comments">
        <div className="space-y-2.5">
          {commentsQ.isLoading ? (
            <p className="text-xs text-muted-foreground py-3 text-center">Loading…</p>
          ) : comments.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
              <MessageCircle className="h-6 w-6 mx-auto text-muted-foreground/60 mb-1.5" />
              <p className="text-xs text-muted-foreground">No comments yet. Start the conversation below.</p>
            </div>
          ) : (
            comments.map(c => {
              const author = authorDisplay(c);
              const mine = currentUserId && c.userId === currentUserId;
              return (
                <div key={c.id} className="flex gap-2.5" data-testid={`comment-${c.id}`}>
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white text-[10px] font-semibold flex items-center justify-center shrink-0 mt-0.5">
                    {initials(author)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="rounded-lg border border-border bg-card px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2 mb-0.5">
                        <span className="text-xs font-semibold truncate">{author}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{relativeTime(c.createdAt)}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap break-words">{c.body}</p>
                    </div>
                    {mine && (
                      <div className="flex justify-end mt-1">
                        <button
                          onClick={() => deleteComment.mutate(c.id)}
                          className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1"
                          data-testid={`button-delete-comment-${c.id}`}
                        >
                          <Trash2 className="h-2.5 w-2.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-2.5 space-y-2">
          <Textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
            placeholder="Write a comment… (Cmd/Ctrl+Enter to send)"
            rows={2}
            className="min-h-[60px] text-sm resize-none border-0 shadow-none px-1 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
            data-testid="input-new-comment"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={submit}
              disabled={!body.trim() || addComment.isPending}
              data-testid="button-submit-comment"
              className="h-7 text-xs"
            >
              <Send className="h-3 w-3 mr-1.5" />
              {addComment.isPending ? "Posting…" : "Comment"}
            </Button>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="activity" className="mt-3" data-testid="content-activity">
        {activityQ.isLoading ? (
          <p className="text-xs text-muted-foreground py-3 text-center">Loading…</p>
        ) : activity.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
            <ActivityIcon className="h-6 w-6 mx-auto text-muted-foreground/60 mb-1.5" />
            <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
          </div>
        ) : (
          <div className="relative pl-5">
            <div className="absolute left-[10px] top-1 bottom-1 w-px bg-border" />
            <ul className="space-y-2.5">
              {activity.map(row => {
                const v = activityVisual(row.type);
                return (
                  <li key={row.id} className="relative flex items-start gap-2.5" data-testid={`activity-${row.id}`}>
                    <span className={`absolute -left-5 mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-background ${v.tone}`}>
                      {v.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs leading-relaxed text-foreground">{describeActivity(row)}</p>
                      <p className="text-[10px] text-muted-foreground">{relativeTime(row.createdAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
