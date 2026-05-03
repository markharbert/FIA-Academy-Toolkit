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
import { useAuth } from "@/lib/auth";
import { Briefcase, Plus, MoreVertical, Archive, ArchiveRestore, Trash2, ChevronRight, ChevronLeft, CalendarClock, CalendarDays, CircleCheck, CircleDot, Loader2, Pencil, LayoutGrid, List, Flame, Clock, AlertTriangle, X, ListChecks, Inbox } from "lucide-react";

// dueDate is stored as UTC midnight representing a calendar day. Treat the stored
// UTC Y/M/D as a local calendar date, then compare to the viewer's local "today".
function dueDateAsLocalMidnight(due: Date): Date {
  return new Date(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
}

function formatProjectDueLabel(due: Date): { text: string; tone: "overdue" | "soon" | "today" | "tomorrow" | "future" } {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const d = dueDateAsLocalMidnight(due);
  const diffDays = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return { text: `${-diffDays}d overdue`, tone: "overdue" };
  if (diffDays === 0) return { text: "Due today", tone: "today" };
  if (diffDays === 1) return { text: "Due tomorrow", tone: "tomorrow" };
  if (diffDays <= 7) return { text: `Due in ${diffDays}d`, tone: "soon" };
  return { text: `Due ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`, tone: "future" };
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

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              {p.status === "archived" ? (
                <Badge variant="secondary" className="text-[10px]">Archived</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">Active</Badge>
              )}
              {p.dueDate && (() => {
                const due = new Date(p.dueDate);
                const label = formatProjectDueLabel(due);
                const dLocal = dueDateAsLocalMidnight(due);
                return (
                  <span
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${projectDueToneClasses(label.tone)}`}
                    data-testid={`badge-project-due-${p.id}`}
                    title={dLocal.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
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

function bucketTask(t: OpenTask): "overdue" | "today" | "week" | "later" | "none" {
  if (!t.dueDate) return "none";
  const due = new Date(t.dueDate);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dayMs = 86400000;
  // Tasks with date-only (UTC midnight) get treated as that calendar day.
  const dueLocal = (() => {
    if (due.getUTCHours() === 0 && due.getUTCMinutes() === 0 && due.getUTCSeconds() === 0) {
      return new Date(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
    }
    return due;
  })();
  if (dueLocal.getTime() < today.getTime()) {
    // Same calendar day check (overdue if before today's start)
    const sameDay = dueLocal.toDateString() === today.toDateString();
    if (sameDay) return "today";
    return "overdue";
  }
  if (dueLocal.toDateString() === today.toDateString()) return "today";
  if (dueLocal.getTime() - today.getTime() <= 7 * dayMs) return "week";
  return "later";
}

function formatTaskDue(due: Date): string {
  const d = (due.getUTCHours() === 0 && due.getUTCMinutes() === 0)
    ? new Date(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
    : due;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  const isToday = d.toDateString() === today.toDateString();
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const hasTime = !(due.getUTCHours() === 0 && due.getUTCMinutes() === 0 && due.getUTCSeconds() === 0);
  const timeStr = hasTime ? ` ${due.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "";
  if (isToday) return `Today${timeStr}`;
  if (isTomorrow) return `Tomorrow${timeStr}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" }) + timeStr;
}

function TaskRow({ t }: { t: OpenTask }) {
  const due = t.dueDate ? new Date(t.dueDate) : null;
  const bucket = bucketTask(t);
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
          {formatTaskDue(due)}
        </span>
      )}
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}

function AllTasksList({ tasks, isLoading }: { tasks: OpenTask[]; isLoading: boolean }) {
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
    const b = bucketTask(t);
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
            {g.items.map(t => <li key={t.id}>{<TaskRow t={t} />}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function TasksCalendar({ tasks, isLoading }: { tasks: OpenTask[]; isLoading: boolean }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Build 6-week grid starting Sunday for the cursor month.
  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = new Date(monthStart);
  gridStart.setDate(monthStart.getDate() - monthStart.getDay());
  const days: Date[] = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d;
  });

  // Index tasks by yyyy-mm-dd.
  const tasksByDay = new Map<string, OpenTask[]>();
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const due = new Date(t.dueDate);
    const dLocal = (due.getUTCHours() === 0 && due.getUTCMinutes() === 0 && due.getUTCSeconds() === 0)
      ? new Date(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
      : due;
    const key = `${dLocal.getFullYear()}-${dLocal.getMonth()}-${dLocal.getDate()}`;
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
          const isToday = d.getTime() === today.getTime();
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const dayTasks = tasksByDay.get(key) || [];
          const overdue = d.getTime() < today.getTime();
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
                  <Link
                    key={t.id}
                    href={`/projects/${t.projectId}`}
                    className={`text-[10px] leading-tight px-1.5 py-0.5 rounded truncate hover-elevate ${
                      overdue && !isToday ? "bg-rose-100 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200" :
                      isToday ? "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-200" :
                      "bg-muted text-foreground"
                    }`}
                    title={`${t.title} · ${t.projectName}`}
                    data-testid={`cal-task-${t.id}`}
                  >
                    <span className="inline-block h-1.5 w-1.5 rounded-full mr-1 align-middle" style={{ background: t.projectColor }} aria-hidden="true" />
                    {t.title}
                  </Link>
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
  const firstName = user?.firstName || user?.displayName?.split(" ")[0] || "";
  const possessive = firstName ? `${firstName}${firstName.endsWith("s") ? "'" : "'s"}` : "Your";
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [showArchived, setShowArchived] = useState(false);
  const [topTab, setTopTab] = useState<"overview" | "list" | "calendar">(() => {
    if (typeof window === "undefined") return "overview";
    const saved = localStorage.getItem("projects-top-tab");
    return (saved === "list" || saved === "calendar" || saved === "overview") ? saved : "overview";
  });
  const setTopTabPersist = (t: "overview" | "list" | "calendar") => {
    setTopTab(t);
    try { localStorage.setItem("projects-top-tab", t); } catch {}
  };
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
    enabled: topTab !== "overview",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { name, description, color };
      if (dueDate) payload.dueDate = `${dueDate}T00:00:00.000Z`;
      const res = await apiRequest("POST", "/api/projects", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/projects"] });
      setName(""); setDescription(""); setColor(COLOR_PALETTE[0]); setDueDate("");
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

          {/* top tabs: Overview / List / Calendar */}
          <div className="mt-5 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-1.5" role="tablist" aria-label="Projects view">
              <button
                onClick={() => setTopTabPersist("overview")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${topTab === "overview" ? "bg-white text-[hsl(245_60%_30%)]" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
                data-testid="tab-overview"
              >
                <Briefcase className="h-3 w-3 inline mr-1" /> Overview · {active.length}
              </button>
              <button
                onClick={() => setTopTabPersist("list")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${topTab === "list" ? "bg-white text-[hsl(245_60%_30%)]" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
                data-testid="tab-list"
              >
                <ListChecks className="h-3 w-3 inline mr-1" /> List
              </button>
              <button
                onClick={() => setTopTabPersist("calendar")}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${topTab === "calendar" ? "bg-white text-[hsl(245_60%_30%)]" : "bg-white/10 text-white/80 hover:bg-white/15"}`}
                data-testid="tab-calendar"
              >
                <CalendarDays className="h-3 w-3 inline mr-1" /> Calendar
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
          )
        ) : topTab === "list" ? (
          <AllTasksList tasks={allTasks} isLoading={tasksLoading} />
        ) : (
          <TasksCalendar tasks={allTasks} isLoading={tasksLoading} />
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
