import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Mail, Copy, Check, Trash2, ChevronDown, ChevronUp, Settings,
  ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, Loader2,
  Inbox, Info, TrendingUp, CircleCheck, CircleX, CircleAlert,
  ExternalLink, FileText, Zap, Globe, Hash, HelpCircle, Smile,
  User, Reply, Server, Eye, Image, Link2, Type, BookOpen, MapPin, Star, RefreshCw,
  Plus, ToggleLeft, ToggleRight, AtSign, Tag, Users, Bell, MessageSquare,
} from "lucide-react";
import { SiGmail } from "react-icons/si";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import type {
  EmailAnalysis, SpamFlag, CopyFeedback,
  SubjectAnalysis, TechnicalHealth, SenderTrust, ContentQuality, SeedInbox,
} from "@shared/schema";

const INBOX_DOMAIN = "email.fearlessmarketinglab.com";

// ── Helpers ──────────────────────────────────────────────────────────────────

function stripTrackingPixels(html: string): string {
  if (!html) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const wMatch = tag.match(/\bwidth\s*=\s*["']?(\d+)["']?/i);
    const hMatch = tag.match(/\bheight\s*=\s*["']?(\d+)["']?/i);
    if (wMatch && hMatch && parseInt(wMatch[1]) <= 1 && parseInt(hMatch[1]) <= 1) return "";
    if (/style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden|(?:width|height)\s*:\s*0)/i.test(tag)) return "";
    if (/src\s*=\s*["'][^"']*(?:\/(?:track|pixel|open|beacon|wf|trk)(?:[/?.])|open\.(?:gif|png|php)|\.pixel\.)/.test(tag)) return "";
    return tag;
  });
}

function scoreColor(score: number | null | undefined) {
  if (score == null) return "text-muted-foreground";
  if (score >= 80) return "text-emerald-500";
  if (score >= 60) return "text-yellow-500";
  return "text-red-500";
}

function scoreBg(score: number | null | undefined) {
  if (score == null) return "bg-muted";
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-yellow-500";
  return "bg-red-500";
}

function ScoreRing({ score, size = 64 }: { score: number | null | undefined; size?: number }) {
  const r = size * 0.38;
  const circ = 2 * Math.PI * r;
  const pct = score != null ? Math.max(0, Math.min(100, score)) : 0;
  const dash = (pct / 100) * circ;
  const color = score == null ? "#888" : score >= 80 ? "#10b981" : score >= 60 ? "#eab308" : "#ef4444";
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={size * 0.09} className="text-muted/30" />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={size * 0.09}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
        fontSize={size * 0.26} fontWeight="700" fill={color}>
        {score != null ? score : "—"}
      </text>
    </svg>
  );
}

function AuthBadge({ result, label }: { result: string | null | undefined; label: string }) {
  const r = (result || "unknown").toLowerCase();
  const isPass = r === "pass";
  const isFail = r === "fail" || r === "softfail";
  return (
    <div className="flex items-center gap-2">
      {isPass ? <CircleCheck className="h-4 w-4 text-emerald-500 flex-shrink-0" />
        : isFail ? <CircleX className="h-4 w-4 text-red-500 flex-shrink-0" />
          : <CircleAlert className="h-4 w-4 text-yellow-500 flex-shrink-0" />}
      <span className="text-sm font-medium">{label}</span>
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 uppercase font-bold ml-auto ${isPass ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
        : isFail ? "border-red-500/40 text-red-600 dark:text-red-400"
          : "border-yellow-500/40 text-yellow-600 dark:text-yellow-400"}`}>
        {r}
      </Badge>
    </div>
  );
}

function CheckRow({ pass, warn, label, detail }: { pass?: boolean; warn?: boolean; label: string; detail?: string }) {
  return (
    <div className="flex items-start gap-2">
      {pass === true ? <CircleCheck className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
        : warn ? <CircleAlert className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          : <CircleX className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <span className="text-sm">{label}</span>
        {detail && <span className="text-xs text-muted-foreground ml-1.5">({detail})</span>}
      </div>
    </div>
  );
}

function DnsCheck({ exists, label }: { exists: boolean | null | undefined; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {exists === true ? <CircleCheck className="h-4 w-4 text-emerald-500 flex-shrink-0" />
        : exists === false ? <CircleX className="h-4 w-4 text-red-500 flex-shrink-0" />
          : <CircleAlert className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
      <span className="text-sm">{label}</span>
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ml-auto ${exists === true ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
        : exists === false ? "border-red-500/40 text-red-600 dark:text-red-400"
          : "text-muted-foreground"}`}>
        {exists === true ? "Found" : exists === false ? "Missing" : "Unknown"}
      </Badge>
    </div>
  );
}

function SpamFlagChip({ flag }: { flag: SpamFlag }) {
  const colors = {
    high: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    medium: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    low: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${colors[flag.severity]}`}>
      {flag.severity === "high" ? <ShieldX className="h-3 w-3" /> : flag.severity === "medium" ? <ShieldAlert className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {flag.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "complete") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs">Analyzed</Badge>;
  if (status === "processing") return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-xs"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Analyzing</Badge>;
  if (status === "failed") return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs">Failed</Badge>;
  return <Badge variant="outline" className="text-xs">Pending</Badge>;
}

function SectionPanel({ title, icon: Icon, score, children }: {
  title: string;
  icon: React.ElementType;
  score?: number | null;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary flex-shrink-0" />
        {title}
        {score != null && (
          <span className={`ml-auto text-sm font-bold ${scoreColor(score)}`}>{score}/100</span>
        )}
      </h4>
      {children}
    </div>
  );
}

// ── Email Detail Panel ────────────────────────────────────────────────────────

function EmailDetail({ email, onDelete, onReanalyze, seedInboxes = [], sendingFromAddress = "" }: {
  email: EmailAnalysis;
  onDelete: () => void;
  onReanalyze?: (id: string) => void;
  seedInboxes?: SeedInbox[];
  sendingFromAddress?: string;
}) {
  const cf = email.copyFeedback as CopyFeedback | null;
  const flags = (email.spamFlags as SpamFlag[] | null) || [];
  const sa = email.subjectAnalysis as SubjectAnalysis | null;
  const th = email.technicalHealth as TechnicalHealth | null;
  const st = email.senderTrust as SenderTrust | null;
  const cq = email.contentQuality as ContentQuality | null;

  const [placementResults, setPlacementResults] = useState<PlacementResult[] | null>(null);
  const [placementLoading, setPlacementLoading] = useState(false);
  const [placementError, setPlacementError] = useState<string | null>(null);

  const connectedInboxes = seedInboxes.filter(s => s.isActive && s.isConnected);

  const runPlacementCheck = async () => {
    setPlacementLoading(true);
    setPlacementError(null);
    try {
      const res = await fetch("/api/inbox-analyzer/placement-check", { credentials: "include" });
      if (!res.ok) {
        const body = await res.json();
        setPlacementError(body.message || "Failed to check placement");
      } else {
        const body = await res.json();
        setPlacementResults(body.results || []);
      }
    } catch {
      setPlacementError("Network error. Please try again.");
    } finally {
      setPlacementLoading(false);
    }
  };

  const receivedDate = email.receivedAt
    ? new Date(email.receivedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[5fr_7fr] gap-6 pt-2">

      {/* ── LEFT: Email content + sender info ──────────────────────────── */}
      <div className="space-y-4 min-w-0">

        {/* Email metadata card */}
        <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Type className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Subject</p>
                <p className="text-sm font-semibold text-foreground leading-snug break-words">{email.subject}</p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">From</p>
                {email.fromName && <p className="text-sm font-medium text-foreground">{email.fromName}</p>}
                <p className="text-xs text-muted-foreground break-all">{email.fromAddress}</p>
              </div>
            </div>
            {email.replyTo && (
              <div className="flex items-start gap-2">
                <Reply className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Reply-To</p>
                  <p className="text-xs text-muted-foreground break-all">{email.replyTo}</p>
                </div>
              </div>
            )}
            {(email.sendingDomain || email.sendingIp) && (
              <div className="flex items-start gap-2">
                <Server className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Sending Server</p>
                  {email.sendingDomain && <p className="text-xs text-foreground font-medium">{email.sendingDomain}</p>}
                  {email.sendingIp && <p className="text-xs text-muted-foreground font-mono">{email.sendingIp}</p>}
                </div>
              </div>
            )}
            {receivedDate && (
              <div className="flex items-start gap-2">
                <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide">Received</p>
                  <p className="text-xs text-muted-foreground">{receivedDate}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Email body preview */}
        {(email.bodyHtml || email.bodyText) && (
          <div className="rounded-xl border border-border bg-muted/10 p-4">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide mb-2 flex items-center gap-1.5">
              <FileText className="h-3 w-3" />
              Email Body
            </p>
            {email.bodyHtml ? (
              <iframe
                srcDoc={stripTrackingPixels(email.bodyHtml)}
                sandbox="allow-same-origin"
                className="w-full rounded border border-border bg-white"
                style={{ minHeight: "400px", height: "auto" }}
                onLoad={(e) => {
                  const frame = e.currentTarget;
                  try {
                    const doc = frame.contentDocument || frame.contentWindow?.document;
                    if (doc) {
                      frame.style.height = Math.min(doc.documentElement.scrollHeight, 800) + "px";
                    }
                  } catch {
                    frame.style.height = "500px";
                  }
                }}
              />
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap">
                  {email.bodyText!.slice(0, 1200)}
                  {email.bodyText!.length > 1200 && <span className="text-muted-foreground"> …[truncated]</span>}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Re-analyze button */}
        {onReanalyze && (
          <div className="flex justify-start">
            <Button
              variant="ghost" size="sm"
              className="text-muted-foreground hover:text-foreground gap-1.5 text-xs"
              onClick={() => onReanalyze(email.id)}
              data-testid={`button-reanalyze-${email.id}`}
            >
              <RefreshCw className="h-3.5 w-3.5" />Re-analyze
            </Button>
          </div>
        )}
      </div>

      {/* ── RIGHT: Full analysis report ─────────────────────────────────── */}
      <div className="space-y-4 min-w-0">

        {/* Score overview */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-4 mb-4">
            <ScoreRing score={email.overallScore} size={72} />
            <div>
              <p className="text-base font-bold text-foreground">Overall Score</p>
              <p className="text-xs text-muted-foreground mt-0.5">Based on 6 categories below</p>
              <StatusBadge status={email.status} />
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[
              { label: "Auth", score: (() => {
                let p = 0;
                if (email.spfResult === "pass") p += 8; else if (email.spfResult === "softfail") p += 4;
                if (email.dkimResult === "pass") p += 8;
                if (email.dmarcResult === "pass") p += 7;
                if (email.spfRecordExists) p += 4;
                if (email.dkimRecordExists) p += 3;
                return Math.round((p / 30) * 100);
              })() },
              { label: "Trust", score: st ? (() => {
                let p = 0;
                if (!st.blacklisted) p += 8;
                if (st.displayNameDomainMatch === true) p += 4;
                if (st.replyToMatchesFrom === true || st.replyToMatchesFrom === null) p += 3;
                return Math.round((p / 15) * 100);
              })() : null },
              { label: "CAN-SPAM", score: email.spamScore },
              { label: "Technical", score: th ? (() => {
                let p = 0;
                if (th.hasPlainTextVersion) p += 3;
                if (th.hasPreheader) p += 2;
                if (th.trackingPixelCount === 0) p += 2;
                if (th.estimatedSizeKb < 100) p += 2;
                if (th.missingAltCount === 0) p += 1;
                return Math.round((p / 10) * 100);
              })() : null },
              { label: "Content", score: cq ? (() => {
                let p = 0;
                if (cq.hasPhysicalAddress) p += 4;
                if (cq.hasPersonalization) p += 3;
                if (cq.wordCount >= 50 && cq.wordCount <= 600) p += 3;
                return Math.round((p / 10) * 100);
              })() : null },
              { label: "Copy", score: email.copyScore },
            ].map((item) => (
              <div key={item.label} className="flex flex-col items-center gap-1 rounded-lg bg-muted/30 py-2 px-1">
                <ScoreRing score={item.score} size={40} />
                <span className="text-[10px] text-muted-foreground font-medium text-center leading-tight">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Placement ─────────────────────────────────────────────── */}
        <SectionPanel title="Inbox Placement" icon={Inbox}>
          {connectedInboxes.length === 0 ? (
            // No monitoring set up at all
            <div className="space-y-2">
              {seedInboxes.length === 0 ? (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/40">
                  <CircleAlert className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-foreground">Placement monitoring not active</p>
                    <p className="text-xs text-muted-foreground mt-0.5">No seed inboxes have been set up yet. Once connected, you'll see if your emails land in Inbox or Spam across Gmail, Outlook, and more.</p>
                  </div>
                </div>
              ) : (
                // Inboxes exist but none connected via OAuth
                <div className="space-y-2">
                  {seedInboxes.filter(s => s.isActive).map(inbox => (
                    <div key={inbox.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/50">
                      <ProviderIcon provider={inbox.provider} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground">{inbox.label}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">{inbox.email}</p>
                      </div>
                      <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Not monitoring</span>
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground pt-1">Add these addresses to your CRM and connect them in My Address to enable placement checking.</p>
                </div>
              )}
            </div>
          ) : (
            // Connected inboxes — show check results or prompt
            <div className="space-y-2">
              {!sendingFromAddress ? (
                <div className="flex items-start gap-2.5 p-3 rounded-lg bg-muted/40">
                  <CircleAlert className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">Set your sending From address in My Address to run a placement check.</p>
                </div>
              ) : (
                <>
                  {/* Results or idle state per inbox */}
                  {connectedInboxes.map(inbox => {
                    const result = placementResults?.find(r => r.inboxId === inbox.id);
                    return (
                      <div key={inbox.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/50">
                        <ProviderIcon provider={inbox.provider} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground">{inbox.label}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">{inbox.email}</p>
                        </div>
                        {placementLoading ? (
                          <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
                        ) : result ? (
                          <PlacementStatusBadge status={result.status} />
                        ) : (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                    );
                  })}

                  {placementError && (
                    <p className="text-xs text-red-500 flex items-center gap-1"><CircleX className="h-3 w-3" />{placementError}</p>
                  )}

                  {placementResults && (
                    <p className="text-[10px] text-muted-foreground">
                      Checked at {new Date(placementResults[0]?.checkedAt).toLocaleTimeString()} · Searches last 14 days
                    </p>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1.5 mt-1"
                    onClick={runPlacementCheck}
                    disabled={placementLoading}
                    data-testid={`button-placement-check-${email.id}`}
                  >
                    {placementLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    {placementResults ? "Re-check Placement" : "Check Placement"}
                  </Button>
                </>
              )}
            </div>
          )}
        </SectionPanel>

        {/* Authentication */}
        <SectionPanel title="Email Authentication" icon={ShieldCheck}>
          <div className="grid sm:grid-cols-2 gap-2">
            <AuthBadge result={email.spfResult} label="SPF" />
            <AuthBadge result={email.dkimResult} label="DKIM" />
            <AuthBadge result={email.dmarcResult} label="DMARC" />
          </div>
          <Separator className="my-1" />
          <p className="text-xs font-semibold text-muted-foreground">DNS Record Presence</p>
          <div className="grid sm:grid-cols-2 gap-2">
            <DnsCheck exists={email.spfRecordExists} label="SPF record" />
            <DnsCheck exists={email.dkimRecordExists} label="DKIM record" />
            <DnsCheck exists={email.dmarcRecordExists} label="DMARC record" />
          </div>
        </SectionPanel>

        {/* Sender Trust */}
        {st && (
          <SectionPanel title="Sender Trust" icon={ShieldCheck}>
            <div className="space-y-2">
              <CheckRow
                pass={!st.blacklisted}
                label={st.blacklisted ? `IP blacklisted on: ${st.blacklistHits.join(", ")}` : "IP not on any blocklists"}
                detail={st.blacklisted ? "may affect inbox delivery" : "Spamhaus, Barracuda, SpamCop checked"}
              />
              {st.displayNameDomainMatch !== null && (
                <CheckRow
                  pass={st.displayNameDomainMatch === true}
                  warn={st.displayNameDomainMatch === null}
                  label={st.displayNameDomainMatch ? "Display name matches sending domain" : "Display name doesn't match sending domain"}
                  detail={st.displayNameDomainMatch === false ? "possible spoofing signal" : undefined}
                />
              )}
              {st.replyToMatchesFrom !== null && (
                <CheckRow
                  pass={st.replyToMatchesFrom === true}
                  label={st.replyToMatchesFrom ? "Reply-To matches From domain" : "Reply-To is on a different domain than From"}
                  detail={st.replyToMatchesFrom === false ? "common in phishing emails" : undefined}
                />
              )}
              {st.replyToMatchesFrom === null && (
                <CheckRow pass={true} label="No Reply-To header (replies go to From address)" />
              )}
            </div>
          </SectionPanel>
        )}

        {/* CAN-SPAM Compliance */}
        <SectionPanel title="CAN-SPAM Compliance" icon={AlertTriangle}>
          <div className="space-y-2">
            <CheckRow
              pass={!flags.some(f => f.label.toLowerCase().includes("unsubscribe"))}
              label="Unsubscribe link present"
              detail={flags.some(f => f.label.toLowerCase().includes("unsubscribe")) ? "Required by CAN-SPAM" : "Detected in email"}
            />
            <CheckRow
              pass={!!cq?.hasPhysicalAddress}
              label="Physical address in footer"
              detail={!cq?.hasPhysicalAddress ? "Required by CAN-SPAM" : "Detected in email"}
            />
          </div>
        </SectionPanel>

        {/* Technical Health */}
        {th && (
          <SectionPanel title="Technical Health" icon={Zap}>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
              <CheckRow pass={th.hasHtmlVersion} label="HTML version present" />
              <CheckRow pass={th.hasPlainTextVersion} label="Plain text version present" detail={!th.hasPlainTextVersion ? "helps avoid spam filters" : undefined} />
              <CheckRow pass={th.hasPreheader} warn={!th.hasPreheader} label={th.hasPreheader ? "Preheader text detected" : "No preheader text"} detail={!th.hasPreheader ? "missed preview opportunity" : undefined} />
              <CheckRow
                pass={th.estimatedSizeKb < 100}
                warn={th.estimatedSizeKb >= 100 && th.estimatedSizeKb < 102}
                label={`~${th.estimatedSizeKb} KB email size`}
                detail={th.estimatedSizeKb >= 102 ? "Gmail clips at 102 KB" : "under Gmail clip limit"}
              />
              <CheckRow
                pass={th.missingAltCount === 0}
                label={th.missingAltCount === 0 ? "All images have ALT text" : `${th.missingAltCount} image${th.missingAltCount !== 1 ? "s" : ""} missing ALT text`}
                detail={th.missingAltCount > 0 ? "impacts accessibility & spam score" : undefined}
              />
              <CheckRow
                pass={th.trackingPixelCount === 0}
                warn={th.trackingPixelCount > 0}
                label={th.trackingPixelCount === 0 ? "No tracking pixels detected" : `${th.trackingPixelCount} tracking pixel${th.trackingPixelCount !== 1 ? "s" : ""} found`}
              />
              {th.uniqueExternalDomains > 0 && (
                <div className="col-span-2">
                  <CheckRow
                    pass={th.uniqueExternalDomains <= 3}
                    warn={th.uniqueExternalDomains > 3 && th.uniqueExternalDomains <= 6}
                    label={`${th.uniqueExternalDomains} unique external domain${th.uniqueExternalDomains !== 1 ? "s" : ""} in links`}
                    detail={th.uniqueExternalDomains > 6 ? "high variety may trigger filters" : undefined}
                  />
                </div>
              )}
            </div>
          </SectionPanel>
        )}

        {/* Content Quality */}
        {cq && (
          <SectionPanel title="Content Quality" icon={BookOpen}>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
              <CheckRow
                pass={cq.wordCount >= 50 && cq.wordCount <= 600}
                warn={cq.wordCount > 0 && (cq.wordCount < 50 || cq.wordCount > 600)}
                label={`${cq.wordCount} words`}
                detail={cq.wordCount < 50 ? "too short" : cq.wordCount > 600 ? "may be too long" : "ideal range 50–600"}
              />
              <CheckRow
                pass={cq.hasPersonalization}
                warn={!cq.hasPersonalization}
                label={cq.hasPersonalization ? "Personalization detected" : "No personalization found"}
                detail={!cq.hasPersonalization ? "use first name or merge tags" : undefined}
              />
              <CheckRow
                pass={cq.hasPhysicalAddress}
                label={cq.hasPhysicalAddress ? "Physical address found" : "No physical address"}
                detail={!cq.hasPhysicalAddress ? "required by CAN-SPAM" : "CAN-SPAM compliant"}
              />
              <CheckRow
                pass={cq.hasPs}
                warn={!cq.hasPs}
                label={cq.hasPs ? "P.S. section found" : "No P.S. section"}
                detail={!cq.hasPs ? "P.S. is one of the most-read parts" : "great engagement technique"}
              />
            </div>
          </SectionPanel>
        )}

        {/* Subject Line */}
        {sa && (
          <SectionPanel title="Subject Line Analysis" icon={Type}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <CheckRow
                pass={sa.isIdealLength}
                warn={!sa.isIdealLength && sa.charCount > 0}
                label={`${sa.charCount} characters`}
                detail={sa.isIdealLength ? "ideal 30–60" : sa.charCount < 30 ? "too short" : "too long"}
              />
              <CheckRow
                pass={true}
                warn={false}
                label={`${sa.wordCount} word${sa.wordCount !== 1 ? "s" : ""}`}
              />
              <CheckRow
                pass={sa.hasNumber}
                warn={!sa.hasNumber}
                label={sa.hasNumber ? "Contains a number" : "No number in subject"}
                detail={!sa.hasNumber ? "numbers boost specificity" : undefined}
              />
              <CheckRow
                pass={sa.hasQuestion}
                warn={!sa.hasQuestion}
                label={sa.hasQuestion ? "Contains a question" : "No question mark"}
                detail={!sa.hasQuestion ? "questions invite curiosity" : undefined}
              />
              <CheckRow
                pass={sa.hasEmoji}
                warn={!sa.hasEmoji}
                label={sa.hasEmoji ? "Emoji detected" : "No emoji"}
                detail={!sa.hasEmoji ? "emojis can boost open rates" : undefined}
              />
              <CheckRow
                pass={sa.hasPersonalizationToken}
                warn={!sa.hasPersonalizationToken}
                label={sa.hasPersonalizationToken ? "Personalization token found" : "No personalization token"}
                detail={!sa.hasPersonalizationToken ? "e.g. {first_name}" : undefined}
              />
            </div>
          </SectionPanel>
        )}

        {/* AI Copy scoring */}
        {cf && cf.sections.length > 0 && (
          <SectionPanel title="AI Copy Analysis" icon={TrendingUp} score={email.copyScore}>
            <div className="space-y-3">
              {cf.sections.map((sec) => (
                <div key={sec.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">{sec.name}</span>
                    <span className={`text-xs font-bold ${scoreColor(sec.score * 10)}`}>{sec.score}/10</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div className={`h-1.5 rounded-full ${scoreBg(sec.score * 10)}`} style={{ width: `${sec.score * 10}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{sec.feedback}</p>
                </div>
              ))}
            </div>
            {cf.topSuggestions?.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-foreground">Top Suggestions</p>
                  {cf.topSuggestions.map((s, i) => (
                    <div key={i} className="flex gap-2 text-xs text-muted-foreground">
                      <span className="text-primary font-bold flex-shrink-0">{i + 1}.</span>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </SectionPanel>
        )}

        {email.status === "processing" && (
          <div className="flex items-center gap-3 p-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin" />
              Analysis in progress…
            </div>
            {onReanalyze && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5 text-muted-foreground"
                onClick={() => onReanalyze(email.id)}
                data-testid={`button-retry-processing-${email.id}`}
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            )}
          </div>
        )}
        {email.status === "failed" && (
          <div className="flex items-center gap-3 p-2">
            <p className="text-sm text-red-500">Analysis failed.</p>
            {onReanalyze && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
                onClick={() => onReanalyze(email.id)}
                data-testid={`button-retry-${email.id}`}
              >
                <RefreshCw className="h-3 w-3" />
                Retry
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Email Row ────────────────────────────────────────────────────────────────

function EmailRow({ email, onDelete, onReanalyze, seedInboxes, sendingFromAddress }: {
  email: EmailAnalysis;
  onDelete: (id: string) => void;
  onReanalyze?: (id: string) => void;
  seedInboxes?: SeedInbox[];
  sendingFromAddress?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-sm" data-testid={`email-row-${email.id}`}>
      <div className="px-4 py-3.5 flex items-center gap-3">
        {/* Clickable area to expand/collapse */}
        <button
          className="flex items-center gap-3 flex-1 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
          onClick={() => setOpen((o) => !o)}
          data-testid={`email-expand-${email.id}`}
        >
          <ScoreRing score={email.overallScore} size={44} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{email.subject}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress}
              {email.receivedAt && (
                <span className="ml-2 opacity-60">· {new Date(email.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              )}
            </p>
          </div>
        </button>

        {/* Right-side controls — outside the expand button so clicks don't toggle */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <StatusBadge status={email.status} />

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-red-500 hover:bg-red-500/10"
                onClick={(e) => e.stopPropagation()}
                data-testid={`email-delete-${email.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this email?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the email and its full analysis report. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={() => onDelete(email.id)}
                  data-testid={`email-delete-confirm-${email.id}`}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <button
            className="p-1 text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Collapse" : "Expand"}
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-5">
          <Separator className="mb-5" />
          <EmailDetail email={email} onDelete={() => onDelete(email.id)} onReanalyze={onReanalyze} seedInboxes={seedInboxes} sendingFromAddress={sendingFromAddress} />
        </div>
      )}
    </div>
  );
}

// ── My Address Tab ────────────────────────────────────────────────────────────

function CopyField({ value, testId }: { value: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
      <code className="flex-1 bg-background border border-border rounded-lg px-4 py-3 text-sm font-mono text-foreground break-all select-all">
        {value}
      </code>
      <Button onClick={copy} variant="outline" size="sm" className="gap-2 flex-shrink-0" data-testid={testId || "button-copy"}>
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied!" : "Copy"}
      </Button>
    </div>
  );
}

function ProviderIcon({ provider }: { provider: string }) {
  if (provider === "gmail") return <SiGmail className="h-4 w-4 text-red-500 flex-shrink-0" />;
  if (provider === "outlook") return <Mail className="h-4 w-4 text-blue-500 flex-shrink-0" />;
  if (provider === "yahoo") return <Mail className="h-4 w-4 text-purple-500 flex-shrink-0" />;
  return <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
}

function StepNumber({ n }: { n: number }) {
  return (
    <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold flex-shrink-0">
      {n}
    </div>
  );
}

type PlacementStatus = "primary" | "promotions" | "social" | "updates" | "forums" | "spam" | "not_found" | "error" | "not_connected";

type PlacementResult = {
  inboxId: string;
  label: string;
  email: string;
  provider: string;
  status: PlacementStatus;
  checkedAt: string;
};

function PlacementStatusBadge({ status }: { status: PlacementStatus }) {
  if (status === "primary") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
      <CircleCheck className="h-3 w-3" /> Primary
    </span>
  );
  if (status === "promotions") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-500/10 px-2 py-0.5 rounded-full">
      <Tag className="h-3 w-3" /> Promotions
    </span>
  );
  if (status === "social") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-purple-600 bg-purple-500/10 px-2 py-0.5 rounded-full">
      <Users className="h-3 w-3" /> Social
    </span>
  );
  if (status === "updates") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-full">
      <Bell className="h-3 w-3" /> Updates
    </span>
  );
  if (status === "forums") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-500/10 px-2 py-0.5 rounded-full">
      <MessageSquare className="h-3 w-3" /> Forums
    </span>
  );
  if (status === "spam") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-500/10 px-2 py-0.5 rounded-full">
      <CircleX className="h-3 w-3" /> Spam
    </span>
  );
  if (status === "not_found") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
      <CircleAlert className="h-3 w-3" /> Not found
    </span>
  );
  if (status === "not_connected") return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
      <Info className="h-3 w-3" /> Not connected
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-yellow-600 bg-yellow-500/10 px-2 py-0.5 rounded-full">
      <CircleAlert className="h-3 w-3" /> Error
    </span>
  );
}

function MyAddressTab({
  inboxEmail,
  sendingFromAddress: initialSendingFrom,
  seedInboxes,
  onSave,
}: {
  inboxEmail: string;
  sendingFromAddress: string;
  seedInboxes: SeedInbox[];
  onSave: (addr: string) => void;
}) {
  const [fromAddr, setFromAddr] = useState(initialSendingFrom || "");
  const [saved, setSaved] = useState(false);
  const activeSeedInboxes = seedInboxes.filter(s => s.isActive);

  const handleSave = () => {
    onSave(fromAddr);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const stepCount = activeSeedInboxes.length > 0 ? 5 : 4;
  let step = 0;
  const nextStep = () => { step += 1; return step; };

  return (
    <div className="space-y-4 max-w-2xl mx-auto">

      {/* Step 1: Add scoring address */}
      <Card className="border-primary/20">
        <CardContent className="pt-5 pb-4">
          <div className="flex gap-3 mb-3">
            <StepNumber n={nextStep()} />
            <div>
              <p className="text-sm font-bold text-foreground">Add your scoring address to your CRM</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                This unique address receives a copy of every campaign you send — we analyze it automatically. Never share it publicly.
              </p>
            </div>
          </div>
          <CopyField value={inboxEmail} testId="button-copy-address" />
        </CardContent>
      </Card>

      {/* Step 2 (optional): Add placement addresses */}
      {activeSeedInboxes.length > 0 && (
        <Card className="border-primary/20">
          <CardContent className="pt-5 pb-4">
            <div className="flex gap-3 mb-3">
              <StepNumber n={nextStep()} />
              <div>
                <p className="text-sm font-bold text-foreground">Add these placement addresses to your CRM</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  These are real inboxes we monitor. Adding them tells us exactly where your emails land — Primary, Promotions, Spam, or Junk.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {activeSeedInboxes.map((inbox) => (
                <div key={inbox.id}>
                  <div className="flex items-center gap-2 mb-1">
                    <ProviderIcon provider={inbox.provider} />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{inbox.label}</span>
                  </div>
                  <CopyField value={inbox.email} testId={`button-copy-seed-${inbox.id}`} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Enter sending From address */}
      <Card className="border-primary/20">
        <CardContent className="pt-5 pb-4">
          <div className="flex gap-3 mb-3">
            <StepNumber n={nextStep()} />
            <div>
              <p className="text-sm font-bold text-foreground">Enter your sending From address</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                The email address your subscribers see when you send — found in your CRM's From settings. We use this to match your emails in our placement inboxes.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 font-mono text-sm"
                placeholder="you@yourdomain.com"
                value={fromAddr}
                onChange={e => setFromAddr(e.target.value)}
                data-testid="input-sending-from"
              />
            </div>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!fromAddr.trim() || fromAddr.trim() === initialSendingFrom}
              className="gap-1.5 flex-shrink-0"
              data-testid="button-save-sending-from"
            >
              {saved ? <><Check className="h-3.5 w-3.5" />Saved</> : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Step 4: Send your campaign */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex gap-3">
            <StepNumber n={nextStep()} />
            <div>
              <p className="text-sm font-bold text-foreground">Send your campaign as normal</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Send to your list. The addresses above will each receive a copy automatically — no extra steps. Your copy analysis arrives in minutes; placement results are checked shortly after.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 5: View results */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex gap-3 items-start">
            <StepNumber n={nextStep()} />
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">View your results in the Emails tab</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your full report — authentication, deliverability, CAN-SPAM, copy score, and inbox placement — all in one place.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What gets analyzed */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            What Gets Analyzed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { icon: ShieldCheck, label: "Authentication", desc: "SPF, DKIM, and DMARC pass/fail results from your actual sending server" },
              { icon: ShieldAlert, label: "Sender Trust", desc: "IP blacklist checks across Spamhaus, Barracuda & SpamCop; display name and Reply-To alignment" },
              { icon: AlertTriangle, label: "CAN-SPAM Compliance", desc: "Checks for required unsubscribe link and physical mailing address in the footer" },
              { icon: Type, label: "Subject Line", desc: "Character count, emoji, numbers, question marks, personalization tokens, and ideal length scoring" },
              { icon: Zap, label: "Technical Health", desc: "HTML/text version, preheader, email size, missing ALT text, tracking pixels, external domains" },
              { icon: BookOpen, label: "Content Quality", desc: "Word count, CAN-SPAM physical address, P.S. section, personalization detection" },
              { icon: TrendingUp, label: "AI Copy Scoring", desc: "AI evaluates your subject line, hook, body, CTA and overall flow against proven email frameworks" },
            ].map((item) => (
              <div key={item.label} className="flex gap-3 p-3 rounded-lg bg-muted/40">
                <item.icon className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold">{item.label}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Settings Tab (admin only) ─────────────────────────────────────────────────

function SettingsTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const search = useSearch();

  // Show success/error toast on redirect back from Google OAuth
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (params.get("connected") === "1") {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-analyzer/seed-inboxes"] });
      toast({ title: "Gmail inbox connected!", description: "The inbox is now authorized and ready to check placement." });
      window.history.replaceState({}, "", window.location.pathname + "?tab=settings");
    } else if (params.get("error")) {
      toast({ title: "OAuth connection failed", description: "Google authorization was denied or failed. Try again.", variant: "destructive" });
      window.history.replaceState({}, "", window.location.pathname + "?tab=settings");
    }
  }, [search]);

  const { data: seedInboxes = [], isLoading: seedLoading } = useQuery<SeedInbox[]>({
    queryKey: ["/api/inbox-analyzer/seed-inboxes"],
  });

  const [newProvider, setNewProvider] = useState("gmail");
  const [newLabel, setNewLabel] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const addMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/inbox-analyzer/seed-inboxes", { provider: newProvider, label: newLabel, email: newEmail }),
    onSuccess: (data: SeedInbox) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-analyzer/seed-inboxes"] });
      setNewLabel("");
      setNewEmail("");
      setShowAddForm(false);
      toast({ title: "Inbox added" });
      // Immediately kick off OAuth for Gmail
      if (data.provider === "gmail") {
        window.location.href = `/api/inbox-analyzer/seed-inboxes/connect/gmail?inboxId=${data.id}`;
      }
    },
    onError: () => toast({ title: "Failed to add inbox", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/inbox-analyzer/seed-inboxes/${id}/toggle`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/inbox-analyzer/seed-inboxes"] }),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/inbox-analyzer/seed-inboxes/${id}/disconnect`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-analyzer/seed-inboxes"] });
      toast({ title: "Inbox disconnected" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/inbox-analyzer/seed-inboxes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-analyzer/seed-inboxes"] });
      toast({ title: "Seed inbox removed" });
    },
  });

  return (
    <div className="space-y-6 max-w-2xl mx-auto">

      {/* Seed Inbox Management */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Inbox className="h-4 w-4 text-primary" />
            Placement Seed Inboxes
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Real Gmail accounts you control. Members add them to their CRM — we check where their emails land via Gmail API.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Existing inboxes list */}
          {seedLoading ? (
            <div className="space-y-2">
              {[1, 2].map(i => <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : seedInboxes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-5 text-center space-y-1">
              <Inbox className="h-6 w-6 text-muted-foreground/40 mx-auto" />
              <p className="text-sm text-muted-foreground">No seed inboxes added yet</p>
              <p className="text-xs text-muted-foreground/70">Click "Add Inbox" below to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              {seedInboxes.map((inbox) => (
                <div key={inbox.id} className="rounded-lg border border-border bg-muted/20 overflow-hidden">
                  {/* Top row: icon, label, email, toggle, delete */}
                  <div className="flex items-center gap-3 p-3">
                    <ProviderIcon provider={inbox.provider} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground">{inbox.label}</p>
                        {inbox.isConnected ? (
                          <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-500/15 text-emerald-600 border-emerald-500/20">
                            Connected
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-muted-foreground">
                            Not connected
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs font-mono text-muted-foreground truncate">{inbox.email}</p>
                    </div>
                    <Switch
                      checked={inbox.isActive}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: inbox.id, isActive: checked })}
                      data-testid={`toggle-seed-${inbox.id}`}
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-500 flex-shrink-0" data-testid={`button-delete-seed-${inbox.id}`}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove seed inbox?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will remove <strong>{inbox.email}</strong> from the placement list and revoke its OAuth connection. Members who added it to their CRM will no longer contribute placement data.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(inbox.id)} className="bg-red-600 hover:bg-red-700">
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  {/* Bottom row: OAuth connect / disconnect for Gmail */}
                  {inbox.provider === "gmail" && (
                    <div className="border-t border-border px-3 py-2 bg-muted/10 flex items-center justify-between">
                      {inbox.isConnected ? (
                        <div className="flex items-center gap-3 w-full">
                          <CircleCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0" />
                          <p className="text-xs text-muted-foreground flex-1">Gmail API authorized — placement checks active</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-xs text-muted-foreground hover:text-red-500 px-2"
                            onClick={() => disconnectMutation.mutate(inbox.id)}
                            disabled={disconnectMutation.isPending}
                            data-testid={`button-disconnect-${inbox.id}`}
                          >
                            Disconnect
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 w-full">
                          <CircleAlert className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                          <p className="text-xs text-muted-foreground flex-1">Connect this Gmail account to enable placement checking</p>
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1.5 flex-shrink-0"
                            onClick={() => { window.location.href = `/api/inbox-analyzer/seed-inboxes/connect/gmail?inboxId=${inbox.id}`; }}
                            data-testid={`button-connect-gmail-${inbox.id}`}
                          >
                            <SiGmail className="h-3 w-3" />
                            Connect with Google
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {inbox.provider === "outlook" && !inbox.isConnected && (
                    <div className="border-t border-border px-3 py-2 bg-muted/10 flex items-center gap-2">
                      <Info className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <p className="text-xs text-muted-foreground">Outlook OAuth requires a Microsoft Azure app registration — coming soon</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <Separator />

          {/* Add new inbox */}
          {!showAddForm ? (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowAddForm(true)} data-testid="button-show-add-form">
              <Plus className="h-3.5 w-3.5" />
              Add Inbox
            </Button>
          ) : (
            <div className="space-y-3 p-4 rounded-lg border border-border bg-muted/10">
              <p className="text-xs font-semibold text-foreground">New Seed Inbox</p>
              <div className="grid grid-cols-3 gap-2">
                <Select value={newProvider} onValueChange={setNewProvider}>
                  <SelectTrigger className="text-sm" data-testid="select-seed-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gmail">Gmail</SelectItem>
                    <SelectItem value="outlook">Outlook</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  className="text-sm"
                  placeholder="Label (e.g. Gmail A)"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  data-testid="input-seed-label"
                />
                <Input
                  className="text-sm font-mono"
                  placeholder="email@gmail.com"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  data-testid="input-seed-email"
                />
              </div>
              {newProvider === "gmail" && (
                <p className="text-xs text-muted-foreground">
                  After adding, you'll be redirected to Google to authorize inbox access.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!newLabel.trim() || !newEmail.trim() || addMutation.isPending}
                  onClick={() => addMutation.mutate()}
                  data-testid="button-add-seed-inbox"
                >
                  {addMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : newProvider === "gmail" ? <SiGmail className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {newProvider === "gmail" ? "Add & Connect with Google" : "Add Inbox"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SendGrid Setup */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-primary" />
            SendGrid Inbound Parse Setup
          </CardTitle>
          <p className="text-xs text-muted-foreground">Configure your domain to forward emails to this tool.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-foreground">Inbound Domain</p>
            <code className="text-xs font-mono text-muted-foreground">{INBOX_DOMAIN}</code>
          </div>
          <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-foreground">MX Record</p>
            <code className="text-xs font-mono text-muted-foreground">MX 10 mx.sendgrid.net</code>
          </div>
          <div className="rounded-lg bg-muted/40 px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-foreground">Webhook URL</p>
            <code className="text-xs font-mono text-muted-foreground break-all">/api/inbox-analyzer/inbound</code>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function InboxAnalyzerPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.isAdmin ?? false;
  const search = useSearch();
  const defaultTab = new URLSearchParams(search).get("tab") || "emails";

  const { data: addressData, isLoading: addressLoading } = useQuery<{ email: string; token: string; sendingFromAddress: string }>({
    queryKey: ["/api/inbox-analyzer/address"],
  });

  const { data: seedInboxes = [] } = useQuery<SeedInbox[]>({
    queryKey: ["/api/inbox-analyzer/seed-inboxes"],
  });

  const { data: emails = [], isLoading: emailsLoading } = useQuery<EmailAnalysis[]>({
    queryKey: ["/api/inbox-analyzer/emails"],
    refetchInterval: (query) => {
      const data = query.state.data as EmailAnalysis[] | undefined;
      const hasPending = data?.some((e) => e.status === "processing" || e.status === "pending");
      return hasPending ? 4000 : false;
    },
  });

  const saveSendingFromMutation = useMutation({
    mutationFn: (sendingFromAddress: string) =>
      apiRequest("PATCH", "/api/inbox-analyzer/address/sending-from", { sendingFromAddress }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-analyzer/address"] });
      toast({ title: "Sending address saved" });
    },
    onError: () => toast({ title: "Failed to save address", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/inbox-analyzer/emails/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-analyzer/emails"] });
      toast({ title: "Email deleted" });
    },
  });

  const reanalyzeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/inbox-analyzer/emails/${id}/reanalyze`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-analyzer/emails"] });
      toast({ title: "Re-analysis started", description: "Your email is being analyzed again." });
    },
    onError: () => {
      toast({ title: "Failed to re-analyze", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="bg-sidebar text-sidebar-foreground px-4 sm:px-6 py-8 sm:py-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
              <Inbox className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Inbox Analyzer</h1>
              <p className="text-white/50 text-xs sm:text-sm mt-0.5">
                Forward any campaign to your seed address — get instant deliverability and copy analysis.
              </p>
            </div>
          </div>
          {addressData && (
            <div className="mt-4 inline-flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2">
              <Mail className="h-3.5 w-3.5 text-white/60 flex-shrink-0" />
              <code className="text-xs sm:text-sm font-mono text-white/90 break-all">{addressData.email}</code>
            </div>
          )}
          {addressLoading && <div className="mt-4 h-8 w-64 bg-white/10 rounded-lg animate-pulse" />}
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Tabs defaultValue={isAdmin && defaultTab === "settings" ? "settings" : defaultTab === "address" ? "address" : "emails"}>
          <div className="flex justify-center mb-6">
            <TabsList className="h-10 bg-muted gap-1 p-1">
              <TabsTrigger value="emails" className="gap-1.5 text-sm px-4" data-testid="tab-emails">
                <Inbox className="h-3.5 w-3.5" />
                Emails
                {emails.length > 0 && (
                  <span className="ml-1 bg-primary/20 text-primary text-xs rounded-full px-1.5 py-0.5 font-semibold leading-none">
                    {emails.length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="address" className="gap-1.5 text-sm px-4" data-testid="tab-my-address">
                <Mail className="h-3.5 w-3.5" />
                My Address
              </TabsTrigger>
              {isAdmin && (
                <TabsTrigger value="settings" className="gap-1.5 text-sm px-4" data-testid="tab-settings">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Emails tab */}
          <TabsContent value="emails" className="m-0">
            {emailsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : emails.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                  <Inbox className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <div>
                  <p className="text-base font-semibold text-foreground">No emails yet</p>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    Add your seed address to your CRM and send a campaign to see it analyzed here.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => document.querySelector<HTMLElement>('[data-testid="tab-my-address"]')?.click()} data-testid="button-go-to-address">
                  Get My Address
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {emails.map((email) => (
                  <EmailRow
                    key={email.id}
                    email={email}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onReanalyze={(id) => reanalyzeMutation.mutate(id)}
                    seedInboxes={seedInboxes}
                    sendingFromAddress={addressData?.sendingFromAddress || ""}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* My Address tab */}
          <TabsContent value="address" className="m-0">
            {addressData ? (
              <MyAddressTab
                inboxEmail={addressData.email}
                sendingFromAddress={addressData.sendingFromAddress || ""}
                seedInboxes={seedInboxes}
                onSave={(addr) => saveSendingFromMutation.mutate(addr)}
              />
            ) : addressLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">Failed to load address. Please refresh.</p>
            )}
          </TabsContent>

          {/* Settings tab (admin only) */}
          {isAdmin && (
            <TabsContent value="settings" className="m-0">
              <SettingsTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
