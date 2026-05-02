import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldCheck, ShieldAlert, ShieldX, Shield, ExternalLink, RefreshCw,
  Loader2, AlertTriangle, CheckCircle2, XCircle, Globe, Lock, Mail,
  ArrowLeft, PlugZap, Unplug, Info, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

type DailyTrafficStat = {
  date: string;
  domainReputation: string | null;
  spamRate: number | null;
  spfSuccessRatio: number | null;
  dkimSuccessRatio: number | null;
  dmarcSuccessRatio: number | null;
  outboundEncryptionRatio: number | null;
  deliveryErrors: Array<{ errorType: string; errorClass: string; errorRatio: number }>;
};

type PostmasterDomainData = {
  id: string;
  domainName: string;
  latestReputation: string | null;
  latestSpamRate: number | null;
  latestSpfRatio: number | null;
  latestDkimRatio: number | null;
  latestDmarcRatio: number | null;
  latestEncryptionRatio: number | null;
  trafficStats: DailyTrafficStat[];
  lastFetchedAt: string | null;
};

type StatusResponse = {
  connected: boolean;
  connectedEmail?: string;
  lastSyncedAt?: string | null;
  domains: PostmasterDomainData[];
};

const REPUTATION_CONFIG: Record<string, { label: string; color: string; textColor: string; icon: typeof ShieldCheck; description: string }> = {
  HIGH: {
    label: "High",
    color: "bg-emerald-500/15 border-emerald-500/30",
    textColor: "text-emerald-600 dark:text-emerald-400",
    icon: ShieldCheck,
    description: "Gmail considers you a trusted sender. Your emails consistently land in the inbox.",
  },
  MEDIUM: {
    label: "Medium",
    color: "bg-amber-500/15 border-amber-500/30",
    textColor: "text-amber-600 dark:text-amber-400",
    icon: Shield,
    description: "Your reputation is acceptable but could be improved. Watch spam complaints closely.",
  },
  LOW: {
    label: "Low",
    color: "bg-orange-500/15 border-orange-500/30",
    textColor: "text-orange-600 dark:text-orange-400",
    icon: ShieldAlert,
    description: "Deliverability is at risk. High spam complaints or authentication failures detected.",
  },
  BAD: {
    label: "Bad",
    color: "bg-red-500/15 border-red-500/30",
    textColor: "text-red-600 dark:text-red-400",
    icon: ShieldX,
    description: "Gmail is actively filtering your emails. Immediate action is required.",
  },
};

function ReputationBadge({ reputation }: { reputation: string | null }) {
  if (!reputation || reputation === "REPUTATION_CATEGORY_UNSPECIFIED") {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted/40 border border-border w-fit">
        <Shield className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Insufficient data</span>
      </div>
    );
  }
  const cfg = REPUTATION_CONFIG[reputation] ?? REPUTATION_CONFIG.MEDIUM;
  const Icon = cfg.icon;
  return (
    <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border ${cfg.color} w-fit`}>
      <Icon className={`h-6 w-6 ${cfg.textColor}`} />
      <div>
        <p className={`text-lg font-bold ${cfg.textColor}`}>{cfg.label} Reputation</p>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-xs">{cfg.description}</p>
      </div>
    </div>
  );
}

function RatioBar({ label, value, icon: Icon }: { label: string; value: number | null; icon: typeof CheckCircle2 }) {
  const pct = value != null ? Math.round(value * 100) : null;
  const color = pct == null ? "bg-muted" : pct >= 95 ? "bg-emerald-500" : pct >= 80 ? "bg-amber-500" : "bg-red-500";
  const textColor = pct == null ? "text-muted-foreground" : pct >= 95 ? "text-emerald-600 dark:text-emerald-400" : pct >= 80 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${textColor}`} />
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <span className={`text-sm font-bold tabular-nums ${textColor}`}>
          {pct != null ? `${pct}%` : "—"}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: pct != null ? `${pct}%` : "0%" }}
        />
      </div>
    </div>
  );
}

function SpamRateChart({ stats }: { stats: DailyTrafficStat[] }) {
  const chartData = [...stats]
    .filter(s => s.spamRate !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({
      date: s.date.slice(5),
      rate: s.spamRate != null ? +(s.spamRate * 100).toFixed(4) : null,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-28 text-sm text-muted-foreground">
        No spam rate data available yet
      </div>
    );
  }

  const latest = chartData[chartData.length - 1]?.rate ?? 0;
  const prev = chartData[chartData.length - 2]?.rate ?? latest;
  const trend = latest < prev ? "down" : latest > prev ? "up" : "flat";
  const TrendIcon = trend === "down" ? TrendingDown : trend === "up" ? TrendingUp : Minus;
  const trendColor = trend === "down" ? "text-emerald-500" : trend === "up" ? "text-red-500" : "text-muted-foreground";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold tabular-nums">{latest.toFixed(3)}%</span>
        <TrendIcon className={`h-4 w-4 ${trendColor}`} />
        <span className="text-xs text-muted-foreground">spam complaint rate</span>
      </div>
      <div className="h-28">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 0, left: -32, bottom: 0 }}>
            <defs>
              <linearGradient id="spamGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip
              formatter={(v: number) => [`${v.toFixed(4)}%`, "Spam rate"]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Area type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} fill="url(#spamGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        Google recommends keeping spam complaints below 0.1%. Above 0.3% risks deliverability.
      </p>
    </div>
  );
}

function DomainDashboard({ domain, lastSyncedAt, onSync, isSyncing }: {
  domain: PostmasterDomainData;
  lastSyncedAt: string | null | undefined;
  onSync: () => void;
  isSyncing: boolean;
}) {
  const latestErrors = domain.trafficStats
    .flatMap(s => s.deliveryErrors)
    .filter(e => e.errorRatio > 0.01)
    .slice(0, 5);

  return (
    <div className="space-y-5">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ReputationBadge reputation={domain.latestReputation} />
        <div className="flex items-center gap-3">
          {lastSyncedAt && (
            <span className="text-xs text-muted-foreground">
              Updated {new Date(lastSyncedAt).toLocaleString()}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={onSync} disabled={isSyncing} data-testid="button-sync-postmaster">
            {isSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Refresh data
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Spam rate */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Spam Complaint Rate
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <SpamRateChart stats={domain.trafficStats} />
          </CardContent>
        </Card>

        {/* Authentication */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lock className="h-4 w-4 text-blue-500" />
              Authentication Pass Rates
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-4">
            <RatioBar label="SPF" value={domain.latestSpfRatio} icon={CheckCircle2} />
            <RatioBar label="DKIM" value={domain.latestDkimRatio} icon={CheckCircle2} />
            <RatioBar label="DMARC" value={domain.latestDmarcRatio} icon={CheckCircle2} />
            <Separator />
            <RatioBar label="Encryption (TLS)" value={domain.latestEncryptionRatio} icon={Lock} />
          </CardContent>
        </Card>
      </div>

      {/* Delivery errors */}
      {latestErrors.length > 0 && (
        <Card className="border-red-500/20">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
              <XCircle className="h-4 w-4" />
              Delivery Errors Detected
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-2">
            {latestErrors.map((e, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{e.errorType.replace(/_/g, " ")}</span>
                <Badge variant="outline" className="text-[10px] text-red-500 border-red-500/30">
                  {(e.errorRatio * 100).toFixed(1)}%
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* No data nudge */}
      {domain.trafficStats.length === 0 && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border">
          <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">No traffic data yet</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Google requires at least 200+ emails/day sent to Gmail recipients before data appears. Data is typically 24–48 hours delayed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SenderReputationPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedDomain, setSelectedDomain] = useState<string>("");

  const { data: status, isLoading } = useQuery<StatusResponse>({
    queryKey: ["/api/sender-reputation/status"],
    refetchInterval: false,
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sender-reputation/sync"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sender-reputation/status"] });
      toast({ title: "Data refreshed" });
    },
    onError: () => toast({ title: "Refresh failed", description: "Could not fetch data from Google. Try reconnecting.", variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/sender-reputation/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sender-reputation/status"] });
      toast({ title: "Disconnected from Google Postmaster" });
    },
    onError: () => toast({ title: "Failed to disconnect", variant: "destructive" }),
  });

  const activeDomain = status?.domains.find(d => d.domainName === selectedDomain) ?? status?.domains[0];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <button
            className="flex items-center gap-1.5 text-white/50 hover:text-white/80 text-xs mb-4 transition-colors"
            onClick={() => setLocation("/email-tools")}
            data-testid="link-back-email-tools"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Email Tools
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Sender Reputation</h1>
              <p className="text-white/50 text-xs mt-0.5">Google Postmaster Tools — domain health dashboard</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {!status?.connected ? (
          /* ── Not connected ───────────────────────────────────────────────── */
          <div className="max-w-xl mx-auto space-y-6">
            {/* Explainer */}
            <Card>
              <CardContent className="pt-6 pb-5 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <Globe className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Connect Google Postmaster Tools</p>
                    <p className="text-xs text-muted-foreground">Read-only access — we never send on your behalf</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Google Postmaster Tools gives you direct insight into how Gmail sees your sending domain — including your reputation score, spam complaint rate, and whether your SPF, DKIM, and DMARC are passing.
                </p>

                <Separator />

                {/* Steps */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Setup (one-time)</p>
                  <div className="space-y-2">
                    {[
                      {
                        n: 1,
                        title: "Verify your sending domain",
                        detail: "Go to postmaster.google.com, add your domain, and add the provided TXT record to your DNS. Takes about 5 minutes.",
                        link: "https://postmaster.google.com",
                      },
                      {
                        n: 2,
                        title: "Connect here with Google OAuth",
                        detail: "Click the button below to grant read-only access. We request only the Postmaster read scope — nothing else.",
                        link: null,
                      },
                    ].map(step => (
                      <div key={step.n} className="flex gap-3">
                        <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                          {step.n}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{step.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{step.detail}</p>
                          {step.link && (
                            <a href={step.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1">
                              Open Postmaster Tools <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  className="w-full"
                  onClick={() => { window.location.href = "/api/sender-reputation/connect"; }}
                  data-testid="button-connect-postmaster"
                >
                  <PlugZap className="h-4 w-4 mr-2" />
                  Connect Google Postmaster
                </Button>

                <p className="text-[11px] text-center text-muted-foreground">
                  Requires a Google account that has access to your Postmaster domain.
                </p>
              </CardContent>
            </Card>

            {/* Volume note */}
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-muted/40 border border-border">
              <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Google only shows data when your domain sends 200+ emails per day to Gmail users. Low-volume senders will see "Insufficient data" until they reach that threshold. Data is always 24–48 hours delayed.
              </p>
            </div>
          </div>
        ) : (
          /* ── Connected ───────────────────────────────────────────────────── */
          <div className="space-y-6">
            {/* Connection bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-muted/30 border border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Connected</p>
                  <p className="text-xs text-muted-foreground">{status.connectedEmail}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-red-500 text-xs"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                data-testid="button-disconnect-postmaster"
              >
                {disconnectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Unplug className="h-3.5 w-3.5 mr-1" />}
                Disconnect
              </Button>
            </div>

            {status.domains.length === 0 ? (
              /* No domains yet */
              <Card>
                <CardContent className="pt-8 pb-8 text-center space-y-3">
                  <Globe className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                  <div>
                    <p className="font-medium text-foreground">No verified domains found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      You need to verify your sending domain in Google Postmaster Tools first.
                    </p>
                  </div>
                  <a href="https://postmaster.google.com" target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm" className="mt-2">
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Open Postmaster Tools
                    </Button>
                  </a>
                  <p className="text-xs text-muted-foreground pt-1">
                    After verifying your domain there, click "Refresh data" to pull it in.
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                    {syncMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                    Refresh data
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Domain selector */}
                {status.domains.length > 1 && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <Select
                      value={selectedDomain || status.domains[0].domainName}
                      onValueChange={setSelectedDomain}
                    >
                      <SelectTrigger className="w-64" data-testid="select-domain">
                        <SelectValue placeholder="Select domain" />
                      </SelectTrigger>
                      <SelectContent>
                        {status.domains.map(d => (
                          <SelectItem key={d.domainName} value={d.domainName} data-testid={`option-domain-${d.domainName}`}>
                            {d.domainName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {activeDomain && (
                  <DomainDashboard
                    domain={activeDomain}
                    lastSyncedAt={status.lastSyncedAt}
                    onSync={() => syncMutation.mutate()}
                    isSyncing={syncMutation.isPending}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
