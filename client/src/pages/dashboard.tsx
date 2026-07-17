import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Briefcase, Target, GripVertical, X, Plus } from "lucide-react";
import type { DmoEntry, InsightsResponse } from "@shared/schema";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  type WidgetConfig,
  type WidgetId,
  WIDGET_META,
  SIZE_CLASSES,
  mergeLayout,
  dmoTotalPts,
} from "@/components/dashboard/widget-registry";
import { ProjectsWidget } from "@/components/dashboard/widgets/projects-widget";
import { EmailHealthWidget } from "@/components/dashboard/widgets/email-health-widget";
import { DmoWidget } from "@/components/dashboard/widgets/dmo-widget";
import { InboxAnalyzerWidget } from "@/components/dashboard/widgets/inbox-analyzer-widget";
import { CompetitorPulseWidget } from "@/components/dashboard/widgets/competitor-pulse-widget";
import { RecentActivityWidget } from "@/components/dashboard/widgets/recent-activity-widget";

// ─── Time helpers ──────────────────────────────────────────────────────────────

function timeGreeting(tz?: string | null) {
  let h: number;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz || undefined,
      hour: "numeric",
      hour12: false,
    }).formatToParts(new Date());
    h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
  } catch {
    h = new Date().getHours();
  }
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(tz?: string | null) {
  try {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: tz || undefined,
    });
  } catch {
    return new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
}

function nowTimeLabel(tz?: string | null) {
  try {
    return new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: tz || undefined,
    });
  } catch {
    return new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
}

// ─── Widget renderer ────────────────────────────────────────────────────────────

function WidgetRenderer({ id }: { id: WidgetId }) {
  switch (id) {
    case "projects":       return <ProjectsWidget />;
    case "email-health":   return <EmailHealthWidget />;
    case "dmo-streak":     return <DmoWidget />;
    case "inbox-analyzer": return <InboxAnalyzerWidget />;
    case "competitor-pulse": return <CompetitorPulseWidget />;
    case "recent-activity": return <RecentActivityWidget />;
    default:               return null;
  }
}

// ─── Sortable widget wrapper ─────────────────────────────────────────────────

function SortableWidget({
  config,
  onRemove,
}: {
  config: WidgetConfig;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: config.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${SIZE_CLASSES[config.size]} group relative ${
        isDragging ? "opacity-40 z-50" : ""
      }`}
      data-testid={`widget-cell-${config.id}`}
    >
      {/* Hover controls — visible only on hover */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="h-6 w-6 flex items-center justify-center rounded-md bg-background/90 backdrop-blur-sm border border-border shadow text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
          data-testid={`drag-handle-${config.id}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>

        {/* Remove button */}
        <button
          onClick={onRemove}
          className="h-6 w-6 flex items-center justify-center rounded-md bg-background/90 backdrop-blur-sm border border-border shadow text-muted-foreground hover:text-rose-500 hover:border-rose-300 transition-colors"
          aria-label={`Remove ${WIDGET_META[config.id]?.title} widget`}
          data-testid={`remove-widget-${config.id}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <WidgetRenderer id={config.id} />
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const firstName = user?.firstName || user?.displayName?.split(" ")[0] || "";

  // Live clock
  const [nowTime, setNowTime] = useState(() => nowTimeLabel(user?.timezone));
  useEffect(() => {
    setNowTime(nowTimeLabel(user?.timezone));
    const id = setInterval(() => setNowTime(nowTimeLabel(user?.timezone)), 30_000);
    return () => clearInterval(id);
  }, [user?.timezone]);

  // ── Layout (local state, synced from server once) ────────────────────────────
  const { data: layoutData } = useQuery<{ layout: WidgetConfig[] | null }>({
    queryKey: ["/api/dashboard/layout"],
  });

  const [localLayout, setLocalLayout] = useState<WidgetConfig[]>(() =>
    mergeLayout(null)
  );
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (layoutData !== undefined && !hasInitialized.current) {
      setLocalLayout(mergeLayout(layoutData.layout ?? null));
      hasInitialized.current = true;
    }
  }, [layoutData]);

  // ── Auto-save debounce ───────────────────────────────────────────────────────
  const saveTimer = useRef<NodeJS.Timeout>();

  const saveLayoutMutation = useMutation({
    mutationFn: (newLayout: WidgetConfig[]) =>
      apiRequest("PATCH", "/api/dashboard/layout", { layout: newLayout }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/layout"] });
    },
    onError: () => {
      toast({ title: "Couldn't save layout", variant: "destructive" });
    },
  });

  const scheduleAutoSave = useCallback(
    (newLayout: WidgetConfig[]) => {
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveLayoutMutation.mutate(newLayout);
      }, 900);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── DnD ─────────────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalLayout((prev) => {
      const visibleIds = prev.filter((w) => w.visible).map((w) => w.id);
      const oldIdx = visibleIds.indexOf(active.id as WidgetId);
      const newIdx = visibleIds.indexOf(over.id as WidgetId);
      if (oldIdx < 0 || newIdx < 0) return prev;

      const reorderedVisible = arrayMove(visibleIds, oldIdx, newIdx);
      const hiddenItems = prev.filter((w) => !w.visible);
      const visibleItems = reorderedVisible.map(
        (id) => prev.find((w) => w.id === id)!
      );
      const next = [...visibleItems, ...hiddenItems];
      scheduleAutoSave(next);
      return next;
    });
  }

  // ── Remove / add widget ──────────────────────────────────────────────────────
  function removeWidget(id: WidgetId) {
    setLocalLayout((prev) => {
      const next = prev.map((w) => (w.id === id ? { ...w, visible: false } : w));
      scheduleAutoSave(next);
      return next;
    });
  }

  function addWidget(id: WidgetId) {
    setLocalLayout((prev) => {
      const next = prev.map((w) => (w.id === id ? { ...w, visible: true } : w));
      scheduleAutoSave(next);
      return next;
    });
  }

  // ── Hero KPI ribbon data ─────────────────────────────────────────────────────
  const { data: dmoToday } = useQuery<{ entry: DmoEntry | null; date: string }>({
    queryKey: ["/api/dmo/today"],
  });
  const { data: projectsSummary } = useQuery<{
    totalOpenTasks: number;
    totalActive: number;
    totalDueThisWeek: number;
    totalOverdue: number;
  }>({ queryKey: ["/api/dashboard/projects"] });
  const { data: insights } = useQuery<InsightsResponse>({
    queryKey: ["/api/inbox-intel/insights"],
  });

  const todayPts = dmoTotalPts(dmoToday?.entry ?? null);

  const headerKpis = useMemo(
    () => [
      { label: "DMO points today", value: `${todayPts}/25` },
      { label: "Open tasks", value: projectsSummary?.totalOpenTasks ?? 0 },
      { label: "Competitor emails 7d", value: insights?.totalEmails7d ?? 0 },
    ],
    [todayPts, projectsSummary, insights]
  );

  const visibleWidgets = localLayout.filter((w) => w.visible);
  const hiddenWidgets = localLayout.filter((w) => !w.visible);

  return (
    <div className="flex-1 overflow-auto bg-background">
      {/* ── Hero header ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(245_60%_18%)]" />
        <div className="absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute -top-20 -left-10 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute top-0 left-1/2 h-56 w-56 rounded-full bg-teal-500/8 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-7">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="text-white">
              <p className="text-xs font-medium tracking-wide uppercase text-white/70 flex items-center gap-2 flex-wrap">
                <span data-testid="text-dashboard-date">{todayLabel(user?.timezone)}</span>
                <span className="opacity-50">·</span>
                <span className="tabular-nums" data-testid="text-dashboard-time">
                  {nowTime}
                </span>
              </p>
              <h1
                className="text-3xl sm:text-4xl font-bold tracking-tight mt-1 text-white"
                data-testid="text-dashboard-title"
              >
                {firstName
                  ? `${timeGreeting(user?.timezone)}, ${firstName}`
                  : timeGreeting(user?.timezone)}
              </h1>
              <p className="text-white/70 mt-1 text-sm">
                Your private marketing command center.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Link href="/projects">
                <Button
                  size="sm"
                  className="bg-white text-[hsl(230_70%_12%)] hover:bg-white/90 shadow-lg"
                  data-testid="button-open-projects"
                >
                  <Briefcase className="h-4 w-4 mr-1.5" />
                  Open Projects
                </Button>
              </Link>
              <Link href="/dmo-tracker">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/40 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                  data-testid="button-log-dmo"
                >
                  <Target className="h-4 w-4 mr-1.5" />
                  Log DMO
                </Button>
              </Link>
            </div>
          </div>

          {/* KPI ribbon */}
          {(() => {
            const kpiStyles = [
              {
                bg: "bg-amber-500/15 ring-amber-400/30",
                label: "text-amber-200/80",
                value: "text-amber-100",
              },
              {
                bg: "bg-indigo-500/15 ring-indigo-400/30",
                label: "text-indigo-200/80",
                value: "text-indigo-100",
              },
              {
                bg: "bg-violet-500/15 ring-violet-400/30",
                label: "text-violet-200/80",
                value: "text-violet-100",
              },
            ];
            return (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
                {headerKpis.map((k, i) => {
                  const s = kpiStyles[i] ?? kpiStyles[0];
                  return (
                    <div
                      key={i}
                      className={`rounded-xl backdrop-blur-md ring-1 px-4 py-3 ${s.bg}`}
                      data-testid={`kpi-${i}`}
                    >
                      <p className={`text-[10px] uppercase tracking-wider font-medium ${s.label}`}>
                        {k.label}
                      </p>
                      <p className={`mt-1 text-2xl font-bold tabular-nums ${s.value}`}>
                        {k.value}
                      </p>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Widget area ───────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Section label + hint */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Dashboard
            </p>
            {visibleWidgets.length > 0 && (
              <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                Drag widgets to reorder · hover to remove
              </p>
            )}
          </div>

          {/* Add hidden widgets back */}
          {hiddenWidgets.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-7"
                  data-testid="button-add-widget"
                >
                  <Plus className="h-3 w-3" />
                  Add widget
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {hiddenWidgets.map((w) => (
                  <DropdownMenuItem
                    key={w.id}
                    onClick={() => addWidget(w.id)}
                    data-testid={`add-widget-${w.id}`}
                  >
                    <Plus className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    {WIDGET_META[w.id]?.title ?? w.id}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Empty state */}
        {visibleWidgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              No widgets visible
            </p>
            <p className="text-xs text-muted-foreground/70">
              Use the "Add widget" button above to restore your dashboard.
            </p>
          </div>
        ) : (
          /* DnD grid */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleWidgets.map((w) => w.id)}
              strategy={rectSortingStrategy}
            >
              <div className="grid grid-cols-12 gap-4">
                {visibleWidgets.map((config) => (
                  <SortableWidget
                    key={config.id}
                    config={config}
                    onRemove={() => removeWidget(config.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}
