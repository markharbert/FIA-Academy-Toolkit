import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ProjectWithCounts, ProjectTask } from "@shared/schema";

type UrgentTask = ProjectTask & { projectName: string; projectColor: string };
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Briefcase, Plus, MoreVertical, Archive, ArchiveRestore, Trash2, ChevronRight, CalendarClock, CircleCheck, CircleDot, Loader2, Pencil, LayoutGrid, List, Flame, Clock, AlertTriangle } from "lucide-react";

const COLOR_PALETTE = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f59e0b", // amber
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#64748b", // slate
];

function ProjectCard({ p, onEdit, onArchive, onDelete }: { p: ProjectWithCounts; onEdit: (p: ProjectWithCounts) => void; onArchive: (p: ProjectWithCounts) => void; onDelete: (p: ProjectWithCounts) => void }) {
  const completionPct = p.totalTasks > 0 ? Math.round((p.doneTasks / p.totalTasks) * 100) : 0;
  return (
    <Card className="group relative overflow-hidden hover-elevate transition-all" data-testid={`card-project-${p.id}`}>
      <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: p.color }} />
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/projects/${p.id}`} className="flex-1 min-w-0">
            <h3 className="font-semibold text-base leading-tight truncate" data-testid={`text-project-name-${p.id}`}>{p.name}</h3>
            {p.description && (
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{p.description}</p>
            )}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1 -mt-1 shrink-0" data-testid={`button-project-menu-${p.id}`}>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(p)} data-testid={`menu-edit-${p.id}`}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Edit details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onArchive(p)} data-testid={`menu-archive-${p.id}`}>
                {p.status === "archived" ? <><ArchiveRestore className="h-3.5 w-3.5 mr-2" /> Unarchive</> : <><Archive className="h-3.5 w-3.5 mr-2" /> Archive</>}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete(p)} className="text-destructive focus:text-destructive" data-testid={`menu-delete-${p.id}`}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Link href={`/projects/${p.id}`}>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold tabular-nums">{p.openTasks}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Open</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{p.doneTasks}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Done</p>
            </div>
            <div>
              <p className={`text-lg font-bold tabular-nums ${p.dueThisWeek > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{p.dueThisWeek}</p>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Due 7d</p>
            </div>
          </div>

          {p.totalTasks > 0 && (
            <div className="mt-3">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${completionPct}%`, background: p.color }} />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">{completionPct}% complete</p>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between">
            {p.status === "archived" ? (
              <Badge variant="secondary" className="text-[10px]">Archived</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">Active</Badge>
            )}
            <span className="inline-flex items-center text-xs text-muted-foreground group-hover:text-foreground transition-colors">
              Open <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </span>
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}

function formatDueLabel(due: Date): { text: string; tone: "overdue" | "soon" | "today" | "tomorrow" } {
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);
  const minutes = Math.round(absMs / 60000);
  const hours = Math.round(absMs / 3600000);

  if (diffMs < 0) {
    if (hours < 1) return { text: `${minutes}m overdue`, tone: "overdue" };
    if (hours < 24) return { text: `${hours}h overdue`, tone: "overdue" };
    return { text: `${Math.round(hours / 24)}d overdue`, tone: "overdue" };
  }
  const sameDay = due.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = due.toDateString() === tomorrow.toDateString();

  if (hours < 1) return { text: `in ${minutes}m`, tone: "soon" };
  if (sameDay) return { text: `today ${due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`, tone: "today" };
  if (isTomorrow) return { text: `tomorrow ${due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`, tone: "tomorrow" };
  return { text: `in ${hours}h`, tone: "soon" };
}

function UrgentTasksBanner({ tasks }: { tasks: UrgentTask[] }) {
  const overdue = tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date());
  const upcoming = tasks.filter(t => t.dueDate && new Date(t.dueDate) >= new Date());

  return (
    <div className="rounded-xl border border-rose-500/20 bg-gradient-to-br from-rose-500/5 via-amber-500/5 to-rose-500/5 dark:from-rose-500/10 dark:via-amber-500/10 dark:to-rose-500/10 overflow-hidden" data-testid="card-urgent-tasks">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-rose-500/15 bg-rose-500/5">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center shadow-sm">
            <Flame className="h-3.5 w-3.5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold leading-tight" data-testid="text-urgent-tasks-title">Urgent — due in next 48 hours</h2>
            <p className="text-[11px] text-muted-foreground leading-tight">
              {overdue.length > 0 && <span className="text-rose-600 dark:text-rose-400 font-medium">{overdue.length} overdue</span>}
              {overdue.length > 0 && upcoming.length > 0 && <span> · </span>}
              {upcoming.length > 0 && <span>{upcoming.length} upcoming</span>}
            </p>
          </div>
        </div>
        <Badge variant="outline" className="bg-background/50 text-[10px]" data-testid="badge-urgent-count">
          {tasks.length} task{tasks.length === 1 ? "" : "s"}
        </Badge>
      </div>
      <ul className="divide-y divide-rose-500/10 max-h-[280px] overflow-auto">
        {tasks.map(t => {
          const due = t.dueDate ? new Date(t.dueDate) : null;
          const label = due ? formatDueLabel(due) : null;
          const toneClasses =
            label?.tone === "overdue" ? "text-rose-700 dark:text-rose-400 bg-rose-500/10" :
            label?.tone === "soon"    ? "text-amber-700 dark:text-amber-400 bg-amber-500/10" :
            label?.tone === "today"   ? "text-amber-700 dark:text-amber-400 bg-amber-500/10" :
            "text-foreground/80 bg-muted";
          return (
            <li key={t.id} data-testid={`urgent-task-${t.id}`}>
              <Link href={`/projects/${t.projectId}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-rose-500/[0.04] transition-colors group">
                {label?.tone === "overdue"
                  ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                  : <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                }
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{t.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: t.projectColor }} aria-hidden="true" />
                    <p className="text-[11px] text-muted-foreground truncate">{t.projectName}</p>
                    {t.priority && t.priority !== "none" && (
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1 py-0 h-3.5 leading-none uppercase tracking-wide shrink-0 border-0 ${
                          t.priority === "urgent" ? "bg-rose-600 text-white" :
                          t.priority === "high"   ? "bg-orange-500 text-white" :
                          t.priority === "medium" ? "bg-amber-500 text-white" :
                          t.priority === "low"    ? "bg-sky-500 text-white" : ""
                        }`}
                      >{t.priority}</Badge>
                    )}
                  </div>
                </div>
                {label && (
                  <span className={`text-[10px] font-semibold uppercase tracking-wide tabular-nums px-1.5 py-0.5 rounded shrink-0 ${toneClasses}`}>{label.text}</span>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProjectList({
  projects,
  onEdit,
  onArchive,
  onDelete,
}: {
  projects: ProjectWithCounts[];
  onEdit: (p: ProjectWithCounts) => void;
  onArchive: (p: ProjectWithCounts) => void;
  onDelete: (p: ProjectWithCounts) => void;
}) {
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card" data-testid="list-projects">
      {/* header (md+) */}
      <div className="hidden md:grid grid-cols-[1fr_80px_80px_80px_140px_40px] items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/30 text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">
        <div>Project</div>
        <div className="text-center">Open</div>
        <div className="text-center">Done</div>
        <div className="text-center">Due 7d</div>
        <div>Progress</div>
        <div></div>
      </div>
      <ul className="divide-y divide-border">
        {projects.map(p => {
          const completionPct = p.totalTasks > 0 ? Math.round((p.doneTasks / p.totalTasks) * 100) : 0;
          return (
            <li key={p.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_80px_80px_80px_140px_40px] items-center gap-3 px-4 py-3 hover-elevate transition-colors group" data-testid={`row-project-${p.id}`}>
              <Link href={`/projects/${p.id}`} className="flex items-center gap-3 min-w-0">
                <span className="h-3 w-3 rounded-full shrink-0" style={{ background: p.color }} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate" data-testid={`text-list-project-name-${p.id}`}>{p.name}</p>
                    {p.status === "archived" && (
                      <Badge variant="secondary" className="text-[10px] shrink-0">Archived</Badge>
                    )}
                  </div>
                  {p.description && (
                    <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                  )}
                  {/* mobile-only meta */}
                  <div className="flex md:hidden items-center gap-3 mt-1 text-[11px] text-muted-foreground tabular-nums">
                    <span>{p.openTasks} open</span>
                    <span className="text-emerald-600 dark:text-emerald-400">{p.doneTasks} done</span>
                    {p.dueThisWeek > 0 && <span className="text-amber-600 dark:text-amber-400">{p.dueThisWeek} due</span>}
                  </div>
                </div>
              </Link>
              <div className="hidden md:block text-center text-sm tabular-nums">{p.openTasks}</div>
              <div className="hidden md:block text-center text-sm tabular-nums text-emerald-600 dark:text-emerald-400">{p.doneTasks}</div>
              <div className={`hidden md:block text-center text-sm tabular-nums ${p.dueThisWeek > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>{p.dueThisWeek}</div>
              <div className="hidden md:flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full transition-all" style={{ width: `${completionPct}%`, background: p.color }} />
                </div>
                <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">{completionPct}%</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" data-testid={`button-list-project-menu-${p.id}`}>
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(p)} data-testid={`menu-list-edit-${p.id}`}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onArchive(p)} data-testid={`menu-list-archive-${p.id}`}>
                    {p.status === "archived" ? <><ArchiveRestore className="h-3.5 w-3.5 mr-2" /> Unarchive</> : <><Archive className="h-3.5 w-3.5 mr-2" /> Archive</>}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(p)} className="text-destructive focus:text-destructive" data-testid={`menu-list-delete-${p.id}`}>
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function ProjectsPage() {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [showArchived, setShowArchived] = useState(false);
  const [view, setView] = useState<"cards" | "list">(() => {
    if (typeof window === "undefined") return "cards";
    return (localStorage.getItem("projects-view") as "cards" | "list") || "cards";
  });
  const setViewMode = (v: "cards" | "list") => {
    setView(v);
    try { localStorage.setItem("projects-view", v); } catch {}
  };
  const [deleteTarget, setDeleteTarget] = useState<ProjectWithCounts | null>(null);
  const [editTarget, setEditTarget] = useState<ProjectWithCounts | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState(COLOR_PALETTE[0]);
  const [editStatus, setEditStatus] = useState<"active" | "archived">("active");

  const openEdit = (p: ProjectWithCounts) => {
    setEditTarget(p);
    setEditName(p.name);
    setEditDescription(p.description || "");
    setEditColor(p.color);
    setEditStatus(p.status === "archived" ? "archived" : "active");
  };

  const { data: projects = [], isLoading } = useQuery<ProjectWithCounts[]>({ queryKey: ["/api/projects"] });
  const { data: urgentTasks = [] } = useQuery<UrgentTask[]>({ queryKey: ["/api/projects/urgent-tasks"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/projects", { name, description, color });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
      setName(""); setDescription(""); setColor(COLOR_PALETTE[0]);
      setCreateOpen(false);
      toast({ title: "Project created" });
    },
    onError: (err: Error) => toast({ title: "Failed to create", description: err.message, variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: async (p: ProjectWithCounts) => {
      await apiRequest("PATCH", `/api/projects/${p.id}`, { status: p.status === "archived" ? "active" : "archived" });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/projects"] }),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editTarget) return;
      await apiRequest("PATCH", `/api/projects/${editTarget.id}`, {
        name: editName.trim(),
        description: editDescription.trim(),
        color: editColor,
        status: editStatus,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
      setEditTarget(null);
      toast({ title: "Project updated" });
    },
    onError: (err: Error) => toast({ title: "Failed to update", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/projects/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
      setDeleteTarget(null);
      toast({ title: "Project deleted" });
    },
  });

  const active = projects.filter(p => p.status === "active");
  const archived = projects.filter(p => p.status === "archived");
  const visible = showArchived ? archived : active;

  return (
    <div className="flex-1 overflow-auto bg-background">
      {/* Header */}
      <div className="border-b border-border bg-gradient-to-br from-[hsl(230_60%_18%)] to-[hsl(245_60%_30%)] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-7">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-white/70 text-xs uppercase tracking-wide font-medium">
                <Briefcase className="h-3.5 w-3.5" /> Projects
              </div>
              <h1 className="mt-1 text-3xl font-bold tracking-tight" data-testid="text-projects-title">Your Projects</h1>
              <p className="mt-1 text-sm text-white/80">Plan, organize, and ship the work that runs your business.</p>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-white text-[hsl(245_60%_30%)] hover:bg-white/90 shadow-lg" data-testid="button-new-project">
                  <Plus className="h-4 w-4 mr-1.5" /> New Project
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md" data-testid="dialog-new-project">
                <DialogHeader>
                  <DialogTitle>New project</DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                  <div>
                    <Label htmlFor="proj-name">Name</Label>
                    <Input id="proj-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. YouTube Channel Q3" data-testid="input-project-name" />
                  </div>
                  <div>
                    <Label htmlFor="proj-desc">Description (optional)</Label>
                    <Textarea id="proj-desc" rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this project about?" data-testid="input-project-description" />
                  </div>
                  <div>
                    <Label>Color</Label>
                    <div className="mt-1.5 flex gap-1.5 flex-wrap">
                      {COLOR_PALETTE.map(c => (
                        <button key={c} type="button" onClick={() => setColor(c)} className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition-all ${color === c ? "ring-2 ring-foreground" : "hover:scale-110"}`} style={{ background: c }} aria-label={`Color ${c}`} data-testid={`color-${c.replace("#", "")}`} />
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={() => createMutation.mutate()} disabled={!name.trim() || createMutation.isPending} data-testid="button-create-project">
                    {createMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* tabs + view toggle */}
          <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1.5">
              <button
                onClick={() => setShowArchived(false)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${!showArchived ? "bg-white text-[hsl(245_60%_30%)]" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
                data-testid="tab-active"
              >
                <CircleDot className="h-3 w-3 inline mr-1" /> Active · {active.length}
              </button>
              <button
                onClick={() => setShowArchived(true)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${showArchived ? "bg-white text-[hsl(245_60%_30%)]" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
                data-testid="tab-archived"
              >
                <Archive className="h-3 w-3 inline mr-1" /> Archived · {archived.length}
              </button>
            </div>
            <div className="inline-flex items-center rounded-full bg-white/10 p-0.5" role="tablist" aria-label="View mode">
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                aria-pressed={view === "cards"}
                title="Card view"
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${view === "cards" ? "bg-white text-[hsl(245_60%_30%)] shadow-sm" : "text-white/80 hover:text-white"}`}
                data-testid="button-view-cards"
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                aria-pressed={view === "list"}
                title="List view"
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${view === "list" ? "bg-white text-[hsl(245_60%_30%)] shadow-sm" : "text-white/80 hover:text-white"}`}
                data-testid="button-view-list"
              >
                <List className="h-3.5 w-3.5" /> List
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {urgentTasks.length > 0 && <UrgentTasksBanner tasks={urgentTasks} />}
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center" data-testid="empty-projects">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Briefcase className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold">{showArchived ? "No archived projects" : "No projects yet"}</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              {showArchived ? "Archived projects show up here." : "Create your first project to start organizing tasks and notes."}
            </p>
            {!showArchived && (
              <Button onClick={() => setCreateOpen(true)} data-testid="button-empty-create">
                <Plus className="h-4 w-4 mr-1.5" /> New Project
              </Button>
            )}
          </div>
        ) : view === "cards" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map(p => (
              <ProjectCard
                key={p.id}
                p={p}
                onEdit={openEdit}
                onArchive={(p) => archiveMutation.mutate(p)}
                onDelete={(p) => setDeleteTarget(p)}
              />
            ))}
          </div>
        ) : (
          <ProjectList
            projects={visible}
            onEdit={openEdit}
            onArchive={(p) => archiveMutation.mutate(p)}
            onDelete={(p) => setDeleteTarget(p)}
          />
        )}
      </div>

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-edit-project">
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="edit-proj-name">Name</Label>
              <Input id="edit-proj-name" value={editName} onChange={e => setEditName(e.target.value)} data-testid="input-edit-project-name" />
            </div>
            <div>
              <Label htmlFor="edit-proj-desc">Description (optional)</Label>
              <Textarea id="edit-proj-desc" rows={3} value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="What is this project about?" data-testid="input-edit-project-description" />
            </div>
            <div>
              <Label>Color</Label>
              <div className="mt-1.5 flex gap-1.5 flex-wrap">
                {COLOR_PALETTE.map(c => (
                  <button key={c} type="button" onClick={() => setEditColor(c)} className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition-all ${editColor === c ? "ring-2 ring-foreground" : "hover:scale-110"}`} style={{ background: c }} aria-label={`Color ${c}`} data-testid={`edit-color-${c.replace("#", "")}`} />
                ))}
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditStatus("active")}
                  className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold border transition-all ${editStatus === "active" ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}
                  data-testid="button-edit-status-active"
                >
                  <CircleDot className="h-3 w-3 inline mr-1" /> Active
                </button>
                <button
                  type="button"
                  onClick={() => setEditStatus("archived")}
                  className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold border transition-all ${editStatus === "archived" ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}
                  data-testid="button-edit-status-archived"
                >
                  <Archive className="h-3 w-3 inline mr-1" /> Archived
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button onClick={() => editMutation.mutate()} disabled={!editName.trim() || editMutation.isPending} data-testid="button-save-edit-project">
              {editMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.name}</strong> and all of its tasks will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-project"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
