import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowUpRight, BookOpen, Check, Clipboard,
  Code2, ExternalLink, FileCheck2, FileText, Fingerprint, FolderKanban,
  Info, KeyRound, LockKeyhole, Plug, RefreshCw, Search, ShieldCheck, TriangleAlert,
} from "lucide-react";

type ReferenceParameter = { name: string; required: boolean; description: string };
type ReferenceEndpoint = { method: string; path: string; category: string; access: string; description: string };
type ReferenceTool = { name: string; description: string; write: boolean; destructive: boolean; parameters: ReferenceParameter[] };
type McpReference = {
  endpoint: string;
  productionEndpoint: string;
  scopes: string[];
  transport: string;
  auth: string;
  endpoints: ReferenceEndpoint[];
  tools: ReferenceTool[];
};

const REFERENCE_KEY = ["/api/admin/mcp/reference"];
const CLAUDE_DOCS = "https://claude.com/docs/connectors/custom/add-unlisted";
const OPENAI_DOCS = "https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt";

function CopyValue({ label, value }: { label: string; value: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast({ title: `${label} copied` });
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast({ title: "Could not copy", description: "Select and copy the value manually.", variant: "destructive" });
    }
  };
  return (
    <div className="flex min-w-0 items-stretch gap-2">
      <code className="min-w-0 flex-1 break-all rounded-md border border-border/80 bg-background/70 px-3 py-2.5 font-mono text-xs leading-5 text-foreground">{value || "Not available"}</code>
      <Button type="button" variant="outline" size="icon" aria-label={`Copy ${label}`} onClick={copy} disabled={!value} className="shrink-0">
        {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function LoadingState() {
  return <div className="space-y-5" aria-label="Loading MCP reference">
    <div className="h-28 animate-pulse rounded-xl bg-muted/70" />
    <div className="grid gap-5 lg:grid-cols-2"><div className="h-52 animate-pulse rounded-xl bg-muted/60" /><div className="h-52 animate-pulse rounded-xl bg-muted/50" /></div>
    <div className="h-72 animate-pulse rounded-xl bg-muted/50" />
  </div>;
}

function SectionHeading({ icon: Icon, eyebrow, title, description }: { icon: typeof Plug; eyebrow: string; title: string; description: string }) {
  return <div className="mb-5 flex items-start gap-3">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
    <div><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-primary">{eyebrow}</p><h2 className="mt-0.5 text-lg font-semibold tracking-tight">{title}</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p></div>
  </div>;
}

export default function AdminMcpServerPage() {
  const [search, setSearch] = useState("");
  const reference = useQuery<McpReference>({ queryKey: REFERENCE_KEY });
  const data = reference.data;
  const needle = search.trim().toLowerCase();
  const endpoints = useMemo(() => (data?.endpoints ?? []).filter((item) =>
    !needle || [item.method, item.path, item.category, item.access, item.description].some((part) => part.toLowerCase().includes(needle))
  ), [data?.endpoints, needle]);
  const tools = useMemo(() => (data?.tools ?? []).filter((item) =>
    !needle || [item.name, item.description, ...item.parameters.flatMap((parameter) => [parameter.name, parameter.description, parameter.required ? "required" : "optional"])].some((part) => part.toLowerCase().includes(needle))
  ), [data?.tools, needle]);

  const retry = () => { void reference.refetch(); };

  return (
    <div className="min-h-full bg-[hsl(42,35%,96%)] text-foreground dark:bg-background">
      <header className="border-b border-border/70 bg-card/70">
        <div className="mx-auto max-w-5xl px-4 py-7 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
            <LockKeyhole className="h-4 w-4 text-primary" /> Admin-only · FIA Toolkit
          </div>
          <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Connect your AI to FIA Toolkit</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Manage Projects and build Funnel Grid maps through your AI using your familiar Academy login. Use the same connection name and published address below. Existing connections must reconnect and approve Funnel Grid access before using the new tools.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={retry} disabled={reference.isFetching}><RefreshCw className={`h-4 w-4 ${reference.isFetching ? "animate-spin" : ""}`} /> Refresh reference</Button>
              <Button asChild><a href="/projects/ai"><ShieldCheck className="h-4 w-4" /> AI connections</a></Button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {reference.isError && <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" /><AlertTitle>Server reference unavailable</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3"><span>The reference could not be loaded. Nothing about member AI connections was changed.</span><Button size="sm" variant="outline" onClick={retry}><RefreshCw className="h-3.5 w-3.5" /> Try again</Button></AlertDescription>
        </Alert>}

        {reference.isLoading ? <LoadingState /> : (
          <>
            <section aria-label="FIA Toolkit connection details" className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="grid gap-4 sm:grid-cols-[0.7fr_1.3fr] sm:items-center">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Plug className="h-5 w-5" /></span>
                  <div className="min-w-0 flex-1"><p className="mb-1.5 text-xs font-medium text-muted-foreground">Copy this name</p><CopyValue label="Connection name" value="FIA Toolkit" /></div>
                </div>
                <div><p className="mb-1.5 text-xs font-medium text-muted-foreground">Published connection address</p><CopyValue label="Published production URL" value={data?.productionEndpoint ?? ""} /></div>
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">Copy the name and production URL, then choose instructions for your AI. Use your familiar Academy login when prompted.</p>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><Activity className="h-3.5 w-3.5" /> Choose the AI you already use</span>
                <span className="inline-flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5" /> Sign in through the Academy</span>
              </div>
            </section>

            <section aria-label="Provider setup instructions" className="space-y-3">
            <details className="group rounded-xl border border-border bg-card px-4 shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>Claude setup instructions</span><span aria-hidden="true" className="text-lg text-primary transition-transform group-open:rotate-45">＋</span>
              </summary>
              <div className="border-t py-5">
              <Card className="border-[hsl(39,24%,82%)] shadow-sm">
                <CardHeader><SectionHeading icon={BookOpen} eyebrow="Provider guide" title="Claude custom connector" description="For current Claude setup labels, use the official instructions linked below." /></CardHeader>
                <CardContent className="space-y-3 text-sm leading-6">
                  <ol className="list-inside list-decimal space-y-2 text-muted-foreground">
                    <li>Open <strong className="text-foreground">Customize → Connectors → Add custom connector</strong>.</li>
                    <li>Enter the name <strong className="text-foreground">FIA Toolkit</strong> and the published remote HTTPS connection URL above.</li>
                    <li>For authentication, choose <strong className="text-foreground">Sign in now</strong> or the equivalent OAuth sign-in option.</li>
                    <li>Choose OAuth client registration <strong className="text-foreground">Register automatically</strong> (dynamic client registration) when offered.</li>
                    <li>Complete Academy member login and consent. Team or Enterprise owners add the organization connector; members then select <strong className="text-foreground">Connect</strong>.</li>
                    <li>Enable the connector from a chat using <strong className="text-foreground">Connectors</strong>.</li>
                  </ol>
                  <Alert className="border-amber-700/20 bg-amber-500/[0.06]"><TriangleAlert className="h-4 w-4 text-amber-800" /><AlertTitle className="text-sm">Do not use Claude published identity</AlertTitle><AlertDescription className="text-xs leading-5">This server does not implement Claude’s published identity / CIMD. Do not select “Use Claude published identity.” Manual client ID and secret entry is not needed when automatic registration is available. Older interfaces may place Connectors under Settings or Advanced settings.</AlertDescription></Alert>
                  <a href={CLAUDE_DOCS} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-4">Official Claude custom connector guide <ExternalLink className="h-3 w-3" /></a>
                </CardContent>
              </Card>
              </div>
            </details>
            <details className="group rounded-xl border border-border bg-card px-4 shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>ChatGPT setup instructions</span><span aria-hidden="true" className="text-lg text-primary transition-transform group-open:rotate-45">＋</span>
              </summary>
              <div className="border-t py-5">
              <Card className="border-[hsl(39,24%,82%)] shadow-sm">
                <CardHeader><SectionHeading icon={Code2} eyebrow="Provider guide" title="ChatGPT developer mode" description="Workspace policy and account plan control whether custom connectors are available." /></CardHeader>
                <CardContent className="space-y-3 text-sm leading-6">
                  <ol className="list-inside list-decimal space-y-2 text-muted-foreground">
                    <li>In ChatGPT web, enable <strong className="text-foreground">Settings → Apps → Advanced settings → Developer mode</strong>, if available for the account.</li>
                    <li>For a workspace, an owner may need to enable Developer mode and custom MCP connectors under <strong className="text-foreground">Workspace settings → Permissions &amp; Roles</strong>.</li>
                    <li>Go to <strong className="text-foreground">Workspace settings → Apps → Create</strong>, or <strong className="text-foreground">Settings → Apps → Create</strong> for authorized individual accounts.</li>
                    <li>Name the app <strong className="text-foreground">FIA Toolkit</strong>, enter the published remote URL, select OAuth, and choose automatic registration if offered.</li>
                    <li>Scan tools, finish Academy login and consent, then select <strong className="text-foreground">Create</strong>. Use the app from chat tools or @mention it.</li>
                  </ol>
                  <Alert className="border-[hsl(39,24%,82%)] bg-muted/40"><Info className="h-4 w-4" /><AlertTitle className="text-sm">Availability varies</AlertTitle><AlertDescription className="text-xs leading-5">Full write support is documented in beta for Business, Enterprise, and Edu. Pro may be limited to read/fetch. UI, policy, and plan availability vary; do not assume access on every plan, including Plus. An admin refreshing or publishing an app to a ChatGPT workspace is separate from publishing this website.</AlertDescription></Alert>
                  <a href={OPENAI_DOCS} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-4">Official ChatGPT MCP guide <ExternalLink className="h-3 w-3" /></a>
                </CardContent>
              </Card>
              </div>
            </details>
            </section>

            <details className="group rounded-xl border border-border bg-card px-4 shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>Connection details and URL guidance</span><span aria-hidden="true" className="text-lg text-primary transition-transform group-open:rotate-45">＋</span>
              </summary>
              <div className="border-t pb-4 pt-4">
                <div className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Transport</p><p className="mt-1 font-medium">{data?.transport || "Not reported"}</p></div>
                  <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Authentication</p><p className="mt-1 font-medium">{data?.auth || "Not reported"}</p></div>
                  <div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Scope boundary</p><div className="mt-1 flex flex-wrap gap-1">{(data?.scopes ?? []).length ? data?.scopes.map((scope) => <Badge key={scope} variant="secondary" className="font-mono text-[10px]">{scope}</Badge>) : <span className="text-muted-foreground">Not reported</span>}</div></div>
                </div>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <SectionHeading icon={KeyRound} eyebrow="Keep the URLs distinct" title="Connection is not OAuth" description="Do not paste an OAuth, website, or API route into the custom connector URL field." />
                  <div className="space-y-3 text-sm leading-5">
                    <p><strong>Connector URL:</strong> the published value above. It is the MCP service address.</p>
                    <p><strong>OAuth and website routes:</strong> used behind the scenes for sign-in, consent, token exchange, and renewal. The client discovers and manages these automatically.</p>
                    <p className="text-xs leading-5 text-muted-foreground">A private development preview may not be reachable from an external AI provider. Publish the server version first, then configure the published URL.</p>
                  </div>
                </div>
              </div>
            </details>

            <details className="group rounded-xl border border-border bg-card px-4 shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>Permissions, safety, and member approvals</span><span aria-hidden="true" className="text-lg text-primary transition-transform group-open:rotate-45">＋</span>
              </summary>
              <div className="border-t py-5">
            <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
              <Card className="border-[hsl(39,24%,82%)] shadow-sm">
                <CardHeader><SectionHeading icon={ShieldCheck} eyebrow="Permissions and safety" title="Member consent sets the boundary" description="Projects and Funnel Grid have separate permissions. This admin reference page does not make the underlying MCP integration admin-only." /></CardHeader>
                <CardContent className="space-y-4 text-sm leading-5">
                  <div className="space-y-3">
                    <div className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FolderKanban className="h-4 w-4" /></span><p><strong>Changes are opt-in.</strong> Approve Projects editing and/or Funnel Grid reading and editing separately. Funnel Grid is personal-member access only, not shared Project Manager collaborator access. No other Toolkit features are exposed.</p></div>
                    <p><strong>Try a funnel prompt:</strong> “Build a webinar funnel with Facebook traffic, registration, a thank-you page, three reminder emails, a two-day delay, the webinar, a sales page, an order form, an upsell, and a note explaining the offer.” All 15 node types are supported. The assistant returns an editable map link; it does not publish pages or send messages.</p>
                    <div className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-700/10 text-emerald-800"><FileCheck2 className="h-4 w-4" /></span><p><strong>Ordinary edits</strong> execute with an approved write grant. <strong>Deletions</strong> show a preview and ask for your confirmation inside your AI app. Confirm there—no website visit is required. Requests expire after 10 minutes; changed content needs a fresh preview and confirmation.</p></div>
                    <div className="flex gap-3"><span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><RefreshCw className="h-4 w-4" /></span><p><strong>Credential renewal:</strong> access tokens last 15 minutes; rolling refresh credentials last 30 days. Compatible AI clients renew automatically.</p></div>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
                    <p><strong className="text-foreground">Operational limits.</strong> Retry a request with its <code className="font-mono">request_id</code> UUID; use the exact <code className="font-mono">expected_version</code> returned by the get tool. Keep notes plain text and subtasks one level deep.</p>
                    <p className="mt-2">File uploads are limited to 25 MB, or 512 KB when directly base64 encoded. Download links expire after 5 minutes.</p>
                  </div>
                  <Alert><LockKeyhole className="h-4 w-4" /><AlertTitle className="text-sm">Never share secrets in chat</AlertTitle><AlertDescription className="text-xs leading-5">Do not put passwords or API keys in prompts or headers. Sign in through the provider-managed OAuth flow. Confirm deletions in your AI conversation; the AI client controls its confirmation prompt. The server requires an explicit confirmation call but cannot independently verify how the client obtained your consent.</AlertDescription></Alert>
                  <Button asChild variant="outline" className="w-full sm:w-auto"><a href="/projects/ai"><ShieldCheck className="h-4 w-4" /> Manage AI connections <ArrowUpRight className="h-4 w-4" /></a></Button>
                </CardContent>
              </Card>

            </section>
              </div>
            </details>

            <details className="group rounded-xl border border-border bg-card px-4 shadow-sm">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>Compatibility testing, other clients, and troubleshooting</span><span aria-hidden="true" className="text-lg text-primary transition-transform group-open:rotate-45">＋</span>
              </summary>
              <div className="space-y-5 border-t py-5">
            <section className="grid gap-5">
              <Card className="border-[hsl(39,24%,82%)] shadow-sm">
                <CardHeader><SectionHeading icon={FileText} eyebrow="Verify before rollout" title="A short compatibility test" description="External AI compatibility has not yet been verified using live provider accounts. Run this checklist with a test member account." /></CardHeader>
                <CardContent>
                  <ol className="space-y-3 text-sm">
                    {[
                      ["1", "Connect with read-only scope", "Use the published URL and complete member login. Confirm the provider can list tools and read a project."],
                      ["2", "Create a disposable project", "Only after validating the read boundary, grant optional write access and ask the client to create a throwaway project."],
                      ["3", "Check the Academy site", "Confirm the disposable project appears and ordinary edits reflect correctly."],
                      ["4", "Request a deletion", "Ask the client to delete the test project. It should show a preview and ask for confirmation without sending you to the website."],
                      ["5", "Confirm in your AI app", "Confirm in the conversation or the app's approval prompt. The agent uses confirm_deletion to complete it, or cancel_deletion if you decline. Unanswered previews expire after 10 minutes."],
                    ].map(([number, title, text]) => <li key={number} className="flex gap-3 rounded-lg border bg-background/60 p-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">{number}</span><div><p className="font-medium">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div></li>)}
                  </ol>
                  <p className="mt-4 text-[11px] text-muted-foreground">Provider instructions last reviewed October 12, 2026. Labels and availability may change.</p>
                </CardContent>
              </Card>
            </section>
            <section className="rounded-xl border border-[hsl(39,24%,82%)] bg-[hsl(224,36%,16%)] p-5 text-[hsl(43,37%,95%)] sm:p-6">
              <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[hsl(43,68%,72%)]">Other MCP clients</p>
                  <h2 className="mt-2 text-xl font-semibold">Remote HTTP + OAuth</h2>
                  <p className="mt-2 text-sm leading-6 text-white/65">Use a client that supports remote Streamable HTTP, OAuth 2.0 with S256 PKCE, and dynamic client registration (DCR). Local-only stdio clients cannot connect directly to a URL.</p>
                  <div className="mt-4 flex flex-wrap gap-2">{["Streamable HTTP", "OAuth 2.0", "S256 PKCE", "DCR"].map((label) => <Badge key={label} className="border-white/15 bg-white/10 text-white/80 hover:bg-white/10">{label}</Badge>)}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/70">Troubleshooting</p>
                  <div className="divide-y divide-white/10 text-sm">
                    <p className="py-2.5"><strong>Can’t reach endpoint?</strong> Publish the server version and use its externally reachable production URL, not a private development preview.</p>
                    <p className="py-2.5"><strong>OAuth setup stalls?</strong> Choose automatic client registration and provider-managed sign-in. Browser clients handle OAuth endpoints; do not enter credentials into chat.</p>
                    <p className="py-2.5"><strong>Tool list looks stale?</strong> Refresh or rescan tools in the AI client after a server update. This page’s registry updates from the server; refresh this reference after future server changes.</p>
                    <p className="py-2.5"><strong>Connection or method check?</strong> A GET to <code className="font-mono text-[hsl(43,68%,72%)]">/mcp/agent</code> may return 405 normally; an unauthenticated POST may return 401.</p>
                    <p className="py-2.5"><strong>No write controls?</strong> Confirm member-approved write scope and provider plan/workspace policy. Provider support is not guaranteed on every account.</p>
                  </div>
                </div>
              </div>
            </section>
              </div>
            </details>

            <details className="group rounded-xl border border-border bg-card px-4 shadow-sm">
              <summary className="flex cursor-pointer items-center justify-between gap-4 py-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                <span>Live endpoint and tool registry</span><span aria-hidden="true" className="text-lg text-primary transition-transform group-open:rotate-45">＋</span>
              </summary>
              <section className="space-y-4 border-t py-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div><p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-primary">Live server registry</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Endpoints and tools</h2><p className="mt-1 text-sm text-muted-foreground">Search the complete published reference, including access, descriptions, and required or optional inputs.</p></div>
                <div className="relative w-full sm:max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search MCP endpoints and tools" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search paths, tools, inputs…" className="pl-9" /></div>
              </div>
              {!reference.isError && !data && <div className="rounded-xl border border-dashed bg-background/60 px-6 py-9 text-center"><ArrowDownToLine className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 font-medium">Reference data is not available yet</p><p className="mt-1 text-sm text-muted-foreground">Retry when the admin server reference endpoint is ready.</p><Button variant="outline" size="sm" className="mt-4" onClick={retry}>Retry loading reference</Button></div>}
              {data && <>
                <Card className="overflow-hidden border-[hsl(39,24%,82%)] shadow-sm">
                  <CardHeader className="border-b bg-muted/20 py-4"><CardTitle className="text-base">Website and OAuth endpoints <Badge variant="secondary" className="ml-2">{endpoints.length}</Badge></CardTitle><CardDescription>These registry routes are not the MCP connection URL. Provider-managed OAuth generally discovers and calls auth routes automatically.</CardDescription></CardHeader>
                  <CardContent className="p-0">
                    {endpoints.length ? <div className="divide-y">{endpoints.map((endpoint, index) => <div key={`${endpoint.method}-${endpoint.path}-${index}`} className="grid gap-2 px-4 py-4 md:grid-cols-[135px_minmax(0,1fr)] md:px-5">
                      <div className="flex flex-wrap items-start gap-2"><Badge variant={endpoint.method.toUpperCase() === "GET" ? "secondary" : "outline"} className="font-mono text-[10px]">{endpoint.method}</Badge><Badge variant="outline" className="text-[10px]">{endpoint.category}</Badge></div>
                      <div className="min-w-0"><code className="break-all font-mono text-xs font-semibold">{endpoint.path}</code><p className="mt-1 text-sm leading-5 text-muted-foreground">{endpoint.description}</p><p className="mt-2 text-[11px] text-muted-foreground">Access: <span className="font-medium text-foreground/80">{endpoint.access}</span></p></div>
                    </div>)}</div> : <div className="px-5 py-8 text-center text-sm text-muted-foreground">{needle ? "No endpoints match this search." : "No endpoint routes are currently reported."}</div>}
                  </CardContent>
                </Card>
                <Card className="overflow-hidden border-[hsl(39,24%,82%)] shadow-sm">
                  <CardHeader className="border-b bg-muted/20 py-4"><CardTitle className="text-base">MCP tools <Badge variant="secondary" className="ml-2">{tools.length}</Badge></CardTitle><CardDescription>Tool names, operation safety, and input names are read from the server registry, not maintained in this page.</CardDescription></CardHeader>
                  <CardContent className="p-0">
                    {tools.length ? <div className="divide-y">{tools.map((tool) => <details key={tool.name} className="group px-4 py-4 open:bg-muted/15 md:px-5">
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                        <div className="min-w-0"><code className="break-all font-mono text-sm font-semibold">{tool.name}</code><p className="mt-1 text-sm leading-5 text-muted-foreground">{tool.description}</p></div>
                        <div className="flex shrink-0 flex-wrap gap-1.5">{tool.write && <Badge variant="outline">Write</Badge>}{tool.destructive && <Badge className="bg-amber-700/10 text-amber-900 hover:bg-amber-700/10">Approval required</Badge>}<Badge variant="secondary">{tool.parameters.length} inputs</Badge></div>
                      </summary>
                      <div className="mt-4 rounded-lg border bg-background/75">
                        <div className="border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Input parameters</div>
                        {tool.parameters.length ? <div className="divide-y">{tool.parameters.map((parameter) => <div key={`${tool.name}-${parameter.name}`} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(120px,0.34fr)_minmax(0,1fr)] sm:gap-4"><div className="flex flex-wrap items-center gap-2"><code className="font-mono text-xs font-semibold">{parameter.name}</code><Badge variant={parameter.required ? "default" : "outline"} className="px-1.5 py-0 text-[9px]">{parameter.required ? "Required" : "Optional"}</Badge></div><p className="text-xs leading-5 text-muted-foreground">{parameter.description}</p></div>)}</div> : <p className="px-3 py-3 text-xs text-muted-foreground">No input parameters.</p>}
                      </div>
                    </details>)}</div> : <div className="px-5 py-8 text-center text-sm text-muted-foreground">{needle ? "No tools match this search." : "No MCP tools are currently reported."}</div>}
                  </CardContent>
                </Card>
              </>}
              </section>
            </details>

            <footer className="flex flex-col gap-2 border-t border-[hsl(39,24%,82%)] pt-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>Registry content is server-owned. After a server update, refresh the tool list in each AI client.</span>
              <a href="/projects/ai" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Manage connections and view request status <ArrowUpRight className="h-3.5 w-3.5" /></a>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
