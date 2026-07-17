import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Mail } from "lucide-react";
import { Tile, TileTitle, scoreColor } from "../widget-registry";
import type { EmailAnalysis } from "@shared/schema";

export function InboxAnalyzerWidget() {
  const { data: emails = [] } = useQuery<EmailAnalysis[]>({
    queryKey: ["/api/inbox-analyzer/emails"],
  });

  const scoredEmails = emails.filter((e) => e.overallScore != null).slice(0, 10);
  const avgEmailScore = useMemo(() => {
    if (scoredEmails.length === 0) return null;
    const total = scoredEmails.reduce((s, e) => s + (e.overallScore ?? 0), 0);
    return Math.round(total / scoredEmails.length);
  }, [scoredEmails]);

  const latestEmail = emails[0] ?? null;

  const [inboxLastVisited] = useState<string | null>(() =>
    typeof window !== "undefined"
      ? localStorage.getItem("inbox_analyzer_last_visited")
      : null
  );

  const hasNewEmail = useMemo(() => {
    if (!latestEmail?.receivedAt) return false;
    if (!inboxLastVisited) return true;
    return new Date(String(latestEmail.receivedAt)) > new Date(inboxLastVisited);
  }, [latestEmail, inboxLastVisited]);

  return (
    <Tile accent="bg-sky-500" href="/email-tools/inbox-analyzer" testId="card-inbox-analyzer">
      <TileTitle
        icon={Mail}
        title="Inbox Analyzer"
        accent="bg-sky-500/10 text-sky-600 dark:text-sky-400"
        badge={
          hasNewEmail ? (
            <Badge className="h-4 px-1.5 text-[10px] leading-none bg-sky-500 hover:bg-sky-500 text-white border-0 rounded-full">
              New
            </Badge>
          ) : undefined
        }
      />
      <div className="mt-4 flex items-end gap-2">
        <span className="text-4xl font-bold tabular-nums leading-none">{emails.length}</span>
        <span className="text-muted-foreground text-sm mb-1">analyzed</span>
        {avgEmailScore != null && (
          <span
            className={`ml-auto text-xs font-bold mb-1 px-2 py-0.5 rounded-full bg-muted ${scoreColor(avgEmailScore)}`}
          >
            avg {avgEmailScore}
          </span>
        )}
      </div>
      <div className="mt-4">
        {emails.length > 0 ? (
          <>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1.5">
              Recent
            </p>
            <div className="space-y-1.5">
              {emails.slice(0, 3).map((email, i) => (
                <div key={(email as any).id ?? i} className="flex items-center gap-1.5">
                  <p className="text-xs font-medium truncate flex-1 text-foreground">
                    {email.subject || "(No subject)"}
                  </p>
                  {email.overallScore != null ? (
                    <span
                      className={`text-xs font-bold shrink-0 tabular-nums ${scoreColor(email.overallScore)}`}
                    >
                      {email.overallScore}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground shrink-0">—</span>
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            No emails yet — send a test to your inbox address.
          </p>
        )}
      </div>
    </Tile>
  );
}
