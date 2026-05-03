import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, ProjectTask, ProjectLink } from "@shared/schema";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { RichTextEditor } from "./rich-text-editor";
import { TaskCommentsActivity } from "./task-comments-activity";
import { useAuth } from "@/lib/auth";
import { CalendarIcon, Trash2, X, Plus, Link2, ExternalLink, ListChecks, Flag, CheckCircle2, ChevronLeft, CornerDownRight } from "lucide-react";

const STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
];

const PRIORITY_OPTIONS: { value: string; label: string; dot: string; badge: string }[] = [
  { value: "none",   label: "None",   dot: "bg-muted-foreground/40",                 badge: "bg-white/15 text-white" },
  { value: "low",    label: "Low",    dot: "bg-sky-500",                              badge: "bg-sky-500/90 text-white" },
  { value: "medium", label: "Medium", dot: "bg-amber-500",                            badge: "bg-amber-500/90 text-white" },
  { value: "high",   label: "High",   dot: "bg-orange-500",                           badge: "bg-orange-500/90 text-white" },
  { value: "urgent", label: "Urgent", dot: "bg-rose-600 ring-2 ring-rose-400/40",     badge: "bg-rose-600 text-white" },
];

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function adjustBrightness(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const c = (v: number) => Math.max(0, Math.min(255, v + amount));
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const ch = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function getHeaderTheme(color: string) {
  const lum = relativeLuminance(color);
  const gradientStyle = {
    background: `linear-gradient(135deg, ${adjustBrightness(color, -60)} 0%, ${adjustBrightness(color, -30)} 55%, ${color} 100%)`,
  };
  const useWhite = lum < 0.5;
  return {
    gradientStyle,
    tx: useWhite ? "text-white" : "text-gray-900",
    txSubtle: useWhite ? "text-white/70" : "text-gray-700",
    txFaint: useWhite ? "text-white/40" : "text-gray-400",
    chip: useWhite ? "bg-white/15 text-white border-0" : "bg-black/10 text-gray-800 border-0",
    ring: useWhite ? "ring-white/20" : "ring-black/15",
    placeholder: useWhite ? "placeholder-white/40" : "placeholder-gray-400",
  };
}

interface Props {
  project: Project;
  task: ProjectTask | null;
  parentTask?: ProjectTask | null;
  subtasks: ProjectTask[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenTask?: (id: string) => void;
}

export function TaskDetailSheet({ project, task, parentTask, subtasks, open, onOpenChange, onOpenTask }: Props) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("none");
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [confirmDeleteTask, setConfirmDeleteTask] = useState(false);
  const [confirmDeleteSubtask, setConfirmDeleteSubtask] = useState<ProjectTask | null>(null);

  useEffect(() => {
    if (task && open) {
      setTitle(task.title);
      setNotes(task.notes || "");
      setStatus(task.status);
      setPriority(task.priority);
      setDueDate(task.dueDate ? new Date(task.dueDate) : null);
      setLinks(task.links || []);
      setLinkLabel("");
      setLinkUrl("");
      setNewSubtaskTitle("");
    }
  }, [task, open]);

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (!task) return null;
      const res = await apiRequest("PATCH", `/api/tasks/${task.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/urgent-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
      if (task?.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.id, "activity"] });
      }
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => { if (task) await apiRequest("DELETE", `/api/tasks/${task.id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/urgent-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
      toast({ title: "Task deleted" });
      onOpenChange(false);
    },
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", project.id, "tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects/all-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects/urgent-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
    if (task?.id) {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.id, "activity"] });
    }
  };

  const addSubtaskMutation = useMutation({
    mutationFn: async (t: string) => {
      if (!task) return null;
      const res = await apiRequest("POST", `/api/projects/${project.id}/tasks`, { title: t, parentTaskId: task.id });
      return res.json();
    },
    onSuccess: () => { invalidateAll(); setNewSubtaskTitle(""); },
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/tasks/${id}`, { status });
    },
    onSuccess: invalidateAll,
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/tasks/${id}`); },
    onSuccess: invalidateAll,
  });

  if (!task) return null;

  const addLink = () => {
    if (!linkLabel.trim() || !linkUrl.trim()) return;
    let url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    try { new URL(url); } catch { toast({ title: "Invalid URL", variant: "destructive" }); return; }
    const next = [...links, { label: linkLabel.trim().slice(0, 80), url: url.slice(0, 500) }];
    setLinks(next);
    updateMutation.mutate({ links: next });
    setLinkLabel(""); setLinkUrl("");
  };

  const removeLink = (idx: number) => {
    const next = links.filter((_, i) => i !== idx);
    setLinks(next);
    updateMutation.mutate({ links: next });
  };

  const saveTitle = () => {
    const t = title.trim();
    if (!t || t === task.title) return;
    updateMutation.mutate({ title: t });
  };

  const saveNotes = (html: string) => {
    setNotes(html);
    updateMutation.mutate({ notes: html });
  };

  const completedSubs = subtasks.filter(s => s.status === "done").length;

  const initials = (project.name || "P").split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();

  const hdr = getHeaderTheme(project.color);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0" data-testid="sheet-task-detail">
        {/* Breadcrumb bar (subtask only) */}
        {parentTask && onOpenTask && (
          <button
            onClick={() => onOpenTask(parentTask.id)}
            className="w-full sticky top-0 z-20 flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-100 via-amber-50 to-transparent dark:from-amber-500/20 dark:via-amber-500/10 dark:to-transparent border-b border-amber-300/40 dark:border-amber-500/30 hover:from-amber-200 hover:via-amber-100 dark:hover:from-amber-500/30 dark:hover:via-amber-500/20 transition-colors group text-left"
            data-testid="button-breadcrumb-top"
          >
            <div className="h-7 w-7 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:bg-amber-600 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider text-amber-800/80 dark:text-amber-200/80 font-bold leading-tight">Back to parent task</p>
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 truncate leading-tight">{parentTask.title}</p>
            </div>
            <span className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300 font-bold shrink-0 hidden sm:inline">Click to return</span>
          </button>
        )}

        {/* Gradient header card — uses project color */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0" style={hdr.gradientStyle} />
          <div className="absolute -top-12 -right-8 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <SheetHeader className="relative px-6 pt-6 pb-5">
            <div className="flex items-start gap-3">
              <div
                className={`h-11 w-11 rounded-xl flex items-center justify-center text-white font-bold shrink-0 ring-2 ${hdr.ring} mt-0.5 bg-black/20`}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                {parentTask && onOpenTask ? (
                  <button
                    onClick={() => onOpenTask(parentTask.id)}
                    className={`flex items-center gap-1 text-[10px] uppercase tracking-wider ${hdr.txSubtle} hover:${hdr.tx} font-semibold group`}
                    data-testid="button-back-to-parent"
                  >
                    <ChevronLeft className="h-3 w-3 -ml-0.5" />
                    <span className="opacity-70">{project.name}</span>
                    <span className="opacity-50">/</span>
                    <span className="truncate max-w-[260px]">{parentTask.title}</span>
                  </button>
                ) : (
                  <p className={`text-[10px] uppercase tracking-wider ${hdr.txSubtle} font-semibold`}>{project.name}</p>
                )}
                <SheetTitle asChild>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    onBlur={saveTitle}
                    onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className={`bg-transparent border-0 p-0 text-lg font-semibold ${hdr.tx} ${hdr.placeholder} focus:outline-none focus:ring-0 w-full`}
                    placeholder="Task title…"
                    data-testid="input-task-title"
                  />
                </SheetTitle>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {parentTask && (
                    <Badge variant="secondary" className={`${hdr.chip} text-[10px]`}>
                      <CornerDownRight className="h-2.5 w-2.5 mr-1" /> Subtask
                    </Badge>
                  )}
                  <Badge variant="secondary" className={`${hdr.chip} text-[10px]`}>
                    {STATUS_OPTIONS.find(s => s.value === status)?.label}
                  </Badge>
                  {priority !== "none" && (() => {
                    const opt = PRIORITY_OPTIONS.find(p => p.value === priority);
                    return (
                      <Badge variant="secondary" className={`border-0 text-[10px] ${opt?.badge ?? hdr.chip}`}>
                        <Flag className="h-2.5 w-2.5 mr-1" /> {opt?.label}
                      </Badge>
                    );
                  })()}
                  {dueDate && (
                    <Badge variant="secondary" className={`${hdr.chip} text-[10px]`}>
                      <CalendarIcon className="h-2.5 w-2.5 mr-1" /> {dueDate.toLocaleDateString()} · {dueDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </Badge>
                  )}
                  {subtasks.length > 0 && (
                    <Badge variant="secondary" className={`${hdr.chip} text-[10px]`}>
                      <ListChecks className="h-2.5 w-2.5 mr-1" /> {completedSubs}/{subtasks.length} subtasks
                    </Badge>
                  )}
                </div>
              </div>
              {/* Compact complete button — sits in the header, below the sheet's X close button */}
              <div className="shrink-0 mr-8 mt-1">
                {status === "done" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs font-semibold border border-emerald-400/40 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/20 hover:text-white"
                    onClick={() => { setStatus("todo"); updateMutation.mutate({ status: "todo" }); }}
                    data-testid="button-reopen-task"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-300" /> Reopen
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-white border-0 shadow-sm"
                    onClick={() => { setStatus("done"); updateMutation.mutate({ status: "done" }); }}
                    data-testid="button-complete-task"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Complete
                  </Button>
                )}
              </div>
            </div>
          </SheetHeader>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Status / Priority / Due */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Status</Label>
              <Select value={status} onValueChange={(v) => { setStatus(v); updateMutation.mutate({ status: v }); }}>
                <SelectTrigger className="mt-1 h-8 text-xs" data-testid="select-task-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Priority</Label>
              <Select value={priority} onValueChange={(v) => { setPriority(v); updateMutation.mutate({ priority: v }); }}>
                <SelectTrigger className="mt-1 h-8 text-xs" data-testid="select-task-priority">
                  <SelectValue>
                    {(() => {
                      const opt = PRIORITY_OPTIONS.find(p => p.value === priority);
                      return (
                        <span className="flex items-center gap-1.5">
                          <span className={`inline-block h-2 w-2 rounded-full ${opt?.dot ?? "bg-muted"}`} />
                          {opt?.label}
                        </span>
                      );
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex items-center gap-2">
                        <span className={`inline-block h-2 w-2 rounded-full ${o.dot}`} />
                        {o.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Due</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="mt-1 h-8 w-full justify-start text-xs font-normal" data-testid="button-due-date">
                    <CalendarIcon className="h-3 w-3 mr-1.5 shrink-0" />
                    <span className="truncate">
                      {dueDate
                        ? `${dueDate.toLocaleDateString()} · ${dueDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                        : "None"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dueDate ?? undefined}
                    onSelect={(d) => {
                      if (!d) {
                        setDueDate(null);
                        updateMutation.mutate({ dueDate: null });
                        return;
                      }
                      const next = new Date(d);
                      if (dueDate) {
                        next.setHours(dueDate.getHours(), dueDate.getMinutes(), 0, 0);
                      } else {
                        next.setHours(9, 0, 0, 0);
                      }
                      setDueDate(next);
                      updateMutation.mutate({ dueDate: next.toISOString() });
                    }}
                  />
                  <div className="p-2 border-t flex items-center gap-2">
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold shrink-0">Time</Label>
                    <Input
                      type="time"
                      value={dueDate ? `${String(dueDate.getHours()).padStart(2, "0")}:${String(dueDate.getMinutes()).padStart(2, "0")}` : ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;
                        const [h, m] = v.split(":").map(Number);
                        const base = dueDate ? new Date(dueDate) : new Date();
                        if (!dueDate) base.setSeconds(0, 0);
                        base.setHours(h, m, 0, 0);
                        setDueDate(base);
                        updateMutation.mutate({ dueDate: base.toISOString() });
                      }}
                      disabled={!dueDate}
                      className="h-7 text-xs flex-1"
                      data-testid="input-due-time"
                    />
                  </div>
                  {dueDate && (
                    <div className="p-2 border-t">
                      <Button variant="ghost" size="sm" className="w-full" onClick={() => { setDueDate(null); updateMutation.mutate({ dueDate: null }); }} data-testid="button-clear-due-date">Clear date</Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Links */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
              <Link2 className="h-3 w-3" /> Links
            </Label>
            <div className="mt-1.5 space-y-1.5">
              {links.map((l, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5" data-testid={`link-${idx}`}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 flex items-center gap-2 text-sm hover:underline">
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{l.label}</span>
                    <span className="text-xs text-muted-foreground truncate hidden sm:inline">{l.url}</span>
                  </a>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeLink(idx)} aria-label="Remove link" data-testid={`button-remove-link-${idx}`}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-1.5">
                <Input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Label" className="h-8 text-xs flex-1" data-testid="input-link-label" />
                <Input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…" className="h-8 text-xs flex-[2]" data-testid="input-link-url" />
                <Button size="sm" variant="outline" className="h-8" onClick={addLink} disabled={!linkLabel.trim() || !linkUrl.trim()} data-testid="button-add-link">
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>

          {/* Notes (WYSIWYG) */}
          <div>
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Notes</Label>
            <div className="mt-1.5">
              <RichTextEditor value={notes} onChange={saveNotes} testId="editor-task-notes" />
            </div>
          </div>

          {/* Subtasks */}
          {!task.parentTaskId && (
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
                <ListChecks className="h-3 w-3" /> Subtasks
              </Label>
              <div className="mt-1.5 space-y-1">
                {subtasks.map(st => (
                  <div key={st.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5" data-testid={`subtask-${st.id}`}>
                    <button
                      onClick={() => toggleSubtaskMutation.mutate({ id: st.id, status: st.status === "done" ? "todo" : "done" })}
                      className="shrink-0"
                      aria-label={st.status === "done" ? "Mark not done" : "Mark done"}
                      data-testid={`button-toggle-subtask-${st.id}`}
                    >
                      {st.status === "done"
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />}
                    </button>
                    <button
                      onClick={() => onOpenTask?.(st.id)}
                      className={`text-sm flex-1 text-left truncate hover:underline underline-offset-2 ${st.status === "done" ? "line-through text-muted-foreground" : ""}`}
                      data-testid={`button-open-subtask-${st.id}`}
                    >
                      {st.title}
                    </button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setConfirmDeleteSubtask(st)} aria-label="Delete subtask" data-testid={`button-delete-subtask-${st.id}`}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <div className="flex gap-1.5">
                  <Input
                    value={newSubtaskTitle}
                    onChange={e => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && newSubtaskTitle.trim()) addSubtaskMutation.mutate(newSubtaskTitle.trim()); }}
                    placeholder="Add subtask and press Enter"
                    className="h-8 text-xs"
                    data-testid="input-new-subtask"
                  />
                  <Button size="sm" variant="outline" className="h-8" onClick={() => newSubtaskTitle.trim() && addSubtaskMutation.mutate(newSubtaskTitle.trim())} disabled={!newSubtaskTitle.trim()} data-testid="button-add-subtask">
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Comments + Activity */}
          <div className="pt-1">
            <TaskCommentsActivity taskId={task.id} currentUserId={user?.id} />
          </div>

          {/* Bottom breadcrumb (subtask only) */}
          {parentTask && onOpenTask && (
            <button
              onClick={() => onOpenTask(parentTask.id)}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-lg bg-gradient-to-r from-amber-100 via-amber-50 to-transparent dark:from-amber-500/20 dark:via-amber-500/10 dark:to-transparent border border-amber-300/40 dark:border-amber-500/30 hover:from-amber-200 hover:via-amber-100 dark:hover:from-amber-500/30 dark:hover:via-amber-500/20 transition-colors group text-left"
              data-testid="button-breadcrumb-bottom"
            >
              <div className="h-8 w-8 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm group-hover:bg-amber-600 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-wider text-amber-800/80 dark:text-amber-200/80 font-bold leading-tight">Back to parent task</p>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-100 truncate leading-tight">{parentTask.title}</p>
              </div>
            </button>
          )}

          {/* Footer actions */}
          <div className="border-t border-border pt-4 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              Created {new Date(task.createdAt).toLocaleDateString()}
              {task.completedAt && <> · Completed {new Date(task.completedAt).toLocaleDateString()}</>}
            </p>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirmDeleteTask(true)} data-testid="button-delete-task">
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete task
            </Button>
          </div>
        </div>
      </SheetContent>

      <AlertDialog open={confirmDeleteTask} onOpenChange={setConfirmDeleteTask}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{task.title}</strong>
              {subtasks.length > 0 && <> and its {subtasks.length} subtask{subtasks.length === 1 ? "" : "s"}</>}
              {" "}will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-task">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { deleteMutation.mutate(); setConfirmDeleteTask(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-task"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDeleteSubtask} onOpenChange={(open) => !open && setConfirmDeleteSubtask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this subtask?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{confirmDeleteSubtask?.title}</strong> will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-subtask">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (confirmDeleteSubtask) { deleteSubtaskMutation.mutate(confirmDeleteSubtask.id); } setConfirmDeleteSubtask(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-subtask"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
