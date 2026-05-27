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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ShieldCheck, ShieldAlert, ShieldX, Shield, ExternalLink, RefreshCw,
  Loader2, AlertTriangle, CheckCircle2, XCircle, Globe, Lock, Mail,
  ArrowLeft, PlugZap, Unplug, Info, TrendingUp, TrendingDown, Minus,
  Server, Wifi, Activity, ClipboardList, ChevronDown, ChevronUp,
  BadgeCheck, CircleAlert, CircleX, CircleDashed, Megaphone, Star,
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

function filterByDays(stats: DailyTrafficStat[] | null | undefined, days: number): DailyTrafficStat[] {
  if (!stats?.length) return [];
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

function parseFeedbackId(id: string): { listId: string; accountId: string; broadcastId: string; shortId: string } | null {
  const parts = id.split(":");
  if (parts.length >= 3) {
    return { listId: parts[0], accountId: parts[1], broadcastId: parts[2], shortId: parts[3] ?? "" };
  }
  return null;
}

const SPAM_REASONS = [
  {
    title: "They forgot who you are",
    detail: "If someone signed up a while ago and you haven't emailed them recently, they may not remember you. When your name pops up, they hit spam instead of bothering to unsubscribe.",
    fix: "Start every email with a quick reminder of who you are and why you're emailing them. Something like: 'Hey, it's Mark — you signed up when you downloaded [X].' Do this especially after any gap in sending.",
  },
  {
    title: "The unsubscribe button is too hard to find",
    detail: "When people want out and can't easily unsubscribe, they hit the spam button instead. That's the quickest way to make your emails stop. Every spam complaint counts against your reputation.",
    fix: "Put your unsubscribe link near the top of every email, not just buried at the bottom. Make it one click — never make people type their email address or jump through hoops. ClickFunnels includes this automatically, but make sure it's easy to see.",
  },
  {
    title: "Your emails don't match what people signed up for",
    detail: "Someone signed up to learn about one thing, but you're emailing them about something else. That bait-and-switch feeling makes people angry — and they hit spam.",
    fix: "Re-read the page or form where people originally signed up. What did you promise them? Make sure every email connects back to that promise. If your content focus has changed, send an email explaining the shift and give people an easy way to opt out.",
  },
  {
    title: "You're emailing people who stopped paying attention",
    detail: "If someone hasn't opened one of your emails in 6 months, they've moved on. Emailing them anyway increases your spam rate because they're more likely to report you than engage.",
    fix: "Every 90 days, move anyone who hasn't opened or clicked anything into an 'Inactive' segment. Run a short 2–3 email re-engagement sequence asking if they still want to hear from you. If they don't respond, stop emailing them. A smaller, engaged list always beats a big, unresponsive one.",
  },
  {
    title: "Your subject lines feel like clickbait or a sales pitch",
    detail: "Subject lines like 'You won't believe this...' or 'URGENT: Open now!!!' make people feel tricked when the email doesn't deliver. That frustration turns into spam complaints.",
    fix: "Write subject lines that are honest and specific about what's inside. 'The 3 steps I used to get my first client' gets fewer spam complaints than 'This changed everything.' People reward honesty with engagement — and punish tricks with the spam button.",
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function ReputationBadge({ reputation, dataDate }: { reputation: string | null; dataDate?: string | null }) {
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

  // If the data is older than 7 days, downgrade the visual severity for BAD/LOW so we
  // don't show an alarming red banner for a reputation state that may have already changed.
  const dataAgeDays = dataDate
    ? Math.floor((Date.now() - new Date(dataDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const isStale = dataDate != null && dataAgeDays > 7;
  const dateLabel = dataDate
    ? new Date(dataDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  // When stale, render BAD and LOW in neutral amber tones instead of red/orange alarms.
  const cfg = REPUTATION_CONFIG[reputation] ?? REPUTATION_CONFIG.MEDIUM;
  const staleCfg = REPUTATION_CONFIG.MEDIUM; // amber — neutral, not alarming
  const displayCfg = isStale && (reputation === "BAD" || reputation === "LOW") ? staleCfg : cfg;
  const Icon = displayCfg.icon;

  return (
    <div className={`flex items-center gap-3 px-5 py-3 rounded-xl border ${displayCfg.bgColor} ${displayCfg.borderColor} w-fit`}>
      <Icon className={`h-7 w-7 ${displayCfg.textColor}`} />
      <div>
        <p className={`text-xl font-bold ${displayCfg.textColor}`}>
          {cfg.label} Reputation{isStale ? " — Historical" : ""}
        </p>
        {isStale ? (
          <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">
            This was recorded on {dateLabel} ({dataAgeDays} days ago). Open Google Postmaster Tools to see your current status.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground mt-0.5 max-w-sm">{cfg.description}</p>
        )}
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

// Shared daily-readings table used below both spam charts
function SpamDailyTable({ data }: { data: Array<{ date: string; rate: number | null; low: number | null; high: number | null }> }) {
  if (data.length === 0) return null;
  const rows = [...data].reverse(); // most recent first
  return (
    <div className="mt-1">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
        Exact daily readings
      </p>
      <div className="max-h-44 overflow-y-auto rounded-lg border border-border text-xs">
        <table className="w-full">
          <thead className="sticky top-0 bg-muted/90 backdrop-blur-sm">
            <tr>
              <th className="text-left px-3 py-1.5 font-semibold text-muted-foreground">Date</th>
              <th className="text-right px-3 py-1.5 font-semibold text-muted-foreground">Spam Rate</th>
              <th className="text-right px-3 py-1.5 font-semibold text-muted-foreground hidden sm:table-cell">vs Threshold</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const val = row.rate ?? row.low ?? null;
              const sev = val == null ? null : val >= 0.3 ? "critical" : val >= 0.1 ? "warning" : "ok";
              const valColor = sev === "critical" ? "text-red-600 dark:text-red-400" : sev === "warning" ? "text-amber-600 dark:text-amber-400" : sev === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground";
              return (
                <tr key={i} className="border-t border-border hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-1.5 font-medium text-foreground">{row.date}</td>
                  <td className={`px-3 py-1.5 text-right font-bold tabular-nums ${valColor}`}>
                    {val != null ? `${val.toFixed(5)}%` : "—"}
                    {row.low != null && row.high != null && row.rate != null && row.low !== row.high && (
                      <span className="ml-1 font-normal text-muted-foreground text-[10px]">
                        ({row.low.toFixed(5)}–{row.high.toFixed(5)})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right hidden sm:table-cell">
                    {sev === "critical" && <span className="font-semibold text-red-600 dark:text-red-400">Above 0.30% — Critical</span>}
                    {sev === "warning" && <span className="font-semibold text-amber-600 dark:text-amber-400">Above 0.10% — Warning</span>}
                    {sev === "ok" && <span className="font-semibold text-emerald-600 dark:text-emerald-400">Below threshold — Good</span>}
                    {sev == null && <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SpamRateChart({ stats }: { stats: DailyTrafficStat[] }) {
  const hasRange = stats.some(s => s.spamRateLow != null && s.spamRateHigh != null);
  // Include ALL days so the X-axis spans the full selected period.
  // Days without spam data get null values — dots only appear where readings exist.
  const data = [...stats]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({
      date: shortDate(s.date),
      rate: s.spamRate != null ? +(s.spamRate * 100).toFixed(5) : null,
      low: s.spamRateLow != null ? +(s.spamRateLow * 100).toFixed(5) : null,
      high: s.spamRateHigh != null ? +(s.spamRateHigh * 100).toFixed(5) : null,
    }));

  const hasSpamData = data.some(d => d.rate != null || d.low != null);
  // Scale Y axis to actual data so low spam rates show variation instead of a flat line.
  const dataMax = hasSpamData ? Math.max(...data.map(d => Math.max(d.rate ?? 0, d.high ?? 0))) : 0;
  const yMax = dataMax < 0.05 ? Math.max(dataMax * 2.5, 0.005) : 0.4;

  if (!hasSpamData) {
    return <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No spam rate data in this period</div>;
  }

  // Trend uses only the days that actually have readings
  const withData = data.filter(d => d.rate != null || d.low != null);
  const latest = withData[withData.length - 1];
  const prev = withData[withData.length - 2];
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
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, yMax]} tickFormatter={v => `${v}%`} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                const val = d.rate ?? d.low ?? null;
                const sev = val == null ? null : val >= 0.3 ? "critical" : val >= 0.1 ? "warning" : "ok";
                const sevColor = sev === "critical" ? "#ef4444" : sev === "warning" ? "#f59e0b" : "#10b981";
                return (
                  <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow space-y-1">
                    <p className="font-bold text-foreground">{d.date}</p>
                    {val != null && <p style={{ color: sevColor }} className="font-bold tabular-nums text-sm">{val.toFixed(5)}%</p>}
                    {d.low != null && d.high != null && d.low !== d.high && (
                      <p className="text-muted-foreground">Range: {d.low.toFixed(5)}% – {d.high.toFixed(5)}%</p>
                    )}
                    {sev === "critical" && <p className="text-red-500 font-semibold">Above 0.30% critical limit</p>}
                    {sev === "warning" && <p className="text-amber-500 font-semibold">Above 0.10% warning line</p>}
                    {sev === "ok" && <p className="text-emerald-500">Below threshold — Good</p>}
                  </div>
                );
              }}
            />
            <ReferenceLine y={0.1} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1} ifOverflow="hidden" />
            <ReferenceLine y={0.3} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1} ifOverflow="hidden" />
            {hasRange && <Area type="monotone" dataKey="high" stroke="none" fill="url(#rangeGrad)" connectNulls />}
            {hasRange && <Area type="monotone" dataKey="low" stroke="none" fill="white" fillOpacity={0.5} connectNulls />}
            <Area type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} fill="url(#spamGrad)" dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 text-[11px]">
        <span className="flex items-center gap-1"><span className="inline-block w-6 border-t-2 border-dashed border-amber-400" /> 0.10% warning</span>
        <span className="flex items-center gap-1"><span className="inline-block w-6 border-t-2 border-dashed border-red-400" /> 0.30% critical</span>
      </div>
      <SpamDailyTable data={data.filter(d => d.rate != null || d.low != null)} />
    </div>
  );
}

function AuthChart({ stats }: { stats: DailyTrafficStat[] }) {
  // Include ALL days so the X-axis spans the full selected period.
  const data = [...stats]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({
      date: shortDate(s.date),
      SPF: s.spfSuccessRatio != null ? +(s.spfSuccessRatio * 100).toFixed(1) : null,
      DKIM: s.dkimSuccessRatio != null ? +(s.dkimSuccessRatio * 100).toFixed(1) : null,
      DMARC: s.dmarcSuccessRatio != null ? +(s.dmarcSuccessRatio * 100).toFixed(1) : null,
    }));

  const hasAuthData = data.some(d => d.SPF != null || d.DKIM != null || d.DMARC != null);

  if (!hasAuthData) {
    return <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No authentication data in this period</div>;
  }

  // Zoom in the Y axis so small dips from 100% are visible rather than a flat line at the top.
  const allValues = data.flatMap(d => [d.SPF, d.DKIM, d.DMARC].filter((v): v is number => v != null));
  const authMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const authDomainMin = Math.max(0, Math.min(authMin - 5, 85));

  return (
    <div className="h-44">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[authDomainMin, 100]} tickFormatter={v => `${v}%`} />
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


function ReputationHistoryChart({ stats }: { stats: DailyTrafficStat[] }) {
  // Include ALL days so the X-axis always spans the full selected period.
  // Days without a reputation value get score=null — the line breaks there rather
  // than the chart collapsing to only the handful of days that have readings.
  const data = [...stats]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => {
      const hasRep = s.domainReputation && s.domainReputation !== "REPUTATION_CATEGORY_UNSPECIFIED";
      return {
        date: shortDate(s.date),
        score: hasRep ? repScore(s.domainReputation) : null,
        reputation: s.domainReputation,
      };
    });

  const hasAnyReputation = data.some(d => d.score != null);

  if (!hasAnyReputation) {
    return <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No reputation history in this period</div>;
  }

  const CustomDot = (props: any) => {
    const { cx, cy, payload } = props;
    if (payload.score == null) return null;
    const color = REPUTATION_COLORS[payload.reputation] ?? "#6b7280";
    return <circle cx={cx} cy={cy} r={4} fill={color} stroke="none" />;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.[0]) return null;
    const { date, reputation, score } = payload[0].payload;
    if (score == null) return null;
    const cfg = REPUTATION_CONFIG[reputation];
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow">
        <p className="font-bold text-foreground">{date}</p>
        {cfg && <p className={`font-semibold ${cfg.textColor}`}>{cfg.label} Reputation</p>}
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
          <Line type="stepAfter" dataKey="score" stroke="#10b981" strokeWidth={2} dot={<CustomDot />} connectNulls={false} />
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
  const hasPtrError = filtered.some(s =>
    s.deliveryErrors.some(e => e.errorType === "BAD_PTR_RECORD" && e.errorRatio > 0.001)
  );
  const ptrStatus: ComplianceStatus = filtered.length === 0 ? "nodata" : hasPtrError ? "warning" : "pass";

  const spfPct = spf != null ? Math.round(spf * 100) : null;
  const dkimPct = dkim != null ? Math.round(dkim * 100) : null;
  const dmarcPct = dmarc != null ? Math.round(dmarc * 100) : null;

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
      // If Google is receiving and analyzing your emails (any traffic data present), your
      // message headers are valid by definition — Gmail rejects emails with missing headers
      // before they're even counted in Postmaster data.
      status: filtered.length > 0 ? "pass" : "nodata",
      note: filtered.length > 0
        ? "Gmail is receiving and processing your emails — message headers are valid"
        : "No data yet",
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
    iconClass: "text-blue-400",
    badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    badgeLabel: "Guideline",
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

        {/* Best practice guidelines */}
        <div className="px-5 py-1">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            Best practice checklist
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
  // Find the actual date the reputation data came from so we can gate on freshness.
  // We search all trafficStats (not just the time-filtered view) because latestReputation
  // is computed server-side from the full dataset.
  const allStats = domain.trafficStats;
  const repDataStat = [...allStats]
    .sort((a, b) => b.date.localeCompare(a.date))
    .find(s => s.domainReputation && s.domainReputation !== "REPUTATION_CATEGORY_UNSPECIFIED");
  const repDataDate = repDataStat?.date ?? null;
  const repDataAgeDays = repDataDate
    ? Math.floor((Date.now() - new Date(repDataDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  const repDataIsStale = repDataDate != null && repDataAgeDays > 7;
  const repDateLabel = repDataDate
    ? new Date(repDataDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : null;

  const rep = domain.latestReputation;
  if (rep === "BAD") {
    items.push({
      id: "rep-bad",
      severity: repDataIsStale ? "warning" : "critical",
      title: repDataIsStale
        ? `Your domain had a BAD reputation as of ${repDateLabel} — verify current status`
        : "Your domain has a BAD reputation with Gmail",
      what: repDataIsStale
        ? `Google Postmaster recorded a BAD domain reputation on ${repDateLabel} (${repDataAgeDays} days ago). This data may no longer reflect your current standing — Google's Postmaster Tools can take weeks to update, and your reputation may have already improved. Before taking any drastic action, log in to Google Postmaster Tools directly to confirm what your reputation shows today.`
        : "This is the most serious problem. Gmail is either blocking your emails or sending almost all of them straight to spam. Most of your subscribers are not seeing your messages at all right now. You need to stop and fix this before sending anything else.",
      steps: repDataIsStale ? [
        `Log in to Google Postmaster Tools (postmaster.google.com) and check the Domain Reputation graph for ${domain.domainName}. The data we have is from ${repDateLabel} — look at what it shows for recent days.`,
        "If Postmaster now shows MEDIUM or HIGH, your reputation has recovered. No emergency action needed — keep focusing on sending only to engaged contacts and keeping your spam complaint rate low.",
        "If Postmaster still shows BAD or LOW, then the situation is ongoing. In that case: stop sending bulk emails immediately, segment your list to keep only contacts who opened or clicked in the last 60 days, and contact your email platform's support about moving to a cleaner IP pool.",
        "Check your domain on MXToolbox (mxtoolbox.com → Blacklists). Type in your domain name to see if you are on any spam blocklists. If you are, follow each blocklist's removal instructions.",
      ] : [
        "Stop sending all bulk emails right now. Do not send any newsletters, broadcasts, or mass emails for at least 2 weeks. Sending more emails while your reputation is bad will make things worse.",
        "Log in to your email platform (like ActiveCampaign, Mailchimp, Keap, etc.) and export your full contact list.",
        "Create a new segment in your email platform called 'Inactive — 90 days' and move everyone who has not opened or clicked any email in the last 90 days into it. Stop sending your regular emails to this segment for now — you will use it for a re-engagement campaign later.",
        "Create a separate segment for any contacts you bought from a list or got from a third party. Do not send your regular emails to this group — purchased contacts are almost always the root cause of spam complaints and need a different approach before they can be emailed again.",
        "Call or chat with your email platform's support team. Tell them: 'My Google Postmaster Tools is showing BAD domain reputation. Can you help me get on a clean sending IP?' They deal with this regularly.",
        "After 2 weeks of not sending, restart very slowly. Send to only your 50–100 most engaged contacts first — people who have opened an email in the last 30 days.",
        "Add a clearly visible unsubscribe link near the top of every email, not just at the bottom. Make it one click. Never make people type their email to unsubscribe.",
        "Check your domain on the MXToolbox blacklist checker: go to mxtoolbox.com, click 'Blacklists', and type in your domain name. If you're listed, follow the removal instructions on each blocklist's website.",
        "After 4–6 weeks of sending only to highly engaged contacts, check this dashboard again. Your reputation should start improving.",
      ],
    });
  } else if (rep === "LOW") {
    items.push({
      id: "rep-low",
      severity: repDataIsStale ? "ok" : "warning",
      title: repDataIsStale
        ? `Your domain had a LOW reputation as of ${repDateLabel} — check current status`
        : "Your domain reputation is LOW — emails may be going to spam",
      what: repDataIsStale
        ? `Google Postmaster recorded a LOW domain reputation on ${repDateLabel} (${repDataAgeDays} days ago). Reputation data can take weeks to refresh, so your current standing may already be better. Check Postmaster directly before making any changes to your sending habits.`
        : "Gmail is suspicious of your emails right now. Some of your messages are probably landing in spam folders instead of the inbox. This is fixable, but you need to act now before it gets worse.",
      steps: repDataIsStale ? [
        `Log in to Google Postmaster Tools (postmaster.google.com) and look at the Domain Reputation graph for ${domain.domainName}. The data here is from ${repDateLabel} — see what the most recent days show.`,
        "If Postmaster now shows MEDIUM or HIGH, your reputation has improved. Stay disciplined: only email engaged contacts, keep your complaint rate low, and send on a consistent schedule.",
        "If Postmaster still shows LOW, reduce your sending volume by half for 2 weeks. Only email people who have opened or clicked something in the last 90 days, and check your unsubscribe link is easy to find.",
      ] : [
        "Cut your sending volume in half for the next 2 weeks. If you normally send to 10,000 people, only send to 5,000 — your most active ones.",
        "Only email people who have opened or clicked something you sent in the last 90 days. Skip everyone else for now.",
        "Create a segment in your email platform called 'Inactive — 6 months' and move anyone who has not engaged in 6 months or more into it. Exclude this segment from your regular sends for now. You can run a targeted re-engagement campaign for them later.",
        "Check that your unsubscribe link is easy to find and works with one click. Test it yourself right now.",
        "Look at your last 5 subject lines. Did any of them use words like FREE, URGENT, GUARANTEED, or lots of exclamation points? Those trigger spam filters — avoid them.",
        "Visit mail-tester.com and send a test email to the address they give you. They will show you a score and flag anything that might be causing spam issues.",
        "Keep checking this dashboard weekly. As long as you keep sending only to engaged contacts, your reputation will slowly improve.",
      ],
    });
  }

  // Spam rate
  const latestSpam = latest.find(s => s.spamRate != null)?.spamRate ?? null;
  // Feedback loop detection (for action plan item)
  const fbActionMap: Record<string, { total: number; count: number }> = {};
  for (const s of filtered) {
    for (const f of (s.feedbackLoops ?? [])) {
      if (!fbActionMap[f.id]) fbActionMap[f.id] = { total: 0, count: 0 };
      fbActionMap[f.id].total += f.spamRatio;
      fbActionMap[f.id].count += 1;
    }
  }
  const highFeedbackLoops = Object.entries(fbActionMap)
    .map(([id, v]) => ({ id, avg: v.total / v.count, parsed: parseFeedbackId(id) }))
    .filter(f => f.avg >= 0.001)
    .sort((a, b) => b.avg - a.avg);

  if (latestSpam != null && latestSpam >= 0.003) {
    items.push({
      id: "spam-critical",
      severity: "critical",
      title: `Too many people are marking your emails as spam (${(latestSpam * 100).toFixed(3)}%)`,
      what: "More than 3 out of every 1,000 Gmail users are hitting the spam button on your emails. Google's limit is 1 out of every 1,000. At this level, Gmail will start blocking your emails automatically. This needs to be fixed today.",
      steps: [
        "Stop sending bulk emails immediately. Every email you send right now makes the problem worse. Set a pause in ClickFunnels by deactivating your active broadcast sequences until you have cleaned your list.",
        "In ClickFunnels, go to Contacts → Segments and create a new segment called 'Active — Last 60 Days'. Set the filter to: opened any email OR clicked any link in the last 60 days. This is your safe sending list going forward. Do not email anyone outside this segment until your spam rate drops below 0.10%.",
        "Create a second segment called 'Purchased or Unverified Contacts' and move any contacts into it that came from a purchased list, a lead list from a third party, a giveaway, or a list swap. Stop emailing this group with your regular broadcasts — they never gave you permission and are the most likely source of your spam complaints.",
        "Check the Spam Intelligence tab on this page. If Google has identified specific campaign IDs with high complaint rates, go to ClickFunnels → Email → Broadcasts and search for those Broadcast IDs. Read those emails and ask yourself: did the subject line match what was inside? Did the content match what people signed up for?",
        "Look at your last 10 subject lines. Did any of them use words like FREE, URGENT, GUARANTEED, ACT NOW, or lots of exclamation points? Those trigger both Gmail's filters and reader frustration. Rewrite your next 5 emails with honest, specific subject lines that describe exactly what's inside.",
        "Make sure every email has a one-click unsubscribe link that is easy to see — put one near the top too, not just at the bottom. In ClickFunnels, check your email template and confirm the unsubscribe link is prominent. When people can easily opt out, they use the unsubscribe button instead of the spam button.",
        "Send a short re-permission email to your active 60-day segment saying something like: 'I want to make sure you still want to hear from me — click here to confirm you're in.' Move anyone who does not click within 7 days into an 'Unconfirmed' segment and stop regular broadcasts to them.",
        "After cleaning your list, wait one full week before resuming sends. Then go to mail-tester.com, send them a copy of your next email, and make sure your score is 8 out of 10 or higher before sending to your real list.",
        "Check this dashboard daily for the next 2 weeks. Your spam rate should start dropping within 3–5 days of cleaning your list. If it does not, the problem is in your email content — go back to step 5.",
      ],
    });
  } else if (latestSpam != null && latestSpam >= 0.001) {
    items.push({
      id: "spam-warning",
      severity: "warning",
      title: `Your spam complaint rate is getting close to Google's limit (${(latestSpam * 100).toFixed(3)}%)`,
      what: "Right now 1–3 out of every 1,000 Gmail recipients are marking your emails as spam. Google's warning threshold is 1 per 1,000. You have not crossed it yet, but you are getting close. If you do nothing, your inbox placement will start dropping.",
      steps: [
        "In ClickFunnels, go to Contacts → Segments and create a segment called 'Inactive — 90 Days' for anyone who has not opened or clicked anything in the last 90 days. Exclude this segment from your regular broadcasts immediately. You can run a dedicated re-engagement campaign for them later, but keep them out of your main sends for now.",
        "Check the Spam Intelligence tab on this page. If any specific campaigns are showing elevated complaint rates, click into those broadcasts in ClickFunnels (Email → Broadcasts → find by Broadcast ID). Look at who received it, what list it went to, and whether the subject line and content matched what people expected.",
        "Look at your last 5 subject lines. Were they honest and specific, or did they feel like clickbait? Gmail users hit spam when they feel tricked or deceived. Write subject lines that clearly tell people what is inside the email.",
        "Check that your unsubscribe link is easy to find. Open one of your own emails on your phone and see how hard it is to find the unsubscribe link. If it takes more than a few seconds to find, it is too hidden. When people cannot unsubscribe easily, they hit spam instead.",
        "In ClickFunnels, look at your broadcast analytics. Any email with an open rate below 15% is being sent to people who have tuned you out. Those are the people most likely to hit spam. Identify those contacts and move them to your inactive segment.",
        "Send a re-engagement email to your 90-day inactive segment: 'Still want to hear from me? Click here to stay on my list.' Anyone who does not click within 7 days goes into a 'Cold' segment — stop regular sends to them. They are not deleted, just paused.",
        "Visit mail-tester.com before your next broadcast. Send them a test copy of your email and check your score. If it is below 8 out of 10, fix the issues they flag before sending to your real list.",
      ],
    });
  }

  // Feedback loop action item
  if (highFeedbackLoops.length > 0) {
    const worst = highFeedbackLoops[0];
    const worstParsed = worst.parsed;
    items.push({
      id: "feedback-loops",
      severity: worst.avg >= 0.003 ? "critical" : "warning",
      title: `Google has identified ${highFeedbackLoops.length} specific campaign${highFeedbackLoops.length > 1 ? "s" : ""} with elevated spam complaints`,
      what: `This data comes from the Feedback-ID header that ClickFunnels automatically adds to your emails. Google matched complaints back to specific campaigns. ${worstParsed ? `The worst offender is Broadcast ID ${worstParsed.broadcastId} on List ${worstParsed.listId}, with a ${(worst.avg * 100).toFixed(3)}% spam rate.` : `The worst offender had a ${(worst.avg * 100).toFixed(3)}% spam rate.`} This is good news — it means the problem is not your whole domain, it is coming from specific sends you can identify and fix.`,
      steps: [
        `Log in to ClickFunnels and go to Email → Broadcasts. Search for the Broadcast ID "${worstParsed?.broadcastId ?? worst.id}". Open that broadcast and read it from start to finish.`,
        "Ask yourself these questions about that broadcast: Did the subject line honestly describe what was inside? Did the content match what people signed up for? Was it sent to a purchased list or an unverified list? Did it have a clear, easy-to-find unsubscribe link?",
        "Check the stats for that broadcast in ClickFunnels. What was the open rate? If it was below 15%, that means you were emailing people who had already checked out — they are the most likely to hit spam. What was the click rate? A click rate below 1% on a broadcast with spam complaints means the content was not what people expected.",
        `${worstParsed ? `Look at List ID ${worstParsed.listId} in ClickFunnels.` : "Look at the list this broadcast was sent to."} How did people get on this list? If they came from a lead magnet, a giveaway, a list swap, or a purchase — those contacts are far more likely to complain. Consider moving them to a separate segment and running a re-permission campaign before sending them regular content again.`,
        "For all the other high-complaint campaigns shown in the Spam Intelligence tab, repeat the same review process. Look for patterns: Is it always a certain type of subject line? A certain list? A certain topic? The pattern tells you what to change.",
        "After fixing the content and list hygiene issues, monitor your spam rate daily in this dashboard for the next 2 weeks. Campaign-specific feedback data should start improving within 3–5 days of your next clean send.",
      ],
    });
  }

  // SPF
  const latestSpf = latest.find(s => s.spfSuccessRatio != null)?.spfSuccessRatio ?? null;
  if (latestSpf != null && latestSpf < 0.80) {
    items.push({
      id: "spf-critical",
      severity: "critical",
      title: `SPF is failing — Gmail cannot verify ${(100 - latestSpf * 100).toFixed(0)}% of your emails`,
      what: "SPF is like an ID badge for your email. It tells Gmail: 'This email really did come from my domain.' Right now, most of your emails are missing that badge. Gmail treats emails without a valid SPF badge as suspicious, and many of them may be going to spam.",
      steps: [
        "Log in to wherever you bought your domain name — this is usually GoDaddy, Namecheap, Cloudflare, Google Domains, or Squarespace.",
        "Look for a section called 'DNS Settings', 'DNS Records', or 'Manage DNS'. Click on it.",
        "Look for a record of type 'TXT' that starts with 'v=spf1'. This is your SPF record.",
        "If you do NOT see one, you need to create one. Go to mxtoolbox.com/spf-survey and type in your domain. It will show you what services are sending email from your domain.",
        "If you DO see one, go to mxtoolbox.com/spf and paste your domain in. It will tell you if anything is missing.",
        "Your SPF record needs to include every email service you use — your main email platform (ActiveCampaign, Mailchimp, etc.), Gmail if you send from Gmail, and any CRM that sends emails for you.",
        "If you are not sure what to put in the record, contact the support team for your email platform. Tell them: 'I need to add you to my SPF record. What should I include?' They will give you the exact text.",
        "After you update the record, wait 24–48 hours for it to take effect, then come back to this dashboard and click Refresh.",
      ],
    });
  } else if (latestSpf != null && latestSpf < 0.95) {
    items.push({
      id: "spf-warning",
      severity: "warning",
      title: `SPF is failing for some emails (${(latestSpf * 100).toFixed(0)}% passing)`,
      what: "Most of your emails are passing SPF, but some are still failing. This usually means you recently started using a new email tool that is not listed in your SPF record yet.",
      steps: [
        "Think about whether you have recently started using a new email tool, CRM, or any service that sends emails on your behalf.",
        "Go to mxtoolbox.com/spf and type in your domain. It will show your current SPF record and flag any problems.",
        "Contact the support team for any new email service you use and ask: 'What do I need to add to my SPF record to authorize your service?' Copy what they give you.",
        "Log in to your domain's DNS settings and add the new entry to your existing SPF record.",
        "Wait 24–48 hours, then come back and click Refresh to see if it improved.",
      ],
    });
  }

  // DKIM
  const latestDkim = latest.find(s => s.dkimSuccessRatio != null)?.dkimSuccessRatio ?? null;
  if (latestDkim != null && latestDkim < 0.80) {
    items.push({
      id: "dkim-critical",
      severity: "critical",
      title: `DKIM signature is missing on ${(100 - latestDkim * 100).toFixed(0)}% of your emails`,
      what: "DKIM is like a wax seal on a letter — it proves the email actually came from you and was not changed along the way. Right now, most of your emails are going out without that seal. Gmail sees unsealed emails as risky and may send them to spam.",
      steps: [
        "Log in to your email platform (ActiveCampaign, Mailchimp, Keap, ConvertKit, etc.).",
        "Go to the account settings or sending settings and look for a section called 'DKIM', 'Domain Authentication', 'Custom Domain', or 'Sender Authentication'.",
        "Follow the instructions your platform gives you. They will ask you to add 1–2 records to your domain's DNS settings.",
        "Log in to your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.) and add those DNS records exactly as your email platform shows them.",
        "Go back to your email platform and click the button that says 'Verify' or 'Check DNS'. It should turn green.",
        "If you get stuck, contact your email platform's support and say: 'I need help setting up DKIM authentication for my domain. Can you walk me through it?' Most support teams will do this in a live chat.",
        "After setting it up, go to mail-tester.com, send them a test email, and check that DKIM shows as passing (green checkmark).",
        "Come back to this dashboard and click Refresh in 24–48 hours to confirm the improvement.",
      ],
    });
  } else if (latestDkim != null && latestDkim < 0.95) {
    items.push({
      id: "dkim-warning",
      severity: "warning",
      title: `DKIM is failing for some emails (${(latestDkim * 100).toFixed(0)}% passing)`,
      what: "Most of your emails have the DKIM signature, but some do not. This can happen when emails are forwarded, or if you are sending from a platform that has not been set up with DKIM yet.",
      steps: [
        "Check if any of your emails go through a forwarding address. Forwarding often breaks the DKIM signature. If so, try sending from the final address directly instead of forwarding.",
        "Log in to every email platform or tool you use to send emails. Check that DKIM authentication is turned on in each one.",
        "Go to mail-tester.com and send a test email. Look at the DKIM section of the report to see if it passes.",
        "If a platform is not set up, follow the DKIM setup instructions in their settings or contact their support team.",
      ],
    });
  }

  // DMARC
  const latestDmarc = latest.find(s => s.dmarcSuccessRatio != null)?.dmarcSuccessRatio ?? null;
  if (latestDmarc != null && latestDmarc < 0.80) {
    items.push({
      id: "dmarc-critical",
      severity: "critical",
      title: `DMARC is failing — Gmail cannot confirm ${(100 - latestDmarc * 100).toFixed(0)}% of your emails are real`,
      what: "DMARC is the final check Gmail uses to decide if your email is real or a fake. It uses both SPF and DKIM to make that decision. If those two checks fail, DMARC fails too. Right now, most of your emails are not passing this final check.",
      steps: [
        "Look at the SPF and DKIM items on this page first. Fixing those two things will automatically fix most of your DMARC problems.",
        "Once SPF and DKIM are working, log in to your domain's DNS settings and look for a TXT record that starts with 'v=DMARC1'.",
        "If you do not have a DMARC record at all, you need to create one. Start with this safe setting that just monitors without blocking anything: v=DMARC1; p=none; rua=mailto:youremail@yourdomain.com (replace the email address with your own).",
        "Go to mxtoolbox.com/dmarc and type in your domain. It will tell you if your DMARC record is set up correctly.",
        "If you are not sure what to do, contact your email platform's support and say: 'I need help setting up a DMARC record for my domain. My SPF and DKIM are set up but DMARC is still failing.'",
        "Wait 24–48 hours after making changes, then click Refresh on this dashboard.",
      ],
    });
  } else if (latestDmarc != null && latestDmarc < 0.95) {
    items.push({
      id: "dmarc-warning",
      severity: "warning",
      title: `DMARC is failing for some emails (${(latestDmarc * 100).toFixed(0)}% passing)`,
      what: "Most of your emails pass DMARC, but some do not. This is almost always caused by the same emails that are failing SPF or DKIM.",
      steps: [
        "Fix any SPF or DKIM issues listed on this page first. DMARC failures are usually just a side effect of those problems.",
        "Check your DMARC policy in your DNS settings. If it says 'p=reject' or 'p=quarantine', change it to 'p=none' temporarily while you are fixing the other issues.",
        "Go to mxtoolbox.com/dmarc and check that your DMARC record is correctly formatted.",
      ],
    });
  }

  // IP reputation
  // Note: Google's new Postmaster Tools UI no longer displays IP reputation, but the API
  // may still return historical records. We apply a 7-day recency gate so stale data does
  // not trigger alarming action items — old IP data reflects a past state, not the current one.
  const latestIpStats = [...filtered].sort((a, b) => b.date.localeCompare(a.date))
    .find(s => s.ipReputations && s.ipReputations.length > 0);

  if (latestIpStats) {
    const ipDataDate = new Date(latestIpStats.date);
    const ipDataAgeMs = Date.now() - ipDataDate.getTime();
    const ipDataAgeDays = Math.floor(ipDataAgeMs / (1000 * 60 * 60 * 24));
    const ipDataIsStale = ipDataAgeDays > 7;
    const ipDateLabel = ipDataDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const stalenessNote = ipDataIsStale
      ? ` Note: this data is from ${ipDateLabel} (${ipDataAgeDays} days ago) — Google's updated Postmaster Tools no longer shows live IP reputation, so this may not reflect your current standing.`
      : ` Data is from ${ipDateLabel}.`;

    // The Postmaster API always returns all four reputation buckets (BAD/LOW/MEDIUM/HIGH) as
    // placeholders, even when zero IPs are in that tier. We must check that a bucket actually
    // has IPs (ipCount > 0 or at least one sampleIp) before treating it as populated.
    const hasIps = (ip: IpReputation) => (ip.ipCount ?? 0) > 0 || (ip.sampleIps?.length ?? 0) > 0;
    const badIps = latestIpStats.ipReputations.filter(ip => ip.reputation === "BAD" && hasIps(ip));
    const lowIps = latestIpStats.ipReputations.filter(ip => ip.reputation === "LOW" && hasIps(ip));
    const mediumIps = latestIpStats.ipReputations.filter(ip => ip.reputation === "MEDIUM" && hasIps(ip));
    const highIps = latestIpStats.ipReputations.filter(ip => ip.reputation === "HIGH" && hasIps(ip));

    if (badIps.length > 0) {
      items.push({
        id: "ip-bad",
        severity: ipDataIsStale ? "warning" : "critical",
        title: ipDataIsStale
          ? `Some sending IPs had a BAD reputation as of ${ipDateLabel} — verify current status`
          : `${badIps.length === 1 ? "A group of" : "Some"} sending IP${badIps.length > 1 ? "s" : ""} ${badIps.length > 1 ? "have" : "has"} a BAD reputation`,
        what: `Think of an IP address like a return address on an envelope. ${ipDataIsStale ? `As of ${ipDateLabel}, some` : "Some of"} your emails were being sent from addresses that Gmail had flagged as coming from spammers. Gmail automatically rejects or sends those emails to spam — even if your content is fine. This is usually your email platform's problem, not something you did wrong.${stalenessNote}`,
        steps: ipDataIsStale ? [
          `Log in to Google Postmaster Tools (postmaster.google.com) and check the IP Reputation section for your domain. Compare what you see there today with this historical data from ${ipDateLabel}.`,
          "If the current Postmaster view shows MEDIUM or HIGH, your IP reputation has already improved. No immediate action needed — keep monitoring.",
          "If Postmaster still shows LOW or BAD for IP reputation, contact your email platform's support team. Tell them: 'Google Postmaster Tools is showing a bad IP reputation for my sending IPs. I need to be moved to a cleaner IP pool.'",
          "Ask your platform if they offer a dedicated IP address. With a dedicated IP, only your emails use that address — no one else can affect your reputation.",
        ] : [
          "Contact your email platform's support team (ActiveCampaign, Mailchimp, SendGrid, Keap, etc.) right now. Use live chat if they have it.",
          "Tell them exactly this: 'Google Postmaster Tools is showing a BAD IP reputation for my sending IPs. I need to be moved to a different IP address or a dedicated IP pool.'",
          "If they cannot help you, ask if you can upgrade to a dedicated IP address. With a dedicated IP, only your emails use that address — no one else can hurt your reputation.",
          "While you wait for that to be fixed, go to mxtoolbox.com and click 'Blacklists'. Enter your domain name and see if you are listed on any public spam databases. If you are, visit each blocklist website and request removal.",
          "If your email platform refuses to help, consider switching to a different provider. Your sending reputation depends on the quality of their infrastructure.",
        ],
      });
    } else if (lowIps.length > 0) {
      items.push({
        id: "ip-low",
        severity: ipDataIsStale ? "ok" : "warning",
        title: ipDataIsStale
          ? `Some sending IPs had a LOW reputation as of ${ipDateLabel} — may have improved`
          : "Some of your sending IPs have a LOW reputation",
        what: `Some of the IP addresses your emails go out from have a lower reputation with Gmail. This can cause some emails to land in spam instead of the inbox. This is likely your email platform's shared IP pool having some bad senders on it.${stalenessNote}`,
        steps: ipDataIsStale ? [
          `Check Google Postmaster Tools (postmaster.google.com) directly to see the current IP reputation status. This data is from ${ipDateLabel} and may no longer reflect your current state.`,
          "If current Postmaster shows MEDIUM or better, your reputation has improved — no action needed beyond keeping your spam complaint rate low.",
          "If it still shows LOW, contact your email platform's support and ask to be moved to a cleaner IP pool.",
        ] : [
          "Contact your email platform's support team. Tell them: 'Some of my sending IPs are showing LOW reputation in Google Postmaster Tools. Can you move me to a cleaner IP pool?'",
          "Ask if they offer dedicated IP addresses. A dedicated IP means your reputation is entirely in your own hands.",
          "In the meantime, focus on getting your spam complaint rate as low as possible. As your complaints go down, your IP reputation will naturally improve over time.",
        ],
      });
    } else if (mediumIps.length > 0 && highIps.length === 0) {
      items.push({
        id: "ip-medium",
        severity: "ok",
        title: `Your sending IPs have a MEDIUM reputation with Gmail${ipDataIsStale ? ` (as of ${ipDateLabel})` : ""}`,
        what: `A medium IP reputation means Gmail recognizes your sending addresses but has not fully established trust with them yet. Your emails are likely reaching the inbox for most subscribers, though a small number may land in spam. This is normal for shared IP pools and will improve as you build a consistent sending history with low complaint rates.${stalenessNote}`,
        steps: [
          "Keep your spam complaint rate below 0.10% — this is the single most important factor for improving IP reputation.",
          "Send consistently. Erratic sending patterns (big spikes followed by long silences) signal spammer behavior. A regular schedule builds trust.",
          "Only email engaged contacts. Anyone who has not opened or clicked in the last 90 days is dragging down your engagement metrics and increasing your risk of complaints.",
          "A medium reputation is not an emergency — it is a sign to stay disciplined. Monitor this dashboard monthly and watch for any movement toward LOW.",
        ],
      });
    }
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
      title: "Gmail is flagging your email content as spam",
      what: "This is different from people hitting the spam button — Gmail's own filters are reading your emails and deciding they look like spam before anyone even sees them. This is about the words and formatting inside your emails.",
      steps: [
        "Read your last 3 emails out loud. Do they sound like an advertisement or a used car sales pitch? If yes, that is the problem. Write emails that sound like a real person talking to another real person.",
        "Remove these types of words and phrases from your subject lines and email body: FREE, ACT NOW, URGENT, GUARANTEED, CLICK HERE, LIMITED TIME, EARN MONEY, WINNER, CONGRATULATIONS.",
        "Do not write in ALL CAPS anywhere in your email. Do not use more than one exclamation point per email.",
        "Make sure every email has an unsubscribe link that is clearly visible. Gmail penalizes emails that hide or remove the unsubscribe option.",
        "Do not attach files to mass emails. Attachments are a major spam signal.",
        "Do not use lots of different fonts, colors, or giant images. Simple, plain-text-style emails get better delivery than flashy HTML ones.",
        "Go to mail-tester.com and send them a copy of your next email before you send it to your list. They will grade it and tell you exactly what to fix.",
      ],
    });
  }

  if (hasRateLimit) {
    items.push({
      id: "delivery-ratelimit",
      severity: "warning",
      title: "Gmail is slowing down your emails because you are sending too fast",
      what: "Imagine trying to pour a whole bucket of water through a small funnel all at once — it overflows. That is what is happening with your emails. You are sending too many too quickly, and Gmail is putting the brakes on. Some emails are being delayed or not delivered at all.",
      steps: [
        "Log in to your email platform and look for a setting called 'sending schedule', 'throttle', 'batch sending', or 'send window'. Turn on a slower, more spread-out sending schedule.",
        "Instead of sending your entire list at 9am all at once, spread it out over 4–6 hours or even the whole day.",
        "If you recently added a lot of new contacts to your list, do not email them all at once. Start with small groups and increase the number slowly over several weeks. This is called 'warming up' your list.",
        "Contact your email platform's support and ask: 'How do I set up rate limiting or throttled sending so I do not get blocked by Gmail?' They can guide you through the settings.",
      ],
    });
  }

  if (hasIpRbl || hasDomainRbl) {
    items.push({
      id: "delivery-rbl",
      severity: "critical",
      title: `Your ${hasIpRbl && hasDomainRbl ? "sending IP and domain are" : hasIpRbl ? "sending IP is" : "domain is"} on a public spam blocklist`,
      what: "There are public lists that email providers around the world use to automatically block emails from known spammers. Your domain or IP address has ended up on one of these lists. This means some email providers are automatically rejecting your emails before they are even checked.",
      steps: [
        "Go to mxtoolbox.com in your browser. Click the big 'Blacklists' button at the top.",
        "Type in your domain name (like yourdomain.com) and hit enter. Wait a few seconds while it checks 100+ blocklists.",
        "Look at the results. Any row highlighted in red means you are on that blocklist.",
        "For each red result, click the name of the blocklist. It will take you to that blocklist's website.",
        "Look for a button that says 'Request Removal', 'Delist', or 'Submit Removal Request'. Fill out their form.",
        "Most blocklists will ask you to confirm that you have fixed the problem that got you listed. Before submitting, make sure your spam complaint rate is going down and your email content is clean.",
        "Some blocklists charge a fee for faster removal. You do not have to pay — the free removal usually happens within 1–3 days.",
        "If your email platform's shared IP is blacklisted (not just your domain), contact their support team. It is their IP and they need to fix it.",
        "After removal, come back in 48 hours and run the blacklist check again to confirm you are off all of them.",
      ],
    });
  }

  if (hasBadPtr) {
    items.push({
      id: "delivery-ptr",
      severity: "warning",
      title: "Your email server's reverse address lookup is not set up correctly",
      what: "When Gmail receives an email from you, it looks up the sending server's address to verify it is legitimate. Right now, that lookup is not working correctly. It is like sending a letter with a return address that does not match any real building — it looks suspicious.",
      steps: [
        "If you use a shared email platform like ActiveCampaign, Mailchimp, or Keap, this is their problem to fix, not yours. Contact their support team and say: 'Google Postmaster Tools is showing a BAD_PTR_RECORD error for my sending domain. Can you fix the PTR record on your sending servers?'",
        "If you run your own email server (most people do not), you need to contact your hosting company (like DigitalOcean, Linode, AWS, etc.) and ask them to set a reverse DNS (rDNS or PTR) record that matches your mail server's hostname.",
        "After it is fixed, wait 24–48 hours and then click Refresh on this dashboard to confirm the error is gone.",
      ],
    });
  }

  if (hasBadDmarc) {
    items.push({
      id: "delivery-dmarc-policy",
      severity: "warning",
      title: "Your DMARC settings are blocking some of your own emails",
      what: "DMARC is a security setting for your domain. Right now it is set to block or quarantine emails that do not pass authentication checks. If your SPF or DKIM are not fully working yet, your DMARC policy may be blocking your own legitimate emails.",
      steps: [
        "Log in to your domain's DNS settings (GoDaddy, Namecheap, Cloudflare, etc.).",
        "Find the TXT record that starts with 'v=DMARC1'.",
        "Look for the part that says 'p=reject' or 'p=quarantine'. Change it to 'p=none'. This turns DMARC into a monitoring-only mode so it stops blocking your emails while you fix the underlying issues.",
        "Save the change and wait 24 hours.",
        "Now focus on fixing your SPF and DKIM (see those items on this page). Once both are consistently passing, you can safely change DMARC back to 'p=quarantine' and eventually 'p=reject'.",
      ],
    });
  }

  // All clear
  if (items.length === 0) {
    items.push({
      id: "all-good",
      severity: "ok",
      title: "Everything looks great — your email health is in good shape",
      what: "All of your email health metrics are in the green. Your emails are being delivered properly and Gmail trusts your domain. Here is how to keep it that way.",
      steps: [
        "Audit your list every 90 days. Move anyone who has not opened or clicked anything in the last 3 months into an inactive segment and stop sending your regular campaigns to them. A smaller, engaged active segment always outperforms a large, mixed one — and you can always run re-engagement campaigns to bring people back.",
        "Only email people who have actively given you permission. Never add someone to your list without their knowledge.",
        "Check this dashboard once a week. Problems are much easier to fix when they are caught early. Set a reminder in your calendar right now.",
        "Keep writing emails that people actually want to read. If people look forward to your emails, they will not mark them as spam.",
        "Before sending a big email blast, go to mail-tester.com and send them a test copy. If your score drops below 8/10, find out why and fix it before sending.",
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

// ── Spam Intelligence Tab ──────────────────────────────────────────────────────

function SpamIntelligenceTab({ filtered }: { filtered: DailyTrafficStat[] }) {
  const sortedByDate = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
  const latestSpamIdx = sortedByDate.findIndex(s => s.spamRate != null);
  const latestSpamStat = latestSpamIdx >= 0 ? sortedByDate[latestSpamIdx] : null;
  const prevSpamStat = sortedByDate.slice(latestSpamIdx + 1).find(s => s.spamRate != null) ?? null;
  const latestSpam = latestSpamStat?.spamRate ?? null;
  const prevSpam = prevSpamStat?.spamRate ?? null;
  const spamChange = latestSpam != null && prevSpam != null ? latestSpam - prevSpam : null;
  const spamChangePct = spamChange != null && prevSpam != null && prevSpam > 0 ? (spamChange / prevSpam) * 100 : null;

  const hasRange = filtered.some(s => s.spamRateLow != null && s.spamRateHigh != null);
  // Include ALL days so the X-axis spans the full selected period.
  const chartData = [...filtered]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({
      date: shortDate(s.date),
      rate: s.spamRate != null ? +(s.spamRate * 100).toFixed(5) : null,
      low: s.spamRateLow != null ? +(s.spamRateLow * 100).toFixed(5) : null,
      high: s.spamRateHigh != null ? +(s.spamRateHigh * 100).toFixed(5) : null,
    }));
  const siHasSpamData = chartData.some(d => d.rate != null || d.low != null);
  const siDataMax = siHasSpamData
    ? Math.max(...chartData.map(d => Math.max(d.rate ?? 0, d.high ?? 0)))
    : 0;
  const siYMax = siDataMax < 0.05 ? Math.max(siDataMax * 2.5, 0.005) : 0.4;

  // Feedback loops aggregated
  const feedbackMap: Record<string, { total: number; count: number }> = {};
  for (const s of filtered) {
    for (const f of (s.feedbackLoops ?? [])) {
      if (!feedbackMap[f.id]) feedbackMap[f.id] = { total: 0, count: 0 };
      feedbackMap[f.id].total += f.spamRatio;
      feedbackMap[f.id].count += 1;
    }
  }
  const feedbackLoops = Object.entries(feedbackMap)
    .map(([id, v]) => ({ id, avgSpamRatio: v.total / v.count, parsed: parseFeedbackId(id) }))
    .sort((a, b) => b.avgSpamRatio - a.avgSpamRatio);

  // SPAM_DETECTED delivery errors
  const spamDetectedRatios: number[] = [];
  for (const s of filtered) {
    const e = s.deliveryErrors.find(e => e.errorType === "SPAM_DETECTED");
    if (e && e.errorRatio > 0) spamDetectedRatios.push(e.errorRatio);
  }
  const avgSpamDetected = spamDetectedRatios.length > 0
    ? spamDetectedRatios.reduce((a, b) => a + b, 0) / spamDetectedRatios.length : null;
  const maxSpamDetected = spamDetectedRatios.length > 0 ? Math.max(...spamDetectedRatios) : null;

  // Status config
  const statusConfig = latestSpam == null
    ? { bg: "bg-muted/40", border: "border-border", Icon: CircleDashed, iconClass: "text-muted-foreground", label: "No spam rate data yet", msg: "Google needs to see 200 or more emails per day to your Gmail recipients before it shows spam data. Keep sending and check back in a day or two." }
    : latestSpam < 0.001
    ? { bg: "bg-emerald-500/10", border: "border-emerald-500/30", Icon: ShieldCheck, iconClass: "text-emerald-600 dark:text-emerald-400", label: "You're in great shape", msg: `Your spam complaint rate is ${(latestSpam * 100).toFixed(4)}% — well under Google's 0.10% warning line. Most of your emails are landing in the inbox. Keep doing what you're doing.` }
    : latestSpam < 0.003
    ? { bg: "bg-amber-500/10", border: "border-amber-500/30", Icon: CircleAlert, iconClass: "text-amber-600 dark:text-amber-400", label: "Getting close to the danger zone", msg: `Your spam complaint rate is ${(latestSpam * 100).toFixed(4)}%. Google's warning line is 0.10%. You haven't crossed the critical threshold yet, but you're getting closer. Take action now before your inbox placement starts to drop.` }
    : { bg: "bg-red-500/10", border: "border-red-500/30", Icon: CircleX, iconClass: "text-red-600 dark:text-red-400", label: "Take action today", msg: `Your spam complaint rate is ${(latestSpam * 100).toFixed(4)}% — above Google's 0.30% critical limit. At this level, Gmail will start filtering your emails to spam automatically. Stop sending to unengaged contacts right now and work through the Action Plan tab.` };

  if (filtered.length === 0) {
    return (
      <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border">
        <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">No data in this time range</p>
          <p className="text-xs text-muted-foreground mt-0.5">Try a wider range, or click Refresh to pull the latest data from Google.</p>
        </div>
      </div>
    );
  }

  const { Icon: StatusIcon } = statusConfig;

  return (
    <div className="space-y-5">

      {/* ── Status Banner ── */}
      <div className={`flex items-start gap-4 p-4 rounded-xl border ${statusConfig.bg} ${statusConfig.border}`}>
        <StatusIcon className={`h-6 w-6 flex-shrink-0 mt-0.5 ${statusConfig.iconClass}`} />
        <div className="flex-1 min-w-0">
          <p className={`font-semibold text-sm ${statusConfig.iconClass}`}>{statusConfig.label}</p>
          <p className="text-sm text-foreground mt-1 leading-relaxed">{statusConfig.msg}</p>
          {spamChange != null && (
            <div className="flex items-center gap-1.5 mt-2">
              {spamChange > 0
                ? <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                : spamChange < 0
                ? <TrendingDown className="h-3.5 w-3.5 text-emerald-500" />
                : <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
              <span className={`text-xs font-medium ${spamChange > 0 ? "text-red-600 dark:text-red-400" : spamChange < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                {spamChange > 0 ? "Up" : spamChange < 0 ? "Down" : "No change"} from previous day with data
                {spamChangePct != null && ` (${Math.abs(spamChangePct).toFixed(0)}%)`}
              </span>
            </div>
          )}
        </div>
        {latestSpam != null && (
          <div className="text-right flex-shrink-0">
            <p className={`text-2xl font-bold tabular-nums ${statusConfig.iconClass}`}>{(latestSpam * 100).toFixed(4)}%</p>
            <p className="text-[10px] text-muted-foreground">spam rate</p>
          </div>
        )}
      </div>

      {/* ── Spam Rate Chart with Confidence Band ── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-amber-500" />
            Spam Complaint Rate Over Time
          </CardTitle>
          {hasRange && (
            <p className="text-xs text-muted-foreground mt-0.5">
              The shaded band shows the range Google reported (low to high estimate). The line is the midpoint.
            </p>
          )}
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {!siHasSpamData ? (
            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">No spam rate data in this period</div>
          ) : (
            <>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="siLineGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="siBandGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} domain={[0, siYMax]} tickFormatter={v => `${v}%`} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        const val = d.rate ?? d.low ?? null;
                        const sev = val == null ? null : val >= 0.3 ? "critical" : val >= 0.1 ? "warning" : "ok";
                        const sevColor = sev === "critical" ? "#ef4444" : sev === "warning" ? "#f59e0b" : "#10b981";
                        return (
                          <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow space-y-1">
                            <p className="font-bold text-foreground">{d.date}</p>
                            {val != null && <p style={{ color: sevColor }} className="font-bold tabular-nums text-sm">{val.toFixed(5)}%</p>}
                            {d.low != null && d.high != null && d.low !== d.high && (
                              <p className="text-muted-foreground">Range: {d.low.toFixed(5)}% – {d.high.toFixed(5)}%</p>
                            )}
                            {sev === "critical" && <p className="text-red-500 font-semibold">Above 0.30% critical limit</p>}
                            {sev === "warning" && <p className="text-amber-500 font-semibold">Above 0.10% warning line</p>}
                            {sev === "ok" && <p className="text-emerald-500">Below threshold — Good</p>}
                          </div>
                        );
                      }}
                    />
                    <ReferenceLine y={0.1} stroke="#f59e0b" strokeDasharray="4 2" strokeWidth={1.5} ifOverflow="hidden" />
                    <ReferenceLine y={0.3} stroke="#ef4444" strokeDasharray="4 2" strokeWidth={1.5} ifOverflow="hidden" />
                    {hasRange && <Area type="monotone" dataKey="high" stroke="none" fill="url(#siBandGrad)" legendType="none" connectNulls />}
                    {hasRange && <Area type="monotone" dataKey="low" stroke="none" fill="white" fillOpacity={0.6} legendType="none" connectNulls />}
                    <Area type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2} fill="url(#siLineGrad)" dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-4 text-[11px] text-muted-foreground mt-1">
                <span className="flex items-center gap-1"><span className="inline-block w-6 border-t-2 border-dashed border-amber-400" /> 0.10% warning threshold</span>
                <span className="flex items-center gap-1"><span className="inline-block w-6 border-t-2 border-dashed border-red-400" /> 0.30% critical threshold</span>
              </div>
              <SpamDailyTable data={chartData.filter(d => d.rate != null || d.low != null)} />
            </>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">0.10% Warning Threshold</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Above this, Gmail starts watching your domain more closely. Inbox placement may start to dip.</p>
            </div>
            <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-xs font-semibold text-red-700 dark:text-red-400">0.30% Critical Threshold</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Above this, Gmail automatically starts sending your emails to spam folders.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Google-Blocked Spam (SPAM_DETECTED) ── */}
      {(avgSpamDetected != null || maxSpamDetected != null) && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              Emails Blocked by Google's Own Spam Filter
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4 space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              This is <strong className="text-foreground">different</strong> from users hitting the spam button. Google's own automated filters read your emails and decided they look like spam — before any human even saw them. These emails never reached anyone's inbox.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/40 border border-border px-4 py-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Average Rate</p>
                <p className="text-xl font-bold tabular-nums text-red-600 dark:text-red-400 mt-0.5">
                  {avgSpamDetected != null ? `${(avgSpamDetected * 100).toFixed(2)}%` : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">of sends blocked by filters</p>
              </div>
              <div className="rounded-lg bg-muted/40 border border-border px-4 py-3">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Worst Day</p>
                <p className="text-xl font-bold tabular-nums text-red-600 dark:text-red-400 mt-0.5">
                  {maxSpamDetected != null ? `${(maxSpamDetected * 100).toFixed(2)}%` : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground">in selected period</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-muted/30 border border-border">
              <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                The most common causes are spam-trigger words in your subject line or email body (like FREE, ACT NOW, GUARANTEED), a missing or broken unsubscribe link, or a history of sending to unengaged recipients. See the Action Plan tab for step-by-step fixes.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Feedback Loop Breakdown ── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-purple-500" />
            Which Specific Emails Are Getting Complaints
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Powered by the Feedback-ID header in your ClickFunnels emails — this shows which campaigns or lists triggered complaints with Gmail.
          </p>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {feedbackLoops.length === 0 ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 py-4 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                No elevated-complaint campaigns detected in this period.
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border">
                <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Google only reports campaign-level feedback data when complaint volumes are high enough. If specific broadcasts start generating notable complaints, they'll appear here ranked by spam rate. Your ClickFunnels emails already include the Feedback-ID header needed for this tracking — no setup required on your end.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                {feedbackLoops.slice(0, 10).map((f) => {
                  const sev = f.avgSpamRatio >= 0.003 ? "critical" : f.avgSpamRatio >= 0.001 ? "warning" : "ok";
                  const colors = {
                    critical: { bg: "bg-red-500/10", border: "border-red-500/25", text: "text-red-600 dark:text-red-400", label: "Above 0.30% — Gmail is filtering these emails" },
                    warning: { bg: "bg-amber-500/10", border: "border-amber-500/25", text: "text-amber-600 dark:text-amber-400", label: "Above 0.10% — approaching the complaint threshold" },
                    ok: { bg: "bg-muted/40", border: "border-border", text: "text-muted-foreground", label: "Below warning threshold" },
                  }[sev];
                  return (
                    <div key={f.id} className={`rounded-lg border px-4 py-3 ${colors.bg} ${colors.border}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {f.parsed ? (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mb-2">
                              <div>
                                <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">List ID</p>
                                <p className="text-xs font-mono font-semibold text-foreground">{f.parsed.listId}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Account</p>
                                <p className="text-xs font-mono font-semibold text-foreground">{f.parsed.accountId}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Broadcast ID</p>
                                <p className="text-xs font-mono font-semibold text-foreground">{f.parsed.broadcastId}</p>
                              </div>
                              {f.parsed.shortId && (
                                <div>
                                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">Key</p>
                                  <p className="text-xs font-mono font-semibold text-foreground">{f.parsed.shortId}</p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-xs font-mono text-foreground mb-1">{f.id}</p>
                          )}
                          <p className={`text-[11px] font-medium ${colors.text}`}>{colors.label}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-xl font-bold tabular-nums ${colors.text}`}>
                            {(f.avgSpamRatio * 100).toFixed(3)}%
                          </p>
                          <p className="text-[10px] text-muted-foreground">avg spam rate</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border">
                <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  To find a specific broadcast in ClickFunnels: log in → go to <strong className="text-foreground">Email → Broadcasts</strong> → use the Broadcast ID shown above to find the exact campaign that triggered the complaints. From there you can check who it went to, what the subject line was, and what list it targeted.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Why People Hit Spam ── */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-500" />
            Why Do People Hit the Spam Button?
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            The 5 most common reasons — and exactly what to do about each one.
          </p>
        </CardHeader>
        <CardContent className="px-5 pb-4 space-y-3">
          {SPAM_REASONS.map((reason, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-muted border border-border text-[11px] font-bold text-muted-foreground flex items-center justify-center flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{reason.title}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{reason.detail}</p>
                  <div className="mt-2.5 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide mb-1">The Fix</p>
                    <p className="text-xs text-foreground leading-relaxed">{reason.fix}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-muted/40 border border-border">
        <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          Google Postmaster data is always 24–48 hours delayed. Campaign-level feedback data only appears when specific broadcasts trigger enough complaints for Google to report. Spam rate data only shows when your domain sends 200+ emails per day to Gmail users.
        </p>
      </div>
    </div>
  );
}

// ── Domain Dashboard ────────────────────────────────────────────────────────────

function DomainDashboard({ domain, domains, selectedDomain, onSelectDomain, defaultDomain, onSetDefault, lastSyncedAt, onSync, isSyncing }: {
  domain: PostmasterDomainData;
  domains: PostmasterDomainData[];
  selectedDomain: string;
  onSelectDomain: (d: string) => void;
  defaultDomain: string;
  onSetDefault: (d: string) => void;
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
  const spamColor = latestSpam == null ? "muted" : latestSpam < 0.001 ? "emerald" : latestSpam < 0.003 ? "amber" : "red";
  const authColor = (v: number | null) => v == null ? "muted" : v >= 0.95 ? "emerald" : v >= 0.80 ? "amber" : "red";

  const actionPlanIssueCount = useMemo(() => {
    const effectiveFiltered = filtered.length > 0 ? filtered : domain.trafficStats;
    const items = buildActionPlan(domain, effectiveFiltered);
    return items.filter(i => i.severity === "critical" || i.severity === "warning").length;
  }, [domain, filtered]);

  return (
    <div className="space-y-6">
      {/* Top row: reputation badge on left, all controls on right */}
      <div className="flex items-center justify-between gap-3 flex-wrap-reverse">
        <ReputationBadge
          reputation={
            [...filtered]
              .sort((a, b) => b.date.localeCompare(a.date))
              .find(s => s.domainReputation && s.domainReputation !== "REPUTATION_CATEGORY_UNSPECIFIED")
              ?.domainReputation ?? null
          }
          dataDate={
            [...filtered]
              .sort((a, b) => b.date.localeCompare(a.date))
              .find(s => s.domainReputation && s.domainReputation !== "REPUTATION_CATEGORY_UNSPECIFIED")
              ?.date ?? null
          }
        />
        <div className="flex flex-wrap items-center gap-2">
          {domains.length > 1 && (
            <>
              <Select value={selectedDomain || domains[0].domainName} onValueChange={onSelectDomain}>
                <SelectTrigger className="w-44 h-8 text-xs" data-testid="select-domain">
                  <Globe className="h-3.5 w-3.5 mr-1.5 text-muted-foreground flex-shrink-0" />
                  <SelectValue placeholder="Select domain" />
                </SelectTrigger>
                <SelectContent>
                  {domains.map(d => (
                    <SelectItem key={d.domainName} value={d.domainName} className="text-xs" data-testid={`option-domain-${d.domainName}`}>
                      <span className="flex items-center gap-1.5">
                        {d.domainName}
                        {d.domainName === defaultDomain && (
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400 flex-shrink-0" />
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title={`Set "${selectedDomain || domains[0].domainName}" as default`}
                data-testid="button-set-default-domain"
                onClick={() => onSetDefault(selectedDomain || domains[0].domainName)}
              >
                <Star className={`h-3.5 w-3.5 ${(selectedDomain || domains[0].domainName) === defaultDomain ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`} />
              </Button>
              <span className="text-border">|</span>
            </>
          )}
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
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Updated {new Date(lastSyncedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={onSync} disabled={isSyncing} data-testid="button-sync-postmaster" className="h-8 text-xs">
            {isSyncing ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <RefreshCw className="h-3 w-3 mr-1.5" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Spam Rate" value={latestSpam != null ? `${(latestSpam * 100).toFixed(4)}%` : "—"} sublabel="user reported" color={spamColor as any} />
        <StatCard label="SPF" value={pct(latestSpf, 1)} sublabel="pass rate" color={authColor(latestSpf) as any} />
        <StatCard label="DKIM" value={pct(latestDkim, 1)} sublabel="pass rate" color={authColor(latestDkim) as any} />
        <StatCard label="DMARC" value={pct(latestDmarc, 1)} sublabel="pass rate" color={authColor(latestDmarc) as any} />
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start h-9 p-1 bg-muted/50 border border-border rounded-xl mb-1">
          <TabsTrigger value="overview" className="text-xs px-4 rounded-lg" data-testid="tab-overview">
            Overview
          </TabsTrigger>
          <TabsTrigger value="compliance" className="text-xs px-4 rounded-lg" data-testid="tab-compliance">
            Compliance
          </TabsTrigger>
          <TabsTrigger value="action-plan" className="text-xs px-4 rounded-lg" data-testid="tab-action-plan">
            <span className="flex items-center gap-1.5">
              Action Plan
              {actionPlanIssueCount > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none" data-testid="badge-action-plan-count">
                  {actionPlanIssueCount}
                </span>
              )}
            </span>
          </TabsTrigger>
          <TabsTrigger value="spam-intelligence" className="text-xs px-4 rounded-lg" data-testid="tab-spam-intelligence">
            Spam Intelligence
          </TabsTrigger>
          <TabsTrigger value="infrastructure" className="text-xs px-4 rounded-lg" data-testid="tab-infrastructure">
            Infrastructure
          </TabsTrigger>
        </TabsList>

        {/* ── Overview tab ── */}
        <TabsContent value="overview" className="mt-4 space-y-5">
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

              </div>
            </>
          )}

          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-muted/40 border border-border">
            <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Google Postmaster data is always 24–48 hours delayed. Spam rate data only appears when your domain sends 200+ emails per day to Gmail users.
            </p>
          </div>
        </TabsContent>

        {/* ── Compliance tab ── */}
        <TabsContent value="compliance" className="mt-4 space-y-5">
          {domain.trafficStats.length > 0 ? (
            <ComplianceSection domain={domain} filtered={filtered.length > 0 ? filtered : domain.trafficStats} />
          ) : (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border">
              <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">No data available yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Click Refresh to pull data from Google Postmaster.</p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Action Plan tab ── */}
        <TabsContent value="action-plan" className="mt-4 space-y-5">
          {domain.trafficStats.length > 0 ? (
            <ActionPlanSection domain={domain} filtered={filtered.length > 0 ? filtered : domain.trafficStats} />
          ) : (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border">
              <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">No data available yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Click Refresh to pull data from Google Postmaster.</p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Spam Intelligence tab ── */}
        <TabsContent value="spam-intelligence" className="mt-4 space-y-5">
          <SpamIntelligenceTab filtered={filtered.length > 0 ? filtered : domain.trafficStats} />
        </TabsContent>

        {/* ── Infrastructure tab ── */}
        <TabsContent value="infrastructure" className="mt-4 space-y-5">
          {filtered.length === 0 ? (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border">
              <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">No data in this time range</p>
                <p className="text-xs text-muted-foreground mt-0.5">Try a wider range, or click Refresh to pull the latest data from Google.</p>
              </div>
            </div>
          ) : (
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
          )}

          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-muted/40 border border-border">
            <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              IP reputation data only appears when your domain sends 200+ emails per day to Gmail users. Data is always 24–48 hours delayed.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function SenderReputationPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedDomain, setSelectedDomain] = useState<string>(
    () => localStorage.getItem("postmaster_default_domain") ?? ""
  );
  const [defaultDomain, setDefaultDomain] = useState<string>(
    () => localStorage.getItem("postmaster_default_domain") ?? ""
  );

  function handleSetDefault(domain: string) {
    localStorage.setItem("postmaster_default_domain", domain);
    setDefaultDomain(domain);
    toast({ title: `"${domain}" set as your default domain` });
  }
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const { data: status, isLoading } = useQuery<StatusResponse>({
    queryKey: ["/api/sender-reputation/status"],
    refetchInterval: false,
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sender-reputation/sync"),
    onSuccess: () => {
      setNeedsReconnect(false);
      queryClient.invalidateQueries({ queryKey: ["/api/sender-reputation/status"] });
      toast({ title: "Data refreshed from Google Postmaster" });
    },
    onError: (err: any) => {
      let body: any = {};
      try {
        const msg: string = err?.message || "";
        const jsonStart = msg.indexOf("{");
        if (jsonStart !== -1) body = JSON.parse(msg.slice(jsonStart));
      } catch {}
      if (body?.needsReconnect) {
        setNeedsReconnect(true);
      } else {
        toast({
          title: "Refresh failed",
          description: "Could not fetch data from Google. Try disconnecting and reconnecting.",
          variant: "destructive",
        });
      }
    },
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
        <div className="max-w-7xl mx-auto">
          <button
            className="flex items-center gap-1.5 text-white/50 hover:text-white/80 text-xs mb-4 transition-colors"
            onClick={() => setLocation("/email-tools")}
            data-testid="link-back-email-tools"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Email Tools
          </button>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">Sender Reputation</h1>
                <p className="text-white/50 text-xs mt-0.5">Google Postmaster Tools — complete domain health dashboard</p>
              </div>
            </div>
            {status?.connected && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/15">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="text-xs text-white/80 font-medium">Connected</span>
                  <span className="text-white/40 text-xs hidden sm:inline">·</span>
                  <span className="text-xs text-white/50 hidden sm:inline truncate max-w-[180px]">{status.connectedEmail}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/40 hover:text-white/80 hover:bg-white/10 text-xs h-8 px-2.5"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  data-testid="button-disconnect-postmaster"
                >
                  {disconnectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                  <span className="ml-1.5 hidden sm:inline">Disconnect</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
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
            {needsReconnect && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30" data-testid="alert-needs-reconnect">
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Google permission needs to be refreshed</p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5 leading-relaxed">
                    Your Google account is connected, but the Postmaster Tools permission is missing or expired. This usually happens when you connected Google for login before Postmaster was added. Disconnect and reconnect to fix it — it only takes a few seconds.
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <Button
                      size="sm"
                      className="bg-amber-500 hover:bg-amber-600 text-white border-0"
                      onClick={() => disconnectMutation.mutate()}
                      disabled={disconnectMutation.isPending}
                      data-testid="button-reconnect-postmaster"
                    >
                      {disconnectMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <PlugZap className="h-3.5 w-3.5 mr-1.5" />}
                      Disconnect & Reconnect
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
                  domains={status.domains}
                  selectedDomain={selectedDomain || status.domains[0]?.domainName || ""}
                  onSelectDomain={setSelectedDomain}
                  defaultDomain={defaultDomain}
                  onSetDefault={handleSetDefault}
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
