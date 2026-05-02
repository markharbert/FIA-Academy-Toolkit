import { useState, useMemo } from "react";
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
  Server, Wifi, Activity,
} from "lucide-react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────────

type IpReputation = {
  reputation: string;
  numIps: number | null;
  ipCount: number | null;
  sampleIps: string[];
};

type DeliveryError = {
  errorType: string;
  errorClass: string;
  errorRatio: number;
};

type DailyTrafficStat = {
  date: string;
  domainReputation: string | null;
  spamRate: number | null;
  spamRateLow: number | null;
  spamRateHigh: number | null;
  spfSuccessRatio: number | null;
  dkimSuccessRatio: number | null;
  dmarcSuccessRatio: number | null;
  outboundEncryptionRatio: number | null;
  inboundEncryptionRatio: number | null;
  ipReputations: IpReputation[];
  deliveryErrors: DeliveryError[];
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

// ── Constants ──────────────────────────────────────────────────────────────────

const TIME_RANGES = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
  { label: "60 days", value: 60 },
  { label: "90 days", value: 90 },
  { label: "120 days", value: 120 },
  { label: "180 days", value: 180 },
];

const REPUTATION_CONFIG: Record<string, {
  label: string; color: string; textColor: string; bgColor: string;
  borderColor: string; icon: typeof ShieldCheck; description: string; score: number;
}> = {
  HIGH: {
    label: "High", score: 4,
    color: "emerald", textColor: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500/15", borderColor: "border-emerald-500/30",
    icon: ShieldCheck,
    description: "Gmail considers you a trusted sender. Emails consistently land in the inbox.",
  },
  MEDIUM: {
    label: "Medium", score: 3,
    color: "amber", textColor: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500/15", borderColor: "border-amber-500/30",
    icon: Shield,
    description: "Reputation is acceptable but could improve. Watch spam complaints closely.",
  },
  LOW: {
    label: "Low", score: 2,
    color: "orange", textColor: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-500/15", borderColor: "border-orange-500/30",
    icon: ShieldAlert,
    description: "Deliverability is at risk. High spam complaints or auth failures detected.",
  },
  BAD: {
    label: "Bad", score: 1,
    color: "red", textColor: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/15", borderColor: "border-red-500/30",
    icon: ShieldX,
    description: "Gmail is actively filtering your emails. Immediate action is required.",
  },
};

const REPUTATION_COLORS: Record<string, string> = {
  HIGH: "#10b981",
  MEDIUM: "#f59e0b",
  LOW: "#f97316",
  BAD: "#ef4444",
};

const ERROR_CLASS_LABELS: Record<string, string> = {
  PERMANENT_ERROR: "Permanent",
  TEMPORARY_ERROR: "Temporary",
};

const ERROR_TYPE_LABELS: Record<string, string> = {
  RATE_LIMIT_EXCEEDED: "Rate limit exceeded",
  SPAM_DETECTED: "Spam detected",
  BAD_ATTACHMENT: "Bad attachment",
  BAD_DMARC_POLICY: "Bad DMARC policy",
  LOW_IP_REPUTATION: "Low IP reputation",
  LOW_DOMAIN_REPUTATION: "Low domain reputation",
  IP_IN_RBL: "IP in RBL blocklist",
  DOMAIN_IN_RBL: "Domain in RBL blocklist",
  BAD_PTR_RECORD: "Bad PTR record",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function repScore(rep: string | null): number | null {
  if (!rep || rep === "REPUTATION_CATEGORY_UNSPECIFIED") return null;
  return REPUTATION_CONFIG[rep]?.score ?? null;
}

function repFromScore(score: number): string {
  return ["", "BAD", "LOW", "MEDIUM", "HIGH"][Math.round(score)] ?? "MEDIUM";
}

function pct(v: number | null, decimals = 1) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(decimals)}%`;
}

function filterByDays(stats: DailyTrafficStat[], days: number): DailyTrafficStat[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  return stats
    .filter(s => s.date >= cutoffStr)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function shortDate(dateStr: string) {
  return dateStr.slice(5); // MM-DD
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ReputationBadge({ reputation }: { reputation: string | null }) {
  if (!reputation || reputation === "REPUTATION_CATEGORY_UNSPECIFIED") {
    return (
      <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-muted/40 border border-border w-fit">
        <Shield className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-semibold text-muted-foreground">Insufficient data</p>
          <p className="text-[11px] text-muted-foreground/70">Need 200+ emails/day to Gmail</p>
        </div>
      </div>
    );
  }
  const cfg = REPUTATION_CONFIG[reputation] ?? REPUTATION_CONFIG.MEDIUM;
  const Icon = cfg.icon;
  return (
    <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border ${cfg.bgColor} ${cfg.borderColor} w-fit`}>
      <Icon className={`h-7 w-7 ${cfg.textColor}`} />
      <div>
        <p className={`text-xl font-bold ${cfg.textColor}`}>{cfg.label} Reputation</p>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">{cfg.description}</p>
      </div>
    </div>
  );
}

function StatCard({ label, value, sublabel, color }: { label: string; value: string; sublabel?: string; color: "emerald" | "amber" | "red" | "blue" | "muted" }) {
  const colors = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    red: "text-red-600 dark:text-red-400",
    blue: "text-blue-600 dark:text-blue-400",
    muted: "text-muted-foreground",
  };
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-0.5">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${colors[color]}`}>{value}</p>
      {sublabel && <p className="text-[11px] text-muted-foreground">{sublabel}</p>}
    </div>
  );
}

function RatioBar({ label, value }: { label: string; value: number | null }) {
  const p = value != null ? Math.round(value * 100) : null;
  const bar = p == null ? "bg-muted" : p >= 95 ? "bg-emerald-500" : p >= 80 ? "bg-amber-500" : "bg-red-500";
  const text = p == null ? "text-muted-foreground" : p >= 95 ? "text-emerald-600 dark:text-emerald-400" : p >= 80 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-sm text-foreground font-medium">{label}</span>
        <span className={`text-sm font-bold tabular-nums ${text}`}>{p != null ? `${p}%` : "—"}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${bar}`} style={{ width: p != null ? `${p}%` : "0%" }} />
      </div>
    </div>
  );
}

function SpamRateChart({ stats }: { stats: DailyTrafficStat[] }) {
  const hasRange = stats.some(s => s.spamRateLow != null && s.spamRateHigh != null);
  const data = stats
    .filter(s => s.spamRate != null || s.spamRateLow != null)
    .map(s => ({
      date: shortDate(s.date),
      rate: s.spamRate != null ? +(s.spamRate * 100).toFixed(5) : null,
      low: s.spamRateLow != null ? +(s.spamRateLow * 100).toFixed(5) : null,
      high: s.spamRateHigh != null ? +(s.spamRateHigh * 100).toFixed(5) : null,
    }));

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No spam rate data in this period</div>;
  }

  const latest = data[data.length - 1];
  const prev = data[data.length - 2];
  const latestRate = latest?.rate ?? latest?.low ?? 0;
  const prevRate = prev?.rate ?? prev?.low ?? latestRate;
  const trend = latestRate < prevRate ? "down" : latestRate > prevRate ? "up" : "flat";
  const TrendIcon = trend === "down" ? TrendingDown : trend === "up" ? TrendingUp : Minus;
  const trendColor = trend === "down" ? "text-emerald-500" : trend === "up" ? "text-red-500" : "text-muted-foreground";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold tabular-nums">{latestRate.toFixed(4)}%</span>
        <TrendIcon className={`h-4 w-4 ${trendColor}`} />
        {hasRange && <span className="text-xs text-muted-foreground">midpoint of reported range</span>}
      </div>
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="spamGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="rangeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip
              formatter={(v: number, name: string) => [`${v.toFixed(5)}%`, name === "rate" ? "Midpoint" : name === "low" ? "Low" : "High"]}
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
            />
            <ReferenceLine y={0.1} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1} label={{ value: "0.1% warning", position: "insideTopRight", fontSize: 9, fill: "#f59e0b" }} />
            <ReferenceLine y={0.3} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} label={{ value: "0.3% critical", position: "insideTopRight", fontSize: 9, fill: "#ef4444" }} />
            {hasRange && <Area type="monotone" dataKey="high" stroke="none" fill="url(#rangeGrad)" />}
            {hasRange && <Area type="monotone" dataKey="low" stroke="none" fill="white" fillOpacity={0.5} />}
            <Area type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} fill="url(#spamGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[11px] text-muted-foreground">Keep below 0.1%. Above 0.3% Gmail will start filtering your emails.</p>
    </div>
  );
}

function AuthChart({ stats }: { stats: DailyTrafficStat[] }) {
  const data = stats
    .filter(s => s.spfSuccessRatio != null || s.dkimSuccessRatio != null || s.dmarcSuccessRatio != null)
    .map(s => ({
      date: shortDate(s.date),
      SPF: s.spfSuccessRatio != null ? +(s.spfSuccessRatio * 100).toFixed(1) : null,
      DKIM: s.dkimSuccessRatio != null ? +(s.dkimSuccessRatio * 100).toFixed(1) : null,
      DMARC: s.dmarcSuccessRatio != null ? +(s.dmarcSuccessRatio * 100).toFixed(1) : null,
    }));

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No authentication data in this period</div>;
  }

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
          <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <ReferenceLine y={95} stroke="#10b981" strokeDasharray="3 2" strokeWidth={1} />
          <Line type="monotone" dataKey="SPF" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="DKIM" stroke="#8b5cf6" strokeWidth={2} dot={false} connectNulls />
          <Line type="monotone" dataKey="DMARC" stroke="#06b6d4" strokeWidth={2} dot={false} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function EncryptionChart({ stats }: { stats: DailyTrafficStat[] }) {
  const hasInbound = stats.some(s => s.inboundEncryptionRatio != null);
  const data = stats
    .filter(s => s.outboundEncryptionRatio != null || s.inboundEncryptionRatio != null)
    .map(s => ({
      date: shortDate(s.date),
      Outbound: s.outboundEncryptionRatio != null ? +(s.outboundEncryptionRatio * 100).toFixed(1) : null,
      ...(hasInbound ? { Inbound: s.inboundEncryptionRatio != null ? +(s.inboundEncryptionRatio * 100).toFixed(1) : null } : {}),
    }));

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No encryption data in this period</div>;
  }

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="outGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="inGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.2} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
          <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <Area type="monotone" dataKey="Outbound" stroke="#3b82f6" strokeWidth={2} fill="url(#outGrad)" dot={false} connectNulls />
          {hasInbound && <Area type="monotone" dataKey="Inbound" stroke="#8b5cf6" strokeWidth={2} fill="url(#inGrad)" dot={false} connectNulls />}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ReputationHistoryChart({ stats }: { stats: DailyTrafficStat[] }) {
  const data = stats
    .filter(s => s.domainReputation && s.domainReputation !== "REPUTATION_CATEGORY_UNSPECIFIED")
    .map(s => ({
      date: shortDate(s.date),
      score: repScore(s.domainReputation),
      reputation: s.domainReputation,
    }));

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No reputation history in this period</div>;
  }

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    const color = REPUTATION_COLORS[payload.reputation] ?? "#6b7280";
    return <circle cx={cx} cy={cy} r={3} fill={color} stroke="none" />;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const { date, reputation } = payload[0].payload;
    const cfg = REPUTATION_CONFIG[reputation];
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow">
        <p className="font-semibold text-foreground">{date}</p>
        {cfg && <p className={cfg.textColor}>{cfg.label} Reputation</p>}
      </div>
    );
  };

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis
            tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
            domain={[0.5, 4.5]} ticks={[1, 2, 3, 4]}
            tickFormatter={v => ["", "Bad", "Low", "Medium", "High"][Math.round(v)] ?? ""}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line type="stepAfter" dataKey="score" stroke="#10b981" strokeWidth={2} dot={<CustomDot />} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function IpReputationSection({ stats }: { stats: DailyTrafficStat[] }) {
  const latest = [...stats].sort((a, b) => b.date.localeCompare(a.date))
    .find(s => s.ipReputations && s.ipReputations.length > 0);

  if (!latest?.ipReputations?.length) {
    return (
      <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
        No IP reputation data available
      </div>
    );
  }

  const order = ["HIGH", "MEDIUM", "LOW", "BAD", "REPUTATION_CATEGORY_UNSPECIFIED"];
  const sorted = [...latest.ipReputations].sort((a, b) =>
    order.indexOf(a.reputation) - order.indexOf(b.reputation)
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">Based on most recent data ({shortDate(latest.date)})</p>
      <div className="space-y-2">
        {sorted.map((ip, i) => {
          const cfg = REPUTATION_CONFIG[ip.reputation];
          const count = ip.numIps ?? ip.ipCount ?? 0;
          const label = cfg?.label ?? "Unknown";
          const textColor = cfg?.textColor ?? "text-muted-foreground";
          const bgColor = cfg?.bgColor ?? "bg-muted/30";
          const borderColor = cfg?.borderColor ?? "border-border";
          return (
            <div key={i} className={`flex items-center justify-between px-4 py-2.5 rounded-lg border ${bgColor} ${borderColor}`}>
              <div className="flex items-center gap-2">
                <Server className={`h-3.5 w-3.5 ${textColor}`} />
                <span className={`text-sm font-semibold ${textColor}`}>{label}</span>
              </div>
              <div className="flex items-center gap-3 text-right">
                <span className="text-sm font-bold text-foreground tabular-nums">{count} IP{count !== 1 ? "s" : ""}</span>
                {ip.sampleIps?.length > 0 && (
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">
                    e.g. {ip.sampleIps.slice(0, 2).join(", ")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DeliveryErrorsSection({ stats }: { stats: DailyTrafficStat[] }) {
  const aggregated: Record<string, { errorType: string; errorClass: string; total: number; count: number }> = {};

  for (const s of stats) {
    for (const e of s.deliveryErrors) {
      const key = `${e.errorType}::${e.errorClass}`;
      if (!aggregated[key]) {
        aggregated[key] = { errorType: e.errorType, errorClass: e.errorClass, total: 0, count: 0 };
      }
      aggregated[key].total += e.errorRatio;
      aggregated[key].count += 1;
    }
  }

  const errors = Object.values(aggregated)
    .map(e => ({ ...e, avgRatio: e.total / e.count }))
    .filter(e => e.avgRatio > 0.001)
    .sort((a, b) => b.avgRatio - a.avgRatio);

  if (errors.length === 0) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" />
        No significant delivery errors in this period
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {errors.map((e, i) => {
        const label = ERROR_TYPE_LABELS[e.errorType] ?? e.errorType.replace(/_/g, " ").toLowerCase();
        const classLabel = ERROR_CLASS_LABELS[e.errorClass] ?? e.errorClass;
        const isPermament = e.errorClass === "PERMANENT_ERROR";
        return (
          <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
            <div>
              <p className="text-sm font-medium text-foreground capitalize">{label}</p>
              <p className="text-[11px] text-muted-foreground">{classLabel} · avg over period</p>
            </div>
            <Badge
              variant="outline"
              className={`text-xs tabular-nums ${isPermament ? "text-red-500 border-red-500/30" : "text-amber-500 border-amber-500/30"}`}
            >
              {(e.avgRatio * 100).toFixed(2)}%
            </Badge>
          </div>
        );
      })}
    </div>
  );
}

function DomainDashboard({ domain, lastSyncedAt, onSync, isSyncing }: {
  domain: PostmasterDomainData;
  lastSyncedAt: string | null | undefined;
  onSync: () => void;
  isSyncing: boolean;
}) {
  const [days, setDays] = useState(30);
  const filtered = useMemo(() => filterByDays(domain.trafficStats, days), [domain.trafficStats, days]);

  const latestFiltered = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  const latestSpam = latestFiltered.find(s => s.spamRate != null)?.spamRate ?? null;
  const latestSpf = latestFiltered.find(s => s.spfSuccessRatio != null)?.spfSuccessRatio ?? null;
  const latestDkim = latestFiltered.find(s => s.dkimSuccessRatio != null)?.dkimSuccessRatio ?? null;
  const latestDmarc = latestFiltered.find(s => s.dmarcSuccessRatio != null)?.dmarcSuccessRatio ?? null;
  const latestOutEnc = latestFiltered.find(s => s.outboundEncryptionRatio != null)?.outboundEncryptionRatio ?? null;
  const latestInEnc = latestFiltered.find(s => s.inboundEncryptionRatio != null)?.inboundEncryptionRatio ?? null;

  const spamColor = latestSpam == null ? "muted" : latestSpam < 0.001 ? "emerald" : latestSpam < 0.003 ? "amber" : "red";
  const authColor = (v: number | null) => v == null ? "muted" : v >= 0.95 ? "emerald" : v >= 0.80 ? "amber" : "red";

  return (
    <div className="space-y-6">
      {/* Top: reputation + controls */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <ReputationBadge reputation={domain.latestReputation} />
        <div className="flex flex-wrap items-center gap-2">
          <Select value={String(days)} onValueChange={v => setDays(Number(v))}>
            <SelectTrigger className="w-32 h-8 text-xs" data-testid="select-time-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIME_RANGES.map(r => (
                <SelectItem key={r.value} value={String(r.value)} className="text-xs">
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {lastSyncedAt && (
            <span className="text-xs text-muted-foreground">
              Updated {new Date(lastSyncedAt).toLocaleDateString()}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={onSync} disabled={isSyncing} data-testid="button-sync-postmaster" className="h-8 text-xs">
            {isSyncing ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Spam Rate" value={latestSpam != null ? `${(latestSpam * 100).toFixed(4)}%` : "—"} sublabel="user reported" color={spamColor as any} />
        <StatCard label="SPF" value={pct(latestSpf, 1)} sublabel="pass rate" color={authColor(latestSpf) as any} />
        <StatCard label="DKIM" value={pct(latestDkim, 1)} sublabel="pass rate" color={authColor(latestDkim) as any} />
        <StatCard label="DMARC" value={pct(latestDmarc, 1)} sublabel="pass rate" color={authColor(latestDmarc) as any} />
        <StatCard label="Outbound TLS" value={pct(latestOutEnc, 1)} sublabel="encrypted" color={authColor(latestOutEnc) as any} />
        <StatCard label="Inbound TLS" value={pct(latestInEnc, 1)} sublabel="encrypted" color={authColor(latestInEnc) as any} />
      </div>

      {filtered.length === 0 ? (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border">
          <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium">No data in this time range</p>
            <p className="text-xs text-muted-foreground mt-0.5">Try a wider range, or click Refresh to pull the latest data from Google.</p>
          </div>
        </div>
      ) : (
        <>
          {/* Charts — row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Spam Complaint Rate
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <SpamRateChart stats={filtered} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-500" />
                  Domain Reputation History
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <ReputationHistoryChart stats={filtered} />
              </CardContent>
            </Card>
          </div>

          {/* Charts — row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  Authentication Pass Rates
                  <span className="text-[10px] font-normal text-muted-foreground ml-1">SPF · DKIM · DMARC</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <RatioBar label="SPF" value={latestSpf} />
                  <RatioBar label="DKIM" value={latestDkim} />
                  <RatioBar label="DMARC" value={latestDmarc} />
                </div>
                <Separator />
                <AuthChart stats={filtered} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Lock className="h-4 w-4 text-blue-500" />
                  TLS Encryption
                  <span className="text-[10px] font-normal text-muted-foreground ml-1">Outbound · Inbound</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <RatioBar label="Outbound" value={latestOutEnc} />
                  <RatioBar label="Inbound" value={latestInEnc} />
                </div>
                <Separator />
                <EncryptionChart stats={filtered} />
              </CardContent>
            </Card>
          </div>

          {/* IP reputation + delivery errors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Server className="h-4 w-4 text-indigo-500" />
                  Sending IP Reputation
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <IpReputationSection stats={filtered} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  Delivery Errors
                  <span className="text-[10px] font-normal text-muted-foreground ml-1">avg over selected period</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <DeliveryErrorsSection stats={filtered} />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Data freshness note */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-muted/40 border border-border">
        <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Google Postmaster data is always 24–48 hours delayed. Spam rate and IP reputation data only appear when your domain sends 200+ emails per day to Gmail users. Click Refresh to pull the latest available data.
        </p>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

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
      toast({ title: "Data refreshed from Google Postmaster" });
    },
    onError: () => toast({
      title: "Refresh failed",
      description: "Could not fetch data from Google. Try disconnecting and reconnecting.",
      variant: "destructive",
    }),
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
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-8">
        <div className="max-w-6xl mx-auto">
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
              <p className="text-white/50 text-xs mt-0.5">Google Postmaster Tools — complete domain health dashboard</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {!status?.connected ? (
          /* ── Not connected ─────────────────────────────────────────────── */
          <div className="max-w-xl mx-auto space-y-6">
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
                  Google Postmaster Tools gives you direct insight into how Gmail sees your sending domain — reputation, spam complaint rate, IP health, authentication, and more.
                </p>
                <Separator />
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Setup (one-time)</p>
                  {[
                    { n: 1, title: "Verify your sending domain", detail: "Go to postmaster.google.com, add your domain, and add the TXT record to your DNS.", link: "https://postmaster.google.com" },
                    { n: 2, title: "Connect with Google OAuth", detail: "Click the button below to grant read-only access. We request only the Postmaster scope.", link: null },
                  ].map(step => (
                    <div key={step.n} className="flex gap-3">
                      <div className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{step.n}</div>
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
                <Button className="w-full" onClick={() => { window.location.href = "/api/sender-reputation/connect"; }} data-testid="button-connect-postmaster">
                  <PlugZap className="h-4 w-4 mr-2" />
                  Connect Google Postmaster
                </Button>
                <p className="text-[11px] text-center text-muted-foreground">
                  Requires a Google account that has access to your Postmaster domain.
                </p>
              </CardContent>
            </Card>
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-muted/40 border border-border">
              <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Google only shows data when your domain sends 200+ emails per day to Gmail users. Data is always 24–48 hours delayed.
              </p>
            </div>
          </div>
        ) : (
          /* ── Connected ─────────────────────────────────────────────────── */
          <div className="space-y-6">
            {/* Connection bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-muted/30 border border-border">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Connected to Google Postmaster</p>
                  <p className="text-xs text-muted-foreground">{status.connectedEmail}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {status.domains.length > 1 && (
                  <Select
                    value={selectedDomain || status.domains[0].domainName}
                    onValueChange={setSelectedDomain}
                  >
                    <SelectTrigger className="w-56 h-8 text-xs" data-testid="select-domain">
                      <Globe className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                      <SelectValue placeholder="Select domain" />
                    </SelectTrigger>
                    <SelectContent>
                      {status.domains.map(d => (
                        <SelectItem key={d.domainName} value={d.domainName} className="text-xs" data-testid={`option-domain-${d.domainName}`}>
                          {d.domainName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-red-500 text-xs h-8"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  data-testid="button-disconnect-postmaster"
                >
                  {disconnectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Unplug className="h-3.5 w-3.5 mr-1" />}
                  Disconnect
                </Button>
              </div>
            </div>

            {status.domains.length === 0 ? (
              <Card>
                <CardContent className="pt-8 pb-8 text-center space-y-3">
                  <Globe className="h-10 w-10 text-muted-foreground/40 mx-auto" />
                  <div>
                    <p className="font-medium text-foreground">No verified domains found</p>
                    <p className="text-sm text-muted-foreground mt-1">Verify your sending domain in Google Postmaster Tools first, then click Refresh.</p>
                  </div>
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <a href="https://postmaster.google.com" target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm"><ExternalLink className="h-3.5 w-3.5 mr-1.5" />Open Postmaster Tools</Button>
                    </a>
                    <Button size="sm" variant="secondary" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                      {syncMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                      Refresh data
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              activeDomain && (
                <DomainDashboard
                  domain={activeDomain}
                  lastSyncedAt={status.lastSyncedAt}
                  onSync={() => syncMutation.mutate()}
                  isSyncing={syncMutation.isPending}
                />
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
