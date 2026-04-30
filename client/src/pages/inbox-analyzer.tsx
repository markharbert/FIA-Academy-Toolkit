import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Mail, Copy, Check, Trash2, ChevronDown, ChevronUp, Settings,
  ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, Loader2,
  Inbox, Info, TrendingUp, CircleCheck, CircleX, CircleAlert,
  ExternalLink, FileText, Zap, Globe, Hash, HelpCircle, Smile,
  User, Reply, Server, Eye, Image, Link2, Type, BookOpen, MapPin, Star, RefreshCw,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type {
  EmailAnalysis, SpamFlag, CopyFeedback,
  SubjectAnalysis, TechnicalHealth, SenderTrust, ContentQuality,
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

function EmailDetail({ email, onDelete, onReanalyze }: { email: EmailAnalysis; onDelete: () => void; onReanalyze?: (id: string) => void }) {
  const cf = email.copyFeedback as CopyFeedback | null;
  const flags = (email.spamFlags as SpamFlag[] | null) || [];
  const sa = email.subjectAnalysis as SubjectAnalysis | null;
  const th = email.technicalHealth as TechnicalHealth | null;
  const st = email.senderTrust as SenderTrust | null;
  const cq = email.contentQuality as ContentQuality | null;

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

        {/* Delete button */}
        <div className="flex justify-end">
          <Button
            variant="ghost" size="sm"
            className="text-muted-foreground hover:text-red-500 gap-1.5 text-xs"
            onClick={onDelete}
            data-testid={`email-delete-${email.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />Delete
          </Button>
        </div>
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
              { label: "Spam", score: email.spamScore },
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

        {/* Spam signals */}
        <SectionPanel title="Spam Signal Scan" icon={AlertTriangle} score={email.spamScore}>
          {flags.length === 0 ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CircleCheck className="h-4 w-4" />No spam signals detected
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {flags.map((f, i) => <SpamFlagChip key={i} flag={f} />)}
            </div>
          )}
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

function EmailRow({ email, onDelete, onReanalyze }: { email: EmailAnalysis; onDelete: (id: string) => void; onReanalyze?: (id: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden transition-shadow hover:shadow-sm" data-testid={`email-row-${email.id}`}>
      <button
        className="w-full text-left px-4 py-3.5 flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusBadge status={email.status} />
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-5">
          <Separator className="mb-5" />
          <EmailDetail email={email} onDelete={() => onDelete(email.id)} onReanalyze={onReanalyze} />
        </div>
      )}
    </div>
  );
}

// ── My Address Tab ────────────────────────────────────────────────────────────

function MyAddressTab({ inboxEmail }: { inboxEmail: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(inboxEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Your Seed Address
          </CardTitle>
          <p className="text-xs text-muted-foreground">Add this address as a contact in your CRM or email platform. Every campaign you send will automatically be analyzed.</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <code className="flex-1 bg-background border border-border rounded-lg px-4 py-3 text-sm font-mono text-foreground break-all select-all">
              {inboxEmail}
            </code>
            <Button onClick={copy} variant="outline" className="gap-2 flex-shrink-0" data-testid="button-copy-address">
              {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            How to Set Up
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { step: "1", title: "Copy your seed address above", desc: "This address is unique to your account — never share it publicly." },
            { step: "2", title: "Add it as a contact in your CRM", desc: "In Keap, ActiveCampaign, Mailchimp, or any email platform — add the seed address as a contact and tag them if needed." },
            { step: "3", title: "Send your campaign as normal", desc: "When you send your next email campaign, one copy automatically arrives here. No extra steps needed." },
            { step: "4", title: "See your analysis", desc: "Within a few minutes your email will appear in the Emails tab with a full deliverability and copy report." },
          ].map((item) => (
            <div key={item.step} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">
                {item.step}
              </div>
              <div>
                <p className="text-sm font-semibold">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

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
              { icon: AlertTriangle, label: "Spam Signal Scan", desc: "Trigger words, formatting issues, missing unsubscribe links, link density and more" },
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

// ── Settings Tab ──────────────────────────────────────────────────────────────

function SettingsTab() {
  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            Inbox Placement Monitoring
          </CardTitle>
          <p className="text-xs text-muted-foreground">Connect real email inboxes (Gmail, Outlook, Yahoo) to see if your emails land in the inbox or spam folder.</p>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed border-border p-6 text-center space-y-2">
            <Inbox className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm font-medium text-muted-foreground">Coming Soon</p>
            <p className="text-xs text-muted-foreground/70 max-w-xs mx-auto">Add your seed email accounts here to monitor inbox vs. spam placement across Gmail, Outlook, and Yahoo.</p>
          </div>
        </CardContent>
      </Card>

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

  const { data: addressData, isLoading: addressLoading } = useQuery<{ email: string; token: string }>({
    queryKey: ["/api/inbox-analyzer/address"],
  });

  const { data: emails = [], isLoading: emailsLoading } = useQuery<EmailAnalysis[]>({
    queryKey: ["/api/inbox-analyzer/emails"],
    refetchInterval: (query) => {
      const data = query.state.data as EmailAnalysis[] | undefined;
      const hasPending = data?.some((e) => e.status === "processing" || e.status === "pending");
      return hasPending ? 4000 : false;
    },
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
        <Tabs defaultValue="emails">
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
              <TabsTrigger value="settings" className="gap-1.5 text-sm px-4" data-testid="tab-settings">
                <Settings className="h-3.5 w-3.5" />
                Settings
              </TabsTrigger>
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
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* My Address tab */}
          <TabsContent value="address" className="m-0">
            {addressData ? (
              <MyAddressTab inboxEmail={addressData.email} />
            ) : addressLoading ? (
              <div className="space-y-4">
                {[1, 2].map((i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-10">Failed to load address. Please refresh.</p>
            )}
          </TabsContent>

          {/* Settings tab */}
          <TabsContent value="settings" className="m-0">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
