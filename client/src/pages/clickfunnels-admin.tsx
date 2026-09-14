import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip as HelpTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, CheckCircle, AlertCircle, Users, Copy, ExternalLink,
  Webhook, UserCheck, UserX, Zap, Key, Search, Clock, RotateCw, Link,
  Activity, Ban, CheckCircle2, Folder, KeyRound, LogIn, LogOut, Shield, ShieldOff, UserCog, Video, Download,
  DollarSign, TrendingUp, ShieldAlert, CircleHelp, CalendarDays,
} from "lucide-react";
import { CourseImportCard } from "@/components/cf-course-import";
import { CartesianGrid, ComposedChart, Bar, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CfStatus {
  allConfigured: boolean;
  reconciliationConfigured: boolean;
  configured: {
    apiToken: boolean;
    workspaceDomain: boolean;
    courseId: boolean;
    webhookSecret: boolean;
  };
  enrolledCount: number;
  revokedCount: number;
  neverEnrolledCount: number;
  workspaceDomain: string | null;
  courseId: string | null;
  latestReconciliation: CfReconciliationRun | null;
  latestSuccessfulReconciliation: CfReconciliationRun | null;
  health: {
    scheduledAt: string;
    lastWebhookAt: string | null;
    lastSuccessfulReconciliationAt: string | null;
    webhookIsStale: boolean;
    reconciliationIsStale: boolean;
    latestRunFailed: boolean;
    issueCount: number;
  };
}

interface CfIdentityIssue {
  id: string;
  kind: string;
  contactId: string | null;
  email: string | null;
  details: Record<string, unknown>;
  lastDetectedAt: string;
}

interface CfUser {
  id: string;
  email: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  cfEnrolled: boolean | null;
  cfEnrolledAt: string | null;
  cfRevokedAt: string | null;
  cfContactId: string | null;
  cfRevokedGraceUntil: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  isDisabled: boolean;
  isAdmin: boolean;
  role: string | null;
}

interface MemberDetails {
  user: CfUser & {
    disabledAt: string | null;
    disabledReason: string | null;
    timezone: string | null;
    themePreference: string | null;
    totalVideos: number;
    projectCount: number;
    taskCount: number;
    tasksDoneCount: number;
    dmoLast30Days: number;
    keywordsCreditsThisMonth: number;
    keywordsCreditsTotalUsed: number;
  };
  identities: Array<{ id: string; provider: string; emailFromProvider: string | null; createdAt: string }>;
  sessions: Array<{ id: string; title: string | null; createdAt: string; scoreJson: { totalScore: number } | null; videoDeletedAt: string | null }>;
  sessionCount: number;
  hasLocalPassword: boolean;
  providers: string[];
}

interface MemberAction {
  id: string;
  actionType: string;
  actionLabel: string;
  createdAt: string;
  ip: string | null;
}

interface MemberEngagement {
  totalMembers: number;
  activeMembers: number;
  returningMembers: number;
  neverLoggedIn: number;
  features: Array<{ key: string; label: string; members: number; events: number; lastUsedAt: string | null }>;
  weeklyActivity: Array<{ week: string; members: number }>;
}

interface MemberFeatureUsage {
  features: Array<{ key: string; label: string; events: number; lastUsedAt: string | null }>;
}

interface MemberHealthRecord {
  id: string; email: string | null; displayName: string | null; cfEnrolled: boolean | null; cfEnrolledAt: string | null;
  lastLoginAt: string | null; lastActivityAt: string | null; courseCompleted: number; courseStarted: number;
  dmoDays30: number; meaningfulActions30: number; segment: "not_started" | "active" | "engaged" | "at_risk"; reasons: string[];
}

interface RecurringRevenueSnapshot {
  syncedAt: string;
  currency: string;
  current: { mrr: number; trialingCount: number; trialingMrr: number; atRiskCount: number; atRiskMrr: number; activeSubscriptions: number; activeSubscribers: number };
  month: { label: string; collected: number; expected: number; expectedAtRisk: number; projected: number };
  history: Array<{ month: string; label: string; mrr: number; cashCollected: number }>;
  performance: { periodLabel: string; effectiveChurnRate: number; grossMrrChurnRate: number; netMrrRetention: number; newMrr: number; churnedMrr: number };
  offers: Array<{ name: string; activeSubscriptions: number; mrr: number; newMrr: number; churnedMrr: number; effectiveChurnRate: number | null; cancellationRate: number | null; confidence: string }>;
  periods: Record<RevenuePeriodKey, RecurringRevenuePeriod>;
  details: {
    trialing: RecurringRevenueContact[];
    atRisk: RecurringRevenueContact[];
  };
  methodology: string;
}

type RevenuePeriodKey = "thisMonth" | "lastMonth" | "last3Months" | "last12Months" | "allTime";

interface RecurringRevenuePeriod {
  label: string;
  dateLabel: string;
  performance: RecurringRevenueSnapshot["performance"];
  offers: RecurringRevenueSnapshot["offers"];
}

interface RecurringRevenueContact {
  id: string;
  name: string;
  email: string | null;
  offers: string[];
  mrr: number;
  billingStatus: string;
  relevantDate: string | null;
  contactUrl: string | null;
}

function normalizeClickFunnelsContactUrl(contactUrl: string): string {
  if (contactUrl.includes("/account/contacts/")) return contactUrl;
  return contactUrl.replace(/\/contacts\/([^/?#]+)(?=([?#]|$))/, "/account/contacts/$1");
}

interface CfReconciliationRun {
  id: string;
  status: "running" | "completed" | "failed";
  totalFetched: number;
  activeFetched: number;
  inactiveFetched: number;
  accountsCreated: number;
  accountsReactivated: number;
  accountsRevoked: number;
  unchanged: number;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

interface CfWebhookActivity {
  id: string;
  eventType: string;
  email: string | null;
  contactId: string | null;
  courseId: string | null;
  status: "processed" | "rejected" | "failed";
  action: string;
  httpStatus: number | null;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
}

interface CfWebhookActivityResponse {
  events: CfWebhookActivity[];
  total: number;
  lastReceivedAt: string | null;
  lastEnrollmentAt: string | null;
  lastRevocationAt: string | null;
  processedCount: number;
  failedCount: number;
}

const formatDateTime = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
    : "Never";

type MemberFilter = "all" | "enrolled" | "revoked" | "never" | "never_logged_in" | "logged_in";

function getMemberState(member: CfUser): Exclude<MemberFilter, "all"> {
  if (member.cfEnrolled) return "enrolled";
  if (member.cfRevokedAt) return "revoked";
  return "never";
}

function memberStateLabel(state: Exclude<MemberFilter, "all">) {
  return {
    enrolled: "Active",
    revoked: "Revoked",
    never: "Never enrolled",
  }[state];
}

function memberStateClass(state: Exclude<MemberFilter, "all">) {
  return {
    enrolled: "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300",
    revoked: "border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300",
    never: "border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300",
  }[state];
}

function MembershipOverviewTab() {
  const { toast } = useToast();
  const { data: status, isLoading, isFetching, refetch } = useQuery<CfStatus>({
    queryKey: ["/api/admin/cf/status"],
  });
  const reconcile = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/cf/reconcile");
      return response.json() as Promise<{ message: string }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cf/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cf/users?filter=all"] });
      toast({ title: "Membership reconciled", description: result.message });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/cf/status"] });
      toast({
        title: "Reconciliation could not finish",
        description: "No membership changes were applied. Check that ClickFunnels is available, then try again.",
        variant: "destructive",
      });
    },
  });
  const { data: issuesData } = useQuery<{ issues: CfIdentityIssue[] }>({
    queryKey: ["/api/admin/cf/identity-issues"],
  });

  const latest = status?.latestReconciliation;
  const latestSuccessful = status?.latestSuccessfulReconciliation;
  const metrics = [
    { label: "Active", value: status?.enrolledCount ?? 0, detail: "Current course access", color: "from-emerald-500 to-teal-400", icon: <UserCheck className="h-4 w-4 text-emerald-500" /> },
    { label: "Revoked", value: status?.revokedCount ?? 0, detail: "No current course access", color: "from-rose-500 to-red-400", icon: <UserX className="h-4 w-4 text-rose-500" /> },
    { label: "Never enrolled", value: status?.neverEnrolledCount ?? 0, detail: "Local accounts without CF history", color: "from-slate-500 to-slate-400", icon: <Users className="h-4 w-4 text-slate-500" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Academy Membership</h2>
          <p className="mt-1 text-sm text-muted-foreground">ClickFunnels is the source of truth for Academy access. Webhooks keep it current; reconciliation safely catches anything missed.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RotateCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.label} className="overflow-hidden">
            <div className={`h-1 bg-gradient-to-r ${metric.color}`} />
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2 pt-4">
              <CardTitle className="text-sm font-medium text-muted-foreground">{metric.label}</CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/60">{metric.icon}</div>
            </CardHeader>
            <CardContent>
              {isLoading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <p className="text-2xl font-bold">{metric.value}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-sky-500 to-indigo-500" />
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-sky-500" />
            Sync health
          </CardTitle>
          <CardDescription>Webhooks apply timely changes; a complete scan runs daily at {status?.health?.scheduledAt || "3:15 AM America/New_York"}.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Last webhook</p>
            <p className={`mt-1 text-sm font-semibold ${status?.health?.webhookIsStale ? "text-amber-700 dark:text-amber-300" : ""}`}>{formatDateTime(status?.health?.lastWebhookAt)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{status?.health?.webhookIsStale ? "No delivery in 48+ hours" : "Receiving deliveries"}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Last full scan</p>
            <p className={`mt-1 text-sm font-semibold ${status?.health?.reconciliationIsStale ? "text-amber-700 dark:text-amber-300" : ""}`}>{formatDateTime(status?.health?.lastSuccessfulReconciliationAt)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{status?.health?.reconciliationIsStale ? "Needs a successful scan" : "Fresh within 30 hours"}</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">API health</p>
            <p className={`mt-1 text-sm font-semibold ${status?.health?.latestRunFailed ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>{status?.health?.latestRunFailed ? "Latest scan failed" : "No current scan failure"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Failed scans leave access unchanged</p>
          </div>
          <div className="rounded-md bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">Identity review</p>
            <p className={`mt-1 text-sm font-semibold ${status?.health?.issueCount ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"}`}>{status?.health?.issueCount || 0} open issue{status?.health?.issueCount === 1 ? "" : "s"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Ambiguous records are never auto-merged</p>
          </div>
        </CardContent>
      </Card>

      {(issuesData?.issues?.length ?? 0) > 0 && (
        <Card className="border-amber-300 dark:border-amber-900">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><AlertCircle className="h-4 w-4 text-amber-600" />Identity issues to review</CardTitle>
            <CardDescription>These records were intentionally skipped to prevent a ClickFunnels email or contact ID from being linked to the wrong local account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {issuesData?.issues.map((issue) => (
              <div key={issue.id} className="rounded-md border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm dark:border-amber-950 dark:bg-amber-950/20">
                <p className="font-medium">{issue.kind.replace(/_/g, " ")}</p>
                <p className="mt-0.5 text-muted-foreground">{issue.email || "No email"}{issue.contactId ? ` · Contact ${issue.contactId}` : ""} · Detected {formatDateTime(issue.lastDetectedAt)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-400" />
        <CardHeader className="pt-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <RotateCw className="h-4 w-4 text-indigo-500" />
                Full Membership Reconciliation
              </CardTitle>
              <CardDescription className="mt-1">
                Scans the entire configured ClickFunnels course before changing any account. If the scan fails, no member access is changed.
              </CardDescription>
            </div>
            <Button
              onClick={() => reconcile.mutate()}
              disabled={reconcile.isPending || !status?.reconciliationConfigured}
              data-testid="button-reconcile-cf-membership"
            >
              {reconcile.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
              {reconcile.isPending ? "Reconciling…" : "Reconcile now"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!status?.reconciliationConfigured ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              Add the ClickFunnels API token, workspace domain, and course ID before running reconciliation.
            </p>
          ) : latest ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={latest.status === "completed" ? "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-300" : latest.status === "failed" ? "border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300" : "border-amber-300 text-amber-700"}>
                  {latest.status === "completed" ? "Last run completed" : latest.status === "failed" ? "Last run failed" : "Reconciliation in progress"}
                </Badge>
                <span className="text-sm text-muted-foreground">{latest.completedAt ? `Finished ${formatDateTime(latest.completedAt)}` : `Started ${formatDateTime(latest.startedAt)}`}</span>
              </div>
              {latest.status === "completed" ? (
                <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-md bg-muted/50 px-3 py-2"><span className="text-muted-foreground">Scanned</span><p className="font-semibold">{latest.totalFetched} ClickFunnels records</p></div>
                  <div className="rounded-md bg-muted/50 px-3 py-2"><span className="text-muted-foreground">Created</span><p className="font-semibold">{latest.accountsCreated} local accounts</p></div>
                  <div className="rounded-md bg-muted/50 px-3 py-2"><span className="text-muted-foreground">Restored</span><p className="font-semibold">{latest.accountsReactivated} members</p></div>
                  <div className="rounded-md bg-muted/50 px-3 py-2"><span className="text-muted-foreground">Revoked</span><p className="font-semibold">{latest.accountsRevoked} members</p></div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-950 dark:bg-rose-950/30 dark:text-rose-200">
                    {latest.error || "The last scan did not complete. No membership changes were applied."}
                  </p>
                  {latestSuccessful && (
                    <p className="text-sm text-muted-foreground">Last successful reconciliation: {formatDateTime(latestSuccessful.completedAt || latestSuccessful.startedAt)}.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No full reconciliation has been run yet. Webhooks can still be syncing memberships in real time.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function getMemberName(member: Pick<CfUser, "displayName" | "firstName" | "lastName" | "email">) {
  return member.displayName || [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email || "Unnamed account";
}

function ToolkitLoginStatus({ member }: { member: Pick<CfUser, "lastLoginAt" | "isDisabled"> }) {
  if (member.isDisabled) {
    return <Badge variant="outline" className="border-rose-300 text-rose-700 dark:border-rose-800 dark:text-rose-300">Disabled</Badge>;
  }
  if (!member.lastLoginAt) {
    return <Badge variant="outline" className="border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300">Never logged in</Badge>;
  }
  return <Badge variant="outline" className="border-sky-300 text-sky-700 dark:border-sky-800 dark:text-sky-300">Logged in</Badge>;
}

function MemberEngagementSummary() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery<MemberEngagement>({
    queryKey: [`/api/admin/cf/engagement?days=${days}`],
  });
  const highestAdoption = Math.max(...(data?.features.map((feature) => feature.members) ?? [1]), 1);
  const topFeature = data?.features[0];
  const weeklyPeak = Math.max(...(data?.weeklyActivity.map((week) => week.members) ?? [1]), 1);

  return (
    <Card className="overflow-hidden border-indigo-200/70 dark:border-indigo-950">
      <div className="h-1.5 bg-gradient-to-r from-indigo-600 via-violet-500 to-cyan-400" />
      <CardHeader className="gap-3 pb-3 pt-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4 text-indigo-500" />Member engagement</CardTitle>
            <CardDescription className="mt-1">Recorded Toolkit activity, measured by unique members—not raw clicks.</CardDescription>
          </div>
          <div className="flex rounded-lg border bg-muted/40 p-1">
            {([7, 30, 90, 3650] as const).map((value) => (
              <button key={value} type="button" onClick={() => setDays(value)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${days === value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {value === 3650 ? "All time" : `${value}d`}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Active members", data?.activeMembers ?? 0, `Used the Toolkit in the last ${days === 3650 ? "all recorded time" : `${days} days`}`, "text-indigo-600 dark:text-indigo-300"],
            ["Returning members", data?.returningMembers ?? 0, "Active on two or more days", "text-violet-600 dark:text-violet-300"],
            ["Never logged in", data?.neverLoggedIn ?? 0, "Members who have not started", "text-amber-700 dark:text-amber-300"],
            ["Most adopted", topFeature?.label || "No usage yet", topFeature ? `${topFeature.members} member${topFeature.members === 1 ? "" : "s"} used it` : "Awaiting activity", "text-cyan-700 dark:text-cyan-300"],
          ].map(([label, value, detail, tone]) => (
            <div key={String(label)} className="rounded-xl border bg-card p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
              {isLoading ? <Loader2 className="mt-2 h-5 w-5 animate-spin text-muted-foreground" /> : <p className={`mt-1 truncate text-2xl font-bold ${tone}`}>{value}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>

        {!isLoading && (
          <div className="grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
            <div>
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Feature adoption</h3><span className="text-xs text-muted-foreground">Unique members</span></div>
              {data?.features.length ? <div className="mt-3 space-y-3">{data.features.slice(0, 6).map((feature) => (
                <div key={feature.key}>
                  <div className="mb-1 flex items-center justify-between gap-3 text-sm"><span className="truncate">{feature.label}</span><span className="shrink-0 text-xs font-medium text-muted-foreground">{feature.members} member{feature.members === 1 ? "" : "s"}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-cyan-400" style={{ width: `${Math.max((feature.members / highestAdoption) * 100, 5)}%` }} /></div>
                </div>
              ))}</div> : <p className="mt-3 text-sm text-muted-foreground">No recorded feature usage in this period yet.</p>}
            </div>
            <div className="rounded-xl border bg-muted/20 p-3">
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Weekly activity</h3><span className="text-xs text-muted-foreground">Active members</span></div>
              {data?.weeklyActivity.length ? <div className="mt-5 flex h-24 items-end gap-2">{data.weeklyActivity.slice(-8).map((week) => <div key={week.week} className="flex min-w-0 flex-1 flex-col items-center gap-1"><div className="w-full rounded-t bg-gradient-to-t from-violet-600 to-indigo-400" style={{ height: `${Math.max((week.members / weeklyPeak) * 76, 8)}px` }} title={`${week.members} active members`} /><span className="truncate text-[10px] text-muted-foreground">{week.week.replace(" ", "\n")}</span></div>)}</div> : <p className="mt-5 text-sm text-muted-foreground">Activity will appear here as members use the Toolkit.</p>}
            </div>
          </div>
        )}
        <p className="border-t pt-3 text-xs text-muted-foreground">Usage shows recorded Toolkit activity. It is separate from ClickFunnels access and does not include private member content.</p>
      </CardContent>
    </Card>
  );
}

function MemberDetailsSheet({
  memberId,
  onOpenChange,
  onAccountChanged,
}: {
  memberId: string | null;
  onOpenChange: (open: boolean) => void;
  onAccountChanged: () => void;
}) {
  const { toast } = useToast();
  const [pendingAction, setPendingAction] = useState<{ title: string; description: string; run: () => Promise<void> } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const { data: details, isLoading } = useQuery<MemberDetails>({
    queryKey: ["/api/admin/users", memberId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/users/${memberId}`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load Toolkit account details");
      return response.json();
    },
    enabled: !!memberId,
  });
  const { data: actionData, isLoading: activityLoading } = useQuery<{ items: MemberAction[] }>({
    queryKey: ["/api/admin/users", memberId, "actions"],
    queryFn: async () => {
      const response = await fetch(`/api/admin/users/${memberId}/actions?limit=20`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load account activity");
      return response.json();
    },
    enabled: !!memberId,
  });
  const { data: featureUsage, isLoading: featureUsageLoading } = useQuery<MemberFeatureUsage>({
    queryKey: ["/api/admin/users", memberId, "feature-usage"],
    queryFn: async () => {
      const response = await fetch(`/api/admin/users/${memberId}/feature-usage?days=90`, { credentials: "include" });
      if (!response.ok) throw new Error("Could not load feature usage");
      return response.json();
    },
    enabled: !!memberId,
  });

  const runAction = async (key: string, request: () => Promise<Response>, success: string, redirect = false) => {
    try {
      setActionLoading(key);
      const response = await request();
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "The account update could not be completed.");
      if (redirect) {
        window.location.href = "/dashboard";
        return;
      }
      toast({ title: success });
      onAccountChanged();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", memberId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", memberId, "actions"] });
    } catch (error) {
      toast({
        title: "Action could not be completed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const account = details?.user;
  const membershipState = account ? getMemberState(account) : "never";

  return (
    <>
      <Sheet open={!!memberId} onOpenChange={onOpenChange}>
         <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Member account</SheetTitle>
            <SheetDescription>ClickFunnels determines Academy access. Toolkit data below describes the local account only.</SheetDescription>
          </SheetHeader>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
          ) : !account ? (
            <p className="py-12 text-center text-sm text-muted-foreground">This Toolkit account is no longer available.</p>
          ) : (
            <div className="mt-6 space-y-5">
              <div className="rounded-xl border bg-gradient-to-br from-muted/50 to-muted/10 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
                    {getMemberName(account).split(/\s+|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-lg font-semibold">{getMemberName(account)}</h3>
                      {account.isAdmin && <Badge className="bg-amber-500/15 text-amber-800 hover:bg-amber-500/15 dark:text-amber-300"><Shield className="mr-1 h-3 w-3" />Admin</Badge>}
                      <ToolkitLoginStatus member={account} />
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">{account.email || "No email address"}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Toolkit account created {formatDateTime(account.createdAt)}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-950 dark:bg-emerald-950/20">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">ClickFunnels access</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge variant="outline" className={memberStateClass(membershipState)}>{memberStateLabel(membershipState)}</Badge>
                    <span className="text-xs text-muted-foreground">{membershipState === "enrolled" ? `Since ${formatDateTime(account.cfEnrolledAt)}` : account.cfRevokedAt ? `Revoked ${formatDateTime(account.cfRevokedAt)}` : "No enrollment recorded"}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">This status controls Academy access, not Toolkit login history.</p>
                </div>
                <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3 dark:border-sky-950 dark:bg-sky-950/20">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Toolkit account</p>
                  <p className="mt-2 text-sm font-semibold">{account.isDisabled ? "Disabled by administrator" : account.lastLoginAt ? "Has logged in" : "Never logged in"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{account.lastLoginAt ? `Last login ${formatDateTime(account.lastLoginAt)}` : "No Toolkit sign-in recorded yet"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Videos", details.sessionCount, Video],
                  ["Projects", account.projectCount ?? 0, Folder],
                  ["DMO days", `${account.dmoLast30Days ?? 0}/30`, Activity],
                  ["KW credits", account.keywordsCreditsThisMonth ?? 0, KeyRound],
                ].map(([label, value, Icon]) => {
                  const StatIcon = Icon as typeof Activity;
                  return <div key={String(label)} className="rounded-lg border bg-card p-3"><div className="flex items-center gap-1 text-xs text-muted-foreground"><StatIcon className="h-3.5 w-3.5" />{label}</div><p className="mt-1 text-lg font-semibold">{value as string | number}</p></div>;
                })}
              </div>

              <div className="rounded-lg border border-indigo-200/70 bg-indigo-50/30 p-4 dark:border-indigo-950 dark:bg-indigo-950/10">
                <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Activity className="h-4 w-4 text-indigo-500" /><h3 className="text-sm font-semibold">Feature usage</h3></div><span className="text-xs text-muted-foreground">Last 90 days</span></div>
                {featureUsageLoading ? <Loader2 className="mt-3 h-4 w-4 animate-spin text-muted-foreground" /> : !featureUsage?.features.length ? <p className="mt-3 text-sm text-muted-foreground">No feature activity has been recorded in this period.</p> : <div className="mt-3 space-y-2">{featureUsage.features.slice(0, 6).map((feature) => <div key={feature.key} className="flex items-center justify-between gap-3 rounded-md border bg-background/80 px-3 py-2 text-sm"><div className="min-w-0"><p className="truncate font-medium">{feature.label}</p><p className="text-xs text-muted-foreground">Last used {formatDateTime(feature.lastUsedAt)}</p></div><Badge variant="outline" className="shrink-0">{feature.events} event{feature.events === 1 ? "" : "s"}</Badge></div>)}</div>}
              </div>

              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2"><UserCog className="h-4 w-4 text-violet-500" /><h3 className="text-sm font-semibold">Identity & sign-in</h3></div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Role</span><span className="capitalize">{account.role || (account.isAdmin ? "admin" : "user")}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">ClickFunnels contact</span><span className="max-w-[55%] truncate font-mono text-xs">{account.cfContactId || "Not linked"}</span></div>
                  {account.timezone && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Time zone</span><span className="text-right text-xs">{account.timezone}</span></div>}
                  {account.disabledReason && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Disabled reason</span><span className="text-right">{account.disabledReason}</span></div>}
                </div>
                <div className="mt-3 space-y-2 border-t pt-3">
                  {details.hasLocalPassword && <div className="flex items-center justify-between rounded-md border p-2 text-sm"><span className="flex items-center gap-2"><Key className="h-3.5 w-3.5" />Email & password</span><Badge variant="outline">Local</Badge></div>}
                  {details.identities.map((identity) => <div key={identity.id} className="flex items-center justify-between rounded-md border p-2 text-sm"><span className="capitalize">{identity.provider}</span><span className="text-xs text-muted-foreground">{identity.emailFromProvider || formatDateTime(identity.createdAt)}</span></div>)}
                  {!details.hasLocalPassword && details.identities.length === 0 && <p className="text-xs text-muted-foreground">No Toolkit sign-in method is on file.</p>}
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between"><div className="flex items-center gap-2"><Video className="h-4 w-4 text-emerald-500" /><h3 className="text-sm font-semibold">Recent video sessions</h3></div><Badge variant="outline">{details.sessionCount} total</Badge></div>
                {details.sessions.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No video sessions yet.</p> : <div className="mt-3 space-y-2">{details.sessions.slice(0, 5).map((session) => <div key={session.id} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm"><div className="min-w-0"><p className="truncate">{session.title || "Untitled"}</p><p className="text-xs text-muted-foreground">{formatDateTime(session.createdAt)}</p></div><span className="shrink-0 text-xs text-muted-foreground">{session.scoreJson?.totalScore != null ? `${session.scoreJson.totalScore}/100` : "Not scored"}</span></div>)}</div>}
              </div>

              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2"><Activity className="h-4 w-4 text-indigo-500" /><h3 className="text-sm font-semibold">Recent account activity</h3>{activityLoading && <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" />}</div>
                {!activityLoading && !(actionData?.items.length) ? <p className="mt-3 text-sm text-muted-foreground">No account activity has been recorded yet.</p> : <div className="mt-3 space-y-2">{actionData?.items.slice(0, 10).map((item) => <div key={item.id} className="flex items-start justify-between gap-3 text-sm"><div><p>{item.actionLabel || item.actionType.replace(/_/g, " ")}</p>{item.ip && <p className="font-mono text-xs text-muted-foreground">{item.ip}</p>}</div><p className="shrink-0 text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p></div>)}</div>}
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold">Toolkit account actions</h3>
                <p className="mt-1 text-xs text-muted-foreground">These affect the local Toolkit account only. ClickFunnels membership remains the access authority.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={!!actionLoading} onClick={() => setPendingAction({
                    title: account.isAdmin ? "Demote to user" : "Promote to admin",
                    description: account.isAdmin ? "Remove admin privileges from this Toolkit account?" : "Grant this Toolkit account admin privileges?",
                    run: () => runAction("role", () => fetch(`/api/admin/users/${account.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: account.isAdmin ? "user" : "admin" }) }), "Role updated"),
                  })}>{account.isAdmin ? <ShieldOff className="mr-1.5 h-3.5 w-3.5" /> : <Shield className="mr-1.5 h-3.5 w-3.5" />}{account.isAdmin ? "Demote" : "Promote"}</Button>
                  <Button size="sm" variant="outline" disabled={!!actionLoading} onClick={() => setPendingAction({
                    title: account.isDisabled ? "Enable Toolkit account" : "Disable Toolkit account",
                    description: account.isDisabled ? "Allow this Toolkit account to sign in again?" : "Prevent this Toolkit account from signing in? ClickFunnels access will not change.",
                    run: () => runAction("disabled", () => fetch(`/api/admin/users/${account.id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isDisabled: !account.isDisabled, disabledReason: account.isDisabled ? null : "Disabled by administrator" }) }), account.isDisabled ? "Toolkit account enabled" : "Toolkit account disabled"),
                  })}>{account.isDisabled ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : <Ban className="mr-1.5 h-3.5 w-3.5" />}{account.isDisabled ? "Enable" : "Disable"}</Button>
                  <Button size="sm" variant="outline" disabled={!!actionLoading} onClick={() => setPendingAction({
                    title: "Force logout",
                    description: "End all active Toolkit sessions for this account? The member will need to sign in again.",
                    run: () => runAction("logout", () => fetch(`/api/admin/users/${account.id}/force-logout`, { method: "POST", credentials: "include" }), "All Toolkit sessions were ended"),
                  })}><LogOut className="mr-1.5 h-3.5 w-3.5" />Force logout</Button>
                  <Button size="sm" variant="outline" className="border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300" disabled={!!actionLoading} onClick={() => setPendingAction({
                    title: "Log in as this member",
                    description: "You will switch into this Toolkit account. You can return to your admin account from the banner.",
                    run: () => runAction("impersonate", () => fetch(`/api/admin/impersonate/${account.id}`, { method: "POST", credentials: "include" }), "Switching account", true),
                  })}><LogIn className="mr-1.5 h-3.5 w-3.5" />Log in as</Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>{pendingAction?.title}</AlertDialogTitle><AlertDialogDescription>{pendingAction?.description}</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!actionLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!!actionLoading} onClick={(event) => { event.preventDefault(); pendingAction?.run().finally(() => setPendingAction(null)); }}>{actionLoading ? "Working…" : "Continue"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function MembersTab() {
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const { data, isLoading } = useQuery<{ users: CfUser[] }>({
    queryKey: ["/api/admin/cf/users?filter=all"],
  });
  const members = (data?.users ?? []).filter((member) => {
    const state = getMemberState(member);
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [member.displayName, member.firstName, member.lastName, member.email].some((value) => value?.toLowerCase().includes(needle));
    const matchesFilter = filter === "all"
      ? true
      : filter === "never_logged_in"
        ? !member.lastLoginAt
        : filter === "logged_in"
          ? !!member.lastLoginAt
          : state === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">ClickFunnels Members</h2>
        <p className="mt-1 text-sm text-muted-foreground">Your complete membership directory. ClickFunnels controls Academy access; Toolkit status explains local account and sign-in activity.</p>
      </div>
      <MemberEngagementSummary />
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">Member directory</CardTitle>
              <CardDescription>{members.length} matching local member{members.length === 1 ? "" : "s"}</CardDescription>
            </div>
            <div className="relative w-full lg:w-72">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" className="w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm" data-testid="input-cf-member-search" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "All"],
              ["enrolled", "Active"],
              ["revoked", "Revoked"],
              ["never", "Never enrolled"],
              ["never_logged_in", "Never logged in"],
              ["logged_in", "Has logged in"],
            ] as Array<[MemberFilter, string]>).map(([value, label]) => (
              <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)} data-testid={`button-cf-member-filter-${value}`}>
                {label}
              </Button>
            ))}
          </div>
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : members.length ? (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr><th className="px-4 py-3 font-medium">Member</th><th className="px-4 py-3 font-medium">ClickFunnels access</th><th className="px-4 py-3 font-medium">Toolkit account</th><th className="px-4 py-3 font-medium">Membership activity</th></tr>
                </thead>
                <tbody className="divide-y">
                  {members.map((member) => {
                    const state = getMemberState(member);
                    return (
                      <tr key={member.id} className="cursor-pointer transition-colors hover:bg-muted/50" onClick={() => setSelectedMemberId(member.id)} data-testid={`row-cf-member-${member.id}`}>
                        <td className="px-4 py-3"><button type="button" className="text-left" onClick={() => setSelectedMemberId(member.id)}><p className="font-medium hover:underline">{getMemberName(member)}</p><p className="mt-0.5 text-xs text-muted-foreground">{member.email || "No email address"}</p></button></td>
                        <td className="px-4 py-3"><Badge variant="outline" className={memberStateClass(state)}>{memberStateLabel(state)}</Badge></td>
                        <td className="px-4 py-3"><ToolkitLoginStatus member={member} /><p className="mt-1 text-xs text-muted-foreground">{member.lastLoginAt ? `Last login ${formatDateTime(member.lastLoginAt)}` : member.isDisabled ? "Local sign-in blocked" : "No local sign-in yet"}{member.isAdmin ? " · Admin" : ""}</p></td>
                        <td className="px-4 py-3 text-muted-foreground">{state === "enrolled" ? `Active since ${formatDateTime(member.cfEnrolledAt)}` : member.cfRevokedAt ? `Revoked ${formatDateTime(member.cfRevokedAt)}` : "No ClickFunnels enrollment recorded"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">No members match this search and access state.</div>
          )}
        </CardContent>
      </Card>
      <MemberDetailsSheet
        memberId={selectedMemberId}
        onOpenChange={(open) => !open && setSelectedMemberId(null)}
        onAccountChanged={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/cf/users?filter=all"] })}
      />
    </div>
  );
}

function MemberHealthTab() {
  const [filter, setFilter] = useState<"all" | MemberHealthRecord["segment"]>("all");
  const [accessFilter, setAccessFilter] = useState<"all" | "active" | "revoked">("all");
  const [enrollmentMonth, setEnrollmentMonth] = useState("all");
  const [activityRange, setActivityRange] = useState<"all" | "7" | "30" | "90" | "inactive">("all");
  const [progressFilter, setProgressFilter] = useState<"all" | "none" | "started" | "completed">("all");
  const { data, isLoading } = useQuery<{ members: MemberHealthRecord[]; segments: Record<string, number> }>({
    queryKey: ["/api/admin/cf/member-health"],
  });
  const enrollmentMonths = Array.from(new Set((data?.members || []).map((member) => member.cfEnrolledAt?.slice(0, 7)).filter(Boolean))).sort().reverse() as string[];
  const members = (data?.members || []).filter((member) => {
    if (filter !== "all" && member.segment !== filter) return false;
    if (accessFilter === "active" && !member.cfEnrolled) return false;
    if (accessFilter === "revoked" && member.cfEnrolled) return false;
    if (enrollmentMonth !== "all" && member.cfEnrolledAt?.slice(0, 7) !== enrollmentMonth) return false;
    if (progressFilter === "none" && member.courseStarted > 0) return false;
    if (progressFilter === "started" && !(member.courseStarted > 0 && member.courseCompleted < member.courseStarted)) return false;
    if (progressFilter === "completed" && !(member.courseStarted > 0 && member.courseCompleted === member.courseStarted)) return false;
    if (activityRange !== "all") {
      if (activityRange === "inactive") return !member.lastActivityAt || new Date(member.lastActivityAt) >= new Date(Date.now() - 90 * 86400000);
      return !!member.lastActivityAt && new Date(member.lastActivityAt) >= new Date(Date.now() - Number(activityRange) * 86400000);
    }
    return true;
  });
  const labels = { not_started: "Not started", active: "Active", engaged: "Engaged", at_risk: "At risk" };
  const tones = {
    not_started: "border-amber-300 text-amber-800 dark:border-amber-800 dark:text-amber-300",
    active: "border-sky-300 text-sky-800 dark:border-sky-800 dark:text-sky-300",
    engaged: "border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-300",
    at_risk: "border-rose-300 text-rose-800 dark:border-rose-800 dark:text-rose-300",
  };
  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="text-xl font-semibold">Member Health</h2><p className="mt-1 text-sm text-muted-foreground">Explainable engagement segments combine enrollment, login, training, DMO, and meaningful Toolkit activity.</p></div>
      <a href="/api/admin/cf/member-health/export" className="inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-accent"><Download className="mr-2 h-4 w-4" />Export CSV</a>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {(["engaged", "active", "at_risk", "not_started"] as const).map((segment) => <button type="button" key={segment} onClick={() => setFilter(filter === segment ? "all" : segment)} className={`rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40 ${filter === segment ? "ring-2 ring-primary/40" : ""}`}><p className="text-sm font-medium">{labels[segment]}</p><p className="mt-1 text-2xl font-bold">{data?.segments?.[segment] || 0}</p><p className="mt-1 text-xs text-muted-foreground">{segment === "engaged" ? "Recent activity across two or more signals" : segment === "at_risk" ? "Previously active, but no recent activity" : segment === "not_started" ? "Has access but no Toolkit sign-in" : "Recently active Toolkit members"}</p></button>)}
    </div>
    <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-medium text-muted-foreground">Access<select value={accessFilter} onChange={(event) => setAccessFilter(event.target.value as typeof accessFilter)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"><option value="all">All access states</option><option value="active">Active access</option><option value="revoked">Revoked / inactive</option></select></label>
      <label className="text-xs font-medium text-muted-foreground">Enrollment month<select value={enrollmentMonth} onChange={(event) => setEnrollmentMonth(event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"><option value="all">All enrollment months</option>{enrollmentMonths.map((month) => <option key={month} value={month}>{month}</option>)}</select></label>
      <label className="text-xs font-medium text-muted-foreground">Activity range<select value={activityRange} onChange={(event) => setActivityRange(event.target.value as typeof activityRange)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"><option value="all">Any activity date</option><option value="7">Active in 7 days</option><option value="30">Active in 30 days</option><option value="90">Active in 90 days</option><option value="inactive">Inactive 90+ days</option></select></label>
      <label className="text-xs font-medium text-muted-foreground">Course progress<select value={progressFilter} onChange={(event) => setProgressFilter(event.target.value as typeof progressFilter)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"><option value="all">Any course progress</option><option value="none">No lessons started</option><option value="started">In progress</option><option value="completed">All recorded lessons complete</option></select></label>
    </div>
    <Card><CardHeader className="pb-3"><CardTitle className="text-base">{filter === "all" ? "All members" : labels[filter]}</CardTitle><CardDescription>{members.length} member{members.length === 1 ? "" : "s"} · click a row in Members for full account detail</CardDescription></CardHeader><CardContent>{isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div> : <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[960px] text-sm"><thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground"><tr><th className="px-3 py-3">Member</th><th className="px-3 py-3">Segment</th><th className="px-3 py-3">Training</th><th className="px-3 py-3">DMO</th><th className="px-3 py-3">Toolkit use</th><th className="px-3 py-3">Why</th></tr></thead><tbody className="divide-y">{members.map((member) => <tr key={member.id}><td className="px-3 py-3"><p className="font-medium">{member.displayName || member.email || "Unnamed account"}</p><p className="text-xs text-muted-foreground">{member.lastLoginAt ? `Logged in ${formatDateTime(member.lastLoginAt)}` : "No Toolkit login"}</p></td><td className="px-3 py-3"><Badge variant="outline" className={tones[member.segment]}>{labels[member.segment]}</Badge></td><td className="px-3 py-3">{member.courseCompleted}/{member.courseStarted} lessons</td><td className="px-3 py-3">{member.dmoDays30} days / 30</td><td className="px-3 py-3">{member.meaningfulActions30} actions / 30d</td><td className="max-w-sm px-3 py-3 text-xs text-muted-foreground">{member.reasons.slice(0, 2).join(" · ")}</td></tr>)}</tbody></table></div>}</CardContent></Card>
  </div>;
}

export function RecurringRevenueTab() {
  const [detailPanel, setDetailPanel] = useState<"trialing" | "atRisk" | null>(null);
  const [revenuePeriod, setRevenuePeriod] = useState<RevenuePeriodKey>("thisMonth");
  const query = useQuery<RecurringRevenueSnapshot>({
    queryKey: ["/api/admin/cf/recurring-revenue", "contact-details"],
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchIntervalInBackground: true,
    retry: 2,
    queryFn: async () => {
      const response = await apiRequest("POST", "/api/admin/cf/recurring-revenue");
      if (!response.ok) throw new Error("Recurring revenue sync could not be completed");
      return response.json() as Promise<RecurringRevenueSnapshot>;
    },
  });
  const snapshot = query.data;
  const selectedPeriod = snapshot?.periods?.[revenuePeriod];
  const money = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: snapshot?.currency || "USD", maximumFractionDigits: 0 }).format(value);
  const chartMoney = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: snapshot?.currency || "USD", currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  const pct = (value: number | null) => value == null ? "—" : `${value.toFixed(1)}%`;
  const infoIcon = (text: string) => (
    <HelpTooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} aria-label={text} className="inline-flex cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <CircleHelp aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-sm font-normal normal-case leading-relaxed tracking-normal">
        {text}
      </TooltipContent>
    </HelpTooltip>
  );
  const recurringHelp: Record<string, string> = {
    MRR: "The monthly value of all paying subscriptions right now. Free trials are not included.",
    Trialing: "People using a free trial right now. The smaller amount shows what those trials may be worth each month.",
    "At risk": "People whose payment is late. The smaller amount shows the monthly money that may be lost.",
    "Active subscriptions": "The number of subscription plans that are active now. One person can have more than one plan.",
  };
  const revenueChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const point = payload[0]?.payload;
    if (!point) return null;
    return <div className="min-w-[230px] rounded-lg border border-slate-300 bg-card px-3 py-2.5 text-sm text-card-foreground shadow-xl dark:border-slate-700">
      <p className="mb-2 font-semibold">{label}</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-5"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-primary" />MRR (run-rate)</span><span className="font-semibold tabular-nums">{chartMoney(Number(point.mrr) || 0)}</span></div>
        <div className="flex items-center justify-between gap-5"><span className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-teal-500/70" />Cash collected</span><span className="font-semibold tabular-nums">{chartMoney(Number(point.cashCollected) || 0)}</span></div>
      </div>
    </div>;
  };
  const metric = (label: string, value: string, detail: string, tone: string, icon: ReactNode, onClick?: () => void) => {
    const content = <>
      <div className="flex items-center justify-between"><p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}{infoIcon(recurringHelp[label])}</p><span className={`rounded-md p-1.5 ${tone}`}>{icon}</span></div>
      {query.isLoading ? <div className="mt-3 h-8 w-28 animate-pulse rounded bg-muted" /> : <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>}
      <div className="mt-1 flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{detail}</p>{onClick && <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">View people</span>}</div>
    </>;
    const className = `group w-full rounded-xl border border-slate-200/80 bg-card p-4 text-left shadow-sm transition-all dark:border-slate-800 ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" : ""}`;
    return onClick
      ? <button type="button" className={className} onClick={onClick}>{content}</button>
      : <div className={className}>{content}</div>;
  };
  const panelContacts = detailPanel && snapshot ? snapshot.details[detailPanel] : [];
  const panelIsTrialing = detailPanel === "trialing";
  const sortedPanelContacts = panelIsTrialing
    ? panelContacts
    : [...panelContacts].sort((a, b) => {
        const aTime = a.relevantDate ? new Date(a.relevantDate).getTime() : 0;
        const bTime = b.relevantDate ? new Date(b.relevantDate).getTime() : 0;
        return bTime - aTime || a.name.localeCompare(b.name);
      });
  return <div className="space-y-6">
    <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Revenue operations</div><h2 className="text-2xl font-bold tracking-tight">Recurring Revenue</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Offer-level MRR, subscriptions, and churn calculated from subscription orders and invoices.</p></div>
      <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">{query.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-2 w-2 rounded-full bg-emerald-500" />}Updates automatically every 15 minutes</div>
    </div>
    {query.isError && !snapshot && <div className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Revenue sync is temporarily unavailable</p><p className="mt-1">The dashboard will retry automatically. No action is needed.</p></div></div>}
    {!snapshot ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[1,2,3,4].map((item) => <div key={item} className="h-32 animate-pulse rounded-xl bg-muted" />)}</div> : <>
      <section><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Current run-rate</h3><span className="text-xs text-muted-foreground">As of {formatDateTime(snapshot.syncedAt)}</span></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metric("MRR", money(snapshot.current.mrr), "Paying · excludes trials", "bg-primary/10 text-primary", <DollarSign className="h-4 w-4" />)}
        {metric("Trialing", String(snapshot.current.trialingCount), `${money(snapshot.current.trialingMrr)} potential`, "bg-amber-500/10 text-amber-700 dark:text-amber-300", <Clock className="h-4 w-4" />, () => setDetailPanel("trialing"))}
        {metric("At risk", String(snapshot.current.atRiskCount), `${money(snapshot.current.atRiskMrr)} past due`, "bg-rose-500/10 text-rose-700 dark:text-rose-300", <ShieldAlert className="h-4 w-4" />, () => setDetailPanel("atRisk"))}
        {metric("Active subscriptions", String(snapshot.current.activeSubscriptions), `${snapshot.current.activeSubscribers} subscribers`, "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", <CheckCircle2 className="h-4 w-4" />)}
      </div></section>
      <section><div className="mb-3 flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /><h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">This month · {snapshot.month.label}</h3></div><div className="grid gap-3 md:grid-cols-3">
        {[
          [ "Collected so far", money(snapshot.month.collected), "Actual paid invoices", "Subscription money that has been paid this month so far." ],
          [ "Expected rest of month", money(snapshot.month.expected), `Incl. ${money(snapshot.month.expectedAtRisk)} at-risk`, "Subscription money that should still be paid before this month ends. Late payments are included." ],
          [ "Projected month total", money(snapshot.month.projected), "Collected + expected", "The best estimate of this month's full subscription total. It adds money already paid and money still expected." ],
        ].map(([label, value, detail, help]) => <div key={label} className="rounded-xl border bg-muted/20 p-4"><p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">{label}{infoIcon(help)}</p><p className="mt-2 text-xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>)}
      </div></section>
      <Card className="overflow-hidden"><CardHeader className="border-b pb-4"><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-4 w-4 text-primary" />MRR & cash collected</CardTitle><CardDescription>Last 12 months of estimated recurring run-rate and paid invoices.</CardDescription></CardHeader><CardContent className="h-80 pt-6"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={snapshot.history} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-muted" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={(value) => `${snapshot.currency} ${Number(value) / 1000}k`} /><Tooltip content={revenueChartTooltip} cursor={{ stroke: "hsl(var(--primary) / .35)", strokeWidth: 1 }} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="cashCollected" name="Cash collected" fill="hsl(var(--primary) / .25)" radius={[4,4,0,0]} /><Line type="monotone" dataKey="mrr" name="MRR run-rate" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3, fill: "hsl(var(--primary))" }} activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--card))" }} /></ComposedChart></ResponsiveContainer></CardContent></Card>
      {selectedPeriod && <section><div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Performance overview</h3><div className="flex items-center gap-3"><select aria-label="Revenue reporting period" value={revenuePeriod} onChange={(event) => setRevenuePeriod(event.target.value as RevenuePeriodKey)} className="h-9 rounded-lg border border-slate-300 bg-card px-3 pr-8 text-sm font-medium text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700"><option value="thisMonth">This month</option><option value="lastMonth">Last month</option><option value="last3Months">Last 3 months</option><option value="last12Months">Last 12 months</option><option value="allTime">All time</option></select><span className="text-xs text-muted-foreground">{selectedPeriod.dateLabel}</span></div></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
        [ "Effective churn", pct(selectedPeriod.performance.effectiveChurnRate), "The percent of starting subscriptions that ended during this time." ],
        [ "Gross MRR churn", pct(selectedPeriod.performance.grossMrrChurnRate), "The percent of starting monthly subscription money that was lost during this time." ],
        [ "Net MRR retention", pct(selectedPeriod.performance.netMrrRetention), "How much starting monthly subscription money stayed, including upgrades and downgrades. Over 100% means it grew." ],
        [ "New MRR", money(selectedPeriod.performance.newMrr), "New monthly subscription money that started during this time." ],
        [ "Churned MRR", money(selectedPeriod.performance.churnedMrr), "Monthly subscription money lost when subscriptions ended during this time." ],
      ].map(([label, value, help]) => <div key={label} className="rounded-xl border bg-card p-4"><p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}{infoIcon(help)}</p><p className="mt-2 text-xl font-bold">{value}</p></div>)}</div></section>}
      {selectedPeriod && <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Offers · {selectedPeriod.dateLabel}</CardTitle>
          <CardDescription>Subscription mix and retention signals by offer.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b bg-muted/50 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  {[
                    ["Offer", "The subscription product or plan the customer bought."],
                    ["Active subs", "How many subscriptions for this offer were active at the end of this time."],
                    ["MRR", "The monthly value of the active subscriptions for this offer."],
                    ["New MRR", "New monthly subscription money this offer added during this time."],
                    ["Churned MRR", "Monthly subscription money this offer lost during this time."],
                    ["Effective churn", "The percent of starting subscriptions for this offer that ended during this time."],
                    ["Cancellation", "The percent of starting subscriptions for this offer that customers canceled."],
                    ["Confidence", "Direct means ClickFunnels gave us the billing schedule. Invoice-derived means we figured it out from payment dates."],
                  ].map(([label, help], index) => <th key={label} className={`px-3 py-3 ${index > 0 && index < 7 ? "text-right" : ""}`}><span className={`flex items-center gap-1 ${index > 0 && index < 7 ? "justify-end" : ""}`}>{label}{infoIcon(help)}</span></th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {selectedPeriod.offers.map((offer) => <tr key={offer.name} className="transition-colors hover:bg-muted/30">
                  <td className="max-w-[240px] truncate px-3 py-3 font-medium">{offer.name}</td>
                  <td className="px-3 py-3 text-right">{offer.activeSubscriptions}</td>
                  <td className="px-3 py-3 text-right font-medium">{money(offer.mrr)}</td>
                  <td className="px-3 py-3 text-right">{money(offer.newMrr)}</td>
                  <td className="px-3 py-3 text-right">{money(offer.churnedMrr)}</td>
                  <td className="px-3 py-3 text-right">{pct(offer.effectiveChurnRate)}</td>
                  <td className="px-3 py-3 text-right">{pct(offer.cancellationRate)}</td>
                  <td className="px-3 py-3"><Badge variant="outline" className={offer.confidence === "Invoice-derived" ? "border-amber-300 text-amber-700 dark:text-amber-300" : "border-emerald-300 text-emerald-700 dark:text-emerald-300"}>{offer.confidence}</Badge></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>}
      <div className="flex items-start gap-2 border-t pt-4 text-xs text-muted-foreground">{infoIcon("This note explains where the numbers come from and why they may not match other ClickFunnels reports.")}<p>{snapshot.methodology}</p></div>
    </>}
    <Sheet open={detailPanel !== null} onOpenChange={(open) => !open && setDetailPanel(null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader className="border-b pb-5 text-left">
          <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl ${panelIsTrialing ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300"}`}>
            {panelIsTrialing ? <Clock className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </div>
          <SheetTitle>{panelIsTrialing ? "Contacts currently trialing" : "Past-due contacts"}</SheetTitle>
          <SheetDescription>{panelContacts.length} {panelContacts.length === 1 ? "person" : "people"} · data refreshes automatically every 15 minutes</SheetDescription>
        </SheetHeader>
        <div className="py-3">
          <div className="mb-2 hidden grid-cols-[minmax(0,1.7fr)_minmax(0,1.15fr)_82px_150px_82px_34px] items-center gap-3 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground sm:grid">
            <span>Contact</span>
            <span>Offer</span>
            <span className="text-right">Monthly</span>
            <span>{panelIsTrialing ? "Trial ends" : "Payment due"}</span>
            <span className="text-right">Status</span>
            <span aria-hidden="true" />
          </div>
          <div className="divide-y rounded-lg border bg-card">
          {sortedPanelContacts.map((contact) => (
            <div key={contact.id} className="group px-3 py-2.5 transition-colors hover:bg-muted/30">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1.7fr)_minmax(0,1.15fr)_82px_150px_82px_34px] sm:items-center sm:gap-3">
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2 sm:block">
                    <p className="break-words text-sm font-semibold leading-5 text-foreground">{contact.name}</p>
                    <Badge variant="outline" className={`shrink-0 text-[10px] leading-4 sm:hidden ${panelIsTrialing ? "border-amber-300 text-amber-700 dark:text-amber-300" : "border-rose-300 text-rose-700 dark:text-rose-300"}`}>
                      {panelIsTrialing ? "Trialing" : contact.billingStatus}
                    </Badge>
                  </div>
                  {contact.email && <p className="break-all text-xs leading-4 text-muted-foreground">{contact.email}</p>}
                </div>
                <p className="truncate text-xs text-muted-foreground" title={contact.offers.join(" · ")}>{contact.offers.join(" · ") || "No offer listed"}</p>
                <div className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">Monthly</span>
                  <span className="text-sm font-semibold tabular-nums">{money(contact.mrr)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2 sm:block">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground sm:hidden">{panelIsTrialing ? "Trial ends" : "Payment due"}</span>
                  <span className="truncate text-xs font-medium" title={contact.relevantDate ? formatDateTime(contact.relevantDate) : "Not available"}>{contact.relevantDate ? formatDateTime(contact.relevantDate) : "Not available"}</span>
                </div>
                <Badge variant="outline" className={`hidden shrink-0 justify-self-end text-[10px] leading-4 sm:inline-flex ${panelIsTrialing ? "border-amber-300 text-amber-700 dark:text-amber-300" : "border-rose-300 text-rose-700 dark:text-rose-300"}`}>
                  {panelIsTrialing ? "Trialing" : contact.billingStatus}
                </Badge>
                <div className="flex justify-end">
                  {contact.contactUrl && <Button asChild variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" aria-label={`Open ${contact.name} in ClickFunnels`} title="Open in ClickFunnels"><a href={normalizeClickFunnelsContactUrl(contact.contactUrl)} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a></Button>}
                </div>
              </div>
            </div>
          ))}
          </div>
          {!panelContacts.length && <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">No matching contacts in the current snapshot.</div>}
        </div>
      </SheetContent>
    </Sheet>
  </div>;
}

function WebhookActivityTab() {
  const [eventFilter, setEventFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [offset, setOffset] = useState(0);
  const limit = 20;
  const query = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    eventType: eventFilter,
    status: statusFilter,
  });
  const { data, isLoading, isFetching, refetch } = useQuery<CfWebhookActivityResponse>({
    queryKey: [`/api/admin/cf/webhook-activity?${query.toString()}`],
  });

  const formatDate = (value: string | null) =>
    value
      ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
      : "Never";

  const eventLabel = (eventType: string) => {
    const labels: Record<string, string> = {
      "courses/enrollment.created": "Enrollment created",
      "courses/enrollment.suspended": "Enrollment suspended",
      "courses/enrollment.deleted": "Enrollment deleted",
      "subscription.cancelled": "Subscription cancelled",
      "subscription.churned": "Subscription churned",
      unknown: "Unknown event",
    };
    return labels[eventType] || eventType;
  };

  const actionLabel = (action: string) =>
    action.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

  const statusClass = (status: CfWebhookActivity["status"]) => {
    if (status === "processed") return "text-emerald-700 dark:text-emerald-400";
    if (status === "rejected") return "text-amber-700 dark:text-amber-400";
    return "text-red-700 dark:text-red-400";
  };

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
        <CardHeader className="pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Webhook className="h-4 w-4 text-emerald-500" />
                Webhook Setup
              </CardTitle>
              <CardDescription>
                Add this endpoint in ClickFunnels to sync enrollment events automatically.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RotateCw className={`h-3.5 w-3.5 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Webhook URL</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono break-all">
                {`${window.location.protocol}//${window.location.host}/api/webhooks/clickfunnels`}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigator.clipboard.writeText(`${window.location.protocol}//${window.location.host}/api/webhooks/clickfunnels`)}
                data-testid="button-copy-webhook-url-activity"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Subscribe to these events</p>
            <div className="space-y-2">
              {[
                ["courses/enrollment.created", "Grants access", "text-green-500"],
                ["courses/enrollment.suspended", "Revokes access", "text-red-500"],
                ["courses/enrollment.deleted", "Revokes access", "text-red-500"],
                ["subscription.cancelled", "Revokes access", "text-red-500"],
                ["subscription.churned", "Revokes access", "text-red-500"],
              ].map(([event, action, color]) => (
                <div key={event} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Webhook className={`h-4 w-4 ${color}`} />
                    <code className="text-xs font-mono">{event}</code>
                  </div>
                  <span className="text-xs text-muted-foreground">{action}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
            <p className="font-medium">How to set it up in ClickFunnels:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Go to <strong>Workspace Settings → Webhooks</strong></li>
              <li>Click <strong>Add New Endpoint</strong></li>
              <li>Paste the webhook URL above</li>
              <li>Select all 5 events listed above</li>
              <li>Set the signing secret to your <code className="font-mono">CF_WEBHOOK_SECRET</code> value</li>
            </ol>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => window.open("https://app.myclickfunnels.com/settings/webhooks", "_blank")}
            data-testid="button-open-cf-webhooks-activity"
          >
            <ExternalLink className="h-3.5 w-3.5 mr-2" />
            Open ClickFunnels Webhooks
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-indigo-500" />
                Webhook Activity
              </CardTitle>
              <CardDescription>
                Verified requests received by this Toolkit. Activity is retained for 90 days.
              </CardDescription>
            </div>
            <Badge variant="outline">{data?.total ?? 0} events</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Last received", formatDate(data?.lastReceivedAt ?? null)],
              ["Last enrollment", formatDate(data?.lastEnrollmentAt ?? null)],
              ["Last revocation", formatDate(data?.lastRevocationAt ?? null)],
              ["Processed / failed", `${data?.processedCount ?? 0} / ${data?.failedCount ?? 0}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium mt-1 truncate" title={value}>{value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={eventFilter}
              onChange={(e) => { setEventFilter(e.target.value); setOffset(0); }}
              className="text-sm border rounded-md px-3 py-2 bg-background"
              data-testid="select-cf-webhook-event-filter"
            >
              <option value="all">All event types</option>
              <option value="courses/enrollment.created">Enrollment created</option>
              <option value="courses/enrollment.suspended">Enrollment suspended</option>
              <option value="courses/enrollment.deleted">Enrollment deleted</option>
              <option value="subscription.cancelled">Subscription cancelled</option>
              <option value="subscription.churned">Subscription churned</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
              className="text-sm border rounded-md px-3 py-2 bg-background"
              data-testid="select-cf-webhook-status-filter"
            >
              <option value="all">All results</option>
              <option value="processed">Processed</option>
              <option value="rejected">Rejected</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : data?.events.length ? (
            <div className="rounded-md border divide-y">
              {data.events.map((event) => (
                <div key={event.id} className="px-3 py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                    <div>
                      <p className="font-medium">{eventLabel(event.eventType)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {event.email || "No email available"}{event.contactId ? ` · Contact ${event.contactId}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-medium ${statusClass(event.status)}`}>{actionLabel(event.action)}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatDate(event.createdAt)}</p>
                    </div>
                  </div>
                  {event.error && <p className="text-xs text-red-600 dark:text-red-400 mt-2">{event.error}</p>}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No webhook activity matches these filters yet.
            </div>
          )}

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Page {currentPage} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0 || isFetching}>Previous</Button>
              <Button variant="outline" size="sm" onClick={() => setOffset(offset + limit)} disabled={currentPage >= totalPages || isFetching}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── CfIntegrationTab ─────────────────────────────────────────────────────────

function CfIntegrationSection() {
  const { toast } = useToast();

  const { data: cfStatus, isLoading: statusLoading } = useQuery<CfStatus>({
    queryKey: ["/api/admin/cf/status"],
  });

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} copied!` });
    });
  };

  const configItems = [
    { key: "apiToken", label: "CF API Token", desc: "Secret: CF_API_TOKEN" },
    { key: "workspaceDomain", label: "Workspace Domain", desc: "Secret: CF_WORKSPACE_DOMAIN" },
    { key: "courseId", label: "Course ID", desc: "Secret: CF_COURSE_ID" },
    { key: "webhookSecret", label: "Webhook Secret", desc: "Secret: CF_WEBHOOK_SECRET" },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">ClickFunnels Integration</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manage membership access synced with your ClickFunnels course enrollment.
        </p>
      </div>

      {/* One-Click Login URL */}
      <Card className="overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-violet-500 to-indigo-400" />
        <CardHeader className="pt-4 pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Link className="h-4 w-4 text-violet-500" />
            ClickFunnels One-Click Login
          </CardTitle>
          <CardDescription>
            Paste this URL into any ClickFunnels button. CF automatically fills in each member's email address.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs bg-muted px-3 py-2.5 rounded font-mono break-all">
              {`${window.location.origin}/api/auth/cf-magic?email={{contact.email_address}}`}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(`${window.location.origin}/api/auth/cf-magic?email={{contact.email_address}}`, "Login URL")}
              data-testid="button-copy-cf-login-url"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500/10">
                <Zap className="h-3.5 w-3.5 text-emerald-500" />
              </div>
              Integration Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : cfStatus?.allConfigured ? (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-emerald-500" />
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Configured</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-500" />
                <span className="font-semibold text-amber-600 dark:text-amber-400">Incomplete Setup</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-indigo-500 to-violet-400" />
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/10">
                <UserCheck className="h-3.5 w-3.5 text-indigo-500" />
              </div>
              Enrolled Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {statusLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : cfStatus?.enrolledCount ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Active CF access</p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-rose-500 to-red-400" />
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-rose-500/10">
                <UserX className="h-3.5 w-3.5 text-rose-500" />
              </div>
              Revoked / Cancelled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
              {statusLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : cfStatus?.revokedCount ?? 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Access removed</p>
          </CardContent>
        </Card>
      </div>

      <div>
        {/* Configuration Health */}
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-violet-500 to-indigo-400" />
          <CardHeader className="pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="h-4 w-4 text-violet-500" />
              Configuration Secrets
            </CardTitle>
            <CardDescription>
              These secrets must be set in the Replit Secrets panel for the integration to work.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {configItems.map(({ key, label, desc }) => {
              const isSet = cfStatus?.configured[key] ?? false;
              return (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{desc}</p>
                  </div>
                  {statusLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : isSet ? (
                    <Badge variant="outline" className="text-green-600 border-green-300 dark:text-green-400">
                      <CheckCircle className="h-3 w-3 mr-1" /> Set
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-red-600 border-red-300 dark:text-red-400">
                      <AlertCircle className="h-3 w-3 mr-1" /> Missing
                    </Badge>
                  )}
                </div>
              );
            })}
            {cfStatus?.workspaceDomain && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground">Workspace</p>
                <p className="text-sm font-mono">{cfStatus.workspaceDomain}</p>
              </div>
            )}
            {cfStatus?.courseId && (
              <div>
                <p className="text-xs text-muted-foreground">Course ID</p>
                <p className="text-sm font-mono">{cfStatus.courseId}</p>
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 py-4 text-sm text-muted-foreground">
          <Users className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
          <p><span className="font-medium text-foreground">Membership reconciliation is now managed from the Overview tab.</span> It handles initial account creation, restored access, and revocations from one complete ClickFunnels scan.</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClickFunnelsAdminPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
      <Tabs defaultValue="overview">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="member-health">Member Health</TabsTrigger>
          <TabsTrigger value="integration">Integration</TabsTrigger>
          <TabsTrigger value="webhook-activity">Webhook Activity</TabsTrigger>
          <TabsTrigger value="course-import">Course Import</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4">
          <MembershipOverviewTab />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <MembersTab />
        </TabsContent>
        <TabsContent value="member-health" className="mt-4">
          <MemberHealthTab />
        </TabsContent>
        <TabsContent value="integration" className="mt-4 space-y-6">
          <CfIntegrationSection />
        </TabsContent>
        <TabsContent value="webhook-activity" className="mt-4">
          <WebhookActivityTab />
        </TabsContent>
        <TabsContent value="course-import" className="mt-4">
          <CourseImportCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
