import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, ProjectTask } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { dayDiffInTz, formatInTz } from "@shared/datetime";
import { TaskDetailSheet } from "@/components/projects/task-detail-sheet";
import { ChevronLeft, Plus, CheckCircle2, ChevronDown, ChevronRight, CalendarClock, Flag, Loader2, ListChecks, MoreVertical, FileText } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const STATUS_GROUPS: Array<{ value: "todo" | "in_progress" | "done"; label: string; tone: string }> = [
  { value: "todo",        label: "To do",        tone: "text-muted-foreground" },
  { value: "in_progress", label: "In progress",  tone: "text-sky-600 dark:text-sky-400" },
  { value: "done",        label: "Done",         tone: "text-emerald-600 dark:text-emerald-400" },
];

const PRIORITY_TONE: Record<string, string> = {
  none:   "",
  low:    "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  high:   "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  urgent: "bg-rose-600 text-white dark:bg-rose-600 dark:text-white ring-1 ring-rose-300/60",
};

function dueDateTone(due: Date | null, status: string, tz: string) {
  if (!due || status === "done") return "text-muted-foreground bg-muted";
  const diffDays = dayDiffInTz(due, tz);
  if (diffDays < 0) return "text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-900/40";
  if (diffDays <= 1) return "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40";
  return "text-sky-700 bg-sky-100 dark:text-sky-300 dark:bg-sky-900/40";
}

function dueDateLabel(due: Date, tz: string) {
  const diffDays = dayDiffInTz(due, tz);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays < 0) return `${-diffDays}d overdue`;
  if (diffDays <= 6) return formatInTz(due, tz, "EEE");
  return formatInTz(due, tz, "MMM d");
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.id!;
  const { toast } = useToast();
  const { user } = useAuth();
  const tz = user?.timezone || "America/New_York";
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [quickAddInputs, setQuickAddInputs] = useState<Record<string, string>>({ todo: "", in_progress: "", done: "" });
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");

  const { data: project, isLoading: projectLoading } = useQuery<Project>({ queryKey: ["/api/projects", projectId] });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<ProjectTask[]>({ queryKey: ["/api/projects", projectId, "tasks"] });

  const topLevel = useMemo(() => tasks.filter(t => !t.parentTaskId), [tasks]);
  const subtasksByParent = useMemo(() => {
    const map: Record<string, ProjectTask[]> = {};
    tasks.filter(t => t.parentTaskId).forEach(t => {
      const arr = map[t.parentTaskId!] ?? [];
      arr.push(t);
      map[t.parentTaskId!] = arr;
    });
    return map;
  }, [tasks]);

  const groups = useMemo(() => {
    const out: Record<string, ProjectTask[]> = { todo: [], in_progress: [], done: [] };
    topLevel.forEach(t => { (out[t.status] ?? out.todo).push(t); });
    return out;
  }, [topLevel]);

  const createTaskMutation = useMutation({
    mutationFn: async ({ title, status }: { title: string; status: string }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/tasks`, { title, status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/urgent-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/tasks/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/all-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/urgent-tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
    },
  });

  const saveAsTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/save-as-template`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      setSaveTemplateOpen(false);
      setSaveTemplateName("");
      toast({ title: "Saved as template", description: "Find it under Projects → Templates." });
    },
    onError: (err: Error) => toast({ title: "Failed to save as template", description: err.message, variant: "destructive" }),
  });

  const submitQuickAdd = (status: string) => {
    const title = quickAddInputs[status]?.trim();
    if (!title) return;
    createTaskMutation.mutate({ title, status });
    setQuickAddInputs(prev => ({ ...prev, [status]: "" }));
  };

  if (projectLoading || !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading project…
      </div>
    );
  }

  const openTask = openTaskId ? tasks.find(t => t.id === openTaskId) ?? null : null;
  const openSubs = openTask && !openTask.parentTaskId ? (subtasksByParent[openTask.id] ?? []) : [];
  const openParent = openTask?.parentTaskId ? tasks.find(t => t.id === openTask.parentTaskId) ?? null : null;

  return (
    <div className="flex-1 overflow-auto bg-background">
      {/* Header */}
      <div className="border-b border-border" style={{ background: `linear-gradient(135deg, ${project.color}E6, ${project.color}99)` }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 text-white">
          <Link href="/projects">
            <Button variant="ghost" size="sm" className="text-white/80 hover:text-white hover:bg-white/10 -ml-2 mb-2" data-testid="link-back-projects">
              <ChevronLeft className="h-4 w-4 mr-1" /> All projects
            </Button>
          </Link>
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold tracking-tight" data-testid="text-project-detail-title">{project.name}</h1>
              {project.description && (
                <p className="mt-1 text-sm text-white/85 max-w-2xl">{project.description}</p>
              )}
              {project.dueDate && (() => {
                const due = new Date(project.dueDate);
                const diffDays = dayDiffInTz(due, tz);
                let label: string;
                if (diffDays < 0) label = `${-diffDays}d overdue`;
                else if (diffDays === 0) label = "Due today";
                else if (diffDays === 1) label = "Due tomorrow";
                else if (diffDays <= 7) label = `Due in ${diffDays}d`;
                else label = `Due ${formatInTz(due, tz, "MMM d, yyyy")}`;
                const isOverdue = diffDays < 0;
                const isSoon = diffDays >= 0 && diffDays <= 7;
                return (
                  <span
                    className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full ${
                      isOverdue ? "bg-rose-500/30 text-white ring-1 ring-rose-200/40" :
                      isSoon ? "bg-amber-400/25 text-white ring-1 ring-amber-200/40" :
                      "bg-white/15 text-white"
                    }`}
                    data-testid="badge-project-detail-due"
                    title={formatInTz(due, tz, "EEEE, MMMM d, yyyy")}
                  >
                    <CalendarClock className="h-3 w-3" /> {label}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center gap-3 text-sm text-white/85">
              <Badge className="bg-white/15 text-white border-0">
                {topLevel.filter(t => t.status !== "done").length} open
              </Badge>
              <Badge className="bg-white/15 text-white border-0">
                {topLevel.filter(t => t.status === "done").length} done
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:text-white hover:bg-white/15" data-testid="button-project-menu">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => { setSaveTemplateName(`${project.name} template`); setSaveTemplateOpen(true); }}
                    data-testid="menu-save-as-template"
                  >
                    <FileText className="h-3.5 w-3.5 mr-2" /> Save as template
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {tasksLoading ? (
          <div className="text-center py-10 text-muted-foreground">Loading tasks…</div>
        ) : (
          STATUS_GROUPS.map(group => {
            const items = groups[group.value] ?? [];
            return (
              <Card key={group.value} className="overflow-hidden">
                <CardContent className="p-0">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
                    <h2 className={`text-xs uppercase tracking-wider font-semibold ${group.tone}`}>{group.label}</h2>
                    <span className="text-xs text-muted-foreground tabular-nums">· {items.length}</span>
                  </div>
                  <div className="divide-y divide-border">
                    {items.length === 0 && (
                      <p className="px-4 py-3 text-xs text-muted-foreground italic">No tasks here yet.</p>
                    )}
                    {items.map(task => {
                      const subs = subtasksByParent[task.id] ?? [];
                      const isExpanded = expanded[task.id];
                      const due = task.dueDate ? new Date(task.dueDate) : null;
                      return (
                        <div key={task.id} data-testid={`task-row-${task.id}`}>
                          <div className="flex items-center gap-2 px-4 py-2 hover:bg-muted/30 group">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleStatusMutation.mutate({ id: task.id, status: task.status === "done" ? "todo" : "done" }); }}
                              className="shrink-0"
                              aria-label={task.status === "done" ? "Mark not done" : "Mark done"}
                              data-testid={`button-toggle-${task.id}`}
                            >
                              {task.status === "done"
                                ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                                : <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/40 hover:border-foreground transition-colors" />}
                            </button>

                            {subs.length > 0 ? (
                              <button
                                onClick={() => setExpanded(p => ({ ...p, [task.id]: !p[task.id] }))}
                                className="shrink-0 text-muted-foreground hover:text-foreground"
                                aria-label={isExpanded ? "Collapse" : "Expand"}
                                data-testid={`button-expand-${task.id}`}
                              >
                                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              </button>
                            ) : (
                              <span className="w-4 shrink-0" />
                            )}

                            <button
                              onClick={() => setOpenTaskId(task.id)}
                              className="flex-1 min-w-0 text-left"
                              data-testid={`button-open-task-${task.id}`}
                            >
                              <span className={`text-sm ${task.status === "done" ? "line-through text-muted-foreground" : ""}`}>{task.title}</span>
                            </button>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {task.priority !== "none" && (
                                <Badge className={`text-[10px] gap-0.5 px-1.5 py-0 ${PRIORITY_TONE[task.priority]}`} variant="secondary">
                                  <Flag className="h-2.5 w-2.5" /> {task.priority}
                                </Badge>
                              )}
                              {due && (
                                <Badge className={`text-[10px] gap-0.5 px-1.5 py-0 ${dueDateTone(due, task.status, tz)}`} variant="secondary">
                                  <CalendarClock className="h-2.5 w-2.5" /> {dueDateLabel(due, tz)}
                                </Badge>
                              )}
                              {subs.length > 0 && (
                                <Badge variant="outline" className="text-[10px] gap-0.5 px-1.5 py-0">
                                  <ListChecks className="h-2.5 w-2.5" /> {subs.filter(s => s.status === "done").length}/{subs.length}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {isExpanded && subs.length > 0 && (
                            <div className="bg-muted/20 border-t border-border">
                              {subs.map(st => (
                                <div key={st.id} className="flex items-center gap-2 pl-12 pr-4 py-1.5 hover:bg-muted/30" data-testid={`subtask-row-${st.id}`}>
                                  <button
                                    onClick={() => toggleStatusMutation.mutate({ id: st.id, status: st.status === "done" ? "todo" : "done" })}
                                    className="shrink-0"
                                    aria-label="Toggle"
                                  >
                                    {st.status === "done"
                                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                      : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />}
                                  </button>
                                  <button onClick={() => setOpenTaskId(st.id)} className="text-sm text-left flex-1 min-w-0">
                                    <span className={st.status === "done" ? "line-through text-muted-foreground" : ""}>{st.title}</span>
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Quick add */}
                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/10">
                      <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Input
                        value={quickAddInputs[group.value] ?? ""}
                        onChange={e => setQuickAddInputs(prev => ({ ...prev, [group.value]: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") submitQuickAdd(group.value); }}
                        placeholder={`Add a task to ${group.label.toLowerCase()}…`}
                        className="h-7 text-sm border-0 shadow-none px-1 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                        data-testid={`input-quick-add-${group.value}`}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Dialog open={saveTemplateOpen} onOpenChange={setSaveTemplateOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-save-as-template">
          <DialogHeader>
            <DialogTitle>Save project as template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Captures the current task list (titles, notes, priority, tags, links, and one-level subtasks). Due dates and statuses are not stored — pick those when you create a project from this template.
            </p>
            <div>
              <Label htmlFor="save-tpl-name">Template name</Label>
              <Input
                id="save-tpl-name"
                value={saveTemplateName}
                onChange={e => setSaveTemplateName(e.target.value)}
                placeholder="Template name"
                data-testid="input-save-template-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveTemplateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => saveAsTemplateMutation.mutate(saveTemplateName.trim() || `${project.name} template`)}
              disabled={saveAsTemplateMutation.isPending}
              data-testid="button-confirm-save-template"
            >
              {saveAsTemplateMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TaskDetailSheet
        project={project}
        task={openTask}
        parentTask={openParent}
        subtasks={openSubs}
        open={!!openTaskId}
        onOpenChange={(o) => { if (!o) setOpenTaskId(null); }}
        onOpenTask={(id) => setOpenTaskId(id)}
      />
    </div>
  );
}
