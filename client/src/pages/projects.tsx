import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { ProjectWithCounts, ProjectTask, ProjectTemplateWithCounts, Project, ProjectColumn } from "@shared/schema";
import { TaskDetailSheet } from "@/components/projects/task-detail-sheet";

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
import { useAuth } from "@/lib/auth";
import { dayDiffInTz, dueDateKey as dueDateKeyInTz, dueHasTime, formatInTz } from "@shared/datetime";
import { Briefcase, Plus, MoreVertical, Archive, ArchiveRestore, Trash2, ChevronRight, ChevronLeft, CalendarClock, CalendarDays, CircleCheck, CircleDot, Loader2, Pencil, LayoutGrid, List, Flame, Clock, AlertTriangle, X, ListChecks, Inbox, Layers, Copy, FileText, Upload } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function formatProjectDueLabel(due: Date, tz?: string | null): { text: string; tone: "overdue" | "soon" | "today" | "tomorrow" | "future" } {
  const z = tz || "America/New_York";
  const diffDays = dayDiffInTz(due, z);
  if (diffDays < 0) return { text: `${-diffDays}d overdue`, tone: "overdue" };
  if (diffDays === 0) return { text: "Due today", tone: "today" };
  if (diffDays === 1) return { text: "Due tomorrow", tone: "tomorrow" };
  if (diffDays <= 7) return { text: `Due in ${diffDays}d`, tone: "soon" };
  return { text: `Due ${formatInTz(due, z, "MMM d")}`, tone: "future" };
}

function projectDueToneClasses(tone: "overdue" | "soon" | "today" | "tomorrow" | "future"): string {
  switch (tone) {
    case "overdue":  return "text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/40";
    case "today":    return "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40";
    case "tomorrow": return "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40";
    case "soon":     return "text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/40";
    default:         return "text-muted-foreground bg-muted";
  }
}

// Convert a stored Date / ISO string (UTC midnight calendar day) into a yyyy-mm-dd
// value usable by <input type="date">. Uses UTC components so a date selected in any
// timezone always round-trips as the same calendar date.
function dateToInputValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "";
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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

function TemplatesTab({
  templates, isLoading, onCreate, onUse, onDuplicate, onDelete,
}: {
  templates: ProjectTemplateWithCounts[];
  isLoading: boolean;
  onCreate: () => void;
  onUse: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (t: ProjectTemplateWithCounts) => void;
}) {
  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…</div>;
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Project templates</h2>
          <p className="text-xs text-muted-foreground">Reusable blueprints with tasks, subtasks, notes, priorities, tags, and links. Pick one in “Start from” when you create a project.</p>
        </div>
        <Button onClick={onCreate} data-testid="button-create-template">
          <Plus className="h-4 w-4 mr-1.5" /> New template
        </Button>
      </div>
      {templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center" data-testid="empty-templates">
          <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Layers className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="font-semibold">No templates yet</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Build a template from scratch, or save an existing project as a template from its menu.</p>
          <Button onClick={onCreate} data-testid="button-empty-create-template">
            <Plus className="h-4 w-4 mr-1.5" /> New template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map(t => (
            <Card key={t.id} className="overflow-hidden hover-elevate active-elevate-2" data-testid={`card-template-${t.id}`}>
              <div className="h-1.5" style={{ background: t.color }} />
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/projects/templates/${t.id}`} className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate hover:underline" data-testid={`text-template-name-${t.id}`}>{t.name}</h3>
                    {t.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>}
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1" data-testid={`menu-template-${t.id}`}>
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/projects/templates/${t.id}`} data-testid={`menu-template-edit-${t.id}`}>
                          <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDuplicate(t.id)} data-testid={`menu-template-duplicate-${t.id}`}>
                        <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onDelete(t)} className="text-destructive focus:text-destructive" data-testid={`menu-template-delete-${t.id}`}>
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Badge variant="secondary" className="text-[11px] gap-1">
                    <ListChecks className="h-3 w-3" /> {t.totalTasks} task{t.totalTasks === 1 ? "" : "s"}
                  </Badge>
                  <Button size="sm" variant="outline" onClick={() => onUse(t.id)} data-testid={`button-use-template-${t.id}`}>
                    Use template
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ p, onEdit, onArchive, onDelete, onSaveAsTemplate, tz }: { p: ProjectWithCounts; onEdit: (p: ProjectWithCounts) => void; onArchive: (p: ProjectWithCounts) => void; onDelete: (p: ProjectWithCounts) => void; onSaveAsTemplate: (p: ProjectWithCounts) => void; tz?: string | null }) {
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
              <DropdownMenuItem onClick={() => onSaveAsTemplate(p)} data-testid={`menu-save-as-template-${p.id}`}>
                <FileText className="h-3.5 w-3.5 mr-2" /> Save as template
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

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {p.status === "archived" ? (
                <Badge variant="secondary" className="text-[10px]">Archived</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">Active</Badge>
              )}
              {p.dueDate && (() => {
                const due = new Date(p.dueDate);
                const label = formatProjectDueLabel(due, tz);
                return (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${projectDueToneClasses(label.tone)}`}
                    data-testid={`badge-project-due-${p.id}`}
                    title={formatInTz(due, tz || "America/New_York", "EEEE, MMMM d, yyyy")}
                  >
                    <CalendarClock className="h-2.5 w-2.5" /> {label.text}
                  </span>
                );
              })()}
            </div>
            <span className="inline-flex items-center text-xs text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
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
  onSaveAsTemplate,
}: {
  projects: ProjectWithCounts[];
  onEdit: (p: ProjectWithCounts) => void;
  onArchive: (p: ProjectWithCounts) => void;
  onDelete: (p: ProjectWithCounts) => void;
  onSaveAsTemplate: (p: ProjectWithCounts) => void;
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
                  <DropdownMenuItem onClick={() => onSaveAsTemplate(p)} data-testid={`menu-list-save-as-template-${p.id}`}>
                    <FileText className="h-3.5 w-3.5 mr-2" /> Save as template
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

type OpenTask = ProjectTask & { projectName: string; projectColor: string };

function priorityBadgeClasses(priority: string | null | undefined): string {
  switch (priority) {
    case "urgent": return "bg-rose-600 text-white";
    case "high":   return "bg-orange-500 text-white";
    case "medium": return "bg-amber-500 text-white";
    case "low":    return "bg-sky-500 text-white";
    default:       return "bg-muted text-muted-foreground";
  }
}

function bucketTask(t: OpenTask, tz?: string | null): "overdue" | "today" | "week" | "later" | "none" {
  if (!t.dueDate) return "none";
  const diff = dayDiffInTz(new Date(t.dueDate), tz || "America/New_York");
  if (diff === 0) return "today";
  if (diff < 0) return "overdue";
  if (diff <= 7) return "week";
  return "later";
}

function formatTaskDue(due: Date, tz?: string | null): string {
  const z = tz || "America/New_York";
  const diff = dayDiffInTz(due, z);
  const hasTime = dueHasTime(due);
  const timeStr = hasTime ? ` ${formatInTz(due, z, "h:mm a")}` : "";
  if (diff === 0) return `Today${timeStr}`;
  if (diff === 1) return `Tomorrow${timeStr}`;
  if (diff < 0) return `${-diff}d overdue`;
  const sameYear = formatInTz(due, z, "yyyy") === formatInTz(new Date(), z, "yyyy");
  return formatInTz(due, z, sameYear ? "MMM d" : "MMM d, yyyy") + timeStr;
}

function TaskRow({ t, tz }: { t: OpenTask; tz?: string | null }) {
  const due = t.dueDate ? new Date(t.dueDate) : null;
  const bucket = bucketTask(t, tz);
  const dueClasses =
    bucket === "overdue" ? "text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-900/40" :
    bucket === "today"   ? "text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40" :
    bucket === "week"    ? "text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/40" :
    "text-muted-foreground bg-muted";
  return (
    <Link href={`/projects/${t.projectId}`} className="flex items-center gap-3 px-4 py-2.5 hover-elevate transition-colors group" data-testid={`row-task-${t.id}`}>
      <CircleDot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" data-testid={`text-task-title-${t.id}`}>{t.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
          <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: t.projectColor }} aria-hidden="true" />
          <p className="text-[11px] text-muted-foreground truncate">{t.projectName}</p>
          {t.priority && t.priority !== "none" && (
            <Badge variant="outline" className={`text-[9px] px-1 py-0 h-3.5 leading-none uppercase tracking-wide shrink-0 border-0 ${priorityBadgeClasses(t.priority)}`}>
              {t.priority}
            </Badge>
          )}
        </div>
      </div>
      {due && (
        <span className={`text-[10px] font-semibold uppercase tracking-wide tabular-nums px-1.5 py-0.5 rounded shrink-0 ${dueClasses}`}>
          {formatTaskDue(due, tz)}
        </span>
      )}
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}

function AllTasksList({ tasks, isLoading, tz }: { tasks: OpenTask[]; isLoading: boolean; tz?: string | null }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }
  if (tasks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-10 text-center" data-testid="empty-all-tasks">
        <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
          <ListChecks className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="font-semibold">No open tasks</h3>
        <p className="text-sm text-muted-foreground mt-1">Tasks across all your active projects will appear here.</p>
      </div>
    );
  }
  const groups: Array<{ key: ReturnType<typeof bucketTask>; title: string; tone: string; items: OpenTask[] }> = [
    { key: "overdue", title: "Overdue", tone: "text-rose-600 dark:text-rose-400", items: [] },
    { key: "today",   title: "Today",   tone: "text-amber-600 dark:text-amber-400", items: [] },
    { key: "week",    title: "This week", tone: "text-sky-600 dark:text-sky-400", items: [] },
    { key: "later",   title: "Later",   tone: "text-foreground", items: [] },
    { key: "none",    title: "No due date", tone: "text-muted-foreground", items: [] },
  ];
  for (const t of tasks) {
    const b = bucketTask(t, tz);
    groups.find(g => g.key === b)!.items.push(t);
  }
  return (
    <div className="space-y-4" data-testid="all-tasks-list">
      {groups.filter(g => g.items.length > 0).map(g => (
        <div key={g.key} className="rounded-lg border border-border overflow-hidden bg-card">
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-muted/30">
            <h3 className={`text-xs font-bold uppercase tracking-wide ${g.tone}`}>{g.title}</h3>
            <Badge variant="outline" className="text-[10px]">{g.items.length}</Badge>
          </div>
          <ul className="divide-y divide-border">
            {g.items.map(t => <li key={t.id}>{<TaskRow t={t} tz={tz} />}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TasksCalendar({ tasks, isLoading, tz, onTaskClick }: { tasks: OpenTask[]; isLoading: boolean; tz?: string | null; onTaskClick: (task: OpenTask) => void }) {
  const z = tz || "America/New_York";
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });
  const todayKey = formatInTz(new Date(), z, "yyyy-MM-dd");

  // Build 6-week grid starting Sunday for the cursor month.
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const days: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d;
  });

  // Index tasks by yyyy-mm-dd in user's tz.
  const tasksByDay = new Map<string, OpenTask[]>();
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const key = dueDateKeyInTz(new Date(t.dueDate), z);
    const arr = tasksByDay.get(key) || [];
    arr.push(t);
    tasksByDay.set(key, arr);
  }

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const goPrev = () => { const d = new Date(cursor); d.setMonth(d.getMonth() - 1); setCursor(d); };
  const goNext = () => { const d = new Date(cursor); d.setMonth(d.getMonth() + 1); setCursor(d); };
  const goToday = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setCursor(d); };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden" data-testid="tasks-calendar">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
        <h3 className="text-sm font-semibold" data-testid="text-calendar-month">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={goPrev} data-testid="button-cal-prev"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={goToday} data-testid="button-cal-today">Today</Button>
          <Button variant="ghost" size="sm" onClick={goNext} data-testid="button-cal-next"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-7 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground border-b border-border">
        {weekdayLabels.map(w => (
          <div key={w} className="px-2 py-1.5 text-center">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6 auto-rows-fr">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const yy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          const key = `${yy}-${mm}-${dd}`;
          const isToday = key === todayKey;
          const dayTasks = tasksByDay.get(key) || [];
          const overdue = key < todayKey;
          return (
            <div
              key={i}
              className={`border-r border-b border-border last:border-r-0 min-h-[96px] p-1.5 flex flex-col gap-1 ${inMonth ? "bg-card" : "bg-muted/20"}`}
              data-testid={`cal-day-${key}`}
            >
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center justify-center text-[11px] tabular-nums ${
                  isToday ? "h-5 w-5 rounded-full bg-primary text-primary-foreground font-bold" :
                  inMonth ? "text-foreground font-medium" : "text-muted-foreground"
                }`}>
                  {d.getDate()}
                </span>
                {dayTasks.length > 0 && (
                  <span className="text-[9px] text-muted-foreground tabular-nums">{dayTasks.length}</span>
                )}
              </div>
              <div className="flex-1 flex flex-col gap-0.5 overflow-hidden">
                {dayTasks.slice(0, 3).map(t => (
                  <button
                    key={t.id}
                    onClick={() => onTaskClick(t)}
                    className={`text-left text-[10px] leading-tight px-1.5 py-0.5 rounded truncate hover-elevate ${
                      overdue && !isToday ? "bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200" :
                      isToday ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200" :
                      "bg-muted text-foreground"
                    }`}
                    title={`${t.title} · ${t.projectName}`}
                    data-testid={`cal-task-${t.id}`}
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full mr-1 align-middle" style={{ background: t.projectColor }} aria-hidden="true" />
                    {t.title}
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <span className="text-[9px] text-muted-foreground px-1.5">+{dayTasks.length - 3} more</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const firstName = user?.firstName || user?.displayName?.split(" ")[0] || "";
  const possessive = firstName ? `${firstName}${firstName.endsWith("s") ? "'" : "'s"}` : "Your";
  const [createOpen, setCreateOpen] = useState(false);

  // Trello import state
  const [importOpen, setImportOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importColor, setImportColor] = useState(COLOR_PALETTE[0]);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importParsed, setImportParsed] = useState<any>(null);
  const [importStats, setImportStats] = useState<{ lists: number; cards: number } | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  const handleImportFile = (file: File | null) => {
    if (!file) return;
    setImportFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let text = e.target?.result as string;
        // Strip UTF-8 BOM (U+FEFF) that some systems prepend to JSON exports
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const trimmed = text.trim();
        // Detect HTML page — user likely saved the Trello board page instead of exporting JSON
        if (trimmed.toLowerCase().startsWith("<!doctype") || trimmed.toLowerCase().startsWith("<html")) {
          toast({
            title: "That's a web page, not an export file",
            description: "This looks like the Trello board page saved from your browser. To get the JSON export: open your board in Trello → click the board menu (⋯) at the top right → Share → Export as JSON → then download that file.",
            variant: "destructive",
          });
          setImportFile(null);
          setImportParsed(null);
          setImportStats(null);
          return;
        }
        const data = JSON.parse(trimmed);
        if (!data || typeof data !== "object" || Array.isArray(data)) {
          throw new Error("Not a JSON object");
        }
        setImportParsed(data);
        setImportName((data.name as string) || "");
        const activeLists = Array.isArray(data.lists) ? data.lists.filter((l: any) => !l.closed).length : 0;
        const activeCards = Array.isArray(data.cards) ? data.cards.filter((c: any) => !c.closed).length : 0;
        setImportStats({ lists: activeLists, cards: activeCards });
      } catch {
        toast({ title: "Invalid file", description: "Could not read the file as JSON. Make sure you use Trello's Export as JSON option (board menu ⋯ → Share → Export as JSON).", variant: "destructive" });
        setImportFile(null);
        setImportParsed(null);
        setImportStats(null);
      }
    };
    reader.readAsText(file);
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/projects/import/trello", {
        trelloData: importParsed,
        name: importName.trim() || importParsed?.name || "Imported Board",
        color: importColor,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || `Import failed (${res.status})`);
      }
      return res.json() as Promise<{ projectId: string; name: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/all-tasks"] });
      setImportOpen(false);
      setImportFile(null);
      setImportParsed(null);
      setImportStats(null);
      setImportName("");
      setImportColor(COLOR_PALETTE[0]);
      toast({ title: "Board imported!", description: `"${data.name}" is ready.` });
      navigate(`/projects/${data.projectId}`);
    },
    onError: (err: Error) => toast({ title: "Import failed", description: err.message, variant: "destructive" }),
  });

  // Asana import state
  const [asanaOpen, setAsanaOpen] = useState(false);
  const [asanaName, setAsanaName] = useState("");
  const [asanaColor, setAsanaColor] = useState(COLOR_PALETTE[0]);
  const [asanaFile, setAsanaFile] = useState<File | null>(null);
  const [asanaCsvText, setAsanaCsvText] = useState("");
  const [asanaStats, setAsanaStats] = useState<{ tasks: number; subtasks: number; sections: number } | null>(null);
  const asanaFileRef = useRef<HTMLInputElement>(null);

  const handleAsanaFile = (file: File | null) => {
    if (!file) return;
    setAsanaFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let text = e.target?.result as string;
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
        const lines = text.trim().split(/\r?\n/);
        if (lines.length < 2) throw new Error("Empty");
        const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g, "").trim().toLowerCase());
        const iName = headers.indexOf("task name") !== -1 ? headers.indexOf("task name") : headers.indexOf("name");
        if (iName === -1) throw new Error("No Name column");
        const iParent = headers.indexOf("parent task");
        const iSection = headers.indexOf("section/column");
        let tasks = 0, subtasks = 0;
        const sections = new Set<string>();
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const fields: string[] = [];
          let field = "", inQ = false;
          for (const ch of line + ",") {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { fields.push(field); field = ""; }
            else { field += ch; }
          }
          if (iParent >= 0 && fields[iParent]?.trim()) { subtasks++; }
          else {
            tasks++;
            if (iSection >= 0) {
              const sec = (fields[iSection] || "").trim().replace(/:$/, "");
              if (sec) sections.add(sec);
            }
          }
        }
        setAsanaCsvText(text);
        setAsanaStats({ tasks, subtasks, sections: sections.size });
      } catch {
        toast({ title: "Invalid file", description: "That doesn't look like an Asana CSV export. In Asana: open your project → click the ⋯ menu → Export/Print → Export as CSV.", variant: "destructive" });
        setAsanaFile(null);
        setAsanaCsvText("");
        setAsanaStats(null);
      }
    };
    reader.readAsText(file);
  };

  const asanaMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/projects/import/asana", {
        csvText: asanaCsvText,
        name: asanaName.trim() || "Imported from Asana",
        color: asanaColor,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || `Import failed (${res.status})`);
      }
      return res.json() as Promise<{ projectId: string; name: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/all-tasks"] });
      setAsanaOpen(false);
      setAsanaFile(null);
      setAsanaCsvText("");
      setAsanaStats(null);
      setAsanaName("");
      setAsanaColor(COLOR_PALETTE[0]);
      toast({ title: "Project imported!", description: `"${data.name}" is ready.` });
      navigate(`/projects/${data.projectId}`);
    },
    onError: (err: Error) => toast({ title: "Import failed", description: err.message, variant: "destructive" }),
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [showArchived, setShowArchived] = useState(false);
  const [topTab, setTopTab] = useState<"overview" | "list" | "calendar" | "templates">(() => {
    if (typeof window === "undefined") return "overview";
    const saved = localStorage.getItem("projects-top-tab");
    return (saved === "list" || saved === "calendar" || saved === "overview" || saved === "templates") ? saved : "overview";
  });
  const setTopTabPersist = (t: "overview" | "list" | "calendar" | "templates") => {
    setTopTab(t);
    try { localStorage.setItem("projects-top-tab", t); } catch {}
  };
  const [templateId, setTemplateId] = useState<string>("blank");
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplDescription, setTplDescription] = useState("");
  const [tplColor, setTplColor] = useState(COLOR_PALETTE[0]);
  const [deleteTemplateTarget, setDeleteTemplateTarget] = useState<ProjectTemplateWithCounts | null>(null);
  const [view, setView] = useState<"cards" | "list">(() => {
    if (typeof window === "undefined") return "cards";
    return (localStorage.getItem("projects-view") as "cards" | "list") || "cards";
  });
  const setViewMode = (v: "cards" | "list") => {
    setView(v);
    try { localStorage.setItem("projects-view", v); } catch {}
  };
  const [deleteTarget, setDeleteTarget] = useState<ProjectWithCounts | null>(null);
  const [saveAsTemplateTarget, setSaveAsTemplateTarget] = useState<ProjectWithCounts | null>(null);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [editTarget, setEditTarget] = useState<ProjectWithCounts | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editColor, setEditColor] = useState(COLOR_PALETTE[0]);
  const [editStatus, setEditStatus] = useState<"active" | "archived">("active");
  const [dueDate, setDueDate] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  const openEdit = (p: ProjectWithCounts) => {
    setEditTarget(p);
    setEditName(p.name);
    setEditDescription(p.description || "");
    setEditColor(p.color);
    setEditStatus(p.status === "archived" ? "archived" : "active");
    setEditDueDate(dateToInputValue(p.dueDate));
  };

  const { data: projects = [], isLoading } = useQuery<ProjectWithCounts[]>({ queryKey: ["/api/projects"] });
  const { data: urgentTasks = [] } = useQuery<UrgentTask[]>({ queryKey: ["/api/projects/urgent-tasks"] });
  const { data: allTasks = [], isLoading: tasksLoading } = useQuery<OpenTask[]>({
    queryKey: ["/api/projects/all-tasks"],
    enabled: topTab === "list" || topTab === "calendar",
  });
  const { data: templates = [], isLoading: templatesLoading } = useQuery<ProjectTemplateWithCounts[]>({
    queryKey: ["/api/project-templates"],
  });

  // Calendar task detail sheet
  const [calendarTask, setCalendarTask] = useState<OpenTask | null>(null);
  const { data: calendarProject } = useQuery<Project>({
    queryKey: ["/api/projects", calendarTask?.projectId],
    enabled: !!calendarTask,
  });
  const { data: calendarColumns = [] } = useQuery<ProjectColumn[]>({
    queryKey: ["/api/projects", calendarTask?.projectId, "columns"],
    enabled: !!calendarTask,
  });
  const { data: calendarProjectTasks = [] } = useQuery<ProjectTask[]>({
    queryKey: ["/api/projects", calendarTask?.projectId, "tasks"],
    enabled: !!calendarTask,
  });
  const calendarSubtasks = calendarTask
    ? calendarProjectTasks.filter(t => t.parentTaskId === calendarTask.id)
    : [];
  const calendarParentTask = calendarTask?.parentTaskId
    ? calendarProjectTasks.find(t => t.id === calendarTask.parentTaskId) ?? null
    : null;

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { name, description, color };
      if (dueDate) payload.dueDate = `${dueDate}T00:00:00.000Z`;
      if (templateId && templateId !== "blank") payload.templateId = templateId;
      const res = await apiRequest("POST", "/api/projects", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/all-tasks"] });
      setName(""); setDescription(""); setColor(COLOR_PALETTE[0]); setDueDate(""); setTemplateId("blank");
      setCreateOpen(false);
      toast({ title: "Project created" });
    },
    onError: (err: Error) => toast({ title: "Failed to create", description: err.message, variant: "destructive" }),
  });

  const createTemplateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/project-templates", {
        name: tplName.trim(),
        description: tplDescription.trim(),
        color: tplColor,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      setTplName(""); setTplDescription(""); setTplColor(COLOR_PALETTE[0]);
      setCreateTemplateOpen(false);
      toast({ title: "Template created" });
    },
    onError: (err: Error) => toast({ title: "Failed to create template", description: err.message, variant: "destructive" }),
  });

  const duplicateTemplateMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/project-templates/${id}/duplicate`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      toast({ title: "Template duplicated" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/project-templates/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      setDeleteTemplateTarget(null);
      toast({ title: "Template deleted" });
    },
  });

  const useTemplate = (id: string) => {
    setTemplateId(id);
    setCreateOpen(true);
  };

  const saveAsTemplateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("POST", `/api/projects/${id}/save-as-template`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-templates"] });
      setSaveAsTemplateTarget(null);
      setSaveTemplateName("");
      toast({ title: "Template saved", description: "Your project has been saved as a reusable template." });
    },
    onError: (err: Error) => toast({ title: "Failed to save template", description: err.message, variant: "destructive" }),
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
        dueDate: editDueDate ? `${editDueDate}T00:00:00.000Z` : null,
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
              <h1 className="mt-1 text-3xl font-bold tracking-tight" data-testid="text-projects-title">{possessive} Projects</h1>
              <p className="mt-1 text-sm text-white/80">Plan, organize, and complete the work that runs your business.</p>
            </div>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="bg-white/10 text-white hover:bg-white/20 border border-white/20"
                    data-testid="button-import-dropdown"
                  >
                    <Upload className="h-4 w-4 mr-1.5" /> Import
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setImportOpen(true)} data-testid="button-import-trello">
                    Import from Trello
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setAsanaOpen(true)} data-testid="button-import-asana">
                    Import from Asana
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
                    <Label htmlFor="proj-template">Start from</Label>
                    <Select value={templateId} onValueChange={setTemplateId}>
                      <SelectTrigger id="proj-template" className="mt-1.5" data-testid="select-project-template">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="blank">Blank project</SelectItem>
                        {templates.map(t => (
                          <SelectItem key={t.id} value={t.id} data-testid={`option-template-${t.id}`}>
                            {t.name} · {t.totalTasks} task{t.totalTasks === 1 ? "" : "s"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
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
                  <div>
                    <Label htmlFor="proj-due">Due date (optional)</Label>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Input
                        id="proj-due"
                        type="date"
                        value={dueDate}
                        onChange={e => setDueDate(e.target.value)}
                        className="flex-1"
                        data-testid="input-project-due-date"
                      />
                      {dueDate && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={() => setDueDate("")}
                          aria-label="Clear due date"
                          data-testid="button-clear-project-due-date"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
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
          </div>

          {/* top tabs: Overview / List / Calendar */}
          <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1.5" role="tablist" aria-label="Projects view">
              <button
                onClick={() => setTopTabPersist("overview")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${topTab === "overview" ? "bg-white text-[hsl(245_60%_30%)]" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
                data-testid="tab-overview"
              >
                <Briefcase className="h-3 w-3 inline mr-1" /> All Projects · {active.length}
              </button>
              <button
                onClick={() => setTopTabPersist("list")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${topTab === "list" ? "bg-white text-[hsl(245_60%_30%)]" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
                data-testid="tab-list"
              >
                <ListChecks className="h-3 w-3 inline mr-1" /> All tasks
              </button>
              <button
                onClick={() => setTopTabPersist("calendar")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${topTab === "calendar" ? "bg-white text-[hsl(245_60%_30%)]" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
                data-testid="tab-calendar"
              >
                <CalendarDays className="h-3 w-3 inline mr-1" /> Calendar
              </button>
              <button
                onClick={() => setTopTabPersist("templates")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${topTab === "templates" ? "bg-white text-[hsl(245_60%_30%)]" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
                data-testid="tab-templates"
              >
                <Layers className="h-3 w-3 inline mr-1" /> Templates · {templates.length}
              </button>
            </div>
            {topTab === "overview" && (
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  <button
                    onClick={() => setShowArchived(false)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${!showArchived ? "bg-white/90 text-[hsl(245_60%_30%)]" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
                    data-testid="tab-active"
                  >
                    <CircleDot className="h-3 w-3 inline mr-1" /> Active · {active.length}
                  </button>
                  <button
                    onClick={() => setShowArchived(true)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${showArchived ? "bg-white/90 text-[hsl(245_60%_30%)]" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
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
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {topTab === "overview" && urgentTasks.length > 0 && <UrgentTasksBanner tasks={urgentTasks} />}
        {topTab === "overview" ? (
          isLoading ? (
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
                  onSaveAsTemplate={(p) => { setSaveAsTemplateTarget(p); setSaveTemplateName(`${p.name} template`); }}
                  tz={user?.timezone}
                />
              ))}
            </div>
          ) : (
            <ProjectList
              projects={visible}
              onEdit={openEdit}
              onArchive={(p) => archiveMutation.mutate(p)}
              onDelete={(p) => setDeleteTarget(p)}
              onSaveAsTemplate={(p) => { setSaveAsTemplateTarget(p); setSaveTemplateName(`${p.name} template`); }}
            />
          )
        ) : topTab === "list" ? (
          <AllTasksList tasks={allTasks} isLoading={tasksLoading} tz={user?.timezone} />
        ) : topTab === "calendar" ? (
          <TasksCalendar tasks={allTasks} isLoading={tasksLoading} tz={user?.timezone} onTaskClick={setCalendarTask} />
        ) : (
          <TemplatesTab
            templates={templates}
            isLoading={templatesLoading}
            onCreate={() => setCreateTemplateOpen(true)}
            onUse={useTemplate}
            onDuplicate={(id) => duplicateTemplateMutation.mutate(id)}
            onDelete={(t) => setDeleteTemplateTarget(t)}
          />
        )}
      </div>

      {calendarProject && (
        <TaskDetailSheet
          project={calendarProject}
          columns={calendarColumns}
          task={calendarTask}
          parentTask={calendarParentTask}
          subtasks={calendarSubtasks}
          open={!!calendarTask}
          onOpenChange={(o) => { if (!o) setCalendarTask(null); }}
          onOpenTask={(id) => {
            const t = calendarProjectTasks.find(p => p.id === id);
            if (t) setCalendarTask({ ...t, projectName: calendarTask?.projectName ?? "", projectColor: calendarTask?.projectColor ?? "" });
          }}
        />
      )}

      <Dialog open={createTemplateOpen} onOpenChange={setCreateTemplateOpen}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-new-template">
          <DialogHeader>
            <DialogTitle>New template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="tpl-name-new">Name</Label>
              <Input id="tpl-name-new" value={tplName} onChange={e => setTplName(e.target.value)} placeholder="e.g. YouTube video launch" data-testid="input-template-name" />
            </div>
            <div>
              <Label htmlFor="tpl-desc-new">Description (optional)</Label>
              <Textarea id="tpl-desc-new" rows={2} value={tplDescription} onChange={e => setTplDescription(e.target.value)} data-testid="input-template-description" />
            </div>
            <div>
              <Label>Color</Label>
              <div className="mt-1.5 flex gap-1.5 flex-wrap">
                {COLOR_PALETTE.map(c => (
                  <button key={c} type="button" onClick={() => setTplColor(c)} className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition-all ${tplColor === c ? "ring-2 ring-foreground" : "hover:scale-110"}`} style={{ background: c }} aria-label={`Color ${c}`} data-testid={`tpl-color-${c.replace("#", "")}`} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateTemplateOpen(false)}>Cancel</Button>
            <Button onClick={() => createTemplateMutation.mutate()} disabled={!tplName.trim() || createTemplateMutation.isPending} data-testid="button-create-template">
              {createTemplateMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Create template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTemplateTarget} onOpenChange={(open) => !open && setDeleteTemplateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this template?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p><strong>{deleteTemplateTarget?.name}</strong> and all of its template tasks will be permanently deleted. Projects already created from this template are not affected.</p>
                <p className="font-semibold text-destructive">This is permanent. There is no way to get it back.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTemplateTarget && deleteTemplateMutation.mutate(deleteTemplateTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-template"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              <Label htmlFor="edit-proj-due">Due date (optional)</Label>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Input
                  id="edit-proj-due"
                  type="date"
                  value={editDueDate}
                  onChange={e => setEditDueDate(e.target.value)}
                  className="flex-1"
                  data-testid="input-edit-project-due-date"
                />
                {editDueDate && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                    onClick={() => setEditDueDate("")}
                    aria-label="Clear due date"
                    data-testid="button-clear-edit-project-due-date"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
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

      <Dialog open={!!saveAsTemplateTarget} onOpenChange={(open) => { if (!open) { setSaveAsTemplateTarget(null); setSaveTemplateName(""); } }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-save-as-template">
          <DialogHeader>
            <DialogTitle>Save as template</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A new template will be created with all tasks from <strong>{saveAsTemplateTarget?.name}</strong>. Due dates and statuses are not copied.
          </p>
          <div className="py-1">
            <Label htmlFor="save-tpl-name">Template name</Label>
            <Input
              id="save-tpl-name"
              className="mt-1.5"
              value={saveTemplateName}
              onChange={e => setSaveTemplateName(e.target.value)}
              placeholder="e.g. YouTube video launch"
              data-testid="input-save-template-name"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setSaveAsTemplateTarget(null); setSaveTemplateName(""); }}>Cancel</Button>
            <Button
              onClick={() => saveAsTemplateTarget && saveAsTemplateMutation.mutate({ id: saveAsTemplateTarget.id, name: saveTemplateName.trim() || `${saveAsTemplateTarget.name} template` })}
              disabled={saveAsTemplateMutation.isPending}
              data-testid="button-confirm-save-as-template"
            >
              {saveAsTemplateMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Save template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Trello Import Dialog */}
      <Dialog open={importOpen} onOpenChange={(open) => {
        if (!open) {
          setImportOpen(false);
          setImportFile(null);
          setImportParsed(null);
          setImportStats(null);
          setImportName("");
          setImportColor(COLOR_PALETTE[0]);
        }
      }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-import-trello">
          <DialogHeader>
            <DialogTitle>Import from Trello</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground space-y-1.5">
              <p>Follow these steps in Trello to get the export file:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Open your board in Trello</li>
                <li>Click the <strong>⋯ board menu</strong> button (top right)</li>
                <li>Click <strong>Share</strong></li>
                <li>Click <strong>Export as JSON</strong></li>
                <li>Download and upload that <code>.json</code> file here</li>
              </ol>
              <p className="text-xs text-amber-600 dark:text-amber-400">⚠️ Do not save the Trello page from your browser — use Trello's Export option.</p>
            </div>
            <div>
              <Label>Trello export file</Label>
              <div className="mt-1.5">
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  data-testid="input-trello-file"
                  onChange={e => handleImportFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => importFileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                  data-testid="button-choose-trello-file"
                >
                  <Upload className="h-4 w-4" />
                  {importFile ? importFile.name : "Choose JSON file…"}
                </button>
              </div>
              {importStats && (
                <p className="mt-1.5 text-xs text-muted-foreground" data-testid="text-import-stats">
                  Found <strong>{importStats.lists}</strong> list{importStats.lists !== 1 ? "s" : ""} and <strong>{importStats.cards}</strong> card{importStats.cards !== 1 ? "s" : ""}
                </p>
              )}
            </div>
            {importParsed && (
              <>
                <div>
                  <Label htmlFor="import-name">Project name</Label>
                  <Input
                    id="import-name"
                    className="mt-1.5"
                    value={importName}
                    onChange={e => setImportName(e.target.value)}
                    placeholder="Project name"
                    data-testid="input-import-project-name"
                  />
                </div>
                <div>
                  <Label>Color</Label>
                  <div className="mt-1.5 flex gap-1.5 flex-wrap">
                    {COLOR_PALETTE.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setImportColor(c)}
                        className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition-all ${importColor === c ? "ring-2 ring-foreground" : "hover:scale-110"}`}
                        style={{ background: c }}
                        aria-label={`Color ${c}`}
                        data-testid={`import-color-${c.replace("#", "")}`}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button
              onClick={() => importMutation.mutate()}
              disabled={!importParsed || importMutation.isPending}
              data-testid="button-confirm-import-trello"
            >
              {importMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Import board
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Asana Import Dialog */}
      <Dialog open={asanaOpen} onOpenChange={(open) => {
        if (!open) {
          setAsanaOpen(false);
          setAsanaFile(null);
          setAsanaCsvText("");
          setAsanaStats(null);
          setAsanaName("");
          setAsanaColor(COLOR_PALETTE[0]);
        }
      }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-import-asana">
          <DialogHeader>
            <DialogTitle>Import from Asana</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground space-y-1.5">
              <p>Follow these steps in Asana to get the export file:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Open your project in Asana</li>
                <li>Click the <strong>⋯ menu</strong> next to the project name</li>
                <li>Click <strong>Export/Print</strong></li>
                <li>Click <strong>CSV</strong></li>
                <li>Upload that <code>.csv</code> file here</li>
              </ol>
            </div>
            <div>
              <Label>Asana export file</Label>
              <div className="mt-1.5">
                <input
                  ref={asanaFileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  data-testid="input-asana-file"
                  onChange={e => handleAsanaFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => asanaFileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                  data-testid="button-choose-asana-file"
                >
                  <Upload className="h-4 w-4" />
                  {asanaFile ? asanaFile.name : "Choose CSV file…"}
                </button>
              </div>
              {asanaStats && (
                <p className="mt-1.5 text-xs text-muted-foreground" data-testid="text-asana-stats">
                  Found <strong>{asanaStats.tasks}</strong> task{asanaStats.tasks !== 1 ? "s" : ""}
                  {asanaStats.subtasks > 0 && <>, <strong>{asanaStats.subtasks}</strong> subtask{asanaStats.subtasks !== 1 ? "s" : ""}</>}
                  {asanaStats.sections > 0 && <> across <strong>{asanaStats.sections}</strong> section{asanaStats.sections !== 1 ? "s" : ""}</>}
                </p>
              )}
            </div>
            {asanaCsvText && (
              <>
                <div>
                  <Label htmlFor="asana-name">Project name</Label>
                  <Input
                    id="asana-name"
                    className="mt-1.5"
                    value={asanaName}
                    onChange={e => setAsanaName(e.target.value)}
                    placeholder="Project name"
                    data-testid="input-asana-project-name"
                  />
                </div>
                <div>
                  <Label>Color</Label>
                  <div className="mt-1.5 flex gap-1.5 flex-wrap">
                    {COLOR_PALETTE.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAsanaColor(c)}
                        className={`h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition-all ${asanaColor === c ? "ring-2 ring-foreground" : "hover:scale-110"}`}
                        style={{ background: c }}
                        aria-label={`Color ${c}`}
                        data-testid={`asana-color-${c.replace("#", "")}`}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAsanaOpen(false)}>Cancel</Button>
            <Button
              onClick={() => asanaMutation.mutate()}
              disabled={!asanaCsvText || asanaMutation.isPending}
              data-testid="button-confirm-import-asana"
            >
              {asanaMutation.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Import project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this project?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p><strong>{deleteTarget?.name}</strong> and everything inside it — all tasks, sections, comments, and attachments — will be permanently deleted.</p>
                <p className="font-semibold text-destructive">This is permanent. There is no way to get it back.</p>
              </div>
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
