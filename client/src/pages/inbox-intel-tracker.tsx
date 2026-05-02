import { useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Copy,
  Check,
  Plus,
  Loader2,
  Mail,
  Trash2,
  Pin,
  PinOff,
  Inbox,
  ExternalLink,
  MoreVertical,
  BarChart3,
  Calendar,
  Type,
  ShieldCheck,
  ShieldAlert,
  Link as LinkIcon,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type {
  CompetitorTracker,
  CompetitorSeedAddress,
  CapturedCompetitorEmail,
  TrackerAnalytics,
} from "@shared/schema";

const MAX_SEEDS = 5;

interface TrackerDetailResponse {
  tracker: CompetitorTracker;
  seeds: (CompetitorSeedAddress & { address: string })[];
  emails: CapturedCompetitorEmail[];
  pinnedCount: number;
}

function formatDate(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(d: Date | string | null) {
  if (!d) return "";
  return new Date(d).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function InboxIntelTrackerPage() {
  const params = useParams<{ trackerId: string }>();
  const trackerId = params.trackerId;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [seedLabel, setSeedLabel] = useState("");

  const { data, isLoading, error } = useQuery<TrackerDetailResponse>({
    queryKey: ["/api/inbox-intel/trackers", trackerId],
    enabled: !!trackerId,
  });

  const addSeedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/inbox-intel/trackers/${trackerId}/seeds`, {
        label: seedLabel.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      setSeedLabel("");
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/trackers", trackerId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/trackers"] });
      toast({ title: "Seed address created" });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't create seed", description: err?.message, variant: "destructive" });
    },
  });

  const deleteSeedMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/inbox-intel/seeds/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/trackers", trackerId] });
      toast({ title: "Seed address removed" });
    },
  });

  const deleteTrackerMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/inbox-intel/trackers/${trackerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/trackers"] });
      toast({ title: "Competitor removed" });
      setLocation("/email-tools/inbox-intel");
    },
  });

  const togglePinMutation = useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      await apiRequest("PATCH", `/api/inbox-intel/emails/${id}/pin`, { pinned });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/trackers", trackerId] });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't update pin", description: err?.message, variant: "destructive" });
    },
  });

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p className="text-muted-foreground mb-4">Couldn't load this competitor.</p>
        <Button variant="outline" onClick={() => setLocation("/email-tools/inbox-intel")}>
          Back to Inbox Intel
        </Button>
      </div>
    );
  }

  const { tracker, seeds, emails, pinnedCount } = data;
  const seedAtLimit = seeds.length >= MAX_SEEDS;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => setLocation("/email-tools/inbox-intel")}
            className="text-white/60 hover:text-white text-sm flex items-center gap-1 mb-4"
            data-testid="link-back-inbox-intel"
          >
            <ArrowLeft className="h-4 w-4" /> All competitors
          </button>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg">
                {tracker.name.substring(0, 1).toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight" data-testid="text-tracker-title">
                  {tracker.name}
                </h1>
                {tracker.website && (
                  <a
                    href={tracker.website.startsWith("http") ? tracker.website : `https://${tracker.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/50 text-xs hover:text-white/80 flex items-center gap-1 mt-0.5"
                  >
                    {tracker.website.replace(/^https?:\/\//, "")} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/70 hover:text-white hover:bg-white/10"
                  data-testid="button-delete-tracker"
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Remove
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove this competitor?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes {tracker.name}, all seed addresses, and every captured email — including pinned ones. This can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteTrackerMutation.mutate()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid="button-confirm-delete-tracker"
                  >
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {tracker.notes && (
            <p className="text-white/60 text-sm mt-3 max-w-2xl whitespace-pre-line">{tracker.notes}</p>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Seed addresses */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-bold text-foreground">Seed addresses</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {seeds.length} of {MAX_SEEDS} addresses. Use these to subscribe to {tracker.name}'s list.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {seeds.map((seed) => (
              <div
                key={seed.id}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
                data-testid={`row-seed-${seed.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono text-foreground truncate" data-testid={`text-seed-address-${seed.id}`}>
                      {seed.address}
                    </code>
                    <button
                      onClick={() => copyToClipboard(seed.address, seed.id)}
                      className="text-muted-foreground hover:text-foreground flex-shrink-0"
                      data-testid={`button-copy-seed-${seed.id}`}
                      title="Copy"
                    >
                      {copiedId === seed.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {seed.label && <span>{seed.label}</span>}
                    <span>{seed.receivedCount} received</span>
                    {seed.lastReceivedAt && <span>Last: {formatDate(seed.lastReceivedAt)}</span>}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteSeedMutation.mutate(seed.id)}
                  data-testid={`button-delete-seed-${seed.id}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>

          {!seedAtLimit && (
            <div className="mt-3 flex gap-2">
              <Input
                placeholder="Optional label (e.g. homepage opt-in)"
                value={seedLabel}
                onChange={(e) => setSeedLabel(e.target.value)}
                maxLength={60}
                data-testid="input-seed-label"
              />
              <Button
                onClick={() => addSeedMutation.mutate()}
                disabled={addSeedMutation.isPending}
                data-testid="button-add-seed"
                className="gap-2 flex-shrink-0"
              >
                {addSeedMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Generate seed
              </Button>
            </div>
          )}

          {seedAtLimit && (
            <p className="text-xs text-muted-foreground mt-3">
              You've reached the {MAX_SEEDS}-address limit. Delete one to generate another.
            </p>
          )}
        </section>

        {/* Tabs: Emails | Analytics */}
        <Tabs defaultValue="emails" className="space-y-4">
          <TabsList data-testid="tabs-tracker">
            <TabsTrigger value="emails" data-testid="tab-emails">
              <Inbox className="h-3.5 w-3.5 mr-1.5" /> Captured emails
            </TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics">
              <BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="emails" className="space-y-3 mt-0">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {emails.length === 0
                  ? "No emails captured yet. They'll appear here once they arrive."
                  : `${emails.length} ${emails.length === 1 ? "email" : "emails"} • ${pinnedCount} pinned`}
              </p>
            </div>

            {emails.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-xl">
                <Inbox className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  Add a seed address above and use it to subscribe to {tracker.name}'s list.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                {emails.map((email) => (
                  <div
                    key={email.id}
                    className="flex items-center gap-3 px-4 py-3 hover-elevate active-elevate-2 cursor-pointer transition-colors"
                    onClick={() => setLocation(`/email-tools/inbox-intel/${trackerId}/email/${email.id}`)}
                    data-testid={`row-email-${email.id}`}
                  >
                    {email.isPinned && (
                      <Pin className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-foreground truncate" data-testid={`text-email-from-${email.id}`}>
                          {email.fromName || email.fromEmail || "Unknown sender"}
                        </span>
                        {!email.bodyAvailable && (
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            archived
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground truncate" data-testid={`text-email-subject-${email.id}`}>
                        {email.subject}
                      </p>
                    </div>
                    <div className="hidden sm:flex flex-col items-end text-xs text-muted-foreground flex-shrink-0">
                      <span>{formatDate(email.receivedAt)}</span>
                      <span>{formatTime(email.receivedAt)}</span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded hover:bg-muted text-muted-foreground"
                          data-testid={`button-email-menu-${email.id}`}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePinMutation.mutate({ id: email.id, pinned: !email.isPinned });
                          }}
                          data-testid={`button-toggle-pin-${email.id}`}
                        >
                          {email.isPinned ? (
                            <><PinOff className="h-4 w-4 mr-2" /> Unpin</>
                          ) : (
                            <><Pin className="h-4 w-4 mr-2" /> Pin to favorites</>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="mt-0">
            <AnalyticsPanel trackerId={trackerId!} trackerName={tracker.name} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Analytics panel — fetches /api/inbox-intel/trackers/:id/analytics
// ──────────────────────────────────────────────────────────────────────────

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = ["12a", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12p", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];

function AnalyticsPanel({ trackerId, trackerName }: { trackerId: string; trackerName: string }) {
  const { data: analytics, isLoading } = useQuery<TrackerAnalytics>({
    queryKey: ["/api/inbox-intel/trackers", trackerId, "analytics"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!analytics || analytics.totalEmails === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-border rounded-xl">
        <BarChart3 className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Analytics will appear once {trackerName} starts sending emails to your seed addresses.
        </p>
      </div>
    );
  }

  // Build heatmap matrix (7 × 24)
  const cellMap = new Map<string, number>();
  let maxCell = 0;
  for (const c of analytics.cadenceHeatmap) {
    cellMap.set(`${c.dayOfWeek}-${c.hourOfDay}`, c.count);
    if (c.count > maxCell) maxCell = c.count;
  }

  const heatmapColor = (count: number): string => {
    if (count === 0) return "bg-muted/40";
    const intensity = Math.min(1, count / Math.max(1, maxCell));
    if (intensity < 0.2) return "bg-violet-500/15";
    if (intensity < 0.4) return "bg-violet-500/30";
    if (intensity < 0.6) return "bg-violet-500/50";
    if (intensity < 0.8) return "bg-violet-500/70";
    return "bg-violet-500";
  };

  const volumeData = analytics.volumeByDay.map((b) => ({
    date: b.date,
    label: new Date(b.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    count: b.count,
  }));

  const busiestLabel =
    analytics.busiestDayOfWeek !== null && analytics.busiestHour !== null
      ? `${DAY_LABELS[analytics.busiestDayOfWeek]} at ${HOUR_LABELS[analytics.busiestHour]}`
      : "—";

  return (
    <div className="space-y-5">
      {/* Top stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile
          icon={<Mail className="h-3.5 w-3.5" />}
          label="Total emails"
          value={analytics.totalEmails.toString()}
          testId="stat-total-emails"
        />
        <StatTile
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Avg per week"
          value={analytics.averageEmailsPerWeek.toString()}
          testId="stat-avg-per-week"
        />
        <StatTile
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="Busiest send"
          value={busiestLabel}
          testId="stat-busiest-send"
        />
        <StatTile
          icon={<Mail className="h-3.5 w-3.5" />}
          label="Primary ESP"
          value={analytics.esp.primary || "Unknown"}
          subtle={analytics.esp.primary ? `${analytics.esp.confidencePct}% confidence` : undefined}
          testId="stat-primary-esp"
        />
      </div>

      {/* Cadence heatmap + Volume chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PanelCard title="Cadence heatmap" subtitle="Send frequency by day of week × hour of day">
          <div className="overflow-x-auto" data-testid="heatmap-cadence">
            <div className="min-w-[560px]">
              <div className="flex">
                <div className="w-10" />
                <div className="flex-1 grid grid-cols-24 gap-0.5">
                  {HOUR_LABELS.map((h, i) => (
                    <div key={i} className="text-[9px] text-center text-muted-foreground" style={{ minWidth: 16 }}>
                      {i % 3 === 0 ? h : ""}
                    </div>
                  ))}
                </div>
              </div>
              {DAY_LABELS.map((day, dow) => (
                <div key={dow} className="flex items-center mt-0.5">
                  <div className="w-10 text-[10px] text-muted-foreground pr-1 text-right">{day}</div>
                  <div className="flex-1 grid grid-cols-24 gap-0.5">
                    {Array.from({ length: 24 }, (_, hod) => {
                      const c = cellMap.get(`${dow}-${hod}`) || 0;
                      return (
                        <div
                          key={hod}
                          className={`aspect-square rounded-[2px] ${heatmapColor(c)}`}
                          title={c > 0 ? `${day} ${HOUR_LABELS[hod]}: ${c} ${c === 1 ? "email" : "emails"}` : `${day} ${HOUR_LABELS[hod]}: no sends`}
                          data-testid={`heatmap-cell-${dow}-${hod}`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
                <span>Less</span>
                <div className="flex gap-0.5">
                  {["bg-muted/40", "bg-violet-500/15", "bg-violet-500/30", "bg-violet-500/50", "bg-violet-500/70", "bg-violet-500"].map((c, i) => (
                    <div key={i} className={`w-3 h-3 rounded-[2px] ${c}`} />
                  ))}
                </div>
                <span>More</span>
              </div>
            </div>
          </div>
        </PanelCard>

        <PanelCard title="Send volume" subtitle="Emails per day, last 90 days">
          <div className="h-[220px]" data-testid="chart-volume">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={volumeData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  interval={Math.floor(volumeData.length / 6)}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  cursor={{ fill: "hsl(var(--muted))" }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PanelCard>
      </div>

      {/* Subject + ESP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PanelCard title="Subject lines" subtitle="Patterns across every captured subject">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MiniStat label="Avg length" value={`${analytics.subject.avgLength} ch`} />
            <MiniStat label="With emoji" value={`${analytics.subject.pctEmoji}%`} />
            <MiniStat label="ALL CAPS" value={`${analytics.subject.pctAllCaps}%`} />
          </div>
          {analytics.subject.topOpeningWords.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Top opening words</div>
              <div className="flex flex-wrap gap-1.5">
                {analytics.subject.topOpeningWords.map((w) => (
                  <span
                    key={w.value}
                    className="text-xs px-2 py-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20"
                    data-testid={`tag-opening-word-${w.value}`}
                  >
                    {w.value} <span className="text-muted-foreground">·{w.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {analytics.subject.longest && (
            <div className="mt-2 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Longest</div>
              <div className="text-foreground italic line-clamp-2">"{analytics.subject.longest}"</div>
            </div>
          )}
          {analytics.subject.shortest && (
            <div className="mt-2 text-xs">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Shortest</div>
              <div className="text-foreground italic">"{analytics.subject.shortest}"</div>
            </div>
          )}
        </PanelCard>

        <PanelCard title="ESP fingerprint" subtitle="Detected sending platform across all captures">
          <div className="mb-3">
            <div className="text-2xl font-bold text-foreground" data-testid="text-primary-esp">
              {analytics.esp.primary || "Unknown"}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {analytics.esp.primary
                ? `${analytics.esp.confidencePct}% of identified emails · ${analytics.esp.changeCount} ESP ${analytics.esp.changeCount === 1 ? "change" : "changes"} detected`
                : "Couldn't identify a sending platform from headers or body"}
            </div>
          </div>
          {analytics.esp.distribution.length > 0 && (
            <div className="space-y-1.5">
              {analytics.esp.distribution.slice(0, 5).map((d) => {
                const pct = analytics.totalEmails > 0 ? (d.count / analytics.totalEmails) * 100 : 0;
                return (
                  <div key={d.value} className="text-xs" data-testid={`row-esp-${d.value}`}>
                    <div className="flex justify-between mb-0.5">
                      <span className="text-foreground font-medium">{d.value}</span>
                      <span className="text-muted-foreground">{d.count} ({Math.round(pct)}%)</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full ${d.value === "Unknown" ? "bg-muted-foreground/40" : "bg-violet-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PanelCard>
      </div>

      {/* Authentication + Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PanelCard title="Authentication audit" subtitle="How often this sender passes inbox-trust checks">
          <div className="grid grid-cols-3 gap-2 mb-4">
            <AuthStat label="SPF pass" pct={analytics.authentication.spfPassPct} />
            <AuthStat label="DKIM pass" pct={analytics.authentication.dkimPassPct} />
            <AuthStat label="DMARC pass" pct={analytics.authentication.dmarcPassPct} />
          </div>
          <div className="space-y-1.5 text-xs">
            <Row label="List-Unsubscribe header" value={`${analytics.authentication.listUnsubscribePct}%`} />
            <Row label="One-click unsubscribe (RFC 8058)" value={`${analytics.authentication.oneClickUnsubscribePct}%`} />
            <Row
              label="Emails with weak auth"
              value={
                <span className={analytics.authentication.weakAuthCount > 0 ? "text-rose-500" : "text-emerald-500"}>
                  {analytics.authentication.weakAuthCount}
                </span>
              }
            />
          </div>
        </PanelCard>

        <PanelCard title="Content patterns" subtitle="What a typical email looks like">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <MiniStat label="Avg words" value={analytics.content.avgWords.toString()} />
            <MiniStat label="Avg links" value={analytics.content.avgLinks.toString()} />
            <MiniStat label="Avg images" value={analytics.content.avgImages.toString()} />
          </div>
          <div className="text-xs mb-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">UTM-tagged emails</span>
              <span className="text-foreground font-medium">{analytics.content.pctWithUtm}%</span>
            </div>
          </div>
          {analytics.content.topLinkDomains.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Top destination domains</div>
              <div className="space-y-1">
                {analytics.content.topLinkDomains.map((d) => (
                  <div
                    key={d.value}
                    className="flex items-center justify-between text-xs"
                    data-testid={`row-link-domain-${d.value}`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <LinkIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                      <span className="text-foreground truncate">{d.value}</span>
                    </div>
                    <span className="text-muted-foreground flex-shrink-0 ml-2">{d.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </PanelCard>
      </div>
    </div>
  );
}

function PanelCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function StatTile({
  icon, label, value, subtle, testId,
}: { icon: React.ReactNode; label: string; value: string; subtle?: string; testId?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3" data-testid={testId}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {icon} {label}
      </div>
      <div className="text-lg font-bold text-foreground truncate">{value}</div>
      {subtle && <div className="text-[10px] text-muted-foreground mt-0.5">{subtle}</div>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2.5 text-center">
      <div className="text-base font-bold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function AuthStat({ label, pct }: { label: string; pct: number }) {
  const tone = pct >= 95 ? "good" : pct >= 70 ? "warn" : "bad";
  const color =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/10"
        : "text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/10";
  const Icon = tone === "good" ? ShieldCheck : ShieldAlert;
  return (
    <div className={`rounded-lg border p-2.5 text-center ${color}`} data-testid={`auth-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <Icon className="h-3.5 w-3.5 mx-auto mb-1" />
      <div className="text-base font-bold">{pct}%</div>
      <div className="text-[9px] uppercase tracking-wider opacity-80 mt-0.5">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}
