import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, CheckCircle, AlertCircle, Users, Copy, ExternalLink,
  Webhook, UserCheck, UserX, Zap, Key, Search, Clock, RotateCw, Link,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CfStatus {
  allConfigured: boolean;
  configured: {
    apiToken: boolean;
    workspaceDomain: boolean;
    courseId: boolean;
    webhookSecret: boolean;
  };
  enrolledCount: number;
  revokedCount: number;
  workspaceDomain: string | null;
  courseId: string | null;
}

interface CfUser {
  id: string;
  email: string;
  displayName: string | null;
  cfEnrolled: boolean;
}

// ─── ImportAllMembersButton ───────────────────────────────────────────────────

function ImportAllMembersButton() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ message: string; created: number; contactIdUpdated: number; skipped: number; inactive: number; errors: number } | null>(null);

  const handleImport = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/cf/import-all-members", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Import failed");
      setResult(data);
      toast({ title: "Import complete", description: data.message });
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={handleImport} disabled={running} data-testid="button-import-all-members">
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Users className="h-3.5 w-3.5 mr-2" />}
        {running ? "Importing… (this may take a minute)" : "Import All Members from ClickFunnels"}
      </Button>
      {result && (
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs space-y-1">
          <p className="font-medium">{result.message}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
            {result.created > 0 && <span className="text-green-700 dark:text-green-400">✓ {result.created} new accounts created</span>}
            {result.contactIdUpdated > 0 && <span className="text-blue-700 dark:text-blue-400">✓ {result.contactIdUpdated} contact IDs updated</span>}
            {result.skipped > 0 && <span>{result.skipped} already up-to-date</span>}
            {result.inactive > 0 && <span>{result.inactive} inactive/revoked skipped</span>}
            {result.errors > 0 && <span className="text-destructive">{result.errors} errors</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── GracePeriodCard ──────────────────────────────────────────────────────────

function GracePeriodCard() {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ hours: number }>({
    queryKey: ["/api/admin/settings/cf-grace-period"],
  });
  const [hoursInput, setHoursInput] = useState("");
  const [edited, setEdited] = useState(false);

  useEffect(() => {
    if (data !== undefined && !edited) {
      setHoursInput(String(data.hours));
    }
  }, [data, edited]);

  const save = useMutation({
    mutationFn: () =>
      apiRequest("PUT", "/api/admin/settings/cf-grace-period", {
        hours: parseFloat(hoursInput),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/settings/cf-grace-period"] });
      setEdited(false);
      toast({ title: "Grace period saved" });
    },
    onError: () => toast({ title: "Failed to save grace period", variant: "destructive" }),
  });

  const parsedHours = parseFloat(hoursInput);
  const isValid = !isNaN(parsedHours) && parsedHours >= 0;

  return (
    <Card data-testid="card-cf-grace-period">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div>
            <CardTitle className="text-base">Revocation Grace Period</CardTitle>
            <CardDescription className="text-sm mt-0.5">
              How many hours a member retains access after a revocation webhook before their account is locked.
              Default is 48 hours. Set to 0 to revoke access immediately.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={0}
              step={1}
              value={hoursInput}
              onChange={(e) => { setHoursInput(e.target.value); setEdited(true); }}
              className="w-28 text-sm border rounded-md px-3 py-1.5 bg-background text-right font-mono"
              data-testid="input-cf-grace-period-hours"
            />
            <span className="text-sm text-muted-foreground">hours</span>
            <Button
              size="sm"
              onClick={() => save.mutate()}
              disabled={save.isPending || !isValid}
              data-testid="button-save-cf-grace-period"
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── CfIntegrationTab ─────────────────────────────────────────────────────────

function CfIntegrationSection() {
  const { toast } = useToast();
  const [testEmail, setTestEmail] = useState("");
  const [testEvent, setTestEvent] = useState("courses/enrollment.created");
  const [testResult, setTestResult] = useState<{ action: string; email: string | null } | null>(null);
  const [testLoading, setTestLoading] = useState(false);

  const { data: cfStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<CfStatus>({
    queryKey: ["/api/admin/cf/status"],
  });

  const [memberFilter, setMemberFilter] = useState<"enrolled" | "revoked" | "never">("enrolled");
  const { data: cfUsersData, isLoading: cfUsersLoading } = useQuery<{ users: CfUser[] }>({
    queryKey: [`/api/admin/cf/users?filter=${memberFilter}`],
  });
  const cfUsers = cfUsersData?.users ?? [];

  const [lookupEmail, setLookupEmail] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<{ enrolled: boolean; contactId?: string | null; email?: string | null; error?: string } | null>(null);

  const handleLookup = async () => {
    if (!lookupEmail.trim()) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      const res = await fetch(`/api/admin/cf/test-lookup?email=${encodeURIComponent(lookupEmail.trim())}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      const er = data.enrollmentResult;
      setLookupResult({ enrolled: !!er?.enrolled, contactId: er?.contactId, email: er?.email, error: er?.error });
    } catch (err: any) {
      toast({ title: "Lookup failed", description: err.message, variant: "destructive" });
    } finally {
      setLookupLoading(false);
    }
  };

  const webhookUrl = `${window.location.protocol}//${window.location.host}/api/webhooks/clickfunnels`;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: `${label} copied!` });
    });
  };

  const handleTestWebhook = async () => {
    if (!testEmail.trim()) {
      toast({ title: "Enter an email address first", variant: "destructive" });
      return;
    }
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/cf/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: testEmail.trim(), eventType: testEvent }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed");
      setTestResult({ action: data.action, email: data.email });
      refetchStatus();
    } catch (err: any) {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    } finally {
      setTestLoading(false);
    }
  };

  const configItems = [
    { key: "apiToken", label: "CF API Token", desc: "Secret: CF_API_TOKEN" },
    { key: "workspaceDomain", label: "Workspace Domain", desc: "Secret: CF_WORKSPACE_DOMAIN" },
    { key: "courseId", label: "Course ID", desc: "Secret: CF_COURSE_ID" },
    { key: "webhookSecret", label: "Webhook Secret", desc: "Secret: CF_WEBHOOK_SECRET" },
  ] as const;

  const webhookEvents = [
    { event: "courses/enrollment.created", action: "Grants access", icon: <UserCheck className="h-4 w-4 text-green-500" /> },
    { event: "courses/enrollment.suspended", action: "Revokes access", icon: <UserX className="h-4 w-4 text-red-500" /> },
    { event: "courses/enrollment.deleted", action: "Revokes access", icon: <UserX className="h-4 w-4 text-red-500" /> },
    { event: "subscription.cancelled", action: "Revokes access", icon: <UserX className="h-4 w-4 text-red-500" /> },
    { event: "subscription.churned", action: "Revokes access", icon: <UserX className="h-4 w-4 text-red-500" /> },
  ];

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

      <div className="grid gap-6 md:grid-cols-2">
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

        {/* Webhook Setup */}
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
          <CardHeader className="pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Webhook className="h-4 w-4 text-emerald-500" />
              Webhook Setup
            </CardTitle>
            <CardDescription>
              Add this endpoint in ClickFunnels to sync enrollment events automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Webhook URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2 rounded font-mono break-all">
                  {webhookUrl}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(webhookUrl, "Webhook URL")}
                  data-testid="button-copy-webhook-url"
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Subscribe to these events</p>
              <div className="space-y-2">
                {webhookEvents.map(({ event, action, icon }) => (
                  <div key={event} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {icon}
                      <code className="text-xs font-mono">{event}</code>
                    </div>
                    <span className="text-xs text-muted-foreground">{action}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t text-xs text-muted-foreground space-y-1">
              <p className="font-medium">How to set it up in ClickFunnels:</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
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
              data-testid="button-open-cf-webhooks"
            >
              <ExternalLink className="h-3.5 w-3.5 mr-2" />
              Open ClickFunnels Webhooks
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Webhook Tester + CF Contact Lookup — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Webhook Tester */}
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-amber-500 to-orange-400" />
          <CardHeader className="pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-amber-500" />
              Webhook Tester
            </CardTitle>
            <CardDescription>
              Simulate a ClickFunnels event to verify your integration is working correctly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3">
              <input
                type="email"
                placeholder="user@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1 text-sm border rounded-md px-3 py-2 bg-background"
                data-testid="input-test-webhook-email"
              />
              <div className="flex gap-2">
                <select
                  value={testEvent}
                  onChange={(e) => setTestEvent(e.target.value)}
                  className="flex-1 text-sm border rounded-md px-3 py-2 bg-background"
                  data-testid="select-test-webhook-event"
                >
                  <option value="courses/enrollment.created">courses/enrollment.created</option>
                  <option value="courses/enrollment.suspended">courses/enrollment.suspended</option>
                  <option value="courses/enrollment.deleted">courses/enrollment.deleted</option>
                  <option value="subscription.cancelled">subscription.cancelled</option>
                  <option value="subscription.churned">subscription.churned</option>
                </select>
                <Button
                  onClick={handleTestWebhook}
                  disabled={testLoading}
                  size="sm"
                  data-testid="button-run-test-webhook"
                >
                  {testLoading ? "Running..." : "Run Test"}
                </Button>
              </div>
            </div>

            {testResult && (
              <div className={`flex items-center gap-3 rounded-md border px-4 py-3 text-sm ${
                ["granted", "created"].includes(testResult.action) ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400" :
                testResult.action === "revoked" ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400" :
                "border-yellow-500/30 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
              }`} data-testid="text-test-webhook-result">
                {["granted", "created"].includes(testResult.action) && <UserCheck className="h-4 w-4 flex-shrink-0" />}
                {testResult.action === "revoked" && <UserX className="h-4 w-4 flex-shrink-0" />}
                {!["granted", "created", "revoked"].includes(testResult.action) && <AlertCircle className="h-4 w-4 flex-shrink-0" />}
                <div>
                  <span className="font-medium capitalize">{testResult.action.replace(/_/g, " ")}</span>
                  {testResult.email && <span className="ml-2 opacity-70">for {testResult.email}</span>}
                  {testResult.action === "created" && (
                    <p className="text-xs mt-0.5 opacity-70">New account auto-provisioned for this enrollee.</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* CF Contact Lookup */}
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-sky-500 to-cyan-400" />
          <CardHeader className="pt-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="h-4 w-4 text-sky-500" />
              CF Contact Lookup
            </CardTitle>
            <CardDescription>
              Check a member's enrollment status directly against the ClickFunnels API.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="user@example.com"
                value={lookupEmail}
                onChange={(e) => setLookupEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                className="flex-1 text-sm border rounded-md px-3 py-2 bg-background"
                data-testid="input-cf-lookup-email"
              />
              <Button onClick={handleLookup} disabled={lookupLoading} size="sm" data-testid="button-cf-lookup">
                {lookupLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Look Up"}
              </Button>
            </div>
            {lookupResult && (
              <div className={`rounded-md border px-4 py-3 text-sm space-y-1 ${
                lookupResult.error ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/30" :
                lookupResult.enrolled ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30" :
                "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
              }`} data-testid="text-cf-lookup-result">
                {lookupResult.error ? (
                  <p className="text-red-700 dark:text-red-400"><span className="font-medium">Error:</span> {lookupResult.error}</p>
                ) : (
                  <>
                    <p className={lookupResult.enrolled ? "text-green-700 dark:text-green-400 font-medium" : "text-amber-700 dark:text-amber-400 font-medium"}>
                      {lookupResult.enrolled ? "✓ Active enrollment found" : "✗ Not enrolled / not found"}
                    </p>
                    {lookupResult.contactId && <p className="text-muted-foreground text-xs">Contact ID: <code className="font-mono">{lookupResult.contactId}</code></p>}
                    {lookupResult.email && <p className="text-muted-foreground text-xs">Email: {lookupResult.email}</p>}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bulk Member Sync */}
        <Card className="overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-emerald-500 to-teal-400" />
          <CardHeader className="pt-4 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-500" />
              Bulk Member Sync
            </CardTitle>
            <CardDescription>
              Pull every active CF enrollee into the Users tab at once — including members who haven't clicked the login link yet. Safe to run anytime; existing accounts are not overwritten.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImportAllMembersButton />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClickFunnelsAdminPage() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl space-y-6">
      <GracePeriodCard />
      <CfIntegrationSection />
    </div>
  );
}
