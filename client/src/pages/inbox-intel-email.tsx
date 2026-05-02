import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Pin,
  PinOff,
  Loader2,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Mail,
  Calendar,
  AtSign,
  Link as LinkIcon,
  ImageIcon,
  Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { CapturedCompetitorEmail, CapturedCompetitorEmailLink } from "@shared/schema";

interface EmailDetailResponse {
  email: CapturedCompetitorEmail;
  links: CapturedCompetitorEmailLink[];
}

function formatFull(d: Date | string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function authBadge(result: string | null | undefined): { label: string; tone: "good" | "bad" | "neutral" } {
  if (!result || result === "unknown") return { label: "Unknown", tone: "neutral" };
  if (result === "pass") return { label: "Pass", tone: "good" };
  return { label: result.charAt(0).toUpperCase() + result.slice(1), tone: "bad" };
}

export default function InboxIntelEmailPage() {
  const params = useParams<{ trackerId: string; emailId: string }>();
  const { trackerId, emailId } = params;
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<EmailDetailResponse>({
    queryKey: ["/api/inbox-intel/emails", emailId],
    enabled: !!emailId,
  });

  const togglePinMutation = useMutation({
    mutationFn: async (pinned: boolean) => {
      await apiRequest("PATCH", `/api/inbox-intel/emails/${emailId}/pin`, { pinned });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/emails", emailId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inbox-intel/trackers", trackerId] });
    },
    onError: (err: any) => {
      toast({ title: "Couldn't update pin", description: err?.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-20 text-center">
        <p className="text-muted-foreground mb-4">Couldn't load this email.</p>
        <Button variant="outline" onClick={() => setLocation(`/email-tools/inbox-intel/${trackerId}`)}>
          Back
        </Button>
      </div>
    );
  }

  const { email, links } = data;
  const spf = authBadge(email.spfResult);
  const dkim = authBadge(email.dkimResult);
  const dmarc = authBadge(email.dmarcResult);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-sidebar text-sidebar-foreground px-6 py-6">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => setLocation(`/email-tools/inbox-intel/${trackerId}`)}
            className="text-white/60 hover:text-white text-sm flex items-center gap-1 mb-3"
            data-testid="link-back-tracker"
          >
            <ArrowLeft className="h-4 w-4" /> Back to competitor
          </button>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate" data-testid="text-email-subject">
                {email.subject}
              </h1>
              <div className="flex items-center gap-3 mt-1 text-xs text-white/60">
                <span className="flex items-center gap-1">
                  <AtSign className="h-3 w-3" /> {email.fromName ? `${email.fromName} <${email.fromEmail}>` : email.fromEmail}
                </span>
              </div>
            </div>
            <Button
              variant={email.isPinned ? "default" : "outline"}
              size="sm"
              onClick={() => togglePinMutation.mutate(!email.isPinned)}
              disabled={togglePinMutation.isPending}
              data-testid="button-toggle-pin"
              className={
                email.isPinned
                  ? "bg-amber-500 hover:bg-amber-500/90 text-white border-transparent"
                  : "bg-transparent text-white border-white/30 hover:bg-white/10"
              }
            >
              {email.isPinned ? (
                <><PinOff className="h-4 w-4 mr-1.5" /> Unpin</>
              ) : (
                <><Pin className="h-4 w-4 mr-1.5" /> Pin</>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Email body */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span>HTML preview {email.bodyAvailable ? "" : "(archived — body no longer available)"}</span>
            </div>
            {email.preheader && (
              <p className="text-xs text-muted-foreground mt-1.5 italic" data-testid="text-email-preheader">
                Preheader: "{email.preheader}"
              </p>
            )}
          </div>
          <div className="bg-white">
            {email.bodyAvailable && email.htmlBody ? (
              <iframe
                title="Email preview"
                srcDoc={email.htmlBody}
                sandbox=""
                className="w-full"
                style={{ minHeight: "600px", height: "85vh", border: 0 }}
                data-testid="iframe-email-body"
              />
            ) : email.plainBody ? (
              <pre className="p-6 text-sm text-foreground whitespace-pre-wrap font-sans bg-white text-black">
                {email.plainBody}
              </pre>
            ) : (
              <div className="p-12 text-center text-muted-foreground bg-card">
                <Mail className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">This email's body has been archived. Metrics are still tracked.</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Metadata */}
          <Panel title="Metadata">
            <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Received">
              {formatFull(email.receivedAt)}
            </Row>
            {email.sentAt && (
              <Row icon={<Calendar className="h-3.5 w-3.5" />} label="Sent">
                {formatFull(email.sentAt)}
              </Row>
            )}
            <Row icon={<AtSign className="h-3.5 w-3.5" />} label="From domain">
              {email.fromDomain || "—"}
            </Row>
            {email.replyToEmail && (
              <Row icon={<AtSign className="h-3.5 w-3.5" />} label="Reply-to">
                {email.replyToEmail}
              </Row>
            )}
            {email.detectedEsp && (
              <Row icon={<Mail className="h-3.5 w-3.5" />} label="ESP">
                <span className="font-semibold text-foreground">{email.detectedEsp}</span>
              </Row>
            )}
          </Panel>

          {/* Metrics */}
          <Panel title="Metrics">
            <div className="grid grid-cols-3 gap-2">
              <MetricBlock icon={<Type className="h-3.5 w-3.5" />} value={email.wordCount ?? 0} label="Words" />
              <MetricBlock icon={<LinkIcon className="h-3.5 w-3.5" />} value={email.linkCount ?? 0} label="Links" />
              <MetricBlock icon={<ImageIcon className="h-3.5 w-3.5" />} value={email.imageCount ?? 0} label="Images" />
            </div>
            <div className="text-xs text-muted-foreground mt-3 space-y-1">
              <div>Subject: {email.subjectLength ?? 0} chars{email.subjectHasEmoji ? " · emoji" : ""}{email.subjectIsAllCaps ? " · ALL CAPS" : ""}</div>
              {email.preheaderLength !== null && email.preheaderLength !== undefined && email.preheaderLength > 0 && (
                <div>Preheader: {email.preheaderLength} chars</div>
              )}
            </div>
          </Panel>

          {/* Authentication */}
          <Panel title="Authentication">
            <div className="grid grid-cols-3 gap-2">
              <AuthChip label="SPF" tone={spf.tone} text={spf.label} />
              <AuthChip label="DKIM" tone={dkim.tone} text={dkim.label} />
              <AuthChip label="DMARC" tone={dmarc.tone} text={dmarc.label} />
            </div>
            <div className="text-xs text-muted-foreground mt-3 space-y-1">
              <div>List-Unsubscribe: {email.listUnsubscribePresent ? "Present" : "Missing"}</div>
              {email.listUnsubscribePresent && (
                <div>One-click unsubscribe: {email.listUnsubscribePostPresent ? "Yes" : "No"}</div>
              )}
            </div>
          </Panel>

          {/* Links */}
          {links.length > 0 && (
            <Panel title={`Links (${links.length})`}>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {links.map((link) => (
                  <div key={link.id} className="text-xs" data-testid={`row-link-${link.id}`}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-violet-600 dark:text-violet-400 hover:underline break-all flex items-start gap-1"
                    >
                      <ExternalLink className="h-3 w-3 flex-shrink-0 mt-0.5" />
                      <span className="break-all">{link.anchorText || link.domain || link.url}</span>
                    </a>
                    {link.domain && (
                      <div className="text-muted-foreground pl-4 mt-0.5">
                        {link.domain}{link.hasUtm && " · UTM"}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </aside>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{title}</h3>
      <div className="space-y-2 text-sm">{children}</div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground flex-shrink-0">
        {icon} {label}
      </div>
      <div className="text-foreground text-right break-all">{children}</div>
    </div>
  );
}

function MetricBlock({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2.5 text-center">
      <div className="text-muted-foreground flex justify-center mb-1">{icon}</div>
      <div className="text-base font-bold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function AuthChip({ label, tone, text }: { label: string; tone: "good" | "bad" | "neutral"; text: string }) {
  const colors = {
    good: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400",
    bad: "bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400",
    neutral: "bg-muted text-muted-foreground border-border",
  };
  const Icon = tone === "good" ? ShieldCheck : tone === "bad" ? ShieldAlert : Mail;
  return (
    <div className={`rounded-lg border ${colors[tone]} p-2 text-center`}>
      <Icon className="h-3.5 w-3.5 mx-auto mb-1" />
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-xs font-semibold mt-0.5">{text}</div>
    </div>
  );
}
