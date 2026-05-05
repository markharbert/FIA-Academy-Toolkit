import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, ProjectTask, ProjectColumn } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { dayDiffInTz, formatInTz } from "@shared/datetime";
import { TaskDetailSheet } from "@/components/projects/task-detail-sheet";
import { KanbanBoard } from "@/components/projects/kanban-board";
import {
  ChevronLeft, Plus, CheckCircle2, ChevronDown, ChevronRight,
  CalendarClock, Flag, Loader2, ListChecks, MoreHorizontal,
  MoreVertical, Pencil, Trash2, FileText, LayoutList, LayoutGrid, X,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
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
    txSubtle: useWhite ? "text-white/80" : "text-gray-700",
    chip: useWhite ? "bg-white/15 text-white border-0" : "bg-black/10 text-gray-800 border-0",
  };
}

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
  const [quickAddInputs, setQuickAddInputs] = useState<Record<string, string>>({});
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [dueDateInput, setDueDateInput] = useState("");
  const [view, setView] = useState<"list" | "board">(() => {
    try { return (localStorage.getItem(`project-view-${projectId}`) as "list" | "board") ?? "list"; }
    catch { return "list"; }
  });

  // Column management state (list view)
  const [renamingColId, setRenamingColId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState("");
  const [deleteColId, setDeleteColId] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");

  const switchView = (v: "list" | "board") => {
    setView(v);
    try { localStorage.setItem(`project-view-${projectId}`, v); } catch {}
  };

  const { data: project, isLoading: projectLoading } = useQuery<Project>({ queryKey: ["/api/projects", projectId] });
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<ProjectTask[]>({ queryKey: ["/api/projects", projectId, "tasks"] });
  const { data: columns = [], isLoading: columnsLoading } = useQuery<ProjectColumn[]>({ queryKey: ["/api/projects", projectId, "columns"] });

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

  const tasksByColumn = useMemo(() => {
    const map: Record<string, ProjectTask[]> = {};
    columns.forEach(c => { map[c.id] = []; });
    const firstColId = columns[0]?.id;
    topLevel.forEach(t => {
      const colId = t.columnId ?? firstColId;
      if (colId && map[colId] !== undefined) {
        map[colId].push(t);
      } else if (firstColId) {
        map[firstColId].push(t);
      }
    });
    return map;
  }, [topLevel, columns]);

  const createTaskMutation = useMutation({
    mutationFn: async ({ title, columnId }: { title: string; columnId: string }) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/tasks`, { title, columnId });
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

  const completeProjectMutation = useMutation({
    mutationFn: async (status: "active" | "archived") => {
      await apiRequest("PATCH", `/api/projects/${projectId}`, { status });
    },
    onSuccess: (_data, status) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
      toast({ title: status === "archived" ? "Project marked complete" : "Project reopened" });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
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

  const updateDueDateMutation = useMutation({
    mutationFn: async (dueDate: string | null) => {
      await apiRequest("PATCH", `/api/projects/${projectId}`, { dueDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
      setDueDateOpen(false);
    },
    onError: (err: Error) => toast({ title: "Failed to update due date", description: err.message, variant: "destructive" }),
  });

  const openDueDatePicker = () => {
    const iso = project?.dueDate ? new Date(project.dueDate).toISOString().slice(0, 10) : "";
    setDueDateInput(iso);
    setDueDateOpen(true);
  };

  const createColumnMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/projects/${projectId}/columns`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "columns"] });
      setAddingSection(false);
      setNewSectionName("");
    },
    onError: (err: Error) => toast({ title: "Failed to create section", description: err.message, variant: "destructive" }),
  });

  const renameColumnMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await apiRequest("PATCH", `/api/project-columns/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "columns"] });
      setRenamingColId(null);
    },
    onError: (err: Error) => toast({ title: "Failed to rename section", description: err.message, variant: "destructive" }),
  });

  const deleteColumnMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/project-columns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "columns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      setDeleteColId(null);
    },
    onError: (err: Error) => toast({ title: "Failed to delete section", description: err.message, variant: "destructive" }),
  });

  const submitQuickAdd = (columnId: string) => {
    const title = quickAddInputs[columnId]?.trim();
    if (!title) return;
    createTaskMutation.mutate({ title, columnId });
    setQuickAddInputs(prev => ({ ...prev, [columnId]: "" }));
  };

  const finishRename = (colId: string) => {
    const name = renameText.trim();
    if (name && name !== columns.find(c => c.id === colId)?.name) {
      renameColumnMutation.mutate({ id: colId, name });
    } else {
      setRenamingColId(null);
    }
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

  const hdr = getHeaderTheme(project.color);
  const openParent = openTask?.parentTaskId ? tasks.find(t => t.id === openTask.parentTaskId) ?? null : null;
  const colToDelete = columns.find(c => c.id === deleteColId);

  return (
    <div className="flex-1 overflow-auto bg-background">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0" style={hdr.gradientStyle} />
        <div className="absolute -top-16 -right-10 h-56 w-56 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white/5 blur-2xl pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-6">
          <Link href="/projects">
            <Button variant="ghost" size="sm" className={`${hdr.txSubtle} hover:${hdr.tx} hover:bg-white/10 -ml-2 mb-2`} data-testid="link-back-projects">
              <ChevronLeft className="h-4 w-4 mr-1" /> All projects
            </Button>
          </Link>
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h1 className={`text-3xl font-bold tracking-tight ${hdr.tx}`} data-testid="text-project-detail-title">{project.name}</h1>
              {project.description && (
                <p className={`mt-1 text-sm ${hdr.txSubtle} max-w-2xl`}>{project.description}</p>
              )}
              {/* Due date — clickable badge / add button + inline picker */}
              <div className="relative mt-2">
                {project.dueDate ? (() => {
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
                    <button
                      onClick={openDueDatePicker}
                      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full transition-opacity hover:opacity-80 ${
                        isOverdue ? "bg-rose-500/30 text-white ring-1 ring-rose-200/40" :
                        isSoon ? "bg-amber-400/25 text-white ring-1 ring-amber-200/40" :
                        hdr.chip
                      }`}
                      data-testid="badge-project-detail-due"
                      title="Click to edit due date"
                    >
                      <CalendarClock className="h-3 w-3" /> {label}
                    </button>
                  );
                })() : (
                  <button
                    onClick={openDueDatePicker}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full transition-opacity hover:opacity-80 ${hdr.chip} opacity-70`}
                    data-testid="button-add-project-due-date"
                  >
                    <CalendarClock className="h-3 w-3" /> Add due date
                  </button>
                )}

                {/* Inline date picker panel */}
                {dueDateOpen && (
                  <div
                    className="absolute left-0 top-8 z-50 bg-popover border border-border rounded-xl shadow-xl p-4 w-64 space-y-3"
                    data-testid="panel-due-date-picker"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-foreground">Project due date</span>
                      <button onClick={() => setDueDateOpen(false)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input
                      type="date"
                      value={dueDateInput}
                      onChange={e => setDueDateInput(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      data-testid="input-project-due-date"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-xs"
                        onClick={() => updateDueDateMutation.mutate(dueDateInput || null)}
                        disabled={updateDueDateMutation.isPending}
                        data-testid="button-save-project-due-date"
                      >
                        {updateDueDateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                      </Button>
                      {project.dueDate && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => updateDueDateMutation.mutate(null)}
                          disabled={updateDueDateMutation.isPending}
                          data-testid="button-clear-project-due-date"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <Badge className={hdr.chip}>
                {topLevel.filter(t => t.status !== "done").length} open
              </Badge>
              <Badge className={hdr.chip}>
                {topLevel.filter(t => t.status === "done").length} done
              </Badge>
              {/* View toggle */}
              <div className="flex items-center rounded-md border border-white/20 overflow-hidden bg-white/10">
                <button
                  onClick={() => switchView("list")}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${view === "list" ? "bg-white/25 text-white" : "text-white/70 hover:text-white hover:bg-white/15"}`}
                  data-testid="button-view-list"
                >
                  <LayoutList className="h-3.5 w-3.5" /> List
                </button>
                <button
                  onClick={() => switchView("board")}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium transition-colors ${view === "board" ? "bg-white/25 text-white" : "text-white/70 hover:text-white hover:bg-white/15"}`}
                  data-testid="button-view-board"
                >
                  <LayoutGrid className="h-3.5 w-3.5" /> Board
                </button>
              </div>
              {project.status === "archived" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs font-semibold bg-white/10 text-white/80 hover:text-white hover:bg-white/20 border border-white/20"
                  onClick={() => completeProjectMutation.mutate("active")}
                  disabled={completeProjectMutation.isPending}
                  data-testid="button-reopen-project"
                >
                  {completeProjectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                  Reopen project
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs font-semibold bg-emerald-500/20 text-white border border-emerald-300/30 hover:bg-emerald-500/35"
                  onClick={() => completeProjectMutation.mutate("archived")}
                  disabled={completeProjectMutation.isPending}
                  data-testid="button-complete-project"
                >
                  {completeProjectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                  Complete project
                </Button>
              )}
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

      {/* Board view */}
      {view === "board" && (
        <KanbanBoard
          projectId={projectId}
          tasks={tasks}
          tz={tz}
          onOpenTask={setOpenTaskId}
        />
      )}

      {/* List view */}
      <div className={`max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4 ${view === "board" ? "hidden" : ""}`}>
        {(tasksLoading || columnsLoading) ? (
          <div className="text-center py-10 text-muted-foreground">Loading tasks…</div>
        ) : (
          <>
            {columns.map(col => {
              const items = tasksByColumn[col.id] ?? [];
              const isRenaming = renamingColId === col.id;
              return (
                <Card key={col.id} className="overflow-hidden" data-testid={`section-${col.id}`}>
                  <CardContent className="p-0">
                    {/* Section header */}
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
                      <div
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: col.color ?? "hsl(var(--muted-foreground) / 0.5)" }}
                      />
                      {isRenaming ? (
                        <input
                          autoFocus
                          value={renameText}
                          onChange={e => setRenameText(e.target.value)}
                          onBlur={() => finishRename(col.id)}
                          onKeyDown={e => {
                            if (e.key === "Enter") finishRename(col.id);
                            if (e.key === "Escape") setRenamingColId(null);
                          }}
                          className="flex-1 text-xs uppercase tracking-wider font-semibold bg-transparent border-b border-primary outline-none text-foreground min-w-0"
                          data-testid={`input-rename-section-${col.id}`}
                        />
                      ) : (
                        <h2
                          className="flex-1 text-xs uppercase tracking-wider font-semibold text-foreground min-w-0 truncate cursor-default select-none"
                          onDoubleClick={() => { setRenamingColId(col.id); setRenameText(col.name); }}
                          data-testid={`text-section-name-${col.id}`}
                        >
                          {col.name}
                        </h2>
                      )}
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">· {items.length}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                            data-testid={`button-section-menu-${col.id}`}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => { setRenamingColId(col.id); setRenameText(col.name); }}
                            data-testid={`menu-rename-section-${col.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5 mr-2" /> Rename section
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteColId(col.id)}
                            disabled={columns.length === 1}
                            data-testid={`menu-delete-section-${col.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            {columns.length === 1 ? "Can't delete only section" : "Delete section"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Tasks */}
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
                          value={quickAddInputs[col.id] ?? ""}
                          onChange={e => setQuickAddInputs(prev => ({ ...prev, [col.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") submitQuickAdd(col.id); }}
                          placeholder={`Add a task to ${col.name}…`}
                          className="h-7 text-sm border-0 shadow-none px-1 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                          data-testid={`input-quick-add-${col.id}`}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Add section */}
            {addingSection ? (
              <Card className="overflow-hidden border-dashed">
                <CardContent className="p-3 space-y-2">
                  <Input
                    autoFocus
                    value={newSectionName}
                    onChange={e => setNewSectionName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") { const n = newSectionName.trim(); if (n) createColumnMutation.mutate(n); }
                      if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); }
                    }}
                    placeholder="Section name…"
                    className="h-8 text-sm"
                    data-testid="input-new-section-name"
                  />
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => { const n = newSectionName.trim(); if (n) createColumnMutation.mutate(n); }}
                      disabled={createColumnMutation.isPending}
                      data-testid="button-confirm-add-section"
                    >
                      {createColumnMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Add section"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setAddingSection(false); setNewSectionName(""); }}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Button
                variant="outline"
                className="w-full border-dashed text-muted-foreground hover:text-foreground gap-2"
                onClick={() => setAddingSection(true)}
                data-testid="button-add-section"
              >
                <Plus className="h-4 w-4" /> Add section
              </Button>
            )}
          </>
        )}
      </div>

      {/* Delete section confirmation */}
      <AlertDialog open={!!deleteColId} onOpenChange={o => !o && setDeleteColId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete "{colToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>All tasks in this section will be moved to the first remaining section, then the section will be permanently deleted.</p>
                <p className="font-semibold text-destructive">This is permanent. There is no way to get it back.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteColId && deleteColumnMutation.mutate(deleteColId)}
              data-testid="button-confirm-delete-section"
            >
              {deleteColumnMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Delete section
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        columns={columns}
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
