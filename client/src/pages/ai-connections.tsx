import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Activity, AlertCircle, ArrowUpRight, Check, CheckCircle2, Clipboard, Clock3, FileText, FolderKanban, Info, Loader2, LockKeyhole, PlugZap, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";

type McpConfig = { endpoint: string; productionEndpoint: string; scopes: string[]; capabilities: string[]; ready: boolean };
type Workspace = { id: string; name: string | null; kind: "own" | "shared"; accessAvailable: boolean };
type Connection = { id: string; clientName: string; scopes: string[]; createdAt: string; lastUsedAt: string | null; revokedAt: string | null; workspace: Workspace };
type Approval = { id: string; connectionId: string; clientName: string; toolName: string; summary: string; status: string; createdAt: string; expiresAt: string; result?: string; error?: string };
type ConnectionsResponse = { connections: Connection[]; approvals: Approval[] };
type Consent = { requestId: string; clientName: string; redirectUri: string; scopes: string[]; csrfToken: string; expiresAt: string; workspace: Workspace };

const CONFIG_KEY = ["/api/mcp/config"];
const CONNECTIONS_KEY = ["/api/mcp/connections"];
const prettyScope = (scope: string) => scope.replace(/:/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const readableDate = (value: string | null) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not yet";
const workspaceName = (workspace: Workspace) => workspace.accessAvailable
  ? workspace.name || (workspace.kind === "own" ? "Your workspace" : "Shared workspace")
  : "Workspace unavailable";
const workspaceKind = (workspace: Workspace) => workspace.kind === "own" ? "Own workspace" : "Shared workspace";

function useMcpWorkspace() {
  const config = useQuery<McpConfig>({ queryKey: CONFIG_KEY });
  const connections = useQuery<ConnectionsResponse>({ queryKey: CONNECTIONS_KEY, refetchInterval: 15000 });
  return { config, connections };
}

function LoadError({ title, message, retry }: { title: string; message: string; retry: () => void }) {
  return <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>{title}</AlertTitle><AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>{message}</span><Button size="sm" variant="outline" onClick={retry}><RefreshCw className="h-3.5 w-3.5" /> Try again</Button></AlertDescription></Alert>;
}

function SkeletonRows() {
  return <div className="space-y-3" aria-label="Loading connections"><div className="h-20 animate-pulse rounded-lg bg-muted/70" /><div className="h-20 animate-pulse rounded-lg bg-muted/50" /></div>;
}

function Scopes({ scopes }: { scopes: string[] }) {
  return <div className="flex flex-wrap gap-1.5">{scopes.map((scope) => <Badge key={scope} variant="secondary" className="font-normal">{prettyScope(scope)}</Badge>)}</div>;
}

export default function AiConnectionsPage() {
  const { toast } = useToast();
  const { config, connections } = useMcpWorkspace();
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);
  const removeConnection = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/mcp/connections/${encodeURIComponent(id)}`); },
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: CONNECTIONS_KEY });
      toast({ title: "Connection removed", description: "This AI assistant can no longer access your projects." });
    },
    onError: (error: Error) => toast({ title: "Could not remove connection", description: error.message, variant: "destructive" }),
  });
  const configError = config.isError;
  const connectionsError = connections.isError;
  const items = connections.data?.connections ?? [];
  const approvals = connections.data?.approvals ?? [];
  const pending = approvals.filter((approval) => approval.status === "pending");
  const activeCount = items.filter((item) => !item.revokedAt && item.workspace.accessAvailable).length;

  return (
    <div className="min-h-full bg-background">
      <div className="relative overflow-hidden border-b border-border bg-[hsl(230,45%,14%)] text-white">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/60"><PlugZap className="h-4 w-4" /> Member toolkit / Projects &amp; Funnel Grid</div>
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">AI connections</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/75">Connect a compatible AI assistant to your projects and Funnel Grid maps. You choose what it can see and change. Existing connections need fresh authorization to add funnel access.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-white/25 bg-white/10 text-white hover:bg-white/15 hover:text-white" onClick={() => { void config.refetch(); void connections.refetch(); }}>
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
              <Button asChild className="bg-white text-[hsl(230,45%,18%)] hover:bg-white/90">
                <a href="#setup"><ArrowUpRight className="h-4 w-4" /> Setup instructions</a>
              </Button>
            </div>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/15 pt-4 text-xs text-white/70">
            <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Permission-aware access</span>
            <span className="inline-flex items-center gap-2"><Activity className="h-4 w-4 text-cyan-200" /> Deletions require your approval</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {(configError || connectionsError) && <LoadError title="Workspace data could not be loaded" message="Check your connection and try again. Your existing connections are not changed." retry={() => { if (configError) void config.refetch(); if (connectionsError) void connections.refetch(); }} />}

        <section aria-labelledby="connections-title" className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(270px,0.65fr)]">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-start justify-between gap-4 border-b bg-muted/20">
              <div>
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" /> Your access list</div>
                <CardTitle id="connections-title">Connected assistants</CardTitle>
                <CardDescription>Only assistants you authorize appear here. Remove access at any time.</CardDescription>
              </div>
              <Badge variant={activeCount ? "default" : "secondary"}>{activeCount} active</Badge>
            </CardHeader>
            <CardContent className="p-4 sm:p-5">
              {connections.isLoading ? <SkeletonRows /> : connectionsError ? <p className="py-5 text-sm text-muted-foreground">Connection list unavailable. Use refresh to retry.</p> : items.length === 0 ? (
                <div className="rounded-xl border border-dashed p-7 text-center">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><PlugZap className="h-5 w-5" /></div>
                  <h3 className="font-semibold">No assistants connected</h3>
                  <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">When you approve an assistant from its sign-in flow, its permissions and activity will be listed here.</p>
                  <Button variant="outline" className="mt-4" onClick={() => document.getElementById("setup")?.scrollIntoView({ behavior: "smooth" })}>View setup instructions</Button>
                </div>
              ) : <div className="space-y-3">{items.map((connection) => (
                <div key={connection.id} className="rounded-lg border p-4">
                  <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{connection.clientName}</h3><Badge variant={connection.revokedAt || !connection.workspace.accessAvailable ? "outline" : "secondary"}>{connection.revokedAt ? "Revoked" : connection.workspace.accessAvailable ? "Connected" : "Unavailable"}</Badge></div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{workspaceName(connection.workspace)}</span>
                        <Badge variant="outline">{workspaceKind(connection.workspace)}</Badge>
                      </div>
                      {!connection.workspace.accessAvailable && <p className="mt-1 text-xs text-muted-foreground">Access to this workspace is no longer available.</p>}
                      <div className="mt-2"><Scopes scopes={connection.scopes} /></div>
                      <p className="mt-3 text-xs text-muted-foreground">Authorized {readableDate(connection.createdAt)} <span className="px-1">·</span> Last used {readableDate(connection.lastUsedAt)}</p>
                    </div>
                    {!connection.revokedAt && <Button variant="outline" size="sm" className="shrink-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(connection)} disabled={removeConnection.isPending}><Trash2 className="h-3.5 w-3.5" /> Remove access</Button>}
                  </div>
                </div>
              ))}</div>}
              <p className="mt-4 rounded-lg bg-muted/40 px-3 py-2.5 text-xs leading-5 text-muted-foreground">Switching workspaces on this website does not change an existing AI connection. To connect another workspace, start a new authorization from your AI assistant.</p>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-primary/[0.035]">
            <CardHeader>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary"><ShieldCheck className="h-4 w-4" /> Permission model</div>
              <CardTitle className="text-lg">You approve the boundary</CardTitle>
              <CardDescription>Access uses your existing member sign-in. No password or API key is shared with an AI assistant.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background text-primary"><FolderKanban className="h-4 w-4" /></span><p><strong>Read</strong> lets an assistant inspect project, task, and related workspace content.</p></div>
              <div className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background text-primary"><CheckCircle2 className="h-4 w-4" /></span><p><strong>Write</strong> may create or update workspace content. Confirm deletions directly in your AI conversation. Requests expire after 10 minutes; you do not need to visit this page.</p></div>
              <Separator />
              {config.data?.scopes?.length ? <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Available permissions</p><Scopes scopes={config.data.scopes} /></div> : null}
              <p className="text-xs leading-5 text-muted-foreground">Your selected AI platform receives the project and task content it accesses. Review that platform’s data handling terms before connecting.</p>
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="approvals-title">
          <Card>
            <CardHeader className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
              <div><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> Read-only status</div><CardTitle id="approvals-title">Pending deletion confirmations</CardTitle><CardDescription>Confirm or cancel requests only inside your AI app. This page shows their status; it cannot approve or deny them.</CardDescription></div>
              {pending.length > 0 && <Badge>{pending.length} awaiting review</Badge>}
            </CardHeader>
            <CardContent className="pt-0">
              {connections.isLoading ? <SkeletonRows /> : connectionsError ? <p className="py-4 text-sm text-muted-foreground">Approvals could not be loaded.</p> : pending.length === 0 ? (
                <div className="flex flex-col items-center rounded-lg border border-dashed px-5 py-7 text-center sm:flex-row sm:text-left">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground sm:mb-0 sm:mr-4"><Check className="h-5 w-5" /></div>
                  <div><p className="font-medium">Nothing needs your approval</p><p className="mt-1 text-sm text-muted-foreground">Pending destructive requests will appear here. This list refreshes automatically.</p></div>
                </div>
              ) : <div className="space-y-3">{pending.map((approval) => (
                <div key={approval.id} className="rounded-lg border border-amber-500/30 bg-amber-500/[0.035] p-4">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-amber-600/30 text-amber-800 dark:text-amber-300">Approval required</Badge><span className="text-xs text-muted-foreground">{approval.clientName}</span></div>
                      <h3 className="mt-2 font-semibold">{approval.toolName}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{approval.summary}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Expires {readableDate(approval.expiresAt)}</p>
                    </div>
                    <p className="max-w-xs text-sm text-muted-foreground">Return to {approval.clientName} to confirm or cancel this request.</p>
                  </div>
                </div>
              ))}</div>}
            </CardContent>
          </Card>
        </section>

        <section id="setup" aria-labelledby="setup-title" className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
          <Card>
            <CardHeader><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><FileText className="h-3.5 w-3.5" /> Get started</div><CardTitle id="setup-title">Connect from your AI assistant</CardTitle><CardDescription>Use the remote MCP endpoint below in a client that supports custom remote MCP servers. Setup labels vary between platforms.</CardDescription></CardHeader>
            <CardContent className="space-y-5">
              {config.isLoading ? <div className="space-y-3"><div className="h-5 w-1/3 animate-pulse rounded bg-muted" /><div className="h-12 animate-pulse rounded bg-muted" /></div> : configError ? <p className="text-sm text-muted-foreground">Connection setup details are unavailable. Refresh the page to retry.</p> : (
                <>
                  <EndpointField title="Connection name" value="FIA Toolkit" />
                  <EndpointField title="Published domain" value={config.data?.productionEndpoint ?? ""} />
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="mb-2 text-sm font-semibold">Setup steps</p>
                    <ol className="list-inside list-decimal space-y-2 text-sm leading-5 text-muted-foreground">
                      <li>In your AI platform, add a custom remote MCP server.</li>
                      <li>Paste the endpoint for the environment you use. The published endpoint is for the live member site.</li>
                      <li>Sign in with your regular Fearless Influencer Academy member account when prompted.</li>
                      <li>Review the requested access and choose read-only or read and write before approving.</li>
                    </ol>
                    {!config.data?.ready && <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">The server currently reports that MCP is not ready in this environment.</p>}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Info className="h-3.5 w-3.5" /> First version</div><CardTitle className="text-lg">What the assistant can work with</CardTitle><CardDescription>Available tools depend on granted permissions and the AI client.</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6 text-muted-foreground">Tools cover project, task, subtask, section, comment, template, and attachment management, plus project activity. Changes that remove or destructively affect data are paused for your approval in this workspace.</p>
              <div className="rounded-lg border p-3"><p className="text-sm font-medium">Attachments</p><p className="mt-1 text-xs leading-5 text-muted-foreground">File uploads use base64 encoding and are intended for modest files. Support and size limits vary by client.</p></div>
              <div className="rounded-lg border p-3"><p className="text-sm font-medium">Compatibility varies</p><p className="mt-1 text-xs leading-5 text-muted-foreground">A custom remote MCP connection is required. We do not guarantee compatibility with every AI provider or client.</p></div>
              {config.data?.capabilities?.length ? <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reported capabilities</p><Scopes scopes={config.data.capabilities} /></div> : null}
            </CardContent>
          </Card>
        </section>
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !removeConnection.isPending) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Remove this AI connection?</AlertDialogTitle><AlertDialogDescription><strong>{deleteTarget?.clientName}</strong> for <strong>{deleteTarget ? workspaceName(deleteTarget.workspace) : ""}</strong> ({deleteTarget ? workspaceKind(deleteTarget.workspace) : ""}) will lose access to its projects immediately. You can reconnect later by approving it again.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={removeConnection.isPending}>Keep connection</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={removeConnection.isPending} onClick={(event) => { event.preventDefault(); if (deleteTarget) removeConnection.mutate(deleteTarget.id); }}>{removeConnection.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remove access</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EndpointField({ title, value }: { title: string; value: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: "Endpoint copied" });
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Could not copy endpoint", description: "Select and copy the URL manually.", variant: "destructive" });
    }
  };
  return <div><Label className="mb-1.5 block text-xs text-muted-foreground">{title}</Label><div className="flex gap-2"><code className="min-w-0 flex-1 break-all rounded-md border bg-muted/40 px-3 py-2.5 text-xs">{value || "Not available"}</code><Button variant="outline" size="icon" aria-label={`Copy ${title} endpoint`} onClick={copy} disabled={!value}><Clipboard className="h-4 w-4" /></Button>{copied && <span className="sr-only">Copied</span>}</div></div>;
}

export function McpAuthorizePage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const requestId = useMemo(() => new URLSearchParams(window.location.search).get("request") ?? "", []);
  const consent = useQuery<Consent>({
    queryKey: [`/api/mcp/consent/${encodeURIComponent(requestId)}`],
    enabled: Boolean(requestId),
    retry: false,
  });
  const [writeAllowed, setWriteAllowed] = useState(false);
  const [funnelReadAllowed, setFunnelReadAllowed] = useState(false);
  const [funnelWriteAllowed, setFunnelWriteAllowed] = useState(false);
  const approve = useMutation({
    mutationFn: async ({ decision, scopes }: { decision: "approve" | "deny"; scopes: string[] }) => {
      if (!consent.data) throw new Error("This authorization request is unavailable.");
      const response = await apiRequest("POST", `/api/mcp/consent/${encodeURIComponent(requestId)}`, { csrfToken: consent.data.csrfToken, decision, scopes });
      return response.json() as Promise<{ redirectTo: string }>;
    },
    onSuccess: (data) => {
      if (data.redirectTo) window.location.assign(data.redirectTo);
      else toast({ title: "Authorization could not be completed", description: "The service did not provide a return destination.", variant: "destructive" });
    },
    onError: (error: Error) => toast({ title: "Authorization failed", description: error.message, variant: "destructive" }),
  });
  const requestedScopes = consent.data?.scopes ?? [];
  const consentData = consent.data;
  const canRead = requestedScopes.includes("projects:read");
  const canWrite = requestedScopes.includes("projects:write");
  const canReadFunnels = requestedScopes.includes("funnels:read");
  const canWriteFunnels = requestedScopes.includes("funnels:write");
  const selectedScopes = [ ...(canRead ? ["projects:read"] : []), ...(canWrite && writeAllowed ? ["projects:write"] : []),
    ...(canReadFunnels && funnelReadAllowed ? ["funnels:read"] : []),
    ...(canWriteFunnels && funnelReadAllowed && funnelWriteAllowed ? ["funnels:write"] : []) ];
  const unavailableMessage = !requestId ? "This authorization link is missing its request identifier. Return to your AI assistant and start connecting again." : "This request may have expired or already been used. Return to your AI assistant and start a new connection.";

  return (
    <div className="flex min-h-[70dvh] items-center justify-center bg-muted/25 px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground"><ShieldCheck className="h-4 w-4 text-primary" /> Fearless Influencer Academy</div>
        {consent.isLoading && requestId ? <Card><CardContent className="space-y-4 p-7"><div className="h-6 w-2/3 animate-pulse rounded bg-muted" /><div className="h-4 w-full animate-pulse rounded bg-muted" /><div className="h-24 animate-pulse rounded bg-muted" /></CardContent></Card> : consent.isError || !requestId || !consentData ? (
          <Card><CardHeader><div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive"><AlertCircle className="h-5 w-5" /></div><CardTitle>Authorization link unavailable</CardTitle><CardDescription>{unavailableMessage}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => setLocation("/projects/ai")}>Back to AI connections</Button></CardContent></Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="h-1.5 bg-primary" />
            <CardHeader className="pb-4">
              <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><LockKeyhole className="h-5 w-5" /></div>
              <CardTitle className="text-2xl">Connect {consentData.clientName}?</CardTitle>
              <CardDescription className="leading-6">This AI platform is requesting access to FIA Toolkit. Review the workspace and choose which features it may read or change.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-lg border bg-muted/25 p-4" aria-label="Authorization workspace">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Workspace for this connection</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{workspaceName(consentData.workspace)}</span>
                  <Badge variant="outline">{workspaceKind(consentData.workspace)}</Badge>
                  {!consentData.workspace.accessAvailable && <Badge variant="destructive">Unavailable</Badge>}
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">Switching workspaces on this website does not change an existing agent connection. To connect another workspace, start a new authorization from your AI assistant.</p>
              </div>
              <div className="rounded-lg border bg-muted/25 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requested permissions</p>
                <div className="space-y-3">
                  {canRead ? <div className="flex gap-3"><FolderKanban className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><p className="text-sm font-medium">Read projects</p><p className="text-xs leading-5 text-muted-foreground">View project, task, section, comment, template, attachment, and activity content available to your account.</p></div></div> : null}
                  {canWrite && <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><p className="text-sm font-medium">Make project changes</p><p className="text-xs leading-5 text-muted-foreground">Create and update supported project content. Deletions require your confirmation inside your AI app, without returning to the website.</p></div></div>}
                  {canReadFunnels && <p className="text-sm leading-6">Funnel Grid: view your personal maps; optionally create and edit every step type, including notes and delays. Shared Project Manager workspaces do not include funnel access.</p>}
                </div>
              </div>
              {canWrite && <div className="flex items-start gap-3 rounded-lg border p-4"><Checkbox id="allow-write" checked={writeAllowed} onCheckedChange={(checked) => setWriteAllowed(checked === true)} /><div><Label htmlFor="allow-write" className="cursor-pointer text-sm font-medium">Include write access</Label><p className="mt-1 text-xs leading-5 text-muted-foreground">Leave unchecked to authorize read-only access. You can remove access later from AI connections.</p></div></div>}
              {canReadFunnels && <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-start gap-3"><Checkbox id="allow-funnel-read" checked={funnelReadAllowed} onCheckedChange={(checked) => setFunnelReadAllowed(checked === true)} /><div><Label htmlFor="allow-funnel-read">Allow Funnel Grid reading</Label><p className="mt-1 text-xs text-muted-foreground">View your saved maps and their content.</p></div></div>
                {canWriteFunnels && <div className="flex items-start gap-3"><Checkbox id="allow-funnel-write" checked={funnelWriteAllowed} disabled={!funnelReadAllowed} onCheckedChange={(checked) => setFunnelWriteAllowed(checked === true)} /><div><Label htmlFor="allow-funnel-write">Allow Funnel Grid changes</Label><p className="mt-1 text-xs leading-5 text-muted-foreground">Build, edit, connect, arrange and duplicate maps. Removal and full-map replacement require confirmation inside your AI app.</p></div></div>}
              </div>}
              <Alert><Info className="h-4 w-4" /><AlertTitle>Your content, your decision</AlertTitle><AlertDescription className="text-xs leading-5">If you approve, the selected AI platform receives the project or funnel content it accesses. Review the platform’s privacy and data handling terms. Access uses your regular member sign-in; never share your password.</AlertDescription></Alert>
              <p className="text-xs text-muted-foreground">Redirect requested by <span className="break-all font-medium text-foreground">{consentData.clientName}</span>. Expires {readableDate(consentData.expiresAt)}.</p>
              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => approve.mutate({ decision: "deny", scopes: [] })} disabled={approve.isPending}>Deny</Button>
                <Button onClick={() => approve.mutate({ decision: "approve", scopes: selectedScopes })} disabled={approve.isPending || selectedScopes.length === 0}>{approve.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Approve selected access</Button>
              </div>
            </CardContent>
          </Card>
        )}
        <p className="mt-4 text-center text-xs text-muted-foreground">You can review or remove connected assistants at any time in Projects → AI connections.</p>
      </div>
    </div>
  );
}
