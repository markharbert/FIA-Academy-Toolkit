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
  Server, Wifi, Activity, ClipboardList, ChevronDown, ChevronUp,
  BadgeCheck, CircleAlert, CircleX, CircleDashed, Megaphone,
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

type FeedbackLoop = {
  id: string;
  spamRatio: number;
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
  feedbackLoops: FeedbackLoop[];
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

// ── Gmail Compliance ───────────────────────────────────────────────────────────

type ComplianceStatus = "pass" | "warning" | "fail" | "nodata" | "manual";

type ComplianceItem = {
  id: string;
  label: string;
  detail: string;
  status: ComplianceStatus;
  note: string;
  learnUrl?: string;
};

function buildComplianceItems(domain: PostmasterDomainData, filtered: DailyTrafficStat[]): ComplianceItem[] {
  const latest = [...filtered].sort((a, b) => b.date.localeCompare(a.date));

  const ratioStatus = (v: number | null): ComplianceStatus =>
    v == null ? "nodata" : v >= 0.95 ? "pass" : v >= 0.80 ? "warning" : "fail";

  const spamStatus = (v: number | null): ComplianceStatus =>
    v == null ? "nodata" : v < 0.001 ? "pass" : v < 0.003 ? "warning" : "fail";

  const spf = latest.find(s => s.spfSuccessRatio != null)?.spfSuccessRatio ?? null;
  const dkim = latest.find(s => s.dkimSuccessRatio != null)?.dkimSuccessRatio ?? null;
  const dmarc = latest.find(s => s.dmarcSuccessRatio != null)?.dmarcSuccessRatio ?? null;
  const spam = latest.find(s => s.spamRate != null)?.spamRate ?? null;
  const tls = latest.find(s => s.outboundEncryptionRatio != null)?.outboundEncryptionRatio ?? null;

  const hasPtrError = filtered.some(s =>
    s.deliveryErrors.some(e => e.errorType === "BAD_PTR_RECORD" && e.errorRatio > 0.001)
  );
  const ptrStatus: ComplianceStatus = filtered.length === 0 ? "nodata" : hasPtrError ? "warning" : "pass";

  const spfPct = spf != null ? Math.round(spf * 100) : null;
  const dkimPct = dkim != null ? Math.round(dkim * 100) : null;
  const dmarcPct = dmarc != null ? Math.round(dmarc * 100) : null;
  const tlsPct = tls != null ? Math.round(tls * 100) : null;

  return [
    {
      id: "spf",
      label: "SPF Authentication",
      detail: "All emails must pass SPF to prove they came from an authorised server.",
      status: ratioStatus(spf),
      note: spf == null ? "No data yet" : spfPct! >= 95 ? `${spfPct}% pass rate — excellent` : `${spfPct}% pass rate — below 95% target`,
      learnUrl: "https://support.google.com/mail/answer/81126#authentication",
    },
    {
      id: "dkim",
      label: "DKIM Signing",
      detail: "Every email must carry a valid DKIM signature. Required for bulk senders.",
      status: ratioStatus(dkim),
      note: dkim == null ? "No data yet" : dkimPct! >= 95 ? `${dkimPct}% pass rate — excellent` : `${dkimPct}% pass rate — below 95% target`,
      learnUrl: "https://support.google.com/mail/answer/81126#authentication",
    },
    {
      id: "dmarc",
      label: "DMARC Policy",
      detail: "A DMARC record must exist and emails must align with SPF or DKIM.",
      status: ratioStatus(dmarc),
      note: dmarc == null ? "No data yet" : dmarcPct! >= 95 ? `${dmarcPct}% pass rate — excellent` : `${dmarcPct}% pass rate — below 95% target`,
      learnUrl: "https://support.google.com/mail/answer/81126#authentication",
    },
    {
      id: "spam",
      label: "Spam Complaint Rate",
      detail: "Keep below 0.10%. Consistently over 0.30% will result in delivery being blocked.",
      status: spamStatus(spam),
      note: spam == null
        ? "No data yet — need 200+ emails/day to Gmail"
        : spam < 0.001 ? `${(spam * 100).toFixed(4)}% — well under 0.10% limit`
        : spam < 0.003 ? `${(spam * 100).toFixed(4)}% — approaching 0.10% warning threshold`
        : `${(spam * 100).toFixed(4)}% — above 0.30% critical limit`,
      learnUrl: "https://support.google.com/mail/answer/81126#spam-rate",
    },
    {
      id: "tls",
      label: "TLS Encryption",
      detail: "Emails should be delivered over an encrypted TLS connection.",
      status: tls == null ? "nodata" : tls >= 0.95 ? "pass" : "warning",
      note: tls == null ? "No data yet" : tlsPct! >= 95 ? `${tlsPct}% of sends encrypted — great` : `${tlsPct}% encrypted — some sends are unencrypted`,
      learnUrl: "https://support.google.com/mail/answer/81126#tls",
    },
    {
      id: "ptr",
      label: "Valid Reverse DNS (PTR)",
      detail: "Your sending IP must have a valid PTR record that resolves back to your domain.",
      status: ptrStatus,
      note: ptrStatus === "nodata" ? "No data yet" : ptrStatus === "pass" ? "No PTR issues detected in this period" : "PTR record errors detected — contact your email provider",
      learnUrl: "https://support.google.com/mail/answer/81126#requirements-for-all-senders",
    },
    {
      id: "unsubscribe",
      label: "One-Click Unsubscribe",
      detail: "All marketing emails must include a List-Unsubscribe-Post header and a visible unsubscribe link. Required for bulk senders (5 000+ emails/day to Gmail).",
      status: "manual",
      note: "Cannot be verified from Postmaster data — check your email platform settings.",
      learnUrl: "https://support.google.com/mail/answer/81126#one-click-unsubscribe",
    },
    {
      id: "headers",
      label: "Valid Message Headers",
      detail: "Every email must include valid From, To, Date, and Message-ID headers.",
      status: "manual",
      note: "Reputable ESPs (ActiveCampaign, Mailchimp, etc.) handle this automatically.",
      learnUrl: "https://support.google.com/mail/answer/81126#requirements-for-all-senders",
    },
    {
      id: "mixing",
      label: "Separate Email Streams",
      detail: "Marketing and transactional emails should be sent from different subdomains or IP pools. Mixing them risks your transactional delivery when spam rates rise.",
      status: "manual",
      note: "Use a separate subdomain (e.g. mail.yourdomain.com) for marketing sends.",
      learnUrl: "https://support.google.com/mail/answer/81126#format-requirements",
    },
  ];
}

const STATUS_CONFIG: Record<ComplianceStatus, {
  icon: typeof CheckCircle2;
  iconClass: string;
  badgeClass: string;
  badgeLabel: string;
}> = {
  pass: {
    icon: BadgeCheck,
    iconClass: "text-emerald-500",
    badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    badgeLabel: "Passing",
  },
  warning: {
    icon: CircleAlert,
    iconClass: "text-amber-500",
    badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
    badgeLabel: "Warning",
  },
  fail: {
    icon: CircleX,
    iconClass: "text-red-500",
    badgeClass: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
    badgeLabel: "Failing",
  },
  nodata: {
    icon: CircleDashed,
    iconClass: "text-muted-foreground",
    badgeClass: "bg-muted/50 text-muted-foreground border-border",
    badgeLabel: "No data",
  },
  manual: {
    icon: CircleDashed,
    iconClass: "text-muted-foreground",
    badgeClass: "bg-muted/50 text-muted-foreground border-border",
    badgeLabel: "Manual",
  },
};

function ComplianceSection({ domain, filtered }: { domain: PostmasterDomainData; filtered: DailyTrafficStat[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const items = useMemo(() => buildComplianceItems(domain, filtered), [domain, filtered]);

  const autoItems = items.filter(i => i.status !== "manual");
  const manualItems = items.filter(i => i.status === "manual");

  const passing = autoItems.filter(i => i.status === "pass").length;
  const failing = autoItems.filter(i => i.status === "fail").length;
  const warnings = autoItems.filter(i => i.status === "warning").length;

  // Aggregate feedback loops across all filtered days
  const feedbackMap: Record<string, { total: number; count: number }> = {};
  for (const s of filtered) {
    for (const f of (s.feedbackLoops ?? [])) {
      if (!feedbackMap[f.id]) feedbackMap[f.id] = { total: 0, count: 0 };
      feedbackMap[f.id].total += f.spamRatio;
      feedbackMap[f.id].count += 1;
    }
  }
  const feedbackLoops = Object.entries(feedbackMap)
    .map(([id, v]) => ({ id, avgSpamRatio: v.total / v.count }))
    .sort((a, b) => b.avgSpamRatio - a.avgSpamRatio);

  const toggle = (id: string) => setExpandedId(prev => prev === id ? null : id);

  const renderItem = (item: ComplianceItem, isManual: boolean) => {
    const cfg = STATUS_CONFIG[item.status];
    const Icon = cfg.icon;
    const isOpen = expandedId === item.id;

    return (
      <div key={item.id} className="border-b border-border last:border-0">
        <button
          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
          onClick={() => toggle(item.id)}
          data-testid={`compliance-item-${item.id}`}
        >
          <Icon className={`h-4 w-4 flex-shrink-0 ${cfg.iconClass}`} />
          <span className="flex-1 text-sm font-medium text-foreground">{item.label}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badgeClass} flex-shrink-0`}>
            {cfg.badgeLabel}
          </span>
          {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
        </button>
        {isOpen && (
          <div className="px-4 pb-4 pt-1 ml-7 space-y-2">
            <p className="text-xs text-muted-foreground leading-relaxed">{item.detail}</p>
            <p className={`text-xs font-medium ${item.status === "pass" ? "text-emerald-600 dark:text-emerald-400" : item.status === "fail" ? "text-red-600 dark:text-red-400" : item.status === "warning" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
              {item.note}
            </p>
            {item.learnUrl && (
              <a href={item.learnUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                Google's guidance <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3 pt-5 px-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-blue-500" />
              Gmail Compliance
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Google's Feb 2024 bulk sender requirements — verified against your live data
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {failing > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                {failing} failing
              </span>
            )}
            {warnings > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                {warnings} warning
              </span>
            )}
            {passing > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {passing} passing
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {/* Auto-verified */}
        <div className="px-5 pb-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Verified from your data
          </p>
        </div>
        <div className="divide-y-0">
          {autoItems.map(item => renderItem(item, false))}
        </div>

        <Separator className="my-1" />

        {/* Manual checks */}
        <div className="px-5 py-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Requires manual verification
          </p>
        </div>
        <div>
          {manualItems.map(item => renderItem(item, true))}
        </div>

        {/* Feedback Loops */}
        {feedbackLoops.length > 0 && (
          <>
            <Separator className="my-1" />
            <div className="px-5 py-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Megaphone className="h-3 w-3" />
                Spammy Campaign Signals
              </p>
            </div>
            <div className="px-5 pb-4 pt-1 space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                These campaign identifiers (from your email platform's feedback loop headers) had elevated spam complaint rates with Gmail over the selected period.
              </p>
              <div className="space-y-1.5 mt-2">
                {feedbackLoops.slice(0, 10).map(f => (
                  <div key={f.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/40 border border-border">
                    <span className="text-xs font-mono text-foreground truncate max-w-[70%]">{f.id}</span>
                    <span className={`text-xs font-bold tabular-nums ${f.avgSpamRatio >= 0.003 ? "text-red-600 dark:text-red-400" : f.avgSpamRatio >= 0.001 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
                      {(f.avgSpamRatio * 100).toFixed(3)}% spam rate
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className="px-5 py-3 border-t border-border bg-muted/20 rounded-b-xl">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Click any item above for details and how to fix it. Requirements apply to all senders; one-click unsubscribe and DMARC enforcement are required for senders of 5 000+ emails/day to Gmail.{" "}
            <a href="https://support.google.com/mail/answer/81126" target="_blank" rel="noopener noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-0.5">
              Full requirements <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Action Plan ────────────────────────────────────────────────────────────────

type ActionItem = {
  id: string;
  severity: "critical" | "warning" | "ok";
  title: string;
  what: string;
  steps: string[];
};

function buildActionPlan(domain: PostmasterDomainData, filtered: DailyTrafficStat[]): ActionItem[] {
  const items: ActionItem[] = [];
  const latest = [...filtered].sort((a, b) => b.date.localeCompare(a.date));

  // Domain reputation
  const rep = domain.latestReputation;
  if (rep === "BAD") {
    items.push({
      id: "rep-bad",
      severity: "critical",
      title: "Domain reputation is Bad",
      what: "Gmail is actively filtering or blocking your emails. This is the most serious issue and needs immediate attention.",
      steps: [
        "Stop all bulk email sending for 2–4 weeks to give Gmail's systems time to recover.",
        "Scrub your contact list — remove anyone who hasn't opened or clicked an email in the last 90 days.",
        "Contact your email platform's support team (ActiveCampaign, Mailchimp, etc.) and let them know about the reputation issue.",
        "After pausing, restart with very small sends of 50–100 emails per day to your most engaged contacts only.",
        "Add an easy one-click unsubscribe link and honor all requests within 24 hours.",
      ],
    });
  } else if (rep === "LOW") {
    items.push({
      id: "rep-low",
      severity: "warning",
      title: "Domain reputation is Low",
      what: "Your emails are at risk of landing in spam. Gmail has detected elevated complaint rates or authentication issues from your domain.",
      steps: [
        "Reduce your sending volume by 50% for the next 2 weeks.",
        "Only send to contacts who have opened or clicked an email in the last 90 days.",
        "Remove anyone who hasn't engaged in the past 6 months.",
        "Make sure your unsubscribe link is working, easy to find, and one-click.",
      ],
    });
  }

  // Spam rate
  const latestSpam = latest.find(s => s.spamRate != null)?.spamRate ?? null;
  if (latestSpam != null && latestSpam >= 0.003) {
    items.push({
      id: "spam-critical",
      severity: "critical",
      title: `Spam complaint rate is critically high (${(latestSpam * 100).toFixed(3)}%)`,
      what: "More than 0.3% of your Gmail recipients are marking your emails as spam. Gmail will block or heavily filter your emails at this level.",
      steps: [
        "Stop sending to unengaged contacts immediately.",
        "Only email people who opened or clicked something in the last 60 days.",
        "Add a one-click unsubscribe link near the top of every email — not just buried at the bottom.",
        "Remove any contacts you purchased or acquired from a third-party list — these are almost always the source of spam complaints.",
        "Send a re-permission email to your remaining list asking if they still want to hear from you, and remove non-responders.",
      ],
    });
  } else if (latestSpam != null && latestSpam >= 0.001) {
    items.push({
      id: "spam-warning",
      severity: "warning",
      title: `Spam complaint rate is elevated (${(latestSpam * 100).toFixed(3)}%)`,
      what: "Your spam rate is approaching Google's 0.1% warning threshold. Left unchecked, this will start hurting your inbox placement.",
      steps: [
        "Audit your contact list and remove anyone who hasn't engaged in 90+ days.",
        "Review your recent subject lines — avoid anything that feels misleading, overly salesy, or clickbait-y.",
        "Make sure your unsubscribe link is clearly visible and working correctly.",
        "Send a re-engagement campaign to inactive subscribers and permanently remove those who don't respond.",
      ],
    });
  }

  // SPF
  const latestSpf = latest.find(s => s.spfSuccessRatio != null)?.spfSuccessRatio ?? null;
  if (latestSpf != null && latestSpf < 0.80) {
    items.push({
      id: "spf-critical",
      severity: "critical",
      title: `SPF is failing for ${(100 - latestSpf * 100).toFixed(0)}% of emails`,
      what: "SPF tells Gmail which servers are authorized to send email from your domain. A large portion of your emails are coming from servers not listed in your SPF record, which looks suspicious to Gmail.",
      steps: [
        "Log in to your domain's DNS provider (GoDaddy, Namecheap, Cloudflare, etc.).",
        "Look for a TXT record starting with 'v=spf1'. If it's missing, you need to create one.",
        "Make sure every email service you use (your ESP, Gmail, any CRMs) is listed in that SPF record.",
        "Use the free SPF checker at mxtoolbox.com/spf to verify your record is valid and complete.",
        "DNS changes can take 24–48 hours to fully take effect.",
      ],
    });
  } else if (latestSpf != null && latestSpf < 0.95) {
    items.push({
      id: "spf-warning",
      severity: "warning",
      title: `SPF pass rate is below 95% (${(latestSpf * 100).toFixed(0)}%)`,
      what: "Most of your emails pass SPF, but some are still failing. This is often caused by a service that was recently added but not yet included in your SPF record.",
      steps: [
        "Check if you've recently started using a new email tool that isn't in your SPF record.",
        "Visit mxtoolbox.com/spf and compare your current record against all services you send from.",
        "Update your SPF record to include any missing services.",
      ],
    });
  }

  // DKIM
  const latestDkim = latest.find(s => s.dkimSuccessRatio != null)?.dkimSuccessRatio ?? null;
  if (latestDkim != null && latestDkim < 0.80) {
    items.push({
      id: "dkim-critical",
      severity: "critical",
      title: `DKIM signing is failing for ${(100 - latestDkim * 100).toFixed(0)}% of emails`,
      what: "DKIM is a digital signature that proves your emails are legitimate and haven't been tampered with. Most of your emails are going out unsigned, which seriously undermines Gmail's trust in you.",
      steps: [
        "Log in to each email platform you send from (ActiveCampaign, Mailchimp, etc.) and find 'DKIM' or 'Domain Authentication' in their settings.",
        "Follow the platform's setup guide to add the required DNS records (usually CNAME or TXT records).",
        "Send a test email to mail-tester.com to confirm DKIM is passing.",
        "If you're unsure, contact your email platform's support team — most have step-by-step guides for this.",
      ],
    });
  } else if (latestDkim != null && latestDkim < 0.95) {
    items.push({
      id: "dkim-warning",
      severity: "warning",
      title: `DKIM pass rate is below 95% (${(latestDkim * 100).toFixed(0)}%)`,
      what: "Most emails are signed correctly but some are failing. This can happen when emails are forwarded — forwarding often strips or breaks the DKIM signature.",
      steps: [
        "Check if any of your emails are being forwarded from another address, which can break the DKIM signature.",
        "Verify that DKIM is enabled in all email platforms you send from.",
        "Send a test via mail-tester.com to confirm DKIM is passing on your main sending domain.",
      ],
    });
  }

  // DMARC
  const latestDmarc = latest.find(s => s.dmarcSuccessRatio != null)?.dmarcSuccessRatio ?? null;
  if (latestDmarc != null && latestDmarc < 0.80) {
    items.push({
      id: "dmarc-critical",
      severity: "critical",
      title: `DMARC is failing for ${(100 - latestDmarc * 100).toFixed(0)}% of emails`,
      what: "DMARC ties together SPF and DKIM. When DMARC fails, Gmail cannot verify that your emails are actually from you. This is almost always caused by SPF or DKIM failures.",
      steps: [
        "Fix your SPF and DKIM issues first — correcting those will automatically improve your DMARC pass rate.",
        "Log in to your DNS provider and check for a TXT record starting with 'v=DMARC1'. If it's missing, add one.",
        "Start with a monitor-only policy: v=DMARC1; p=none; rua=mailto:you@yourdomain.com",
        "Check mxtoolbox.com/dmarc to verify your DMARC record is set up correctly.",
      ],
    });
  } else if (latestDmarc != null && latestDmarc < 0.95) {
    items.push({
      id: "dmarc-warning",
      severity: "warning",
      title: `DMARC pass rate is below 95% (${(latestDmarc * 100).toFixed(0)}%)`,
      what: "Most emails pass DMARC but some are still failing. This is usually a downstream effect of SPF or DKIM issues.",
      steps: [
        "Address any SPF or DKIM issues listed above — fixing those will improve DMARC automatically.",
        "Check that your DMARC policy isn't set to 'reject' while you're still working on authentication.",
      ],
    });
  }

  // IP reputation
  const latestIpStats = [...filtered].sort((a, b) => b.date.localeCompare(a.date))
    .find(s => s.ipReputations && s.ipReputations.length > 0);
  const badIps = latestIpStats?.ipReputations.filter(ip => ip.reputation === "BAD") ?? [];
  const lowIps = latestIpStats?.ipReputations.filter(ip => ip.reputation === "LOW") ?? [];

  if (badIps.length > 0) {
    items.push({
      id: "ip-bad",
      severity: "critical",
      title: "Sending IPs have Bad reputation with Gmail",
      what: "The IP addresses your emails are being sent from have been flagged by Gmail as bad actors. Emails from these IPs are likely being blocked or sent straight to spam.",
      steps: [
        "Contact your email service provider (ActiveCampaign, Mailchimp, SendGrid, etc.) and tell them your sending IPs have a BAD reputation in Google Postmaster Tools.",
        "Ask them to move your account to a different, cleaner IP address or IP pool.",
        "If you run your own email server, seriously consider switching to a reputable email service provider.",
        "Check if your sending IP is on any public blocklists at mxtoolbox.com/blacklists.",
      ],
    });
  } else if (lowIps.length > 0) {
    items.push({
      id: "ip-low",
      severity: "warning",
      title: "Some sending IPs have Low reputation",
      what: "A portion of your sending IPs have a lower reputation with Gmail, which may be causing some emails to land in spam folders.",
      steps: [
        "Contact your email service provider and mention that some sending IPs are showing LOW reputation in Google Postmaster Tools.",
        "Ask if they can move your account to a higher-reputation IP pool.",
        "Reducing your spam complaint rate and fixing authentication will help your IPs recover over time.",
      ],
    });
  }

  // Delivery errors
  const aggregated: Record<string, number> = {};
  for (const s of filtered) {
    for (const e of s.deliveryErrors) {
      aggregated[e.errorType] = (aggregated[e.errorType] ?? 0) + e.errorRatio;
    }
  }
  const hasSpamDetected = (aggregated["SPAM_DETECTED"] ?? 0) > 0;
  const hasRateLimit = (aggregated["RATE_LIMIT_EXCEEDED"] ?? 0) > 0;
  const hasIpRbl = (aggregated["IP_IN_RBL"] ?? 0) > 0;
  const hasDomainRbl = (aggregated["DOMAIN_IN_RBL"] ?? 0) > 0;
  const hasBadDmarc = (aggregated["BAD_DMARC_POLICY"] ?? 0) > 0;
  const hasBadPtr = (aggregated["BAD_PTR_RECORD"] ?? 0) > 0;

  if (hasSpamDetected) {
    items.push({
      id: "delivery-spam",
      severity: "critical",
      title: "Gmail is detecting spam in your email content",
      what: "Gmail's spam filters are flagging the actual content of your emails, not just complaints from recipients.",
      steps: [
        "Avoid spam trigger words in subject lines — things like 'FREE!!!', 'Act NOW', 'GUARANTEED', or 'Click here'.",
        "Don't use all-caps text or excessive exclamation points in your copy.",
        "Every email must have a clearly visible unsubscribe link.",
        "Avoid attaching files unless absolutely necessary.",
        "Test your email content at mail-tester.com before sending to your full list.",
      ],
    });
  }

  if (hasRateLimit) {
    items.push({
      id: "delivery-ratelimit",
      severity: "warning",
      title: "Gmail is rate-limiting your sending speed",
      what: "You're sending emails too fast and Gmail is throttling your delivery as a result.",
      steps: [
        "Spread your email sends over a longer window instead of blasting everyone at once.",
        "Work with your email provider to enable 'send time optimization' or scheduled batch sending.",
        "If you recently increased your list size, gradually warm up your sending volume rather than jumping straight to large sends.",
      ],
    });
  }

  if (hasIpRbl || hasDomainRbl) {
    items.push({
      id: "delivery-rbl",
      severity: "critical",
      title: `${hasIpRbl && hasDomainRbl ? "Sending IP and domain are" : hasIpRbl ? "Sending IP is" : "Domain is"} on a public blocklist`,
      what: "Your sending IP or domain has been added to a public email blocklist (RBL), which causes many email providers to automatically reject your emails.",
      steps: [
        "Go to mxtoolbox.com/blacklists and enter your domain or IP to see which blocklists you're on.",
        "Visit each blocklist's website and follow their removal or delisting process — most are free.",
        "You'll usually need to fix the underlying issue (spam complaints, open relay, etc.) before they'll delist you.",
        "Contact your email provider for help if the blocklisted IP is a shared one from your ESP.",
      ],
    });
  }

  if (hasBadPtr) {
    items.push({
      id: "delivery-ptr",
      severity: "warning",
      title: "Sending server PTR (reverse DNS) record issue",
      what: "Your sending server's reverse DNS record isn't configured correctly. Some email providers use this as a spam signal.",
      steps: [
        "If you use a shared email provider (ActiveCampaign, Mailchimp, etc.), contact their support — this is their infrastructure to fix.",
        "If you run your own email server, ask your hosting provider to set up a proper PTR record that matches your mail server's hostname.",
      ],
    });
  }

  if (hasBadDmarc) {
    items.push({
      id: "delivery-dmarc-policy",
      severity: "warning",
      title: "Emails being rejected due to DMARC policy",
      what: "Your DMARC policy is actively rejecting or quarantining emails that fail authentication, which is causing delivery failures.",
      steps: [
        "If you just set up DMARC, temporarily change the policy to 'p=none' so you can monitor without blocking emails.",
        "Fix your SPF and DKIM issues first so emails consistently pass authentication.",
        "Once authentication is consistently passing, you can safely enforce 'p=quarantine' and eventually 'p=reject'.",
      ],
    });
  }

  // All clear
  if (items.length === 0) {
    items.push({
      id: "all-good",
      severity: "ok",
      title: "Everything looks healthy",
      what: "All of your email health metrics are within good ranges. Here's how to keep it that way.",
      steps: [
        "Keep your spam complaint rate below 0.1% by regularly cleaning unengaged contacts from your list.",
        "Only send to people who have actively engaged in the past 90 days.",
        "Check this dashboard weekly so you catch any issues before they become serious.",
      ],
    });
  }

  return items;
}

function ActionPlanSection({ domain, filtered }: { domain: PostmasterDomainData; filtered: DailyTrafficStat[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const items = useMemo(() => buildActionPlan(domain, filtered), [domain, filtered]);

  const criticalItems = items.filter(i => i.severity === "critical");
  const warningItems = items.filter(i => i.severity === "warning");
  const okItems = items.filter(i => i.severity === "ok");

  const toggle = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderItem = (item: ActionItem) => {
    const isExpanded = expandedIds.has(item.id);
    const config = {
      critical: {
        badge: "bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30",
        dot: "bg-red-500",
        label: "Action Required",
        ring: "border-red-500/20",
      },
      warning: {
        badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30",
        dot: "bg-amber-500",
        label: "Needs Attention",
        ring: "border-amber-500/20",
      },
      ok: {
        badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30",
        dot: "bg-emerald-500",
        label: "Healthy",
        ring: "border-emerald-500/20",
      },
    }[item.severity];

    return (
      <div key={item.id} className={`rounded-xl border bg-card overflow-hidden ${config.ring}`}>
        <button
          className="w-full text-left px-5 py-4 flex items-start gap-3 hover:bg-muted/30 transition-colors"
          onClick={() => toggle(item.id)}
          data-testid={`action-item-${item.id}`}
        >
          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${config.dot}`} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${config.badge}`}>
                {config.label}
              </span>
            </div>
            <p className="text-sm font-semibold text-foreground leading-snug">{item.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.what}</p>
          </div>
          <div className="flex-shrink-0 text-muted-foreground mt-0.5">
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>

        {isExpanded && (
          <div className="px-5 pb-5 pt-1 border-t border-border bg-muted/20">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-3 mt-3">
              {item.severity === "ok" ? "Maintenance tips" : "Step-by-step fix"}
            </p>
            <ol className="space-y-2.5">
              {item.steps.map((step, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-background border border-border text-[10px] font-bold text-muted-foreground flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <p className="text-sm text-foreground leading-relaxed">{step}</p>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3 pt-5 px-5">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" />
          Action Plan
          {criticalItems.length > 0 && (
            <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/30">
              {criticalItems.length} critical
            </span>
          )}
          {warningItems.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
              {warningItems.length} warning
            </span>
          )}
          {criticalItems.length === 0 && warningItems.length === 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              All clear
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Click any item to see exactly what to do. Issues are based on your live data.
        </p>
      </CardHeader>
      <CardContent className="px-5 pb-5 space-y-2.5">
        {criticalItems.map(renderItem)}
        {warningItems.map(renderItem)}
        {okItems.map(renderItem)}
      </CardContent>
    </Card>
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

      {/* Compliance + Action Plan — always visible when there's any data at all */}
      {domain.trafficStats.length > 0 && (
        <>
          <ComplianceSection domain={domain} filtered={filtered.length > 0 ? filtered : domain.trafficStats} />
          <ActionPlanSection domain={domain} filtered={filtered.length > 0 ? filtered : domain.trafficStats} />
        </>
      )}

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
