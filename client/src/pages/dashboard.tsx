import { useMemo, useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Briefcase, Target, SlidersHorizontal } from "lucide-react";
import type { DmoEntry, InsightsResponse } from "@shared/schema";

import {
  type WidgetConfig,
  type WidgetId,
  SIZE_CLASSES,
  mergeLayout,
  dmoTotalPts,
} from "@/components/dashboard/widget-registry";
import { CustomizePanel } from "@/components/dashboard/customize-panel";
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

// ─── Widget renderer ───────────────────────────────────────────────────────────

function WidgetRenderer({ id }: { id: WidgetId }) {
  switch (id) {
    case "projects":
      return <ProjectsWidget />;
    case "email-health":
      return <EmailHealthWidget />;
    case "dmo-streak":
      return <DmoWidget />;
    case "inbox-analyzer":
      return <InboxAnalyzerWidget />;
    case "competitor-pulse":
      return <CompetitorPulseWidget />;
    case "recent-activity":
      return <RecentActivityWidget />;
    default:
      return null;
  }
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

  // ── Customize panel ──────────────────────────────────────────────────────────
  const [showCustomize, setShowCustomize] = useState(false);

  // ── Layout ──────────────────────────────────────────────────────────────────
  const { data: layoutData } = useQuery<{ layout: WidgetConfig[] | null }>({
    queryKey: ["/api/dashboard/layout"],
  });
  const layout = useMemo(
    () => mergeLayout(layoutData?.layout ?? null),
    [layoutData]
  );

  const saveLayoutMutation = useMutation({
    mutationFn: (newLayout: WidgetConfig[]) =>
      apiRequest("PATCH", "/api/dashboard/layout", { layout: newLayout }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/dashboard/layout"] });
      setShowCustomize(false);
      toast({ title: "Dashboard layout saved" });
    },
    onError: () => {
      toast({ title: "Failed to save layout", variant: "destructive" });
    },
  });

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

  // Visible widgets in order
  const visibleWidgets = layout.filter((w) => w.visible);

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
                      <p
                        className={`text-[10px] uppercase tracking-wider font-medium ${s.label}`}
                      >
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
        {/* Customize button row */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Dashboard
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCustomize(true)}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            data-testid="button-customize-dashboard"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Customize
          </Button>
        </div>

        {/* Widget grid — 12 columns, items flow left-to-right using CSS grid */}
        {visibleWidgets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <SlidersHorizontal className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">
              All widgets are hidden
            </p>
            <p className="text-xs text-muted-foreground">
              Click Customize to show some widgets.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowCustomize(true)}
              data-testid="button-customize-empty"
            >
              Customize dashboard
            </Button>
          </div>
        ) : (
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

      {/* ── Customize panel ───────────────────────────────────────────────────── */}
      <CustomizePanel
        layout={layout}
        open={showCustomize}
        onOpenChange={setShowCustomize}
        onSave={(newLayout) => saveLayoutMutation.mutate(newLayout)}
        isSaving={saveLayoutMutation.isPending}
      />
    </div>
  );
}
