import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { dayDiffInTz, formatInTz } from "@shared/datetime";
import { TaskDetailSheet } from "@/components/projects/task-detail-sheet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Briefcase,
  ChevronRight,
  AlertTriangle,
  ListChecks,
  CircleDot,
  CalendarClock,
  Plus,
} from "lucide-react";
import { TileTitle, StatChip } from "../widget-registry";
import type {
  ProjectWithCounts,
  ProjectTask,
  Project,
  ProjectColumn,
} from "@shared/schema";

type OpenTask = ProjectTask & { projectName: string; projectColor: string };

function dueLocal(due: Date): Date {
  if (
    due.getUTCHours() === 0 &&
    due.getUTCMinutes() === 0 &&
    due.getUTCSeconds() === 0
  ) {
    return new Date(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  }
  return due;
}

function bucketTask(
  t: OpenTask,
  tz?: string | null
): "overdue" | "today" | "week" | "later" | "none" {
  if (!t.dueDate) return "none";
  const diff = dayDiffInTz(new Date(t.dueDate), tz || "America/New_York");
  if (diff === 0) return "today";
  if (diff < 0) return "overdue";
  if (diff <= 7) return "week";
  return "later";
}

function formatTaskDue(due: Date, tz?: string | null): string {
  const diff = dayDiffInTz(due, tz || "America/New_York");
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 0) return `Past Due · ${-diff}d`;
  return formatInTz(due, tz || "America/New_York", "MMM d");
}

export function ProjectsWidget() {
  const { user } = useAuth();
  const tz = user?.timezone;

  const { data: summary } = useQuery<{
    projects: ProjectWithCounts[];
    totalActive: number;
    totalOpenTasks: number;
    totalDueThisWeek: number;
    totalOverdue: number;
  }>({ queryKey: ["/api/dashboard/projects"] });

  const { data: openTasks = [] } = useQuery<OpenTask[]>({
    queryKey: ["/api/projects/all-tasks"],
  });

  const s = summary ?? {
    projects: [],
    totalActive: 0,
    totalOpenTasks: 0,
    totalDueThisWeek: 0,
    totalOverdue: 0,
  };

  const [listTask, setListTask] = useState<OpenTask | null>(null);
  const { data: listProject } = useQuery<Project>({
    queryKey: ["/api/projects", listTask?.projectId],
    enabled: !!listTask,
  });
  const { data: listColumns = [] } = useQuery<ProjectColumn[]>({
    queryKey: ["/api/projects", listTask?.projectId, "columns"],
    enabled: !!listTask,
  });
  const { data: listProjectTasks = [] } = useQuery<ProjectTask[]>({
    queryKey: ["/api/projects", listTask?.projectId, "tasks"],
    enabled: !!listTask,
  });
  const listSubtasks = listTask
    ? listProjectTasks.filter((t) => t.parentTaskId === listTask.id)
    : [];
  const listParentTask = listTask?.parentTaskId
    ? listProjectTasks.find((t) => t.id === listTask.parentTaskId) ?? null
    : null;

  const grouped = useMemo(() => {
    const overdue: OpenTask[] = [];
    const today: OpenTask[] = [];
    const week: OpenTask[] = [];
    const later: OpenTask[] = [];
    for (const t of openTasks) {
      if (!t.dueDate) continue;
      const b = bucketTask(t, tz);
      if (b === "overdue") overdue.push(t);
      else if (b === "today") today.push(t);
      else if (b === "week") week.push(t);
      else if (b === "later") later.push(t);
    }
    const out: Array<{ section: string; tone: string; items: OpenTask[] }> = [];
    if (overdue.length)
      out.push({ section: "Past Due", tone: "text-rose-600 dark:text-rose-400", items: overdue });
    if (today.length)
      out.push({ section: "Today", tone: "text-amber-600 dark:text-amber-400", items: today });
    if (week.length)
      out.push({ section: "This week", tone: "text-sky-600 dark:text-sky-400", items: week });
    if (later.length)
      out.push({ section: "Upcoming", tone: "text-muted-foreground", items: later });
    return out;
  }, [openTasks, tz]);

  const hasAnyTasks = grouped.some((g) => g.items.length > 0);
  const hasAnyProjects = s.totalActive > 0;

  return (
    <>
      <Card
        className="relative overflow-hidden border-card-border bg-card hover-elevate transition-all w-full h-full"
        data-testid="card-projects-hero"
      >
        <div className="absolute inset-x-0 top-0 h-0.5 bg-indigo-500" />
        <CardContent className="relative pt-5 pb-5 h-full">
          <div className="flex items-center justify-between gap-2">
            <TileTitle
              icon={Briefcase}
              title="Projects"
              accent="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
            />
            <Link
              href="/projects"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
              data-testid="link-projects-open"
            >
              Open all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <StatChip value={s.totalActive} label="Projects" tone="indigo" />
            <StatChip value={s.totalOpenTasks} label="Open tasks" />
            <StatChip
              value={s.totalDueThisWeek}
              label="Due 7d"
              tone={s.totalDueThisWeek > 0 ? "amber" : "neutral"}
            />
            <StatChip
              value={s.totalOverdue}
              label="Overdue"
              tone={s.totalOverdue > 0 ? "rose" : "neutral"}
            />
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" /> Up Next
                </p>
                {grouped.find((g) => g.section === "Past Due")?.items.length ? (
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded"
                    data-testid="badge-past-due"
                  >
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {grouped.find((g) => g.section === "Past Due")!.items.length} past due
                  </span>
                ) : null}
              </div>
              {hasAnyTasks && (
                <Link
                  href="/projects"
                  className="text-[11px] text-muted-foreground hover:text-foreground"
                  data-testid="link-tasks-list"
                >
                  See all tasks
                </Link>
              )}
            </div>

            {!hasAnyTasks ? (
              <div
                className="rounded-lg border border-dashed border-border p-6 text-center"
                data-testid="empty-projects-tasks"
              >
                {hasAnyProjects ? (
                  <>
                    <CircleDot className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm font-medium">Nothing due this week</p>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                      All clear — open Projects to see your full task list.
                    </p>
                    <Link href="/projects">
                      <Button
                        size="sm"
                        variant="outline"
                        data-testid="button-open-projects-empty"
                      >
                        Browse projects
                      </Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <Briefcase className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm font-medium">No projects yet</p>
                    <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                      Create your first project to start organizing your work.
                    </p>
                    <Link href="/projects">
                      <Button size="sm" data-testid="button-create-first-project">
                        <Plus className="h-3.5 w-3.5 mr-1" /> New Project
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden bg-background/40">
                {grouped.map((g, gi) => (
                  <div key={g.section}>
                    <div
                      className={`px-3 py-1.5 text-[10px] uppercase tracking-wide font-bold border-b border-border bg-muted/30 ${g.tone}`}
                    >
                      {g.section} · {g.items.length}
                    </div>
                    <ul
                      className={`${gi < grouped.length - 1 ? "border-b border-border" : ""}`}
                    >
                      {g.items.map((t) => {
                        const due = t.dueDate ? new Date(t.dueDate) : null;
                        const b = bucketTask(t, tz);
                        const dueClasses =
                          b === "overdue"
                            ? "text-rose-700 dark:text-rose-300 bg-rose-500/10"
                            : b === "today"
                            ? "text-amber-700 dark:text-amber-300 bg-amber-500/10"
                            : b === "week"
                            ? "text-sky-700 dark:text-sky-300 bg-sky-500/10"
                            : "text-muted-foreground bg-muted";
                        return (
                          <li key={t.id} className="border-b border-border last:border-b-0">
                            <button
                              className="w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-muted/40 transition-colors group"
                              onClick={() => setListTask(t)}
                              data-testid={`hero-task-${t.id}`}
                            >
                              <CircleDot className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{t.title}</p>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                  <span
                                    className="h-1.5 w-1.5 rounded-full shrink-0"
                                    style={{ background: t.projectColor }}
                                    aria-hidden="true"
                                  />
                                  <p className="text-[11px] text-muted-foreground truncate">
                                    {t.projectName}
                                  </p>
                                </div>
                              </div>
                              {due && (
                                <span
                                  className={`text-[10px] font-semibold uppercase tracking-wide tabular-nums px-1.5 py-0.5 rounded shrink-0 ${dueClasses}`}
                                >
                                  <CalendarClock className="h-2.5 w-2.5 inline mr-0.5" />
                                  {formatTaskDue(due, tz)}
                                </span>
                              )}
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {listProject && (
        <TaskDetailSheet
          project={listProject}
          columns={listColumns}
          task={listTask}
          parentTask={listParentTask}
          subtasks={listSubtasks}
          open={!!listTask}
          onOpenChange={(o) => {
            if (!o) setListTask(null);
          }}
          onOpenTask={(id) => {
            const t = listProjectTasks.find((p) => p.id === id);
            if (t)
              setListTask({
                ...t,
                projectName: listTask?.projectName ?? "",
                projectColor: listTask?.projectColor ?? "",
              });
          }}
        />
      )}
    </>
  );
}
