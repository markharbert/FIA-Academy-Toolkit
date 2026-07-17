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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Briefcase,
  Target,
  SlidersHorizontal,
  LayoutGrid,
  Eye,
  Move,
  GripVertical,
  X,
  Check,
} from "lucide-react";
import type { DmoEntry, InsightsResponse } from "@shared/schema";

import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

import {
  type WidgetConfig,
  type WidgetId,
  SIZE_CLASSES,
  mergeLayout,
  dmoTotalPts,
} from "@/components/dashboard/widget-registry";
import { CustomizePanel } from "@/components/dashboard/customize-panel";
import { LayoutPanel } from "@/components/dashboard/layout-panel";
import { ProjectsWidget } from "@/components/dashboard/widgets/projects-widget";
import { EmailHealthWidget } from "@/components/dashboard/widgets/email-health-widget";
import { DmoWidget } from "@/components/dashboard/widgets/dmo-widget";
import { InboxAnalyzerWidget } from "@/components/dashboard/widgets/inbox-analyzer-widget";
import { CompetitorPulseWidget } from "@/components/dashboard/widgets/competitor-pulse-widget";
import { RecentActivityWidget } from "@/components/dashboard/widgets/recent-activity-widget";
import { VideoScoreWidget } from "@/components/dashboard/widgets/video-score-widget";
import { TopicPulseWidget } from "@/components/dashboard/widgets/topic-pulse-widget";
import { ScriptsWidget } from "@/components/dashboard/widgets/scripts-widget";
import { YoutubeAnalyticsWidget } from "@/components/dashboard/widgets/youtube-analytics-widget";
import { SearchConsoleWidget } from "@/components/dashboard/widgets/search-console-widget";
import { FunnelBoardWidget } from "@/components/dashboard/widgets/funnel-board-widget";
import { QuickActionsWidget } from "@/components/dashboard/widgets/quick-actions-widget";

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
    case "projects":          return <ProjectsWidget />;
    case "email-health":      return <EmailHealthWidget />;
    case "dmo-streak":        return <DmoWidget />;
    case "inbox-analyzer":    return <InboxAnalyzerWidget />;
    case "competitor-pulse":  return <CompetitorPulseWidget />;
    case "recent-activity":   return <RecentActivityWidget />;
    case "video-score":       return <VideoScoreWidget />;
    case "topic-pulse":       return <TopicPulseWidget />;
    case "scripts":           return <ScriptsWidget />;
    case "youtube-analytics": return <YoutubeAnalyticsWidget />;
    case "search-console":    return <SearchConsoleWidget />;
    case "funnel-board":      return <FunnelBoardWidget />;
    case "quick-actions":     return <QuickActionsWidget />;
    default:                  return null;
  }
}

// ─── Sortable widget (used only in arrange mode) ────────────────────────────────

function SortableWidget({
  config,
  onRemove,
}: {
  config: WidgetConfig;
  onRemove: () => void;
}) {
  // We intentionally do NOT apply transform/transition to the node —
  // live DOM reordering via onDragOver handles placement without CSS
  // transforms, which cause contortion in variable-width CSS grids.
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: config.id,
  });

  // While this item is being dragged, keep a same-size dashed placeholder
  // in the grid slot. The DragOverlay shows the real floating widget.
  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        className={SIZE_CLASSES[config.size]}
        data-testid={`widget-cell-${config.id}`}
      >
        <div className="h-full min-h-[140px] rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/40 dark:bg-gray-900/20" />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`${SIZE_CLASSES[config.size]} relative`}
      data-testid={`widget-cell-${config.id}`}
    >
      {/* Controls — always visible in arrange mode */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-2 pt-2 pointer-events-auto">
        <button
          {...attributes}
          {...listeners}
          className="h-7 w-7 flex items-center justify-center rounded-lg bg-background/95 border border-border shadow-sm text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing touch-none"
          aria-label="Drag to reorder"
          data-testid={`drag-handle-${config.id}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          onClick={onRemove}
          className="h-7 w-7 flex items-center justify-center rounded-lg bg-background/95 border border-border shadow-sm text-muted-foreground hover:text-rose-500 hover:border-rose-300 transition-colors"
          aria-label="Remove widget"
          data-testid={`remove-widget-${config.id}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Subtle violet ring to show edit state */}
      <div className="rounded-xl ring-2 ring-violet-400/40 ring-offset-1 pointer-events-none absolute inset-0 z-10" />

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

  // ── Panel / mode state ───────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState<"layout" | "widgets" | null>(null);
  const [arrangeMode, setArrangeMode] = useState(false);

  // ── Layout — local state synced once from server ─────────────────────────────
  const { data: layoutData } = useQuery<{ layout: WidgetConfig[] | null }>({
    queryKey: ["/api/dashboard/layout"],
  });

  const [localLayout, setLocalLayout] = useState<WidgetConfig[]>(() => mergeLayout(null));
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (layoutData !== undefined && !hasInitialized.current) {
      setLocalLayout(mergeLayout(layoutData.layout ?? null));
      hasInitialized.current = true;
    }
  }, [layoutData]);

  // ── Save mutation ────────────────────────────────────────────────────────────
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

  // ── Debounced auto-save ──────────────────────────────────────────────────────
  const saveTimer = useRef<NodeJS.Timeout>();
  const scheduleAutoSave = useCallback((newLayout: WidgetConfig[]) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveLayoutMutation.mutate(newLayout);
    }, 800);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Panels: layout preset applied + widgets panel save ───────────────────────
  function handleApplyLayout(newLayout: WidgetConfig[]) {
    setLocalLayout(newLayout);
    saveLayoutMutation.mutate(newLayout);
    toast({ title: "Layout updated" });
  }

  function handleSaveWidgets(newLayout: WidgetConfig[]) {
    setLocalLayout(newLayout);
    saveLayoutMutation.mutate(newLayout);
    setActivePanel(null);
    toast({ title: "Widgets updated" });
  }

  // ── Arrange mode: DnD ───────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // Always-current ref so handleDragEnd can read latest layout without
  // stale-closure issues (onDragOver updates state many times mid-drag).
  const localLayoutRef = useRef(localLayout);
  useEffect(() => { localLayoutRef.current = localLayout; }, [localLayout]);

  // Track which widget is being dragged (feeds the DragOverlay)
  const [activeWidgetId, setActiveWidgetId] = useState<WidgetId | null>(null);
  const activeDragWidth = useRef<number>(0);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveWidgetId(event.active.id as WidgetId);
    const rect = (event.active.rect.current as any)?.initial;
    if (rect?.width) activeDragWidth.current = rect.width;
  }, []);

  // Live-reorder the DOM as the cursor moves over different widgets.
  // Because we directly swap the React state here, the grid re-renders
  // with correct CSS grid placement — NO CSS transforms are needed.
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setLocalLayout((prev) => {
      const visibleIds = prev.filter((w) => w.visible).map((w) => w.id);
      const oldIdx = visibleIds.indexOf(active.id as WidgetId);
      const newIdx = visibleIds.indexOf(over.id as WidgetId);
      if (oldIdx < 0 || newIdx < 0) return prev;
      const reordered = arrayMove(visibleIds, oldIdx, newIdx);
      const hidden = prev.filter((w) => !w.visible);
      const visible = reordered.map((id) => prev.find((w) => w.id === id)!);
      return [...visible, ...hidden];
    });
  }, []);

  // On drop: clear overlay and save whatever order the live reorder landed on.
  const handleDragEnd = useCallback((_event: DragEndEvent) => {
    setActiveWidgetId(null);
    scheduleAutoSave(localLayoutRef.current);
  }, [scheduleAutoSave]);

  // ── Arrange mode: remove widget ──────────────────────────────────────────────
  function removeWidget(id: WidgetId) {
    setLocalLayout((prev) => {
      const next = prev.map((w) => (w.id === id ? { ...w, visible: false } : w));
      scheduleAutoSave(next);
      return next;
    });
  }

  // ── Done arranging ───────────────────────────────────────────────────────────
  function doneArranging() {
    clearTimeout(saveTimer.current);
    saveLayoutMutation.mutate(localLayout);
    setArrangeMode(false);
    toast({ title: "Layout saved" });
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
              { bg: "bg-amber-500/15 ring-amber-400/30",  label: "text-amber-200/80",  value: "text-amber-100"  },
              { bg: "bg-indigo-500/15 ring-indigo-400/30", label: "text-indigo-200/80", value: "text-indigo-100" },
              { bg: "bg-violet-500/15 ring-violet-400/30", label: "text-violet-200/80", value: "text-violet-100" },
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

        {/* ── Arrange mode banner ──────────────────────────────────────────────── */}
        {arrangeMode && (
          <div className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-violet-400/50 bg-violet-50 dark:bg-violet-950/30 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Move className="h-4 w-4 text-violet-500 shrink-0" />
              <p className="text-sm font-medium text-violet-700 dark:text-violet-300">
                Arrange mode — drag widgets to reorder, click × to remove
              </p>
            </div>
            <Button
              size="sm"
              onClick={doneArranging}
              disabled={saveLayoutMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700 text-white shrink-0 gap-1.5"
              data-testid="button-done-arrange"
            >
              <Check className="h-3.5 w-3.5" />
              Done
            </Button>
          </div>
        )}

        {/* ── Top bar: label + Customize button ───────────────────────────────── */}
        {!arrangeMode && (
          <div className="flex items-center justify-between mb-5">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Dashboard
            </p>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground hover:text-foreground"
                  data-testid="button-customize-dashboard"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Customize
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onClick={() => setActivePanel("layout")}
                  data-testid="menu-change-layout"
                >
                  <LayoutGrid className="h-4 w-4 mr-2 text-muted-foreground" />
                  Change Layout
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setActivePanel("widgets")}
                  data-testid="menu-add-remove-widgets"
                >
                  <Eye className="h-4 w-4 mr-2 text-muted-foreground" />
                  Add / Remove Widgets
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setArrangeMode(true)}
                  data-testid="menu-arrange-widgets"
                >
                  <Move className="h-4 w-4 mr-2 text-muted-foreground" />
                  Arrange Widgets
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* ── Widget grid ──────────────────────────────────────────────────────── */}
        {visibleWidgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <SlidersHorizontal className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              All widgets are hidden
            </p>
            <p className="text-xs text-muted-foreground/70">
              Use Customize → Add / Remove Widgets to show some.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setActivePanel("widgets")}
              data-testid="button-customize-empty"
            >
              Add widgets
            </Button>
          </div>
        ) : arrangeMode ? (
          /* ── Drag-and-drop grid (arrange mode only) ── */
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
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

            {/* Floating widget clone that follows the cursor — no distortion */}
            <DragOverlay
              dropAnimation={{ duration: 180, easing: "ease" }}
            >
              {activeWidgetId ? (
                <div
                  style={{ width: activeDragWidth.current || undefined }}
                  className="opacity-90 shadow-2xl rounded-xl rotate-1 scale-[1.02]"
                >
                  <WidgetRenderer id={activeWidgetId} />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : (
          /* ── Normal static grid ── */
          <div className="grid grid-cols-12 gap-4">
            {visibleWidgets.map((config) => (
              <div
                key={config.id}
                className={SIZE_CLASSES[config.size]}
                data-testid={`widget-cell-${config.id}`}
              >
                <WidgetRenderer id={config.id} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Side panels ──────────────────────────────────────────────────────── */}
      <LayoutPanel
        layout={localLayout}
        open={activePanel === "layout"}
        onOpenChange={(o) => !o && setActivePanel(null)}
        onApply={handleApplyLayout}
        isSaving={saveLayoutMutation.isPending}
      />
      <CustomizePanel
        layout={localLayout}
        open={activePanel === "widgets"}
        onOpenChange={(o) => !o && setActivePanel(null)}
        onSave={handleSaveWidgets}
        isSaving={saveLayoutMutation.isPending}
      />
    </div>
  );
}
