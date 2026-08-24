import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, CheckCircle, AlertCircle, Users, Copy, ExternalLink,
  Webhook, UserCheck, UserX, Zap, Key, Search, Clock, RotateCw, Link,
} from "lucide-react";
import { CourseImportCard } from "@/components/cf-course-import";

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

type MemberFilter = "all" | "enrolled" | "revoked" | "never";

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

function MembersTab() {
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery<{ users: CfUser[] }>({
    queryKey: ["/api/admin/cf/users?filter=all"],
  });
  const members = (data?.users ?? []).filter((member) => {
    const state = getMemberState(member);
    const needle = search.trim().toLowerCase();
    const matchesSearch = !needle || [member.displayName, member.firstName, member.lastName, member.email].some((value) => value?.toLowerCase().includes(needle));
    return matchesSearch && (filter === "all" || state === filter);
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">ClickFunnels Members</h2>
        <p className="mt-1 text-sm text-muted-foreground">A local membership directory with ClickFunnels access states. General account settings remain in Admin Users.</p>
      </div>
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
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr><th className="px-4 py-3 font-medium">Member</th><th className="px-4 py-3 font-medium">Access</th><th className="px-4 py-3 font-medium">Membership activity</th></tr>
                </thead>
                <tbody className="divide-y">
                  {members.map((member) => {
                    const state = getMemberState(member);
                    const name = member.displayName || [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email || "Unnamed account";
                    return (
                      <tr key={member.id}>
                        <td className="px-4 py-3"><p className="font-medium">{name}</p><p className="mt-0.5 text-xs text-muted-foreground">{member.email || "No email address"}</p></td>
                        <td className="px-4 py-3"><Badge variant="outline" className={memberStateClass(state)}>{memberStateLabel(state)}</Badge></td>
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
    </div>
  );
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
    <div className="container mx-auto py-8 px-4 max-w-5xl space-y-6">
      <Tabs defaultValue="overview">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
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
