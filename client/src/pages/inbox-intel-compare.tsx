import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  GitCompare,
  Plus,
  Loader2,
  TrendingUp,
  TrendingDown,
  Mail,
  Calendar,
  Clock,
  Type,
  ShieldCheck,
  Zap,
  Megaphone,
  X,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  CompetitorTrackerWithStats,
  CompareResponse,
  CompareTrackerSummary,
} from "@shared/schema";

const MAX_COMPARE = 4;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatHour(h: number | null): string {
  if (h == null) return "—";
  const hr = ((h + 11) % 12) + 1;
  return `${hr}${h < 12 ? "am" : "pm"}`;
}

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const days = ms / (24 * 60 * 60 * 1000);
  if (days < 1) {
    const hrs = Math.round(ms / (60 * 60 * 1000));
    return `${hrs}h`;
  }
  if (days < 7) return `${Math.round(days * 10) / 10}d`;
  return `${Math.round((days / 7) * 10) / 10}w`;
}

function PctChange({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-muted-foreground">—</span>;
  if (pct === 0)
    return <span className="text-muted-foreground text-xs font-medium">±0%</span>;
  const positive = pct > 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${
        positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
      }`}
    >
      <Icon className="h-3 w-3" />
      {positive ? "+" : ""}
      {pct}%
    </span>
  );
}

const GRID_BY_COUNT: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
};

export default function InboxIntelComparePage() {
  const [, setLocation] = useLocation();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: trackers = [] } = useQuery<CompetitorTrackerWithStats[]>({
    queryKey: ["/api/inbox-intel/trackers"],
  });

  const idsKey = selectedIds.join(",");

  const { data: comparison, isLoading } = useQuery<CompareResponse>({
    queryKey: ["/api/inbox-intel/compare", idsKey],
    queryFn: async () => {
      if (selectedIds.length === 0) return { trackers: [] };
      const res = await fetch(`/api/inbox-intel/compare?ids=${idsKey}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load comparison");
      return res.json();
    },
    enabled: selectedIds.length > 0,
  });

  const cards: CompareTrackerSummary[] = comparison?.trackers || [];

  const toggleId = (id: string) => {
    setSelectedIds((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= MAX_COMPARE) return cur;
      return [...cur, id];
    });
  };

  const removeId = (id: string) => setSelectedIds((cur) => cur.filter((x) => x !== id));

  const trackerLookup = useMemo(() => {
    const m = new Map<string, CompetitorTrackerWithStats>();
    for (const t of trackers) m.set(t.id, t);
    return m;
  }, [trackers]);

  const gridClass = GRID_BY_COUNT[Math.min(Math.max(cards.length, 1), 4)];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero header */}
      <div className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-[hsl(220_70%_8%)] to-[hsl(262_55%_17%)]" />
        <div className="absolute -bottom-24 -right-12 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute -top-16 -left-8 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative max-w-6xl mx-auto px-6 py-8">
          <button
            onClick={() => setLocation("/email-tools/inbox-intel")}
            className="text-white/60 hover:text-white text-sm flex items-center gap-1 mb-4"
            data-testid="link-back-inbox-intel"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Inbox Intel
          </button>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-violet-500/20 ring-1 ring-violet-400/30 flex items-center justify-center">
              <GitCompare className="h-5 w-5 text-violet-300" />
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Compare competitors</h1>
          </div>
          <p className="text-white/60 text-sm mt-1.5 max-w-xl">
            Pick up to {MAX_COMPARE} competitors and see their cadence, ESP, subject style, and welcome funnels side by side.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Selector bar */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="default"
                  className="gap-1.5"
                  data-testid="button-add-to-compare"
                  disabled={trackers.length === 0}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {selectedIds.length === 0
                    ? "Pick competitors to compare"
                    : `${selectedIds.length} of ${MAX_COMPARE} selected`}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-72 max-h-80 overflow-y-auto">
                <DropdownMenuLabel>Choose up to {MAX_COMPARE}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {trackers.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground">
                    No competitors yet — add some on the Inbox Intel hub.
                  </div>
                )}
                {trackers.map((t) => {
                  const checked = selectedIds.includes(t.id);
                  const disabled = !checked && selectedIds.length >= MAX_COMPARE;
                  return (
                    <DropdownMenuCheckboxItem
                      key={t.id}
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={() => toggleId(t.id)}
                      onSelect={(e) => e.preventDefault()}
                      data-testid={`checkbox-compare-${t.id}`}
                    >
                      {t.name}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {selectedIds.map((id) => {
              const t = trackerLookup.get(id);
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs font-medium px-2.5 py-1"
                  data-testid={`chip-compare-${id}`}
                >
                  {t?.name || "—"}
                  <button
                    onClick={() => removeId(id)}
                    className="hover:bg-violet-500/20 rounded-full p-0.5"
                    aria-label={`Remove ${t?.name || "competitor"} from comparison`}
                    data-testid={`button-remove-compare-${id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}

            {selectedIds.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds([])}
                data-testid="button-clear-compare"
              >
                Clear all
              </Button>
            )}
          </div>
        </div>

        {/* Cards */}
        {selectedIds.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-border rounded-2xl">
            <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <GitCompare className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              Pick competitors to compare
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Add up to {MAX_COMPARE} from the dropdown above. We'll show their stats side by side so patterns jump out.
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className={`grid ${gridClass} gap-4`} data-testid="compare-grid">
            {cards.map((c) => (
              <CompareCard key={c.id} c={c} onOpen={() => setLocation(`/email-tools/inbox-intel/${c.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CompareCard({
  c,
  onOpen,
}: {
  c: CompareTrackerSummary;
  onOpen: () => void;
}) {
  const screenshotSrc = c.screenshotPath
    ? `/api/inbox-intel/trackers/${c.id}/screenshot`
    : null;

  return (
    <div
      className="rounded-xl border border-border bg-card overflow-hidden shadow-sm flex flex-col"
      data-testid={`compare-card-${c.id}`}
    >
      {/* Header with screenshot or initial */}
      <div className="relative aspect-[16/9] w-full bg-muted/40 overflow-hidden border-b border-border">
        {screenshotSrc ? (
          <img
            src={screenshotSrc}
            alt={`${c.name} preview`}
            loading="lazy"
            className="w-full h-full object-cover object-top"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600 text-white text-3xl font-bold">
            {c.name.substring(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <div>
          <h3
            className="text-base font-bold text-foreground truncate"
            data-testid={`compare-name-${c.id}`}
            title={c.name}
          >
            {c.name}
          </h3>
          {c.website && (
            <p className="text-xs text-muted-foreground truncate">
              {c.website.replace(/^https?:\/\//, "")}
            </p>
          )}
        </div>

        {/* Activity */}
        <Section icon={<Mail className="h-3.5 w-3.5" />} label="Activity">
          <Row label="This week" value={c.emails7d.toString()} accessory={<PctChange pct={c.weekOverWeekPct} />} testId={`compare-emails7d-${c.id}`} />
          <Row label="Last 30 days" value={c.emails30d.toString()} testId={`compare-emails30d-${c.id}`} />
          <Row label="Avg per week" value={c.avgEmailsPerWeek.toFixed(1)} testId={`compare-avg-${c.id}`} />
          <Row label="Total captured" value={c.emailCount.toString()} muted />
        </Section>

        {/* ESP */}
        <Section icon={<Zap className="h-3.5 w-3.5" />} label="Email platform">
          <Row
            label={c.primaryEsp || "Unknown"}
            value={c.primaryEsp ? `${c.espConfidencePct}%` : "—"}
            valueClass="text-xs text-muted-foreground"
            testId={`compare-esp-${c.id}`}
          />
        </Section>

        {/* Cadence */}
        <Section icon={<Calendar className="h-3.5 w-3.5" />} label="Busiest send window">
          <Row
            label="Day"
            value={c.busiestDayOfWeek != null ? DAY_LABELS[c.busiestDayOfWeek] : "—"}
            testId={`compare-day-${c.id}`}
          />
          <Row
            label="Hour"
            value={formatHour(c.busiestHour)}
            accessory={<Clock className="h-3 w-3 text-muted-foreground" />}
            testId={`compare-hour-${c.id}`}
          />
        </Section>

        {/* Subject style */}
        <Section icon={<Type className="h-3.5 w-3.5" />} label="Subject style">
          <Row label="Avg length" value={`${Math.round(c.avgSubjectLength)} ch`} />
          <Row label="With emoji" value={`${c.pctEmoji}%`} />
        </Section>

        {/* Auth */}
        <Section icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Authentication pass rate">
          <Row label="SPF" value={`${c.spfPassPct}%`} />
          <Row label="DKIM" value={`${c.dkimPassPct}%`} />
          <Row label="DMARC" value={`${c.dmarcPassPct}%`} />
        </Section>

        {/* Welcome funnel */}
        <Section icon={<Megaphone className="h-3.5 w-3.5" />} label="Welcome funnel">
          {c.welcomeSeriesDetected ? (
            <>
              <Row
                label="Steps"
                value={c.welcomeSeriesSteps.toString()}
                testId={`compare-funnel-steps-${c.id}`}
              />
              <Row label="Total length" value={formatDuration(c.welcomeSeriesDurationMs)} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground italic">No welcome series detected.</p>
          )}
        </Section>

        <div className="mt-auto pt-2 flex items-center justify-between">
          <a
            href={`/api/inbox-intel/trackers/${c.id}/emails.csv`}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            data-testid={`compare-download-csv-${c.id}`}
          >
            <Download className="h-3 w-3" /> CSV
          </a>
          <button
            onClick={onOpen}
            className="text-xs font-semibold text-violet-600 dark:text-violet-400 hover:underline inline-flex items-center gap-1"
            data-testid={`compare-open-${c.id}`}
          >
            Open detail <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
        {icon}
        {label}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  accessory,
  valueClass,
  testId,
  muted,
}: {
  label: string;
  value: string;
  accessory?: React.ReactNode;
  valueClass?: string;
  testId?: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between text-sm ${muted ? "text-muted-foreground" : "text-foreground"}`}
      data-testid={testId}
    >
      <span className="text-xs">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={valueClass || "font-semibold"}>{value}</span>
        {accessory}
      </span>
    </div>
  );
}
