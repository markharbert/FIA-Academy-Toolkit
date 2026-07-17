import { useState, useEffect, useRef, useCallback, memo, useLayoutEffect } from "react";
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
  SlidersHorizontal,
  LayoutGrid,
  Eye,
  Move,
  GripVertical,
  X,
  Check,
  Plus,
} from "lucide-react";

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
  arrayMove,
} from "@dnd-kit/sortable";

import {
  type WidgetConfig,
  type WidgetId,
  SIZE_CLASSES,
  WIDGET_META,
  mergeLayout,
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

// ─── Widget renderer ─────────────────────────────────────────────────────────
// Wrapped in memo so it only re-renders when `id` changes — not on every
// onDragOver state update during arrange mode.

const WidgetRenderer = memo(function WidgetRenderer({ id }: { id: WidgetId }) {
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
});

// ─── Ghost slot (hidden widget placeholder) ──────────────────────────────────
// Defined at module level so React never treats it as a new component type
// between renders — avoiding unmount/remount flicker during drag.

function GhostSlot({
  config,
  onClick,
}: {
  config: WidgetConfig;
  onClick?: () => void;
}) {
  const meta = WIDGET_META[config.id];
  const interactive = Boolean(onClick);
  return (
    <div
      className={`${SIZE_CLASSES[config.size]} min-h-[130px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 p-4 transition-all group ${
        interactive
          ? "border-muted-foreground/15 bg-muted/10 cursor-pointer hover:border-violet-400/50 hover:bg-violet-50/50 dark:hover:bg-violet-950/10"
          : "border-muted-foreground/10 bg-muted/5 cursor-default opacity-50"
      }`}
      onClick={onClick}
      data-testid={`ghost-slot-${config.id}`}
    >
      <div
        className={`h-8 w-8 rounded-full border-2 border-dashed flex items-center justify-center transition-colors ${
          interactive
            ? "border-muted-foreground/20 group-hover:border-violet-400/60"
            : "border-muted-foreground/10"
        }`}
      >
        <Plus
          className={`h-3.5 w-3.5 transition-colors ${
            interactive
              ? "text-muted-foreground/25 group-hover:text-violet-500"
              : "text-muted-foreground/15"
          }`}
        />
      </div>
      <p
        className={`text-xs font-medium text-center leading-tight transition-colors ${
          interactive
            ? "text-muted-foreground/40 group-hover:text-violet-600 dark:group-hover:text-violet-400"
            : "text-muted-foreground/30"
        }`}
      >
        {meta.title}
      </p>
    </div>
  );
}

// ─── Sortable widget (used only in arrange mode) ─────────────────────────────
// FLIP approach: DOM reorders instantly on drag-over (correct positions always),
// and the DashboardPage's useLayoutEffect computes & plays the CSS translation
// animation from old→new position. No dnd-kit CSS transforms on non-active items.

function SortableWidget({
  config,
  onRemove,
  placeholderHeight,
  registerRef,
}: {
  config: WidgetConfig;
  onRemove: () => void;
  placeholderHeight: number;
  registerRef: (id: WidgetId, el: HTMLDivElement | null) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: config.id,
  });

  // Combined ref: registers with dnd-kit AND our FLIP tracker
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      setNodeRef(el);
      registerRef(config.id, el);
    },
    [setNodeRef, config.id, registerRef]
  );

  // While this item is being dragged, keep a same-size dashed placeholder
  // in the grid slot. The DragOverlay shows the real floating widget.
  if (isDragging) {
    return (
      <div
        ref={setRefs}
        className={`${SIZE_CLASSES[config.size]} flex flex-col`}
        data-testid={`widget-cell-${config.id}`}
      >
        <div
          style={{ height: placeholderHeight || 200 }}
          className="rounded-xl border-2 border-dashed border-violet-300/40 dark:border-violet-600/30 bg-violet-50/20 dark:bg-violet-950/10"
        />
      </div>
    );
  }

  return (
    <div
      ref={setRefs}
      className={`${SIZE_CLASSES[config.size]} relative flex flex-col`}
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

  // ── FLIP animation refs ──────────────────────────────────────────────────────
  // widgetElsRef: live DOM element map for all visible sortable widgets.
  // snapRects: pre-reorder bounding box snapshot (set in handleDragOver,
  //            consumed in useLayoutEffect after React re-renders the new order).
  const widgetElsRef = useRef<Map<WidgetId, HTMLDivElement | null>>(new Map());
  const snapRects = useRef<Map<WidgetId, { x: number; y: number }>>(new Map());

  const registerWidgetEl = useCallback(
    (id: WidgetId, el: HTMLDivElement | null) => {
      if (el) widgetElsRef.current.set(id, el);
      else widgetElsRef.current.delete(id);
    },
    []
  );

  // After each live DOM reorder triggered by handleDragOver, animate non-active
  // widgets from their old positions to their new positions (FLIP technique):
  //   F = snapshot rects (done in handleDragOver, before setLocalLayout)
  //   L = new rects read here after React has updated the DOM
  //   I = apply inverse transform so element visually appears at old position
  //   P = remove transform with CSS transition → element animates to new position
  useLayoutEffect(() => {
    if (snapRects.current.size === 0) return;

    const toAnimate: HTMLDivElement[] = [];

    snapRects.current.forEach(({ x, y }, id) => {
      const el = widgetElsRef.current.get(id);
      if (!el) return;
      const next = el.getBoundingClientRect();
      const dx = x - next.left;
      const dy = y - next.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      // Invert: instantly place at old visual position (no transition)
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px,${dy}px)`;
      toAnimate.push(el);
    });

    snapRects.current.clear();

    if (toAnimate.length === 0) return;

    // Play: two rAFs so the browser paints the "Invert" frame first,
    // then triggers the transition to the natural (new) position.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toAnimate.forEach((el) => {
          el.style.transition = "transform 280ms cubic-bezier(0.2,0,0,1)";
          el.style.transform = "";
        });
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localLayout]);

  // ── DnD handlers ─────────────────────────────────────────────────────────────

  // Always-current ref so handleDragEnd can read the latest layout without
  // a stale closure (localLayout changes many times mid-drag via onDragOver).
  const localLayoutRef = useRef(localLayout);
  localLayoutRef.current = localLayout;

  // Track which widget is being dragged (feeds the DragOverlay)
  const [activeWidgetId, setActiveWidgetId] = useState<WidgetId | null>(null);
  const activeWidgetIdRef = useRef<WidgetId | null>(null);
  const activeDragWidth = useRef<number>(0);
  const activeDragHeight = useRef<number>(0);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const id = event.active.id as WidgetId;
    setActiveWidgetId(id);
    activeWidgetIdRef.current = id;
    const rect = (event.active.rect.current as any)?.initial;
    if (rect?.width) activeDragWidth.current = rect.width;
    if (rect?.height) activeDragHeight.current = rect.height;
  }, []);

  // Live-reorder the DOM as the cursor crosses into a new widget's territory.
  // Before updating state (which triggers a React render + DOM update), snapshot
  // the current positions of all non-active widgets for the FLIP animator above.
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Cancel any in-progress FLIP animations so we snapshot real positions,
    // not mid-animation visual positions.
    widgetElsRef.current.forEach((el, id) => {
      if (!el || id === activeWidgetIdRef.current) return;
      if (el.style.transform) {
        el.style.transition = "none";
        el.style.transform = "";
      }
    });

    // F — First: snapshot each non-active widget's position before reorder
    snapRects.current = new Map();
    widgetElsRef.current.forEach((el, id) => {
      if (!el || id === activeWidgetIdRef.current) return;
      const r = el.getBoundingClientRect();
      snapRects.current.set(id, { x: r.left, y: r.top });
    });

    // Reorder state → React re-renders → useLayoutEffect fires (L + I + P)
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

  // On drop: DOM is already in the correct order (from live handleDragOver reorders).
  // Just clear the overlay and persist whatever order we landed on.
  const handleDragEnd = useCallback((_event: DragEndEvent) => {
    setActiveWidgetId(null);
    activeWidgetIdRef.current = null;
    snapRects.current.clear(); // discard any pending snapshot
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

  const visibleWidgets = localLayout.filter((w) => w.visible);

  return (
    <div className="flex-1 overflow-auto bg-background">
      {/* ── Hero header ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(245_60%_18%)]" />
        <div className="absolute -bottom-32 -right-16 h-80 w-80 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute -top-20 -left-10 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute top-0 left-1/2 h-56 w-56 rounded-full bg-teal-500/8 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-6">
          <p className="text-xs font-medium tracking-wide uppercase text-white/60 flex items-center gap-2 flex-wrap">
            <span data-testid="text-dashboard-date">{todayLabel(user?.timezone)}</span>
            <span className="opacity-40">·</span>
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
          <p className="text-white/60 mt-1 text-sm">
            Your private marketing command center.
          </p>
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
        {(() => {
          // In arrange mode or while the Add/Remove panel is open, reveal the
          // full layout: visible widgets render normally, hidden ones show as
          // ghost placeholder slots so the user can see the whole picture.
          const revealAll = arrangeMode || activePanel === "widgets";

          // True empty state: no visible widgets AND we're not in a reveal mode
          if (visibleWidgets.length === 0 && !revealAll) {
            return (
              <div>
                <div className="flex items-center justify-between mb-5">
                  <p className="text-sm text-muted-foreground">
                    Your dashboard is empty — click a slot to add widgets.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActivePanel("widgets")}
                    data-testid="button-customize-empty"
                    className="shrink-0 ml-4"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Add Widgets
                  </Button>
                </div>
                <div className="grid grid-cols-12 gap-4">
                  {localLayout.map((config) => (
                    <GhostSlot
                      key={config.id}
                      config={config}
                      onClick={() => setActivePanel("widgets")}
                    />
                  ))}
                </div>
              </div>
            );
          }

          // Full grid: visible widgets as real cards, hidden widgets as ghost slots.
          // GhostSlot is defined at module level (not inside this IIFE) so React
          // never sees it as a new component type between renders — no remounting.
          // In arrange mode ghost slots are decorative (no onClick) to prevent
          // the Add/Remove panel from opening while the drag banner is active.
          const fullGrid = (
            <div className="grid grid-cols-12 gap-4">
              {localLayout.map((config) => {
                if (config.visible) {
                  if (arrangeMode) {
                    return (
                      <SortableWidget
                        key={config.id}
                        config={config}
                        onRemove={() => removeWidget(config.id)}
                        placeholderHeight={activeDragHeight.current}
                        registerRef={registerWidgetEl}
                      />
                    );
                  }
                  return (
                    <div
                      key={config.id}
                      className={`${SIZE_CLASSES[config.size]} flex flex-col`}
                      data-testid={`widget-cell-${config.id}`}
                    >
                      <WidgetRenderer id={config.id} />
                    </div>
                  );
                }
                // Hidden widget — render a placeholder only when revealing all.
                // Pass onClick only in widget-panel mode, not while in arrange mode.
                return revealAll ? (
                  <GhostSlot
                    key={config.id}
                    config={config}
                    onClick={arrangeMode ? undefined : () => setActivePanel("widgets")}
                  />
                ) : null;
              })}
            </div>
          );

          if (arrangeMode) {
            return (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                {/*
                  strategy={() => null} — dnd-kit computes no CSS transforms for
                  any item. The DOM is live-reordered in onDragOver (always correct
                  positions) and our FLIP useLayoutEffect handles the smooth animation
                  from old→new position for every non-active widget.
                */}
                <SortableContext
                  items={visibleWidgets.map((w) => w.id)}
                  strategy={() => null}
                >
                  {fullGrid}
                </SortableContext>

                {/* Floating widget clone that follows the cursor — no distortion */}
                <DragOverlay dropAnimation={{ duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
                  {activeWidgetId ? (
                    <div
                      style={{
                        width: activeDragWidth.current || undefined,
                        willChange: "transform",
                      }}
                      className="opacity-90 shadow-2xl rounded-xl rotate-1 scale-[1.02] pointer-events-none"
                    >
                      <WidgetRenderer id={activeWidgetId} />
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            );
          }

          return fullGrid;
        })()}
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
